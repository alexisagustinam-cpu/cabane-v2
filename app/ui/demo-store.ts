// Datos de demostración para el modo prueba (solo localhost / red local).
// En modo prueba las escrituras no llegan a la base real, así que un pedido
// enviado no aparecería en Cocina ni en Caja. Este mini "servidor" en memoria
// guarda pedidos de ejemplo y responde como lo haría Supabase (filtros,
// triggers de estado, cobros), para poder probar el flujo completo. Vive en
// sessionStorage: se borra al cerrar la pestaña o con "Reiniciar demo".

import { uuid } from "./uuid";
export const DEMO_READY_EVENT = "cabane:demo-order-ready";
const KEY = "cabane_demo_v1";
const BAR_CATEGORIES = ["Bebidas", "Cafés", "Postres"];

type Row = Record<string, unknown>;
interface Store { orders: Row[]; items: Row[]; payments: Row[]; allocs: Row[]; seq: number }
interface Product { id: string; name: string; category: string; price: number }

let store: Store | null = null;
let seeding: Promise<void> | null = null;

export function isDemoEnabled(): boolean {
  try { return localStorage.getItem("cabane_demo") !== "off"; } catch { return true; }
}
export function setDemoEnabled(on: boolean) {
  try { localStorage.setItem("cabane_demo", on ? "on" : "off"); } catch { /* sin storage */ }
}
export function resetDemo() {
  try { sessionStorage.removeItem(KEY); } catch { /* sin storage */ }
  store = null; seeding = null;
}

function persist() {
  try { sessionStorage.setItem(KEY, JSON.stringify(store)); } catch { /* lleno o bloqueado */ }
}
function loadSaved(): boolean {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) { store = JSON.parse(raw) as Store; return true; }
  } catch { /* corrupto: se vuelve a sembrar */ }
  return false;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const stationOf = (category: string) => (BAR_CATEGORIES.includes(category) ? "bar" : "kitchen");

// Mismo cálculo que el trigger de Fase 11/12 (estado de la cabecera según sus líneas).
function statusFromItems(its: Row[]): string {
  if (its.every(i => i.item_status === "listo")) return "listo";
  if (its.some(i => i.item_status === "preparando" || i.item_status === "listo")) return "preparando";
  return "enviado";
}

async function seed(origin: string, headers: Headers) {
  let products: Product[] = [];
  try {
    const h = new Headers();
    for (const k of ["apikey", "authorization"]) { const v = headers.get(k); if (v) h.set(k, v); }
    const res = await fetch(`${origin}/rest/v1/products?select=id,name,category,price&is_active=eq.true&order=name`, { headers: h });
    if (res.ok) products = await res.json();
  } catch { /* sin productos reales: se usan de ejemplo */ }
  if (!products.length) {
    products = [
      { id: "demo-p1", name: "Sánduche de ejemplo", category: "Sánduches", price: 6.5 },
      { id: "demo-p2", name: "Ensalada de ejemplo", category: "Ensaladas", price: 6.75 },
      { id: "demo-p3", name: "Limonada", category: "Bebidas", price: 2.5 },
      { id: "demo-p4", name: "Capuchino", category: "Cafés", price: 2.9 },
    ];
  }
  const kitchen = products.filter(p => stationOf(p.category) === "kitchen");
  const bar = products.filter(p => stationOf(p.category) === "bar");
  const kp = (n: number) => kitchen[n % (kitchen.length || 1)] ?? products[0];
  const bp = (n: number) => bar[n % (bar.length || 1)] ?? products[0];

  const now = Date.now();
  const orders: Row[] = [];
  const items: Row[] = [];
  const payments: Row[] = [];
  let num = 101;
  const add = (table: string, name: string, mins: number, lines: [Product, number, string, string?][], paid = false) => {
    const id = uuid();
    const its = lines.map(([p, qty, st, notes]) => ({
      id: uuid(), order_id: id, product_id: p.id, product_name: p.name, quantity: qty,
      unit_price: p.price, notes: notes ?? null, station: stationOf(p.category), item_status: st,
    }));
    const total = round2(its.reduce((s, i) => s + (i.quantity as number) * (i.unit_price as number), 0));
    const created_at = new Date(now - mins * 60000).toISOString();
    orders.push({
      id, order_number: num++, table_label: table, status: statusFromItems(its), payment_status: paid ? "paid" : "pending",
      total, created_at, table_released_at: null, table_note: null, customer_name: name, creator_name: "Mesero demo",
    });
    items.push(...its);
    if (paid) payments.push({ id: uuid(), order_id: id, method: "efectivo", amount: total, created_at, charger_name: "Caja demo" });
  };
  add("Mesa 1", "Ana", 3, [[kp(0), 2, "enviado", "sin cebolla"], [bp(0), 2, "enviado"]]);
  add("Mesa 3", "Carlos", 12, [[kp(1), 1, "preparando"], [bp(1), 1, "listo"]]);
  add("Mesa 3", "María", 6, [[kp(2), 1, "enviado"]]);
  add("Mesa 5", "Jorge", 25, [[kp(3), 1, "listo"], [bp(0), 2, "listo"]]);
  add("Mesa 7", "Sofía", 40, [[kp(0), 2, "listo"]], true);
  add("Para llevar", "Diego", 17, [[kp(4), 1, "preparando"], [bp(2), 1, "enviado"]]);
  store = { orders, items, payments, allocs: [], seq: num };
  persist();
}

