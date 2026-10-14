// Tiempos de cocina y barra: cuánto tardan en tener listo cada producto.
// La base de datos anota las horas (Fase 20: sent_at / started_at / ready_at en
// order_items). Aquí se resume para Admin → Tiempos. Sin dependencias de React
// para poder probarlo con node --test.

export type Station = "kitchen" | "bar";
export interface PrepRow {
  product_name: string;
  station: Station;
  quantity: number;
  sent_at: string | null;
  started_at: string | null;
  ready_at: string | null;
}

// Mismos colores que ve el personal en la tablet: verde hasta 10 min, naranja 10–15, rojo +15.
export const GREEN_MAX = 10;
export const ORANGE_MAX = 15;
// Más de una hora sin marcar "listo" = se olvidaron de marcarlo. No entra al promedio
// (lo inflaría) y se cuenta aparte.
export const FORGOTTEN_MIN = 60;

export interface StationTimes {
  avg: number | null;      // minutos promedio de "llegó" a "listo"
  median: number | null;
  lines: number;           // productos medidos (líneas de pedido)
  units: number;
  onTime: number;          // líneas en verde
  mid: number;             // naranja
  late: number;            // rojo (sin contar olvidados)
  forgotten: number;       // sin marcar listo a tiempo (> FORGOTTEN_MIN o nunca)
  waitAvg: number | null;  // de "llegó" a "preparando" (solo si lo marcaron)
  workAvg: number | null;  // de "preparando" a "listo"
}
export interface ProductTimes { name: string; station: Station; lines: number; units: number; avg: number; min: number; max: number }
export interface PrepSummary { kitchen: StationTimes; bar: StationTimes; products: ProductTimes[] }

const mins = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / 60000;
const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Minutos de "llegó a cocina/barra" a "listo"; null si no se puede medir. */
export function totalMinutes(r: PrepRow): number | null {
  if (!r.sent_at || !r.ready_at) return null;
  const m = mins(r.sent_at, r.ready_at);
  return m >= 0 ? m : null;
}

/** Línea olvidada: lleva más de una hora sin marcarse lista, o se marcó después de una hora. */
export function isForgotten(r: PrepRow, now: Date): boolean {
  if (!r.sent_at) return false;
  if (!r.ready_at) return mins(r.sent_at, now.toISOString()) > FORGOTTEN_MIN;
  const t = totalMinutes(r);
  return t !== null && t > FORGOTTEN_MIN;
}

function station(rows: PrepRow[], now: Date): StationTimes {
  const measured: number[] = [], waits: number[] = [], works: number[] = [];
  let units = 0, onTime = 0, mid = 0, late = 0, forgotten = 0;
  for (const r of rows) {
    if (isForgotten(r, now)) { forgotten++; continue; }
    const t = totalMinutes(r);
    if (t === null) continue; // todavía en preparación (normal) o sin datos
    measured.push(t); units += r.quantity;
    if (t <= GREEN_MAX) onTime++; else if (t <= ORANGE_MAX) mid++; else late++;
    if (r.started_at && r.sent_at) {
      const w = mins(r.sent_at, r.started_at), k = mins(r.started_at, r.ready_at!);
      if (w >= 0 && k >= 0) { waits.push(w); works.push(k); }
    }
  }
  return {
    avg: mean(measured), median: median(measured), lines: measured.length, units, onTime, mid, late, forgotten,
    // Solo se informa la división si la mayoría pasó por "preparando"; si no, confunde.
    waitAvg: waits.length >= Math.max(1, measured.length / 2) ? mean(waits) : null,
    workAvg: works.length >= Math.max(1, measured.length / 2) ? mean(works) : null,
  };
}

export function summarize(rows: PrepRow[], now: Date = new Date()): PrepSummary {
  const byProduct = new Map<string, { name: string; station: Station; ts: number[]; units: number }>();
  for (const r of rows) {
    if (isForgotten(r, now)) continue;
    const t = totalMinutes(r);
    if (t === null) continue;
    const key = `${r.station}|${r.product_name}`;
    const p = byProduct.get(key) || { name: r.product_name, station: r.station, ts: [], units: 0 };
    p.ts.push(t); p.units += r.quantity; byProduct.set(key, p);
  }
  const products = [...byProduct.values()]
    .map(p => ({ name: p.name, station: p.station, lines: p.ts.length, units: p.units, avg: mean(p.ts)!, min: Math.min(...p.ts), max: Math.max(...p.ts) }))
    .sort((a, b) => b.avg - a.avg || b.lines - a.lines || a.name.localeCompare(b.name));
  return {
    kitchen: station(rows.filter(r => r.station === "kitchen"), now),
    bar: station(rows.filter(r => r.station === "bar"), now),
    products,
  };
}

/** Promedio por grupo (hora del día o día del período) para el gráfico; 0 = sin datos. */
export function seriesBy(rows: PrepRow[], st: Station, bucketOf: (sent: Date) => number, size: number, now: Date = new Date()): { avg: number[]; count: number[] } {
  const sum = Array(size).fill(0), count = Array(size).fill(0);
  for (const r of rows) {
    if (r.station !== st || isForgotten(r, now)) continue;
    const t = totalMinutes(r);
    if (t === null) continue;
    const b = bucketOf(new Date(r.sent_at!));
    if (b < 0 || b >= size) continue;
    sum[b] += t; count[b]++;
  }
  return { avg: sum.map((s, i) => (count[i] ? s / count[i] : 0)), count };
}

/** "8 min", "1 min", "45 s", "—" */
export function fmtMin(m: number | null | undefined): string {
  if (m === null || m === undefined || !isFinite(m)) return "—";
  if (m < 1) return `${Math.max(1, Math.round(m * 60))} s`;
  return `${Math.round(m)} min`;
}

// ── Espejo del trigger de la Fase 20 (lo usa el modo prueba y documenta las reglas) ──
type Times = { item_status: string; product_id?: unknown; sent_at?: string | null; started_at?: string | null; ready_at?: string | null };
/** Devuelve las horas que debe tener una línea tras insertarse (prev = null) o cambiar de estado. */
export function applyItemTimes(prev: Times | null, next: Times, nowIso: string): { sent_at: string | null; started_at: string | null; ready_at: string | null } {
  if (!prev) {
    return {
      sent_at: nowIso,
      started_at: next.item_status === "preparando" || next.item_status === "listo" ? nowIso : null,
      ready_at: next.item_status === "listo" ? nowIso : null,
    };
  }
  // Nadie puede escribir las horas a mano: se parte de las que ya tenía.
  let sent = prev.sent_at ?? null, started = prev.started_at ?? null, ready = prev.ready_at ?? null;
  const statusChanged = next.item_status !== prev.item_status;
  const productChanged = next.product_id !== undefined && next.product_id !== prev.product_id;
  if (next.item_status === "enviado" && (statusChanged || productChanged)) {
    // Vuelve a empezar (p. ej. se cambió el producto): cuenta desde ahora.
    sent = nowIso; started = null; ready = null;
  } else if (next.item_status === "preparando" && statusChanged) {
    started = started ?? nowIso; ready = null;
  } else if (next.item_status === "listo" && statusChanged) {
    ready = nowIso;
  }
  return { sent_at: sent, started_at: started, ready_at: ready };
}
