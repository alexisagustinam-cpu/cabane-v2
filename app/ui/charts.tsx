"use client";
// Gráficos de Reportes. Reglas (skill dataviz): barras finas (≤24 px) con
// punta redondeada de 4 px sobre una sola línea base, rejilla tenue, solo el
// pico rotulado, ficha con el valor al pasar el mouse / tocar / enfocar, y la
// misma información siempre disponible como tabla. El texto usa colores de
// texto, nunca el color de la serie.
import { useState, type ReactNode } from "react";

const INK = "#2A1A1F", INK2 = "#5E4A40", MUTED = "#7A6555", GRID = "#E6D9C6", SURFACE = "#F7F0E6";
export const SERIES = "#7A1E3A"; // una sola serie: vino de la marca
// Paleta de categorías validada (validate_palette.js, fondo #F7F0E6, todos los pares):
// vino · ámbar · azul. El ámbar queda < 3:1 de contraste → siempre con su valor escrito al lado.
export const CATEGORICAL = ["#A8325A", "#DB8F23", "#2A78D6"];

const compact = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, "")}K` : `${Math.round(n)}`;

// Tope "limpio" para el eje: 1, 2 o 5 × 10^n.
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

export interface Datum { label: string; value: number; long?: string }

export function ColumnChart({ data, format, height = 170, ariaLabel, everyNthLabel = 1, emptyText = "Sin ventas en este período" }: {
  data: Datum[];
  format: (n: number) => string;
  height?: number;
  ariaLabel: string;
  everyNthLabel?: number;
  emptyText?: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(0, ...data.map(d => d.value));
  const top = niceMax(max);
  const peak = max > 0 ? data.findIndex(d => d.value === max) : -1;
  const plotH = height - 26; // espacio para las etiquetas del eje X

  if (max <= 0) return <p style={{ fontSize: 13, fontWeight: 700, color: MUTED, padding: "18px 0" }}>{emptyText}</p>;

  return (
    <div>
      <div role="group" aria-label={ariaLabel} style={{ position: "relative", height, paddingLeft: 40 }}
        onMouseLeave={() => setActive(null)}>
        {/* Rejilla y eje Y: 0, mitad y tope */}
        {[0, 0.5, 1].map(f => (
          <div key={f} aria-hidden="true" style={{ position: "absolute", left: 40, right: 0, top: plotH - f * plotH, height: 1, background: f === 0 ? "#CDBBA3" : GRID }}>
            <span style={{ position: "absolute", right: "100%", marginRight: 8, top: -8, fontSize: 11, fontWeight: 700, color: MUTED, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
              {f === 0 ? "0" : `$${compact(top * f)}`}
            </span>
          </div>
        ))}
        <div style={{ position: "absolute", left: 40, right: 0, top: 0, height: plotH, display: "flex", alignItems: "flex-end" }}>
          {data.map((d, i) => {
            const h = d.value > 0 ? Math.max(3, (d.value / top) * plotH) : 0;
            const on = active === i;
            return (
              <button key={i} type="button" aria-label={`${d.long || d.label}: ${format(d.value)}`}
                onMouseEnter={() => setActive(i)} onFocus={() => setActive(i)} onBlur={() => setActive(null)}
                onClick={() => setActive(on ? null : i)}
                style={{ flex: 1, minWidth: 0, height: "100%", position: "relative", display: "flex", alignItems: "flex-end", justifyContent: "center", background: on ? "rgba(122,30,58,0.06)" : "transparent", border: "none", padding: 0, cursor: "pointer", borderRadius: 6 }}>
                <span aria-hidden="true" style={{ width: "62%", maxWidth: 24, height: h, background: SERIES, opacity: active === null || on ? 1 : 0.55, borderRadius: "4px 4px 0 0", transition: "height .35s ease, opacity .15s" }} />
                {/* Solo el pico lleva su valor escrito */}
                {i === peak && !on && (
                  <span aria-hidden="true" style={{ position: "absolute", bottom: h + 4, fontSize: 11, fontWeight: 900, color: INK, whiteSpace: "nowrap" }}>{format(d.value)}</span>
                )}
                {on && (
                  <span role="tooltip" style={{ position: "absolute", bottom: h + 8, left: "50%", transform: "translateX(-50%)", zIndex: 5, background: INK, color: "#fff", borderRadius: 10, padding: "6px 10px", whiteSpace: "nowrap", boxShadow: "0 6px 16px rgba(23,18,15,0.25)", pointerEvents: "none", textAlign: "left" }}>
                    <span style={{ display: "block", fontSize: 14, fontWeight: 900 }}>{format(d.value)}</span>
                    <span style={{ display: "block", fontSize: 11, fontWeight: 700, opacity: 0.75 }}>{d.long || d.label}</span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {/* Etiquetas del eje X */}
        <div aria-hidden="true" style={{ position: "absolute", left: 40, right: 0, top: plotH + 8, display: "flex" }}>
          {data.map((d, i) => (
            <span key={i} style={{ flex: 1, minWidth: 0, textAlign: "center", fontSize: 11, fontWeight: 700, color: i === active ? INK : MUTED, visibility: i % everyNthLabel === 0 || i === active ? "visible" : "hidden" }}>{d.label}</span>
          ))}
        </div>
      </div>
      <DataTable rows={data.filter(d => d.value > 0).map(d => [d.long || d.label, format(d.value)])} head={["", "Facturado"]} />
    </div>
  );
}

// Parte de un total (ej. métodos de pago): barra apilada con separación de
// 2 px + leyenda con nombre, valor y porcentaje (la leyenda siempre está).
export function ShareBar({ parts, format }: { parts: { name: string; value: number; color: string }[]; format: (n: number) => string }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  const shown = parts.filter(p => p.value > 0);
  return (
    <div>
      <div role="img" aria-label={parts.map(p => `${p.name} ${format(p.value)}`).join(", ")}
        style={{ display: "flex", gap: 2, height: 16, borderRadius: 4, overflow: "hidden", background: total ? SURFACE : GRID }}>
        {shown.map(p => (
          <span key={p.name} style={{ width: `${(p.value / total) * 100}%`, background: p.color, minWidth: 4 }} />
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
        {parts.map(p => (
          <div key={p.name} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 3, background: p.color, flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: INK }}>{p.name}</span>
            <span style={{ fontSize: 15, fontWeight: 900, color: INK, fontVariantNumeric: "tabular-nums" }}>{format(p.value)}</span>
            <span style={{ width: 44, textAlign: "right", fontSize: 13, fontWeight: 700, color: MUTED, fontVariantNumeric: "tabular-nums" }}>{total ? Math.round((p.value / total) * 100) : 0}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Ficha de indicador: valor grande + variación contra el período anterior.
// La variación lleva flecha y texto (nunca solo color).
export function StatTile({ label, value, delta, deltaLabel, hero = false }: {
  label: string; value: string; delta?: number | null; deltaLabel?: string; hero?: boolean;
}) {
  const has = delta !== null && delta !== undefined && isFinite(delta);
  const up = has && (delta as number) >= 0;
  return (
    <div style={{ background: hero ? INK : "#fff", border: hero ? "none" : `1px solid ${GRID}`, borderRadius: 16, padding: "14px 16px", minWidth: 0 }}>
      <p style={{ fontSize: 13, fontWeight: 800, color: hero ? "rgba(255,255,255,0.7)" : INK2, marginBottom: 6 }}>{label}</p>
      <p style={{ fontSize: hero ? 34 : 26, fontWeight: 900, color: hero ? "#F3E6D3" : INK, lineHeight: 1.05, fontVariantNumeric: "proportional-nums" }}>{value}</p>
      {deltaLabel && (
        <p style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 8, fontSize: 12, fontWeight: 800, color: !has ? (hero ? "rgba(255,255,255,0.6)" : MUTED) : up ? (hero ? "#8FD694" : "#2F7D32") : (hero ? "#FF9C9C" : "#C62828") }}>
          {has ? <>{up ? "▲" : "▼"} {Math.abs(delta as number).toFixed(0)}%</> : "—"}
          <span style={{ fontWeight: 700, color: hero ? "rgba(255,255,255,0.6)" : MUTED }}>{deltaLabel}</span>
        </p>
      )}
    </div>
  );
}

// Vista de tabla de cualquier gráfico (accesible y para quien prefiere números).
export function DataTable({ rows, head }: { rows: ReactNode[][]; head: ReactNode[] }) {
  if (!rows.length) return null;
  return (
    <details style={{ marginTop: 10 }}>
      <summary style={{ fontSize: 12, fontWeight: 800, color: INK2, cursor: "pointer", padding: "6px 0" }}>Ver como tabla</summary>
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 6, fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
        <thead><tr>{head.map((h, i) => <th key={i} style={{ textAlign: i ? "right" : "left", fontWeight: 800, color: MUTED, padding: "4px 0", borderBottom: `1px solid ${GRID}` }}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} style={{ textAlign: j ? "right" : "left", fontWeight: j ? 800 : 700, color: INK, padding: "5px 0", borderBottom: `1px solid ${GRID}` }}>{c}</td>)}</tr>)}</tbody>
      </table>
    </details>
  );
}
