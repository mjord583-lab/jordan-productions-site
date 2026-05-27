import { getDeployStore, getStore } from "@netlify/blobs";

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function defaultBudget() {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    settings: {
      target: 10000,
      contingencyPercent: 15,
      currency: "USD"
    },
    categories: [
      {
        id: "family-trip",
        name: "Family Trip",
        icon: "MapPinned",
        color: "#3a86ff",
        description: "Travel, lodging, meals, and memory-making."
      },
      {
        id: "summer-camps",
        name: "Summer Camps",
        icon: "TentTree",
        color: "#00a878",
        description: "Camp weeks, deposits, and kid activities."
      },
      {
        id: "family-fun",
        name: "Family Fun",
        icon: "FerrisWheel",
        color: "#ffbe0b",
        description: "Local outings, rainy-day plans, and easy wins."
      }
    ],
    items: []
  };
}

function budgetStore() {
  const isProduction = globalThis.Netlify?.context?.deploy?.context === "production";
  if (isProduction) {
    return getStore("summer-budget", { consistency: "strong" });
  }
  return getDeployStore("summer-budget");
}

function passwordFromPayload(req, payload) {
  return payload?.password || req.headers.get("x-summer-budget-password") || "";
}

function configuredPassword() {
  return globalThis.Netlify?.env?.get?.("SUMMER_BUDGET_PASSWORD") || "";
}

function normalizeBudget(data) {
  const fallback = defaultBudget();
  return {
    version: Number(data?.version || 1),
    updatedAt: data?.updatedAt || new Date().toISOString(),
    settings: { ...fallback.settings, ...(data?.settings || {}) },
    categories: Array.isArray(data?.categories) ? data.categories : fallback.categories,
    items: Array.isArray(data?.items) ? data.items : fallback.items
  };
}

export default async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Use POST." }, 405);
  }

  let payload = {};
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON." }, 400);
  }

  const expectedPassword = configuredPassword();
  if (!expectedPassword) {
    return jsonResponse({ error: "Budget password is not configured." }, 500);
  }

  if (passwordFromPayload(req, payload) !== expectedPassword) {
    return jsonResponse({ error: "Incorrect password." }, 401);
  }

  const store = budgetStore();
  const action = payload.action || "load";

  if (action === "save") {
    const budget = normalizeBudget(payload.data);
    budget.updatedAt = new Date().toISOString();
    await store.setJSON("budget", budget);
    return jsonResponse({ ok: true, data: budget });
  }

  if (action === "load") {
    const stored = await store.get("budget", { type: "json" });
    const budget = normalizeBudget(stored || defaultBudget());
    return jsonResponse({ ok: true, data: budget });
  }

  return jsonResponse({ error: "Unknown action." }, 400);
};

export const config = {
  path: "/api/summer-budget"
};
