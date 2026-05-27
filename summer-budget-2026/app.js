const state = {
  password: sessionStorage.getItem("summerBudgetPassword") || "",
  data: null,
  filters: {
    category: "all",
    status: "all",
    search: ""
  },
  saveTimer: null
};

const statuses = ["idea", "estimate", "shortlist", "booked", "paid"];
const statusNames = {
  idea: "Idea",
  estimate: "Estimate",
  shortlist: "Shortlist",
  booked: "Booked",
  paid: "Paid"
};

const statusColors = {
  idea: "#ffbe0b",
  estimate: "#3a86ff",
  shortlist: "#ff6b6b",
  booked: "#7b61ff",
  paid: "#00a878"
};

const $ = (id) => document.getElementById(id);

function money(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(Number(value) || 0);
}

function numberValue(value) {
  const next = Number(value);
  return Number.isFinite(next) ? next : 0;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function uid(prefix = "item") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64) || "category";
}

function titleize(value) {
  return String(value)
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}

function setMessage(message) {
  $("lockMessage").textContent = message || "";
}

function setSaveState(label, icon = "cloud-check") {
  $("saveState").innerHTML = `<i data-lucide="${icon}"></i>${escapeHtml(label)}`;
  refreshIcons();
}

async function budgetRequest(action, data) {
  const response = await fetch("/api/summer-budget", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      password: state.password,
      action,
      data
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "Budget request failed.");
  }
  return payload;
}

async function loadBudget() {
  setMessage("");
  const payload = await budgetRequest("load");
  state.data = payload.data;
  sessionStorage.setItem("summerBudgetPassword", state.password);
  $("lockScreen").hidden = true;
  $("dashboard").hidden = false;
  render();
}

async function saveBudget() {
  if (!state.data) return;
  clearTimeout(state.saveTimer);
  state.saveTimer = null;
  setSaveState("Saving", "loader-circle");
  const payload = await budgetRequest("save", state.data);
  state.data = payload.data;
  setSaveState("Saved", "cloud-check");
  renderMeta();
}

function scheduleSave() {
  setSaveState("Unsaved", "cloudy");
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(() => {
    saveBudget().catch((error) => setSaveState(error.message, "circle-alert"));
  }, 650);
}

function includedItems() {
  return state.data.items.filter((item) => item.included !== false);
}

function sum(items, field) {
  return items.reduce((total, item) => total + numberValue(item[field]), 0);
}

function categoryById(id) {
  return state.data.categories.find((category) => category.id === id) || state.data.categories[0];
}

function categoryOptions(selectedId) {
  return state.data.categories.map((category) => {
    const selected = category.id === selectedId ? "selected" : "";
    return `<option value="${escapeHtml(category.id)}" ${selected}>${escapeHtml(category.name)}</option>`;
  }).join("");
}

function categoryTotals() {
  const included = includedItems();
  return state.data.categories.map((category) => {
    const allCategoryItems = state.data.items.filter((item) => item.categoryId === category.id);
    const categoryItems = included.filter((item) => item.categoryId === category.id);
    return {
      ...category,
      planned: sum(categoryItems, "planned"),
      actual: sum(categoryItems, "actual"),
      count: allCategoryItems.length,
      includedCount: categoryItems.length
    };
  });
}

function render() {
  renderMeta();
  renderInputs();
  renderSelectors();
  renderSummary();
  renderCategories();
  renderKanban();
  renderRows();
  refreshIcons();
}

function renderMeta() {
  const date = state.data?.updatedAt ? new Date(state.data.updatedAt) : new Date();
  $("updatedText").textContent = `Saved ${date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`;
}

function renderInputs() {
  $("targetInput").value = numberValue(state.data.settings.target);
  $("bufferInput").value = numberValue(state.data.settings.contingencyPercent);
  $("bufferInputLabel").textContent = `${numberValue(state.data.settings.contingencyPercent)}%`;
}

function renderSelectors() {
  const categoryFilterOptions = [
    `<option value="all">All categories</option>`,
    ...state.data.categories.map((category) => `<option value="${escapeHtml(category.id)}">${escapeHtml(category.name)}</option>`)
  ];
  $("categoryFilter").innerHTML = categoryFilterOptions.join("");
  $("categoryFilter").value = state.filters.category;
  $("itemCategoryInput").innerHTML = categoryOptions($("itemCategoryInput").value || state.data.categories[0]?.id);
}

