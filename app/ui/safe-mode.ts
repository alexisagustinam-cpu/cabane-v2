// Modo prueba: cuando la app corre en la computadora o la red local
// (localhost, 192.168.x.x…) se conecta a la MISMA base de datos que usa el
// restaurante. Para revisar cambios sin tocar datos reales, toda escritura
// se simula aquí: lecturas y login pasan normal, inserts/updates/RPC no
// llegan a Supabase. Se desactiva con NEXT_PUBLIC_ALLOW_LOCAL_WRITES=1.

import { demoGet, demoMutate, isDemoEnabled } from "./demo-store";

export const SAFE_MODE_EVENT = "cabane:safe-mode-write";

export function isSafeMode(): boolean {
  if (typeof window === "undefined") return false;
  if (process.env.NEXT_PUBLIC_ALLOW_LOCAL_WRITES === "1") return false;
  const h = window.location.hostname;
  return h === "localhost" || h === "127.0.0.1" || h.endsWith(".local")
    || /^192\.168\./.test(h) || /^10\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h);
}

function notify(what: string) {
  window.dispatchEvent(new CustomEvent(SAFE_MODE_EVENT, { detail: what }));
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// Respuestas simuladas por RPC: lo justo para que la pantalla siga su flujo.
const RPC_RESULTS: Record<string, unknown> = {
  pay_order: { ok: true },
  register_waste: { ok: true },
  move_order: { ok: true },
  release_table: { ok: true, released: 1 },
  record_item_payment: { ok: true, amount: 0, pending_items: [], order_paid: false },
};

function withFakeIds(row: Record<string, unknown>) {
  return { id: crypto.randomUUID(), created_at: new Date().toISOString(), order_number: 0, order_items: [], ...row };
}

export const safeFetch: typeof fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
  if (!isSafeMode() || !url.includes("/rest/v1/")) return fetch(input, init);

  const u = new URL(url);
  const path = u.pathname.split("/rest/v1/")[1] || "";
  const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
  const wantsObject = (headers.get("Accept") || "").includes("vnd.pgrst.object");

  // Lecturas: pedidos y cobros salen de los datos de demostración; el resto, de la base real.
  if (method === "GET" || method === "HEAD") {
    if (method === "GET" && isDemoEnabled()) {
      const demo = await demoGet(path, u, headers, wantsObject);
      if (demo) return demo;
    }
    return fetch(input, init);
  }

  let body: unknown = null;
  try { body = init?.body ? JSON.parse(String(init.body)) : null; } catch { body = null; }
  if (isDemoEnabled()) {
    const demo = await demoMutate(path, method, u, body, headers, wantsObject);
    if (demo) return demo;
  }

  if (path.startsWith("rpc/")) {
    const fn = path.slice(4);
    notify(fn);
    return json(RPC_RESULTS[fn] ?? { ok: true });
  }

  notify(path);
  if (method === "POST") {
    const rows = (Array.isArray(body) ? body : [body ?? {}]).map(r => withFakeIds(r as Record<string, unknown>));
    return json(wantsObject ? rows[0] : rows, 201);
  }
  // PATCH/DELETE: se devuelve una fila simulada para que la UI lo dé por hecho.
  const row = { id: crypto.randomUUID(), ...(body && typeof body === "object" ? body : {}) };
  return json(wantsObject ? row : [row]);
};
