"use client";

import { useMemo, useRef, useState } from "react";

const INK = "#160D11", MAROON = "#2A1A1F", WINE = "#7A1E3A", GOLD = "#B5894A", CREAM = "#EDE0CE", PAPER = "#FBF7EF", MUTED = "rgba(232,213,183,0.55)";
const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "'Nunito', sans-serif";

interface Category { id: string; name: string; sort: number }
interface MenuProduct { id: string; name: string; category: string; price: number; description: string | null }

const $ = (n: number) => `$${n.toFixed(2)}`;

// Íconos de línea por categoría — coincidencia por palabra clave, con un
// genérico de respaldo para categorías nuevas que el admin agregue después.
function CategoryIcon({ name, size = 22 }: { name: string; size?: number }) {
  const n = name.toLowerCase();
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (/caf[eé]/.test(n)) return (
    <svg {...common}><path d="M4 8h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8Z"/><path d="M17 9.5h1.6a2.3 2.3 0 0 1 0 4.6H17"/><path d="M7.5 3.5c.6.9-.4 1.4.2 2.3M11 3.5c.6.9-.4 1.4.2 2.3M14.5 3.5c.6.9-.4 1.4.2 2.3"/></svg>
  );
  if (/bebida|jugo|gaseosa|cola|limonada/.test(n)) return (
    <svg {...common}><path d="M6 8h12l-1.3 11a2 2 0 0 1-2 1.8H9.3a2 2 0 0 1-2-1.8L6 8Z"/><path d="M5 8h14"/><path d="M9.5 4.5 12 2m0 2v3"/></svg>
  );
  if (/postre|dulce|torta|pay/.test(n)) return (
    <svg {...common}><path d="M4 20 12 6l8 14Z"/><path d="M4 20h16"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/></svg>
  );
  if (/desayuno/.test(n)) return (
    <svg {...common}><ellipse cx="12" cy="13.5" rx="8" ry="5.5"/><circle cx="12" cy="13.5" r="2.6" fill="currentColor" stroke="none"/></svg>
  );
  if (/ensalada|verde|vegetal/.test(n)) return (
    <svg {...common}><path d="M5 19c0-8.8 6.5-15 15-15 0 8.8-6.5 15-15 15Z"/><path d="M5 19c2.7-3.6 6.3-6.4 11-8.4"/></svg>
  );
  if (/compartir|picar|grupo/.test(n)) return (
    <svg {...common}><circle cx="9" cy="12" r="5.2"/><circle cx="16" cy="12" r="5.2"/></svg>
  );
  if (/tablita|tabla|picoteo|queso/.test(n)) return (
    <svg {...common}><rect x="4" y="5" width="16" height="14" rx="2.5"/><circle cx="8.3" cy="10" r="0.9" fill="currentColor" stroke="none"/><circle cx="12" cy="10" r="0.9" fill="currentColor" stroke="none"/><circle cx="15.7" cy="10" r="0.9" fill="currentColor" stroke="none"/><circle cx="8.3" cy="15" r="0.9" fill="currentColor" stroke="none"/><circle cx="12" cy="15" r="0.9" fill="currentColor" stroke="none"/><circle cx="15.7" cy="15" r="0.9" fill="currentColor" stroke="none"/></svg>
  );
  if (/s[aá]nduche|sandwich|cl[aá]sico|burger|hamburguesa/.test(n)) return (
    <svg {...common}><path d="M3.5 12 12 5l8.5 7"/><path d="M4.5 12h15l-1.6 6.3a2 2 0 0 1-1.9 1.5H8a2 2 0 0 1-1.9-1.5L4.5 12Z"/><path d="M4.5 12c1.2 1.4 2.3 1.4 3.5 0s2.3-1.4 3.5 0 2.3 1.4 3.5 0 2.3-1.4 3.5 0"/></svg>
  );
  return (
    <svg {...common}><path d="M12 3.5l1.9 5.9 6.1.1-4.9 3.7 1.9 5.9-5-3.6-5 3.6 1.9-5.9-4.9-3.7 6.1-.1Z"/></svg>
  );
}