async function ensureStore(origin: string, headers: Headers) {
  if (store || loadSaved()) return;
  if (!seeding) seeding = seed(origin, headers);
  await seeding;
}

// ── Mini PostgREST: filtros, orden y relaciones ──────────────────────────
const RESERVED = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);

function splitList(s: string): string[] {
  const out: string[] = []; let cur = ""; let quoted = false;
  for (const ch of s) {
    if (ch === '"') { quoted = !quoted; continue; }
    if (ch === "," && !quoted) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function matches(row: Row, col: string, spec: string): boolean {
  const dot = spec.indexOf(".");
  const op = spec.slice(0, dot), val = spec.slice(dot + 1);
  const v = row[col];
  const isNull = v === null || v === undefined;
  switch (op) {
    case "eq": return !isNull && String(v) === val;
    case "neq": return !isNull && String(v) !== val;
    case "in": return !isNull && splitList(val.replace(/^\(|\)$/g, "")).includes(String(v));
    case "is": return val === "null" ? isNull : String(v) === val;
    case "gte": case "gt": case "lte": case "lt": {
      if (isNull) return false;
      const a = typeof v === "number" ? v : String(v);
      const b = typeof v === "number" ? Number(val) : val;
      return op === "gte" ? a >= b : op === "gt" ? a > b : op === "lte" ? a <= b : a < b;
    }
    default: return true;
  }
}

function parseFilters(sp: URLSearchParams) {
  const top: [string, string][] = [];
  const emb: Record<string, [string, string][]> = {};
  sp.forEach((v, k) => {
    if (RESERVED.has(k)) return;
    const d = k.indexOf(".");
    if (d > 0) (emb[k.slice(0, d)] ||= []).push([k.slice(d + 1), v]);
    else top.push([k, v]);
  });
  return { top, emb };
}

function sortRows(rows: Row[], order: string | null): Row[] {
  if (!order) return rows;
  const keys = order.split(",").map(s => { const [c, d] = s.split("."); return { c, dir: d === "desc" ? -1 : 1 }; });
  return [...rows].sort((a, b) => {
    for (const { c, dir } of keys) {
      const x = a[c] as string | number, y = b[c] as string | number;
      if (x === y) continue;
      return x < y ? -dir : dir;
    }
    return 0;
  });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
function respond(rows: Row[], wantsObject: boolean, status = 200): Response {
  if (!wantsObject) return json(rows, status);
  if (rows.length === 1) return json(rows[0], status);
  return json({ code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: `The result contains ${rows.length} rows`, hint: null }, 406);
}

const TABLES = ["orders", "order_items", "payments", "payment_item_allocations"];

export async function demoGet(path: string, url: URL, headers: Headers, wantsObject: boolean): Promise<Response | null> {
  if (!TABLES.includes(path)) return null;
  await ensureStore(url.origin, headers);
  const s = store!;
  const { top, emb } = parseFilters(url.searchParams);
  const select = url.searchParams.get("select") || "*";
  const ok = (row: Row, f: [string, string][]) => f.every(([c, sp]) => matches(row, c, sp));
  let out: Row[] = [];

  if (path === "orders") {
    const embed = /order_items/.test(select), inner = /order_items!inner/.test(select);
    const itemF = emb["order_items"] || [];
    for (const o of s.orders) {
      if (!ok(o, top)) continue;
      let its = s.items.filter(i => i.order_id === o.id);
      if (itemF.length) its = its.filter(i => ok(i, itemF));
      if (inner && !its.length) continue;
      out.push(embed ? { ...o, order_items: its } : { ...o });
    }
  } else if (path === "order_items") {
    const embed = /orders/.test(select), parentF = emb["orders"] || [];
    const inner = /orders!inner/.test(select) || parentF.length > 0;
    for (const i of s.items) {
      if (!ok(i, top)) continue;
      const parent = s.orders.find(o => o.id === i.order_id);
      if (inner && (!parent || !ok(parent, parentF))) continue;
      out.push(embed ? { ...i, orders: parent ? { ...parent } : null } : { ...i });
    }
  } else {
    const rows = path === "payments" ? s.payments : s.allocs;
    out = rows.filter(r => ok(r, top)).map(r => ({ ...r }));
  }

  out = sortRows(out, url.searchParams.get("order"));
  const limit = Number(url.searchParams.get("limit"));
  if (limit > 0) out = out.slice(0, limit);
  return respond(out, wantsObject);
}

function emitReady(o: Row) {
  const detail = { ...o, order_items: store!.items.filter(i => i.order_id === o.id) };
  setTimeout(() => window.dispatchEvent(new CustomEvent(DEMO_READY_EVENT, { detail })), 60);
}

// Igual que el trigger: al cambiar las líneas se recalcula la cabecera del pedido.
function syncStatus(orderId: unknown) {
  const o = store!.orders.find(x => x.id === orderId);
  if (!o || o.status === "cancelado") return;
  const its = store!.items.filter(i => i.order_id === orderId);
  if (!its.length) return;
  const prev = o.status;
  o.status = statusFromItems(its);
  if (prev !== "listo" && o.status === "listo") emitReady(o);
}

function pendingItems(orderId: unknown) {
  const s = store!;
  return s.items.filter(i => i.order_id === orderId).map(i => {
    const paid = s.allocs.filter(a => a.order_item_id === i.id).reduce((t, a) => t + (a.quantity as number), 0);
    return { order_item_id: i.id, product_name: i.product_name, quantity: i.quantity, paid, pending: Math.max(0, (i.quantity as number) - paid) };
  });
}

export async function demoMutate(path: string, method: string, url: URL, body: unknown, headers: Headers, wantsObject: boolean): Promise<Response | null> {
  const rpc = path.startsWith("rpc/") ? path.slice(4) : null;
  if (rpc ? !["pay_order", "move_order", "release_table", "record_item_payment", "swap_order_item"].includes(rpc) : !["orders", "order_items"].includes(path)) return null;
  if (!rpc && method !== "POST" && method !== "PATCH") return null;
  await ensureStore(url.origin, headers);
  const s = store!;
  const b = (body && typeof body === "object" ? body : {}) as Row;
  const { top } = parseFilters(url.searchParams);
  const select = url.searchParams.get("select") || "";

  if (rpc === "pay_order") {
    const o = s.orders.find(x => x.id === b.p_order_id);
    if (!o) return json({ ok: false, error: "El pedido no existe" });
    if (o.status === "cancelado") return json({ ok: false, error: "El pedido está cancelado" });
    if (o.payment_status === "paid") return json({ ok: false, error: "Este pedido ya fue cobrado" });
    const parts = (b.p_parts as { method: string; amount: number }[]) || [];
    if (Math.abs(parts.reduce((t, p) => t + p.amount, 0) - (o.total as number)) > 0.01) return json({ ok: false, error: "La suma no coincide con el total" });
    parts.forEach(p => s.payments.push({ id: uuid(), order_id: o.id, method: p.method, amount: p.amount, created_at: new Date().toISOString(), charger_name: "Prueba" }));
    o.payment_status = "paid";
    persist();
    return json({ ok: true });
  }
  if (rpc === "swap_order_item") {
    const o = s.orders.find(x => x.id === b.p_order_id);
    if (!o) return json({ ok: false, error: "El pedido no existe" });
    if (o.status !== "enviado") return json({ ok: false, error: "Ya se empezó a preparar este pedido, no se puede editar" });
    if (o.payment_status === "paid") return json({ ok: false, error: "Este pedido ya fue cobrado" });
    if (s.allocs.some(a => a.order_id === o.id)) return json({ ok: false, error: "Este pedido ya tiene cobros parciales registrados" });
    const item = s.items.find(i => i.id === b.p_order_item_id && i.order_id === o.id);
    if (!item) return json({ ok: false, error: "Ese producto no pertenece a este pedido" });
    let p: Product | undefined;
    try {
      const h = new Headers();
      for (const k of ["apikey", "authorization"]) { const v = headers.get(k); if (v) h.set(k, v); }
      const res = await fetch(`${url.origin}/rest/v1/products?id=eq.${b.p_new_product_id}&is_active=eq.true&select=id,name,category,price`, { headers: h });
      if (res.ok) p = ((await res.json()) as Product[])[0];
    } catch { /* sin red */ }
    if (!p) return json({ ok: false, error: "El producto de reemplazo no existe o no está activo" });
    Object.assign(item, { product_id: p.id, product_name: p.name, unit_price: p.price, station: stationOf(p.category), item_status: "enviado", notes: null });
    o.total = round2(s.items.filter(i => i.order_id === o.id).reduce((t, i) => t + (i.quantity as number) * (i.unit_price as number), 0));
    syncStatus(o.id);
    persist();
    return json({ ok: true });
  }
  if (rpc === "move_order") {
    const o = s.orders.find(x => x.id === b.p_order_id);
    if (!o) return json({ ok: false, error: "El pedido no existe" });
    o.table_label = b.p_table; persist();
    return json({ ok: true });
  }
  if (rpc === "release_table") {
    const hit = s.orders.filter(o => o.table_label === b.p_table && !o.table_released_at && o.payment_status === "paid" && o.status === "listo");
    if (!hit.length) return json({ ok: false, error: "La mesa no tiene pedidos pagados y listos para liberar" });
    hit.forEach(o => { o.table_released_at = new Date().toISOString(); });
    persist();
    return json({ ok: true, released: hit.length });
  }
  if (rpc === "record_item_payment") {
    const o = s.orders.find(x => x.id === b.p_order_id);
    if (!o) return json({ ok: false, error: "El pedido no existe" });
    const allocs = (b.p_allocations as { order_item_id: string; quantity: number }[]) || [];
    const before = pendingItems(o.id);
    let amount = 0;
    for (const a of allocs) {
      const line = before.find(p => p.order_item_id === a.order_item_id);
      if (!line || a.quantity > line.pending + 0.0001) return json({ ok: false, error: "Cantidad mayor a lo pendiente" });
      amount += a.quantity * (s.items.find(i => i.id === a.order_item_id)!.unit_price as number);
    }
    allocs.forEach(a => s.allocs.push({ id: uuid(), order_id: o.id, order_item_id: a.order_item_id, quantity: a.quantity, person_name: b.p_person_name ?? null }));
    amount = round2(amount);
    s.payments.push({ id: uuid(), order_id: o.id, method: b.p_method, amount, created_at: new Date().toISOString(), charger_name: "Prueba" });
    const after = pendingItems(o.id);
    const orderPaid = after.every(p => p.pending <= 0.0001);
    if (orderPaid) o.payment_status = "paid";
    persist();
    return json({ ok: true, amount, pending_items: after, order_paid: orderPaid });
  }

  if (path === "orders" && method === "POST") {
    const rows = (Array.isArray(body) ? body : [b]).map((r: Row) => ({
      id: uuid(), order_number: s.seq++, created_at: new Date().toISOString(), status: "enviado",
      payment_status: "pending", table_released_at: null, table_note: null, customer_name: null, ...r,
    }));
    s.orders.push(...rows); persist();
    return respond(rows.map(r => (/order_items/.test(select) ? { ...r, order_items: [] } : r)), wantsObject, 201);
  }
  if (path === "order_items" && method === "POST") {
    const rows = (Array.isArray(body) ? body : [b]).map((r: Row) => ({ id: uuid(), item_status: "enviado", notes: null, ...r }));
    s.items.push(...rows); persist();
    return respond(rows, wantsObject, 201);
  }
  if (method === "PATCH") {
    const list = path === "orders" ? s.orders : s.items;
    const hit = list.filter(r => top.every(([c, sp]) => matches(r, c, sp)));
    hit.forEach(r => Object.assign(r, b));
    if (path === "order_items") new Set(hit.map(r => r.order_id)).forEach(id => syncStatus(id));
    persist();
    return respond(hit.map(r => ({ ...r })), wantsObject);
  }
  return null;
}

// "Eliminar definitivamente" del historial (en modo prueba no llama al servidor).
export async function demoDeleteOrders(ids: string[]) {
  if (!store && !loadSaved()) return;
  const s = store!;
  s.orders = s.orders.filter(o => !ids.includes(o.id as string));
  s.items = s.items.filter(i => !ids.includes(i.order_id as string));
  s.payments = s.payments.filter(p => !ids.includes(p.order_id as string));
  s.allocs = s.allocs.filter(a => !ids.includes(a.order_id as string));
  persist();
}