function renderSummary() {
  const included = includedItems();
  const planned = sum(included, "planned");
  const actual = sum(included, "actual");
  const remaining = planned - actual;
  const target = numberValue(state.data.settings.target);
  const bufferPercent = numberValue(state.data.settings.contingencyPercent);
  const buffer = Math.round(planned * bufferPercent / 100);
  const usedPercent = target ? Math.min(100, Math.round((planned + buffer) / target * 100)) : 0;
  const targetDelta = target - planned - buffer;

  $("plannedTotal").textContent = money(planned);
  $("actualTotal").textContent = money(actual);
  $("bufferTotal").textContent = money(buffer);
  $("bufferLabel").textContent = `${bufferPercent}% cushion`;
  $("remainingText").textContent = `${money(Math.max(0, remaining))} remaining`;
  $("lineCount").textContent = included.length.toLocaleString();
  $("categoryCount").textContent = `${state.data.categories.length} categories`;
  $("targetUsed").textContent = `${money(planned + buffer)} of ${money(target)}`;
  $("targetDelta").textContent = targetDelta >= 0 ? `${money(targetDelta)} left` : `${money(Math.abs(targetDelta))} over`;
  $("meterValue").textContent = `${usedPercent}%`;
  $("targetMeter").style.background = `conic-gradient(var(--mint) 0deg ${usedPercent * 3.6}deg, #edf3f3 ${usedPercent * 3.6}deg 360deg)`;
}

function renderCategories() {
  const totalPlanned = sum(includedItems(), "planned");
  $("categoryGrid").innerHTML = categoryTotals().map((category) => {
    const color = category.color || "#3a86ff";
    const share = totalPlanned ? Math.min(100, category.planned / totalPlanned * 100) : 0;
    const goal = numberValue(category.goal);
    const goalShare = goal ? Math.min(100, category.planned / goal * 100) : share;
    return `
      <article class="category-card">
        <div class="category-head">
          <div class="category-icon" style="background:${escapeHtml(color)}">
            <i data-lucide="${escapeHtml(category.icon || "FolderOpen")}"></i>
          </div>
          <div>
            <h4>${escapeHtml(category.name)}</h4>
            <p>${escapeHtml(category.description || "")}</p>
          </div>
        </div>
        <div class="category-stats">
          ${goal ? `<div><span>Goal</span><strong>${money(goal)}</strong></div>` : ""}
          <div><span>Planned</span><strong>${money(category.planned)}</strong></div>
          <div><span>Actual</span><strong>${money(category.actual)}</strong></div>
          <div><span>Lines</span><strong>${category.includedCount}/${category.count}</strong></div>
        </div>
        <div class="bar-track" title="${goal ? "Goal progress" : "Budget share"}">
          <div class="bar-fill" style="width:${goal ? goalShare : share}%; background:${escapeHtml(color)}"></div>
        </div>
      </article>
    `;
  }).join("");
}

function renderKanban() {
  const included = includedItems();
  $("kanban").innerHTML = statuses.map((status) => {
    const items = included.filter((item) => (item.status || "estimate") === status);
    const total = sum(items, "planned");
    return `
      <div class="kanban-column">
        <h4>
          <span>${escapeHtml(statusNames[status])}</span>
          <span>${money(total)}</span>
        </h4>
        ${items.slice(0, 4).map((item) => `
          <div class="kanban-card" style="border-left-color:${escapeHtml(statusColors[status])}">
            <strong>${escapeHtml(item.name)}</strong>
            <span>${money(item.planned)} | ${escapeHtml(item.owner || categoryById(item.categoryId)?.name || "Family")}</span>
          </div>
        `).join("")}
        ${items.length > 4 ? `<div class="kanban-card" style="border-left-color:${escapeHtml(statusColors[status])}"><strong>+${items.length - 4} more</strong><span>See details below</span></div>` : ""}
      </div>
    `;
  }).join("");
}

function filteredItems() {
  const query = state.filters.search.trim().toLowerCase();
  return state.data.items.filter((item) => {
    const categoryMatch = state.filters.category === "all" || item.categoryId === state.filters.category;
    const statusMatch = state.filters.status === "all" || (item.status || "estimate") === state.filters.status;
    const text = [item.name, item.owner, item.notes, item.source].join(" ").toLowerCase();
    return categoryMatch && statusMatch && (!query || text.includes(query));
  });
}

function renderRows() {
  const items = filteredItems();
  $("emptyState").style.display = items.length ? "none" : "block";
  $("budgetRows").innerHTML = items.map((item) => `
    <tr>
      <td class="check-cell">
        <input type="checkbox" data-id="${escapeHtml(item.id)}" data-field="included" ${item.included !== false ? "checked" : ""} title="Include in totals">
      </td>
      <td><input class="name-input" type="text" data-id="${escapeHtml(item.id)}" data-field="name" value="${escapeHtml(item.name)}"></td>
      <td><select data-id="${escapeHtml(item.id)}" data-field="categoryId">${categoryOptions(item.categoryId)}</select></td>
      <td><input class="money-input" type="number" min="0" step="1" data-id="${escapeHtml(item.id)}" data-field="planned" value="${numberValue(item.planned)}"></td>
      <td><input class="money-input" type="number" min="0" step="1" data-id="${escapeHtml(item.id)}" data-field="actual" value="${numberValue(item.actual)}"></td>
      <td>
        <select data-id="${escapeHtml(item.id)}" data-field="status">
          ${statuses.map((status) => `<option value="${status}" ${(item.status || "estimate") === status ? "selected" : ""}>${statusNames[status]}</option>`).join("")}
        </select>
      </td>
      <td><input type="date" data-id="${escapeHtml(item.id)}" data-field="date" value="${escapeHtml(item.date || "")}"></td>
      <td><input type="text" data-id="${escapeHtml(item.id)}" data-field="owner" value="${escapeHtml(item.owner || "")}"></td>
      <td><input class="notes-input" type="text" data-id="${escapeHtml(item.id)}" data-field="notes" value="${escapeHtml(item.notes || "")}"></td>
      <td>
        <div class="row-actions">
          <button class="mini-button" type="button" data-action="duplicate" data-id="${escapeHtml(item.id)}" title="Duplicate"><i data-lucide="copy"></i></button>
          <button class="mini-button danger" type="button" data-action="delete" data-id="${escapeHtml(item.id)}" title="Delete"><i data-lucide="trash-2"></i></button>
        </div>
      </td>
    </tr>
  `).join("");
}

