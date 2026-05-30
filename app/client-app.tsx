"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

// ── Supabase (lazy init inside component) ────────────────────────
type DB = ReturnType<typeof createClient>;
let _db: DB | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getDB(): any {
  if (!_db) _db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  return _db;
}

// ── Types ─────────────────────────────────────────────────────────
type Status = "enviado" | "preparando" | "listo" | "pagado";
interface Product { id: string; name: string; category: string; price: number }
interface OrderItem { id: string; product_name: string; quantity: number; unit_price: number }
interface Order { id: string; order_number: number; table_label: string; status: Status; total: number; created_at: string; order_items?: OrderItem[] }
interface CartItem extends Product { qty: number }

const fmt = (n: number) => `$${Number(n).toFixed(2)}`;
const MESAS = ["Mesa 1", "Mesa 2", "Mesa 3", "Mesa 4", "Para llevar", "Delivery"];
const ROLES: Record<string, { label: string; screens: string[] }> = {
  waiter:  { label: "Mesero",        screens: ["waiter"] },
  kitchen: { label: "Cocina",        screens: ["kitchen"] },
  cashier: { label: "Caja",          screens: ["cashier"] },
  admin:   { label: "Admin",         screens: ["waiter", "kitchen", "cashier"] },
};

// ── Global styles injected once ───────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@400;500;600;700&display=swap');

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
:root {
  --red: #E13B2D; --red-dark: #B82E22; --dark: #17120F; --dark2: #2A1F1A;
  --cream: #FFF4E3; --cream2: #F5E6CC; --gold: #F5B233; --gold2: #D4962A;
  --green: #2F7D32; --white: #FFFFFF; --muted: #7A6355; --border: #E8D8C4;
  --font-head: 'Syne', system-ui, sans-serif;
  --font-body: 'DM Sans', system-ui, sans-serif;
}
html, body { height: 100%; background: var(--cream); color: var(--dark); font-family: var(--font-body); }
button { cursor: pointer; border: none; font-family: var(--font-body); touch-action: manipulation; transition: transform 0.08s, opacity 0.08s; }
button:active { transform: scale(0.96); }
button:disabled { cursor: not-allowed; }
input, select { font-family: var(--font-body); }
::-webkit-scrollbar { width: 4px; height: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--cream2); border-radius: 99px; }

/* ── Grain overlay ── */
body::before {
  content: ''; position: fixed; inset: 0; pointer-events: none; z-index: 999;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E");
  opacity: 0.4;
}