export default function MenuClient({ categories, products }: { categories: Category[]; products: MenuProduct[] }) {
  const [revealed, setRevealed] = useState(false);
  const [splashGone, setSplashGone] = useState(false);
  const [drag, setDrag] = useState(0);
  const draggingRef = useRef(false);
  const startXRef = useRef(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const maxDrag = 220;

  const orderedCats = useMemo(() => [
    ...categories.map(c => c.name),
    ...[...new Set(products.map(p => p.category))].filter(c => !categories.some(cc => cc.name === c)),
  ].filter(cat => products.some(p => p.category === cat)), [categories, products]);

  const [active, setActive] = useState(() => orderedCats[0] || "");
  const items = products.filter(p => p.category === active);

  function reveal() {
    setRevealed(true);
    setTimeout(() => setSplashGone(true), 550);
  }

  function onPointerDown(e: React.PointerEvent) {
    draggingRef.current = true;
    startXRef.current = e.clientX - drag;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!draggingRef.current) return;
    const next = Math.min(maxDrag, Math.max(0, e.clientX - startXRef.current));
    setDrag(next);
  }
  function onPointerUp() {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (drag > maxDrag * 0.55) { setDrag(maxDrag); reveal(); }
    else setDrag(0);
  }

  return (
    <div style={{ minHeight: "100vh", background: `radial-gradient(ellipse at 50% -10%, rgba(122,30,58,0.35), transparent 55%), linear-gradient(160deg, ${INK} 0%, ${MAROON} 55%, ${INK} 100%)`, display: "flex", justifyContent: "center", fontFamily: SANS }}>
      <div style={{ width: "100%", maxWidth: 480, minHeight: "100vh", position: "relative", overflow: "hidden", boxShadow: "0 40px 100px rgba(0,0,0,0.5)" }}>

        {/* ── SPLASH ─────────────────────────────────────── */}
        {!splashGone && (
          <div
            style={{
              position: "absolute", inset: 0, zIndex: 20,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              padding: "40px 28px", textAlign: "center",
              backgroundImage: "radial-gradient(rgba(181,137,74,0.14) 1px, transparent 1px)",
              backgroundSize: "18px 18px",
              transition: "opacity .5s ease, transform .5s ease",
              opacity: revealed ? 0 : 1,
              transform: revealed ? "translateY(-24px)" : "translateY(0)",
              pointerEvents: revealed ? "none" : "auto",
            }}
          >
            <div style={{ width: 108, height: 108, borderRadius: 26, padding: 6, background: "linear-gradient(145deg, rgba(122,30,58,0.55), rgba(181,137,74,0.25))", border: "1px solid rgba(181,137,74,0.3)", boxShadow: "0 20px 50px rgba(0,0,0,0.45)", marginBottom: 26 }}>
              <img src="/logo.jpg" alt="Cabane Sandwiches" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 20, display: "block" }} />
            </div>
            <h1 style={{ fontFamily: SERIF, color: CREAM, fontSize: 30, fontWeight: 700, margin: 0, letterSpacing: "0.01em" }}>Cabane Sandwiches</h1>
            <div style={{ width: 46, height: 2, background: GOLD, opacity: 0.6, margin: "16px 0" }} />
            <p style={{ color: MUTED, fontSize: 12.5, fontWeight: 700, letterSpacing: "0.28em", textTransform: "uppercase", margin: 0 }}>Sánduches artesanales</p>

            <div
              ref={trackRef}
              onClick={() => { if (!draggingRef.current) reveal(); }}
              style={{ marginTop: 48, width: 260, height: 58, borderRadius: 29, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(181,137,74,0.3)", position: "relative", cursor: "pointer", overflow: "hidden" }}
            >
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ color: "rgba(232,213,183,0.7)", fontSize: 13, fontWeight: 700, letterSpacing: "0.04em" }}>Deslizá para ver el menú</span>
              </div>
              <div
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                style={{
                  position: "absolute", top: 3, left: 3, width: 50, height: 50, borderRadius: "50%",
                  background: `linear-gradient(150deg, ${WINE}, #5a1729)`, display: "flex", alignItems: "center", justifyContent: "center",
                  transform: `translateX(${drag}px)`, transition: draggingRef.current ? "none" : "transform .3s ease",
                  boxShadow: "0 6px 18px rgba(122,30,58,0.5)", touchAction: "none",
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5l7 7-7 7"/></svg>
              </div>
            </div>
          </div>
        )}

        {/* ── MENÚ ───────────────────────────────────────── */}
        <div style={{ opacity: revealed ? 1 : 0, transform: revealed ? "translateY(0)" : "translateY(24px)", transition: "opacity .5s ease .1s, transform .5s ease .1s", display: "flex", flexDirection: "column", minHeight: "100vh" }}>

          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "18px 18px 14px", borderBottom: "1px solid rgba(181,137,74,0.18)" }}>
            <img src="/logo.jpg" alt="" style={{ width: 34, height: 34, borderRadius: 9, objectFit: "cover" }} />
            <div style={{ minWidth: 0 }}>
              <p style={{ fontFamily: SERIF, color: CREAM, fontSize: 16, fontWeight: 700, margin: 0, lineHeight: 1.1 }}>Cabane Sandwiches</p>
              <p style={{ color: MUTED, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", margin: "2px 0 0" }}>Menú</p>
            </div>
          </div>

          <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
            {/* Riel de categorías */}
            <nav style={{ width: 78, flexShrink: 0, borderRight: "1px solid rgba(181,137,74,0.18)", overflowY: "auto", padding: "10px 6px" }}>
              {orderedCats.map(cat => {
                const isActive = cat === active;
                return (
                  <button
                    key={cat}
                    onClick={() => setActive(cat)}
                    style={{
                      width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                      padding: "12px 4px", marginBottom: 4, borderRadius: 14, border: "none", cursor: "pointer",
                      background: isActive ? "rgba(181,137,74,0.16)" : "transparent",
                      color: isActive ? GOLD : "rgba(232,213,183,0.45)",
                      fontFamily: SANS, transition: "background .15s, color .15s",
                    }}
                  >
                    <CategoryIcon name={cat} />
                    <span style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", lineHeight: 1.15, textAlign: "center" }}>{cat}</span>
                  </button>
                );
              })}
            </nav>

            {/* Lista de productos */}
            <div style={{ flex: 1, overflowY: "auto", padding: "20px 20px 48px" }}>
              <h2 style={{ fontFamily: SERIF, color: CREAM, fontSize: 22, fontWeight: 700, margin: "0 0 4px" }}>{active}</h2>
              <p style={{ color: MUTED, fontSize: 11.5, fontWeight: 600, margin: "0 0 20px" }}>{items.length} producto{items.length !== 1 ? "s" : ""}</p>

              <div style={{ display: "flex", flexDirection: "column" }}>
                {items.map((p, i) => (
                  <div key={p.id} style={{ padding: "16px 0", borderTop: i === 0 ? "none" : "1px solid rgba(181,137,74,0.14)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 14 }}>
                      <p style={{ color: PAPER, fontSize: 15.5, fontWeight: 700, margin: 0 }}>{p.name}</p>
                      <span style={{ color: GOLD, fontSize: 15, fontWeight: 900, whiteSpace: "nowrap", flexShrink: 0 }}>{$(p.price)}</span>
                    </div>
                    {p.description && <p style={{ color: MUTED, fontSize: 12.5, fontWeight: 500, margin: "5px 0 0", lineHeight: 1.5 }}>{p.description}</p>}
                  </div>
                ))}
                {!items.length && <p style={{ color: MUTED, fontSize: 13, fontWeight: 600 }}>Sin productos en esta categoría por ahora.</p>}
              </div>

              <p style={{ textAlign: "center", color: "rgba(232,213,183,0.25)", fontSize: 10.5, fontWeight: 600, marginTop: 32 }}>Precios sujetos a cambio sin previo aviso.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