function updateField(target) {
  const id = target.dataset.id;
  const field = target.dataset.field;
  if (!id || !field) return;
  const item = state.data.items.find((entry) => entry.id === id);
  if (!item) return;

  if (target.type === "checkbox") {
    item[field] = target.checked;
  } else if (field === "planned" || field === "actual") {
    item[field] = numberValue(target.value);
  } else {
    item[field] = target.value;
  }

  scheduleSave();
  renderSummary();
  renderCategories();
  renderKanban();
}

function addCategory() {
  const name = prompt("Category name");
  if (!name || !name.trim()) return;
  const baseId = slugify(name);
  let id = baseId;
  let count = 2;
  while (state.data.categories.some((category) => category.id === id)) {
    id = `${baseId}-${count}`;
    count += 1;
  }
  const palette = ["#3a86ff", "#00a878", "#ffbe0b", "#ff6b6b", "#7b61ff", "#00b4d8"];
  state.data.categories.push({
    id,
    name: titleize(name),
    icon: "FolderOpen",
    color: palette[state.data.categories.length % palette.length],
    description: "Manual budget category."
  });
  scheduleSave();
  render();
}

function bindEvents() {
  $("passwordForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    state.password = $("passwordInput").value;
    setMessage("Opening...");
    try {
      await loadBudget();
    } catch (error) {
      setMessage(error.message);
    }
  });

  $("saveButton").addEventListener("click", () => {
    saveBudget().catch((error) => setSaveState(error.message, "circle-alert"));
  });
  $("printButton").addEventListener("click", () => window.print());
  $("lockButton").addEventListener("click", () => {
    sessionStorage.removeItem("summerBudgetPassword");
    state.password = "";
    state.data = null;
    $("dashboard").hidden = true;
    $("lockScreen").hidden = false;
    $("passwordInput").value = "";
    $("passwordInput").focus();
  });
  $("addCategoryButton").addEventListener("click", addCategory);

  $("targetInput").addEventListener("input", (event) => {
    state.data.settings.target = numberValue(event.target.value);
    scheduleSave();
    renderSummary();
  });
  $("bufferInput").addEventListener("input", (event) => {
    state.data.settings.contingencyPercent = numberValue(event.target.value);
    $("bufferInputLabel").textContent = `${state.data.settings.contingencyPercent}%`;
    scheduleSave();
    renderSummary();
  });

  $("categoryFilter").addEventListener("change", (event) => {
    state.filters.category = event.target.value;
    renderRows();
    refreshIcons();
  });
  $("statusFilter").addEventListener("change", (event) => {
    state.filters.status = event.target.value;
    renderRows();
    refreshIcons();
  });
  $("searchInput").addEventListener("input", (event) => {
    state.filters.search = event.target.value;
    renderRows();
    refreshIcons();
  });

  $("addItemForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const name = $("itemNameInput").value.trim();
    if (!name) return;
    state.data.items.push({
      id: uid("item"),
      categoryId: $("itemCategoryInput").value,
      name,
      planned: numberValue($("itemPlannedInput").value),
      actual: 0,
      included: true,
      status: "estimate",
      date: "",
      owner: $("itemOwnerInput").value.trim() || "Family",
      notes: "",
      source: "manual"
    });
    $("itemNameInput").value = "";
    $("itemPlannedInput").value = 0;
    $("itemOwnerInput").value = "";
    scheduleSave();
    render();
  });

  $("budgetRows").addEventListener("input", (event) => {
    updateField(event.target);
  });
  $("budgetRows").addEventListener("change", (event) => {
    updateField(event.target);
    if (["categoryId", "status", "included"].includes(event.target.dataset.field)) {
      renderRows();
      refreshIcons();
    }
  });
  $("budgetRows").addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const item = state.data.items.find((entry) => entry.id === button.dataset.id);
    if (!item) return;

    if (button.dataset.action === "duplicate") {
      state.data.items.push({ ...item, id: uid("item"), name: `${item.name} copy` });
    }
    if (button.dataset.action === "delete") {
      state.data.items = state.data.items.filter((entry) => entry.id !== item.id);
    }
    scheduleSave();
    render();
  });
}

bindEvents();
refreshIcons();

if (state.password) {
  loadBudget().catch(() => {
    sessionStorage.removeItem("summerBudgetPassword");
    state.password = "";
    $("lockScreen").hidden = false;
    $("dashboard").hidden = true;
  });
}