/* ── Animations ── */
@keyframes fadeUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
@keyframes pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.05)} }
@keyframes slideIn { from{transform:translateY(100%);opacity:0} to{transform:translateY(0);opacity:1} }
.fade-up { animation: fadeUp 0.35s ease both; }
.stagger-1 { animation-delay: 0.05s; }
.stagger-2 { animation-delay: 0.1s; }
.stagger-3 { animation-delay: 0.15s; }
.stagger-4 { animation-delay: 0.2s; }
`;

export default function App() {
  const [hydrated, setHydrated] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [screen, setScreen] = useState("waiter");

  // Mesero
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<Record<string, CartItem>>({});
  const [mesa, setMesa] = useState(MESAS[0]);
  const [cat, setCat] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [sendMsg, setSendMsg] = useState("");
  const [sending, setSending] = useState(false);

  // Cocina
  const [kitchenOrders, setKitchenOrders] = useState<Order[]>([]);
  const [kitchenLoading, setKitchenLoading] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);

  // Caja
  const [cashierOrders, setCashierOrders] = useState<Order[]>([]);
  const [cashierLoading, setCashierLoading] = useState(false);
  const [paying, setPaying] = useState<string | null>(null);

  const styleRef = useRef(false);

  useEffect(() => {
    if (!styleRef.current) {
      const el = document.createElement("style");
      el.textContent = CSS;
      document.head.appendChild(el);
      styleRef.current = true;
    }
    setHydrated(true);
    const saved = localStorage.getItem("cabane-role");
    if (saved && ROLES[saved]) { setRole(saved); setScreen(ROLES[saved].screens[0]); }
  }, []);

  useEffect(() => {
    if (screen === "waiter" && products.length === 0 && role) {
      getDB().from("products").select("*").eq("is_active", true).order("category")
        .then(({ data }: { data: Product[] | null }) => { const p = data || []; setProducts(p); if (p.length) setCat(p[0].category); });
    }
  }, [screen, products.length, role]);

  const loadKitchen = useCallback(async () => {
    setKitchenLoading(true);
    const { data }: { data: Order[] | null } = await getDB().from("orders").select("*, order_items(*)").in("status", ["enviado","preparando","listo"]).order("created_at", { ascending: false });
    setKitchenOrders(data || []);
    setKitchenLoading(false);
  }, []);

  const loadCashier = useCallback(async () => {
    setCashierLoading(true);
    const { data }: { data: Order[] | null } = await getDB().from("orders").select("*, order_items(*)").order("created_at", { ascending: false });
    setCashierOrders(data || []);
    setCashierLoading(false);
  }, []);

  useEffect(() => {
    if (screen === "kitchen") loadKitchen();
    if (screen === "cashier") loadCashier();
  }, [screen, loadKitchen, loadCashier]);

  function login(r: string) { localStorage.setItem("cabane-role", r); setRole(r); setScreen(ROLES[r].screens[0]); }
  function logout() { localStorage.removeItem("cabane-role"); setRole(null); }

  function changeQty(id: string, delta: number) {
    setCart(prev => {
      const p = products.find(x => x.id === id)!;
      const cur = prev[id] || { ...p, qty: 0 };
      const qty = Math.max(0, cur.qty + delta);
      if (!qty) { const n = { ...prev }; delete n[id]; return n; }
      return { ...prev, [id]: { ...cur, qty } };
    });
  }

  async function sendToKitchen() {
    const items = Object.values(cart);
    if (!items.length) return;
    const total = items.reduce((s, i) => s + i.price * i.qty, 0);
    setSending(true);
    const { data: order, error }: { data: Order | null; error: unknown } = await getDB().from("orders").insert({ table_label: mesa, status: "enviado", total }).select().single();
    if (error || !order) { setSending(false); return; }
    await getDB().from("order_items").insert(items.map(i => ({ order_id: order.id, product_id: i.id, product_name: i.name, quantity: i.qty, unit_price: i.price })));
    setCart({}); setModalOpen(false);
    setSendMsg(`✓ Pedido #${order.order_number} enviado a cocina`);
    setTimeout(() => setSendMsg(""), 3500);
    setSending(false);
  }

  async function kitchenUpdate(id: string, status: Status) {
    setUpdating(id);
    setKitchenOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o));
    await getDB().from("orders").update({ status }).eq("id", id);
    setUpdating(null);
  }

  async function cobrar(id: string, method: string, amount: number) {
    setPaying(id);
    setCashierOrders(prev => prev.map(o => o.id === id ? { ...o, status: "pagado" } : o));
    await getDB().from("payments").insert({ order_id: id, method, amount });
    await getDB().from("orders").update({ status: "pagado" }).eq("id", id);
    setPaying(null);
  }

  if (!hydrated) return null;

  const cartItems = Object.values(cart);
  const cartTotal = cartItems.reduce((s, i) => s + i.price * i.qty, 0);
  const cartCount = cartItems.reduce((s, i) => s + i.qty, 0);
  const cats = [...new Set(products.map(p => p.category))];
  const visibleProducts = products.filter(p => p.category === cat);
  const screens = role ? ROLES[role].screens : [];

  // ── SHARED STYLES ──────────────────────────────────────────────
  const card = { background: "#fff", borderRadius: 20, boxShadow: "0 2px 0 #E8D8C4, 0 4px 16px rgba(23,18,15,0.07)" } as const;
  const chip = (active: boolean) => ({ padding: "10px 18px", borderRadius: 99, fontWeight: 700, fontSize: 14, whiteSpace: "nowrap" as const, background: active ? "#E13B2D" : "#F5E6CC", color: active ? "#fff" : "#17120F", border: "none" });
  const btn = (bg: string, fg: string, disabled = false) => ({ padding: "14px 20px", borderRadius: 14, fontWeight: 700, fontSize: 15, background: disabled ? "#E8D8C4" : bg, color: disabled ? "#A89080" : fg, border: "none", minHeight: 52, opacity: disabled ? 0.7 : 1 });
  const badge = (s: Status) => {
    const map: Record<Status, [string,string]> = { enviado: ["#E13B2D","#fff"], preparando: ["#F5B233","#17120F"], listo: ["#2F7D32","#fff"], pagado: ["#E8D8C4","#7A6355"] };
    const [bg, fg] = map[s];
    return { background: bg, color: fg, padding: "5px 14px", borderRadius: 99, fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" as const };
  };

  // ── LOGIN ──────────────────────────────────────────────────────
  if (!role) {
    const roleCards = [
      { r: "waiter",  icon: "🛎️", tag: "Mesero",   desc: "Toma pedidos desde el teléfono" },
      { r: "kitchen", icon: "👨‍🍳", tag: "Cocina",   desc: "Gestiona la preparación" },
      { r: "cashier", icon: "💳", tag: "Caja",     desc: "Cobra y cierra el día" },
      { r: "admin",   icon: "⚙️", tag: "Admin",    desc: "Acceso completo al sistema" },
    ];
    return (
      <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"24px 16px", background:"var(--dark)", position:"relative", overflow:"hidden" }}>
        {/* Background decoration */}
        <div style={{ position:"absolute", top:-80, right:-80, width:320, height:320, background:"#E13B2D", borderRadius:"50%", opacity:0.12 }} />
        <div style={{ position:"absolute", bottom:-100, left:-60, width:280, height:280, background:"#F5B233", borderRadius:"50%", opacity:0.08 }} />

        <div className="fade-up" style={{ textAlign:"center", marginBottom:36 }}>
          <div style={{ fontSize:12, fontWeight:700, letterSpacing:"0.2em", color:"#F5B233", textTransform:"uppercase", marginBottom:12 }}>Sistema de pedidos</div>
          <h1 style={{ fontFamily:"var(--font-head)", fontSize:"clamp(32px,6vw,52px)", fontWeight:800, color:"#fff", letterSpacing:"-0.03em", lineHeight:1.1 }}>
            Cabane<br />Sandwiches
          </h1>
          <p style={{ color:"rgba(255,255,255,0.45)", fontWeight:500, marginTop:10, fontSize:14 }}>Sánduches rápidos, calientes y bien armados</p>
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, width:"100%", maxWidth:400 }}>
          {roleCards.map(({ r, icon, tag, desc }, i) => (
            <button key={r} className={`fade-up stagger-${i+1}`} onClick={() => login(r)}
              style={{ background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:20, padding:"20px 16px", textAlign:"left", cursor:"pointer", transition:"all 0.2s" }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(225,59,45,0.2)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "#E13B2D"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.05)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.1)"; }}>
              <div style={{ fontSize:28, marginBottom:8 }}>{icon}</div>
              <div style={{ fontFamily:"var(--font-head)", fontSize:16, fontWeight:800, color:"#fff", marginBottom:4 }}>{tag}</div>
              <div style={{ fontSize:12, color:"rgba(255,255,255,0.5)", fontWeight:500, lineHeight:1.4 }}>{desc}</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── APP SHELL ──────────────────────────────────────────────────
  return (
    <div style={{ minHeight:"100vh", background:"var(--cream)", display:"flex", flexDirection:"column" }}>

      {/* Header */}
      <header style={{ background:"var(--dark)", padding:"10px 16px", display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:100, borderBottom:"2px solid #2A1F1A" }}>
        <div>
          <div style={{ fontFamily:"var(--font-head)", fontSize:17, fontWeight:800, color:"#fff", letterSpacing:"-0.01em" }}>
            <span style={{ color:"#F5B233" }}>Cabane</span> Sandwiches
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:12, color:"rgba(255,255,255,0.4)", fontWeight:600 }}>{ROLES[role].label}</span>
          <button onClick={logout} style={{ background:"rgba(225,59,45,0.2)", color:"#E13B2D", borderRadius:99, padding:"6px 14px", fontSize:12, fontWeight:700, border:"1px solid rgba(225,59,45,0.3)" }}>Salir</button>
        </div>
      </header>

      {/* Tab nav */}
      {screens.length > 1 && (
        <nav style={{ background:"var(--dark2)", padding:"8px 12px", display:"flex", gap:6 }}>
          {screens.map(s => (
            <button key={s} onClick={() => setScreen(s)}
              style={{ flex:1, padding:"10px", borderRadius:12, fontWeight:700, fontSize:13,
                background: screen===s ? "#E13B2D" : "rgba(255,255,255,0.06)",
                color: screen===s ? "#fff" : "rgba(255,255,255,0.55)", border:"none" }}>
              {s==="waiter"?"Mesero":s==="kitchen"?"Cocina":"Caja"}
            </button>
          ))}
        </nav>
      )}

      {/* ── MESERO ────────────────────────────────────────────── */}
      {screen === "waiter" && (
        <div style={{ flex:1, display:"grid", gridTemplateColumns:"1fr", maxWidth:1100, width:"100%", margin:"0 auto", padding:"0 0 90px" }}>

          {/* Desktop: 2 col layout */}
          <style>{`@media(min-width:768px){ .waiter-grid{ display:grid !important; grid-template-columns: 280px 1fr; } }`}</style>
          <div className="waiter-grid" style={{ display:"block" }}>

            {/* Sidebar */}
            <aside style={{ background:"var(--dark)", padding:"20px 16px", minHeight:"100%", display:"flex", flexDirection:"column", gap:16 }}>
              <div>
                <div style={{ fontSize:11, fontWeight:700, letterSpacing:"0.14em", color:"rgba(255,255,255,0.35)", textTransform:"uppercase", marginBottom:8 }}>Mesa activa</div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
                  {MESAS.map(m => (
                    <button key={m} onClick={() => setMesa(m)} style={{ padding:"11px 8px", borderRadius:12, fontSize:13, fontWeight:700, border: mesa===m ? "2px solid #E13B2D" : "2px solid rgba(255,255,255,0.08)", background: mesa===m ? "rgba(225,59,45,0.2)" : "rgba(255,255,255,0.04)", color: mesa===m ? "#fff" : "rgba(255,255,255,0.55)" }}>
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              {/* Cart summary */}
              <div style={{ background:"rgba(255,255,255,0.04)", borderRadius:16, padding:14, border:"1px solid rgba(255,255,255,0.07)" }}>
                <div style={{ fontSize:11, fontWeight:700, letterSpacing:"0.14em", color:"rgba(255,255,255,0.35)", textTransform:"uppercase", marginBottom:10 }}>Pedido actual</div>
                {cartItems.length === 0 ? (
                  <p style={{ fontSize:13, color:"rgba(255,255,255,0.25)", fontWeight:500 }}>Sin productos todavía</p>
                ) : (
                  <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                    {cartItems.map(i => (
                      <div key={i.id} style={{ display:"flex", justifyContent:"space-between", fontSize:13, color:"rgba(255,255,255,0.75)", fontWeight:600 }}>
                        <span>{i.qty}× {i.name}</span>
                        <span style={{ color:"#F5B233" }}>{fmt(i.qty*i.price)}</span>
                      </div>
                    ))}
                    <div style={{ borderTop:"1px solid rgba(255,255,255,0.08)", paddingTop:8, marginTop:4, display:"flex", justifyContent:"space-between", fontWeight:800, color:"#fff", fontFamily:"var(--font-head)" }}>
                      <span>Total</span><span style={{ color:"#F5B233" }}>{fmt(cartTotal)}</span>
                    </div>
                  </div>
                )}
              </div>

              {sendMsg && <div style={{ background:"rgba(47,125,50,0.2)", border:"1px solid #2F7D32", borderRadius:12, padding:"10px 14px", fontSize:13, fontWeight:700, color:"#6FCF73" }}>{sendMsg}</div>}

              <button disabled={cartCount===0} onClick={() => setModalOpen(true)}
                style={{ ...btn("#E13B2D","#fff",cartCount===0), fontFamily:"var(--font-head)", fontWeight:800, fontSize:15, letterSpacing:"-0.01em" }}>
                {cartCount > 0 ? `Enviar ${cartCount} item${cartCount>1?"s":""} · ${fmt(cartTotal)}` : "Agrega productos"}
              </button>
            </aside>

            {/* Products */}
            <main style={{ padding:"16px" }}>
              {/* Category chips */}
              <div style={{ display:"flex", gap:8, overflowX:"auto", paddingBottom:12, marginBottom:16 }}>
                {cats.map(c => <button key={c} onClick={() => setCat(c)} style={chip(cat===c)}>{c}</button>)}
              </div>

              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))", gap:10 }}>
                {visibleProducts.map(p => {
                  const qty = cart[p.id]?.qty || 0;
                  return (
                    <div key={p.id} style={{ ...card, padding:14, display:"flex", flexDirection:"column", gap:10, position:"relative", border: qty > 0 ? "2px solid #E13B2D" : "2px solid transparent" }}>
                      {qty > 0 && <div style={{ position:"absolute", top:-8, right:-8, background:"#E13B2D", color:"#fff", width:22, height:22, borderRadius:"50%", fontSize:11, fontWeight:800, display:"flex", alignItems:"center", justifyContent:"center" }}>{qty}</div>}
                      <div>
                        <div style={{ fontSize:14, fontWeight:700, color:"var(--dark)", lineHeight:1.3, marginBottom:4 }}>{p.name}</div>
                        <div style={{ fontFamily:"var(--font-head)", fontSize:16, fontWeight:800, color:"#E13B2D" }}>{fmt(p.price)}</div>
                      </div>
                      <div style={{ display:"flex", gap:6, marginTop:"auto" }}>
                        {qty > 0 && <button onClick={() => changeQty(p.id,-1)} style={{ ...btn("#F5E6CC","#17120F"), flex:1, minHeight:44, padding:"10px", fontSize:18, fontWeight:800 }}>−</button>}
                        <button onClick={() => changeQty(p.id,1)} style={{ ...btn("#17120F","#fff"), flex: qty>0?1:undefined, minHeight:44, padding:"10px", fontSize: qty>0?18:22, fontWeight:800, width: qty>0?undefined:"100%" }}>
                          {qty > 0 ? qty : "+"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </main>
          </div>

          {/* Mobile cart bar */}
          <style>{`@media(min-width:768px){ .mobile-cart{ display:none !important; } }`}</style>
          <div className="mobile-cart" style={{ position:"fixed", bottom:0, left:0, right:0, background:"var(--dark)", padding:"12px 16px 20px", display:"flex", justifyContent:"space-between", alignItems:"center", zIndex:50, borderTop:"1px solid rgba(255,255,255,0.08)", boxShadow:"0 -8px 24px rgba(0,0,0,0.3)" }}>
            <div>
              <div style={{ fontSize:12, color:"rgba(255,255,255,0.4)", fontWeight:600 }}>{cartCount} productos · {mesa}</div>
              <div style={{ fontFamily:"var(--font-head)", fontSize:22, fontWeight:800, color:"#fff" }}>{fmt(cartTotal)}</div>
            </div>
            <button disabled={cartCount===0} onClick={() => setModalOpen(true)}
              style={{ ...btn("#E13B2D","#fff",cartCount===0), fontFamily:"var(--font-head)", minWidth:140 }}>
              Ver pedido
            </button>
          </div>
        </div>
      )}

      {/* ── COCINA ────────────────────────────────────────────── */}
      {screen === "kitchen" && (
        <div style={{ padding:"16px", maxWidth:1100, margin:"0 auto", width:"100%" }}>
          <div style={{ display:"flex", alignItems:"flex-end", justifyContent:"space-between", marginBottom:16, flexWrap:"wrap", gap:10 }}>
            <div>
              <div style={{ fontSize:11, fontWeight:700, letterSpacing:"0.14em", color:"var(--muted)", textTransform:"uppercase" }}>Pantalla de</div>
              <h1 style={{ fontFamily:"var(--font-head)", fontSize:"clamp(28px,4vw,40px)", fontWeight:800, letterSpacing:"-0.03em" }}>Cocina</h1>
            </div>
            <button onClick={loadKitchen} style={{ ...btn("#F5E6CC","#17120F"), minHeight:44, padding:"10px 18px", fontSize:13 }}>
              {kitchenLoading ? "Cargando…" : "↻ Actualizar"}
            </button>
          </div>

          {/* Status counters */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:20 }}>
            {[
              { label:"Nuevos", count:kitchenOrders.filter(o=>o.status==="enviado").length, bg:"#E13B2D", fg:"#fff" },
              { label:"Preparando", count:kitchenOrders.filter(o=>o.status==="preparando").length, bg:"#F5B233", fg:"#17120F" },
              { label:"Listos", count:kitchenOrders.filter(o=>o.status==="listo").length, bg:"#2F7D32", fg:"#fff" },
            ].map(({ label, count, bg, fg }) => (
              <div key={label} style={{ background:bg, borderRadius:16, padding:"14px 10px", textAlign:"center", boxShadow:`0 2px 0 ${bg}88` }}>
                <div style={{ fontFamily:"var(--font-head)", fontSize:32, fontWeight:800, color:fg, lineHeight:1 }}>{count}</div>
                <div style={{ fontSize:11, fontWeight:700, color:fg, opacity:0.75, textTransform:"uppercase", letterSpacing:"0.1em", marginTop:4 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Orders grid */}
          {kitchenOrders.length === 0 && !kitchenLoading ? (
            <div style={{ textAlign:"center", padding:"60px 20px" }}>
              <div style={{ fontSize:48, marginBottom:12 }}>🧑‍🍳</div>
              <div style={{ fontFamily:"var(--font-head)", fontSize:22, fontWeight:800, color:"var(--muted)" }}>Sin pedidos activos</div>
              <div style={{ fontSize:14, color:"var(--muted)", marginTop:6 }}>Los nuevos pedidos aparecerán aquí</div>
            </div>
          ) : (
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))", gap:12 }}>
              {kitchenOrders.map(o => {
                const busy = updating === o.id;
                const next = o.status==="enviado"?"preparando":o.status==="preparando"?"listo":null;
                const nextLabel = next==="preparando"?"Marcar Preparando":next==="listo"?"Marcar Listo":null;
                const time = new Date(o.created_at).toLocaleTimeString("es-EC",{hour:"2-digit",minute:"2-digit"});
                return (
                  <div key={o.id} style={{ ...card, padding:16, border: o.status==="enviado"?"2px solid #E13B2D":o.status==="listo"?"2px solid #2F7D32":"2px solid var(--border)" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
                      <div>
                        <div style={{ fontSize:12, fontWeight:700, color:"var(--muted)", marginBottom:2 }}>#{o.order_number} · {time}</div>
                        <div style={{ fontFamily:"var(--font-head)", fontSize:22, fontWeight:800 }}>{o.table_label}</div>
                      </div>
                      <span style={badge(o.status)}>{o.status==="enviado"?"Nuevo":o.status==="preparando"?"Preparando":"Listo"}</span>
                    </div>
                    <div style={{ display:"flex", flexDirection:"column", gap:6, marginBottom:12 }}>
                      {(o.order_items||[]).map(i => (
                        <div key={i.id} style={{ display:"flex", justifyContent:"space-between", background:"var(--cream)", borderRadius:10, padding:"8px 12px", fontSize:14, fontWeight:600 }}>
                          <span>{i.quantity}× {i.product_name}</span>
                          <span style={{ fontWeight:700 }}>{fmt(i.quantity*i.unit_price)}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ background:"var(--dark)", borderRadius:12, padding:"10px 14px", display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                      <span style={{ fontSize:13, color:"rgba(255,255,255,0.5)", fontWeight:600 }}>Total</span>
                      <span style={{ fontFamily:"var(--font-head)", fontSize:18, fontWeight:800, color:"#F5B233" }}>{fmt(o.total)}</span>
                    </div>
                    <div style={{ display:"flex", gap:8 }}>
                      {nextLabel && (
                        <button disabled={busy} onClick={() => kitchenUpdate(o.id, next as Status)}
                          style={{ ...btn("#E13B2D","#fff",busy), flex:1, fontWeight:700 }}>
                          {busy ? "Guardando…" : nextLabel}
                        </button>
                      )}
                      {o.status==="listo" && (
                        <button disabled={busy} onClick={() => kitchenUpdate(o.id, "preparando")}
                          style={{ ...btn("#F5E6CC","#17120F",busy), flex:1, fontWeight:700 }}>
                          {busy ? "…" : "Regresar"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── CAJA ──────────────────────────────────────────────── */}
      {screen === "cashier" && (
        <div style={{ padding:"16px", maxWidth:900, margin:"0 auto", width:"100%" }}>
          <div style={{ display:"flex", alignItems:"flex-end", justifyContent:"space-between", marginBottom:16, flexWrap:"wrap", gap:10 }}>
            <div>
              <div style={{ fontSize:11, fontWeight:700, letterSpacing:"0.14em", color:"var(--muted)", textTransform:"uppercase" }}>Módulo de</div>
              <h1 style={{ fontFamily:"var(--font-head)", fontSize:"clamp(28px,4vw,40px)", fontWeight:800, letterSpacing:"-0.03em" }}>Caja</h1>
            </div>
            <button onClick={loadCashier} style={{ ...btn("#F5E6CC","#17120F"), minHeight:44, padding:"10px 18px", fontSize:13 }}>
              {cashierLoading ? "Cargando…" : "↻ Actualizar"}
            </button>
          </div>

          {/* Metrics */}
          {(() => {
            const open = cashierOrders.filter(o=>o.status!=="pagado");
            const paid = cashierOrders.filter(o=>o.status==="pagado");
            const metrics = [
              { v:open.length, l:"Abiertos", bg:"#17120F", fg:"#fff", accent:"#F5B233" },
              { v:open.filter(o=>o.status==="listo").length, l:"Listos", bg:"#E13B2D", fg:"#fff", accent:"#fff" },
              { v:fmt(open.reduce((s,o)=>s+o.total,0)), l:"Por cobrar", bg:"#F5B233", fg:"#17120F", accent:"#17120F" },
              { v:fmt(paid.reduce((s,o)=>s+o.total,0)), l:"Cobrado hoy", bg:"#2F7D32", fg:"#fff", accent:"#fff" },
            ];
            return (
              <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:8, marginBottom:20 }}>
                {metrics.map(({ v, l, bg, fg, accent }) => (
                  <div key={l} style={{ background:bg, borderRadius:16, padding:"14px 16px", boxShadow:`0 2px 0 ${bg}99` }}>
                    <div style={{ fontFamily:"var(--font-head)", fontSize:"clamp(20px,4vw,28px)", fontWeight:800, color:accent, lineHeight:1 }}>{v}</div>
                    <div style={{ fontSize:11, fontWeight:700, color:fg, opacity:0.6, textTransform:"uppercase", letterSpacing:"0.1em", marginTop:4 }}>{l}</div>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Open orders */}
          {cashierOrders.filter(o=>o.status!=="pagado").length === 0 && !cashierLoading ? (
            <div style={{ textAlign:"center", padding:"60px 20px" }}>
              <div style={{ fontSize:48, marginBottom:12 }}>✅</div>
              <div style={{ fontFamily:"var(--font-head)", fontSize:22, fontWeight:800, color:"var(--muted)" }}>Sin pedidos pendientes</div>
            </div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              {cashierOrders.filter(o=>o.status!=="pagado").map(o => {
                const canPay = o.status==="listo";
                const busy = paying===o.id;
                const time = new Date(o.created_at).toLocaleTimeString("es-EC",{hour:"2-digit",minute:"2-digit"});
                return (
                  <div key={o.id} style={{ ...card, padding:16, border: canPay?"2px solid #2F7D32":"2px solid var(--border)" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:14 }}>
                      <div>
                        <div style={{ fontSize:12, fontWeight:700, color:"var(--muted)", marginBottom:2 }}>#{o.order_number} · {time}</div>
                        <div style={{ fontFamily:"var(--font-head)", fontSize:22, fontWeight:800 }}>{o.table_label}</div>
                        <span style={badge(o.status)}>{o.status==="enviado"?"Nuevo":o.status==="preparando"?"Preparando":"Listo para cobrar"}</span>
                      </div>
                      <div style={{ fontFamily:"var(--font-head)", fontSize:"clamp(24px,3vw,30px)", fontWeight:800, color:"#E13B2D" }}>{fmt(o.total)}</div>
                    </div>
                    {!canPay && <p style={{ fontSize:13, color:"var(--muted)", fontWeight:600, marginBottom:12, background:"var(--cream2)", borderRadius:10, padding:"8px 12px" }}>⏳ Esperando que cocina marque como Listo</p>}
                    <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                      {(["efectivo","tarjeta","transferencia"] as const).map(m => {
                        const labels = { efectivo:"💵 Efectivo", tarjeta:"💳 Tarjeta", transferencia:"📱 Transferencia" };
                        const bgs = { efectivo:"#17120F", tarjeta:"#E13B2D", transferencia:"#F5B233" };
                        const fgs = { efectivo:"#fff", tarjeta:"#fff", transferencia:"#17120F" };
                        return (
                          <button key={m} disabled={!canPay||busy} onClick={() => cobrar(o.id, m, o.total)}
                            style={{ ...btn(bgs[m], fgs[m], !canPay||busy), flex:1, minWidth:100, fontSize:13, fontWeight:700 }}>
                            {busy ? "Guardando…" : labels[m]}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── MODAL CONFIRMAR ───────────────────────────────────── */}
      {modalOpen && (
        <div onClick={e => { if(e.target===e.currentTarget) setModalOpen(false); }}
          style={{ position:"fixed", inset:0, background:"rgba(23,18,15,0.7)", backdropFilter:"blur(4px)", zIndex:200, display:"flex", alignItems:"flex-end", justifyContent:"center", padding:12 }}>
          <div style={{ ...card, padding:20, width:"100%", maxWidth:480, maxHeight:"90vh", overflowY:"auto", animation:"slideIn 0.3s ease" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 }}>
              <div>
                <div style={{ fontSize:11, fontWeight:700, letterSpacing:"0.14em", color:"var(--muted)", textTransform:"uppercase", marginBottom:4 }}>Confirmar pedido</div>
                <div style={{ fontFamily:"var(--font-head)", fontSize:24, fontWeight:800 }}>{mesa}</div>
              </div>
              <button onClick={() => setModalOpen(false)} style={{ width:40, height:40, borderRadius:99, background:"var(--cream2)", fontSize:18, fontWeight:800, color:"var(--dark)", border:"none", display:"flex", alignItems:"center", justifyContent:"center" }}>×</button>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:6, marginBottom:14 }}>
              {cartItems.map(i => (
                <div key={i.id} style={{ display:"flex", justifyContent:"space-between", background:"var(--cream)", borderRadius:12, padding:"10px 14px", fontWeight:700 }}>
                  <span>{i.qty}× {i.name}</span>
                  <span style={{ color:"#E13B2D" }}>{fmt(i.qty*i.price)}</span>
                </div>
              ))}
            </div>
            <div style={{ background:"var(--dark)", borderRadius:14, padding:"14px 16px", display:"flex", justifyContent:"space-between", marginBottom:16 }}>
              <span style={{ color:"rgba(255,255,255,0.5)", fontWeight:600 }}>Total a cobrar</span>
              <span style={{ fontFamily:"var(--font-head)", fontSize:22, fontWeight:800, color:"#F5B233" }}>{fmt(cartTotal)}</span>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1.6fr", gap:10 }}>
              <button onClick={() => setModalOpen(false)} style={{ ...btn("#F5E6CC","#17120F"), fontWeight:700 }}>Editar</button>
              <button disabled={sending} onClick={sendToKitchen} style={{ ...btn("#E13B2D","#fff",sending), fontFamily:"var(--font-head)", fontWeight:800, fontSize:15 }}>
                {sending ? "Enviando…" : "🚀 Enviar a cocina"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
