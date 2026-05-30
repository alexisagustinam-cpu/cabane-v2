"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient, type Session } from "@supabase/supabase-js";

// ── Supabase lazy init ────────────────────────────────────────────
let _db: ReturnType<typeof createClient> | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getDB(): any {
  if (!_db) _db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  return _db;
}

// ── Types ─────────────────────────────────────────────────────────
type Role = "waiter" | "kitchen" | "cashier" | "admin";
type Status = "enviado" | "preparando" | "listo" | "pagado";
interface Profile { id: string; name: string; role: Role }
interface Product { id: string; name: string; category: string; price: number }
interface OrderItem { id: string; product_name: string; quantity: number; unit_price: number }
interface Order { id: string; order_number: number; table_label: string; status: Status; total: number; created_at: string; order_items?: OrderItem[] }
interface CartItem extends Product { qty: number }

const fmt = (n: number) => `$${Number(n).toFixed(2)}`;
const MESAS = ["Mesa 1", "Mesa 2", "Mesa 3", "Mesa 4", "Para llevar", "Delivery"];
const ROLE_SCREENS: Record<Role, string[]> = {
  waiter:  ["waiter"],
  kitchen: ["kitchen"],
  cashier: ["cashier"],
  admin:   ["waiter", "kitchen", "cashier"],
};
const SCREEN_LABEL: Record<string, string> = { waiter:"Mesero", kitchen:"Cocina", cashier:"Caja" };

// ── Colors ────────────────────────────────────────────────────────
const C = { red:"#E13B2D", dark:"#17120F", dark2:"#2A1F1A", cream:"#FFF4E3", cream2:"#F5E6CC", gold:"#F5B233", green:"#2F7D32", muted:"#7A6355", border:"#E8D8C4" };
const HEAD = "Syne, system-ui, sans-serif";

export default function App() {
  const [hydrated, setHydrated] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [screen, setScreen] = useState("waiter");

  // Login form
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

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

  // ── Auth init ──────────────────────────────────────────────────
  useEffect(() => {
    setHydrated(true);
    const db = getDB();

    db.auth.getSession().then(({ data: { session: s } }: { data: { session: Session | null } }) => {
      setSession(s);
      if (s) loadProfile(s.user.id);
      else setAuthLoading(false);
    });

    const { data: { subscription } } = db.auth.onAuthStateChange((_event: string, s: Session | null) => {
      setSession(s);
      if (s) loadProfile(s.user.id);
      else { setProfile(null); setAuthLoading(false); }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function loadProfile(userId: string) {
    const { data, error } = await getDB().from("profiles").select("*").eq("id", userId).single();
    if (error || !data) { await getDB().auth.signOut(); setAuthLoading(false); return; }
    setProfile(data as Profile);
    setScreen(ROLE_SCREENS[(data as Profile).role][0]);
    setAuthLoading(false);
  }

  async function login() {
    if (!email || !password) return;
    setLoginLoading(true);
    setLoginError("");
    const { error } = await getDB().auth.signInWithPassword({ email, password });
    if (error) { setLoginError("Email o contraseña incorrectos"); setLoginLoading(false); }
  }

  async function logout() {
    await getDB().auth.signOut();
    setProfile(null);
    setSession(null);
    setCart({});
  }

  // ── Data loading ───────────────────────────────────────────────
  useEffect(() => {
    if (screen === "waiter" && products.length === 0 && profile) {
      getDB().from("products").select("*").eq("is_active", true).order("category")
        .then(({ data }: { data: Product[] | null }) => {
          const p = data || [];
          setProducts(p);
          if (p.length) setCat(p[0].category);
        });
    }
  }, [screen, products.length, profile]);

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

  // ── Actions ────────────────────────────────────────────────────
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

  // ── Render guards ──────────────────────────────────────────────
  if (!hydrated) return null;

  // ── LOADING ────────────────────────────────────────────────────
  if (authLoading) return (
    <div style={{ minHeight:"100vh", background:C.dark, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:16 }}>
      <div style={{ width:40, height:40, border:`3px solid ${C.gold}`, borderTopColor:"transparent", borderRadius:"50%", animation:"spin 0.8s linear infinite" }} />
      <div style={{ color:"rgba(255,255,255,0.4)", fontSize:14, fontWeight:600 }}>Verificando sesión…</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  const cartItems = Object.values(cart);
  const cartTotal = cartItems.reduce((s, i) => s + i.price * i.qty, 0);
  const cartCount = cartItems.reduce((s, i) => s + i.qty, 0);
  const cats = [...new Set(products.map(p => p.category))];
  const visibleProducts = products.filter(p => p.category === cat);
  const screens = profile ? ROLE_SCREENS[profile.role] : [];

  const cardStyle = { background:"#fff", borderRadius:20, boxShadow:`0 2px 0 ${C.border}, 0 4px 16px rgba(23,18,15,0.07)` };
  const btnStyle = (bg: string, fg: string, disabled = false) => ({ padding:"14px 20px", borderRadius:14, fontWeight:700, fontSize:15, background: disabled ? C.cream2 : bg, color: disabled ? "#A89080" : fg, border:"none", minHeight:52, opacity: disabled ? 0.7 : 1, cursor: disabled ? "not-allowed" : "pointer" as const });
  const badgeStyle = (s: Status) => {
    const map: Record<Status, [string,string]> = { enviado:[C.red,"#fff"], preparando:[C.gold,C.dark], listo:[C.green,"#fff"], pagado:[C.cream2,C.muted] };
    const [bg, fg] = map[s];
    return { background:bg, color:fg, padding:"5px 14px", borderRadius:99, fontSize:11, fontWeight:700, letterSpacing:"0.04em", textTransform:"uppercase" as const, display:"inline-block" };
  };

  // ── LOGIN ──────────────────────────────────────────────────────
  if (!session || !profile) return (
    <div style={{ minHeight:"100vh", background:C.dark, display:"flex", alignItems:"center", justifyContent:"center", padding:20, position:"relative", overflow:"hidden" }}>
      <div style={{ position:"absolute", top:-100, right:-100, width:350, height:350, background:C.red, borderRadius:"50%", opacity:0.1 }} />
      <div style={{ position:"absolute", bottom:-120, left:-80, width:300, height:300, background:C.gold, borderRadius:"50%", opacity:0.07 }} />

      <div style={{ width:"100%", maxWidth:400, position:"relative", zIndex:1 }}>
        <div style={{ textAlign:"center", marginBottom:36 }}>
          <div style={{ fontSize:11, fontWeight:700, letterSpacing:"0.2em", color:C.gold, textTransform:"uppercase", marginBottom:12 }}>Sistema de pedidos</div>
          <h1 style={{ fontFamily:HEAD, fontSize:"clamp(34px,6vw,52px)", fontWeight:800, color:"#fff", letterSpacing:"-0.03em", lineHeight:1.1 }}>
            <span style={{ color:C.gold }}>Cabane</span><br />Sandwiches
          </h1>
          <p style={{ color:"rgba(255,255,255,0.35)", marginTop:10, fontSize:14, fontWeight:500 }}>Sánduches rápidos, calientes y bien armados</p>
        </div>

        <div style={{ background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:24, padding:24 }}>
          <div style={{ marginBottom:16 }}>
            <label style={{ fontSize:12, fontWeight:700, color:"rgba(255,255,255,0.5)", textTransform:"uppercase", letterSpacing:"0.1em", display:"block", marginBottom:8 }}>Email</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === "Enter" && login()}
              placeholder="tu@email.com"
              style={{ width:"100%", padding:"13px 16px", borderRadius:12, border:"1.5px solid rgba(255,255,255,0.12)", background:"rgba(255,255,255,0.07)", color:"#fff", fontSize:15, fontWeight:500, outline:"none" }}
            />
          </div>
          <div style={{ marginBottom:20 }}>
            <label style={{ fontSize:12, fontWeight:700, color:"rgba(255,255,255,0.5)", textTransform:"uppercase", letterSpacing:"0.1em", display:"block", marginBottom:8 }}>Contraseña</label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === "Enter" && login()}
              placeholder="••••••••"
              style={{ width:"100%", padding:"13px 16px", borderRadius:12, border:"1.5px solid rgba(255,255,255,0.12)", background:"rgba(255,255,255,0.07)", color:"#fff", fontSize:15, fontWeight:500, outline:"none" }}
            />
          </div>

          {loginError && (
            <div style={{ background:"rgba(225,59,45,0.15)", border:"1px solid rgba(225,59,45,0.3)", borderRadius:10, padding:"10px 14px", color:"#FF8A80", fontSize:13, fontWeight:600, marginBottom:16 }}>
              ⚠️ {loginError}
            </div>
          )}

          <button disabled={loginLoading || !email || !password} onClick={login}
            style={{ ...btnStyle(C.red,"#fff", loginLoading || !email || !password), width:"100%", fontFamily:HEAD, fontSize:16, fontWeight:800 }}>
            {loginLoading ? "Ingresando…" : "Ingresar"}
          </button>
        </div>
      </div>
    </div>
  );

  // ── APP ────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight:"100vh", background:C.cream, display:"flex", flexDirection:"column" }}>

      {/* Header */}
      <header style={{ background:C.dark, padding:"10px 16px", display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:100 }}>
        <div style={{ fontFamily:HEAD, fontSize:17, fontWeight:800, color:"#fff", letterSpacing:"-0.01em" }}>
          <span style={{ color:C.gold }}>Cabane</span> Sandwiches
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ textAlign:"right" }}>
            <div style={{ fontSize:13, color:"#fff", fontWeight:700 }}>{profile.name}</div>
            <div style={{ fontSize:11, color:"rgba(255,255,255,0.4)", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.08em" }}>{SCREEN_LABEL[profile.role] || profile.role}</div>
          </div>
          <button onClick={logout} style={{ background:"rgba(225,59,45,0.2)", color:C.red, borderRadius:99, padding:"7px 14px", fontSize:12, fontWeight:700, border:`1px solid rgba(225,59,45,0.3)`, cursor:"pointer" }}>
            Salir
          </button>
        </div>
      </header>

      {/* Tabs — solo si tiene más de 1 módulo */}
      {screens.length > 1 && (
        <nav style={{ background:C.dark2, padding:"8px 12px", display:"flex", gap:6 }}>
          {screens.map(s => (
            <button key={s} onClick={() => setScreen(s)}
              style={{ flex:1, padding:"10px", borderRadius:12, fontWeight:700, fontSize:13, border:"none", cursor:"pointer",
                background: screen===s ? C.red : "rgba(255,255,255,0.06)",
                color: screen===s ? "#fff" : "rgba(255,255,255,0.55)" }}>
              {SCREEN_LABEL[s]}
            </button>
          ))}
        </nav>
      )}

      {/* ── MESERO ── */}
      {screen === "waiter" && (
        <div style={{ flex:1, maxWidth:1100, width:"100%", margin:"0 auto", paddingBottom:90 }}>
          <style>{`@media(min-width:768px){ .wgrid{ display:grid !important; grid-template-columns:280px 1fr; min-height:calc(100vh - 120px); } }`}</style>
          <div className="wgrid" style={{ display:"block" }}>
            {/* Sidebar */}
            <aside style={{ background:C.dark, padding:"20px 16px", display:"flex", flexDirection:"column", gap:16 }}>
              <div>
                <div style={{ fontSize:11, fontWeight:700, letterSpacing:"0.14em", color:"rgba(255,255,255,0.3)", textTransform:"uppercase", marginBottom:8 }}>Mesa activa</div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
                  {MESAS.map(m => (
                    <button key={m} onClick={() => setMesa(m)} style={{ padding:"11px 8px", borderRadius:12, fontSize:13, fontWeight:700, cursor:"pointer", border: mesa===m ? `2px solid ${C.red}` : "2px solid rgba(255,255,255,0.08)", background: mesa===m ? "rgba(225,59,45,0.2)" : "rgba(255,255,255,0.04)", color: mesa===m ? "#fff" : "rgba(255,255,255,0.5)" }}>
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ background:"rgba(255,255,255,0.04)", borderRadius:16, padding:14, border:"1px solid rgba(255,255,255,0.07)", flex:1 }}>
                <div style={{ fontSize:11, fontWeight:700, letterSpacing:"0.14em", color:"rgba(255,255,255,0.3)", textTransform:"uppercase", marginBottom:10 }}>Pedido · {mesa}</div>
                {cartItems.length === 0 ? (
                  <p style={{ fontSize:13, color:"rgba(255,255,255,0.2)", fontWeight:500 }}>Sin productos todavía</p>
                ) : (
                  <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                    {cartItems.map(i => (
                      <div key={i.id} style={{ display:"flex", justifyContent:"space-between", fontSize:13, color:"rgba(255,255,255,0.75)", fontWeight:600 }}>
                        <span>{i.qty}× {i.name}</span>
                        <span style={{ color:C.gold }}>{fmt(i.qty*i.price)}</span>
                      </div>
                    ))}
                    <div style={{ borderTop:"1px solid rgba(255,255,255,0.08)", paddingTop:8, marginTop:4, display:"flex", justifyContent:"space-between", fontWeight:800, color:"#fff" }}>
                      <span>Total</span><span style={{ color:C.gold, fontFamily:HEAD }}>{fmt(cartTotal)}</span>
                    </div>
                  </div>
                )}
              </div>

              {sendMsg && <div style={{ background:"rgba(47,125,50,0.2)", border:`1px solid ${C.green}`, borderRadius:12, padding:"10px 14px", fontSize:13, fontWeight:700, color:"#6FCF73" }}>{sendMsg}</div>}

              <button disabled={cartCount===0} onClick={() => setModalOpen(true)}
                style={{ ...btnStyle(C.red,"#fff",cartCount===0), fontFamily:HEAD, fontWeight:800, fontSize:15 }}>
                {cartCount > 0 ? `Enviar · ${fmt(cartTotal)}` : "Agrega productos"}
              </button>
            </aside>

            {/* Products */}
            <main style={{ padding:16 }}>
              <div style={{ display:"flex", gap:8, overflowX:"auto", paddingBottom:12, marginBottom:16, scrollbarWidth:"none" }}>
                {cats.map(c => (
                  <button key={c} onClick={() => setCat(c)} style={{ padding:"10px 18px", borderRadius:99, fontWeight:700, fontSize:14, whiteSpace:"nowrap", border:"none", cursor:"pointer", background: cat===c ? C.red : C.cream2, color: cat===c ? "#fff" : C.dark }}>
                    {c}
                  </button>
                ))}
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(155px,1fr))", gap:10 }}>
                {visibleProducts.map(p => {
                  const qty = cart[p.id]?.qty || 0;
                  return (
                    <div key={p.id} style={{ ...cardStyle, padding:14, display:"flex", flexDirection:"column", gap:10, position:"relative", border: qty>0 ? `2px solid ${C.red}` : `2px solid transparent` }}>
                      {qty > 0 && <div style={{ position:"absolute", top:-8, right:-8, background:C.red, color:"#fff", width:22, height:22, borderRadius:"50%", fontSize:11, fontWeight:800, display:"flex", alignItems:"center", justifyContent:"center" }}>{qty}</div>}
                      <div>
                        <div style={{ fontSize:14, fontWeight:700, color:C.dark, lineHeight:1.3, marginBottom:4 }}>{p.name}</div>
                        <div style={{ fontFamily:HEAD, fontSize:16, fontWeight:800, color:C.red }}>{fmt(p.price)}</div>
                      </div>
                      <div style={{ display:"flex", gap:6, marginTop:"auto" }}>
                        {qty > 0 && <button onClick={() => changeQty(p.id,-1)} style={{ ...btnStyle(C.cream2,C.dark), flex:1, minHeight:44, padding:"10px", fontSize:18 }}>−</button>}
                        <button onClick={() => changeQty(p.id,1)} style={{ ...btnStyle(C.dark,"#fff"), flex: qty>0?1:undefined, minHeight:44, padding:"10px", fontSize: qty>0?18:22, width: qty>0?undefined:"100%" }}>
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
          <style>{`@media(min-width:768px){ .mcart{ display:none !important; } }`}</style>
          <div className="mcart" style={{ position:"fixed", bottom:0, left:0, right:0, background:C.dark, padding:"12px 16px 20px", display:"flex", justifyContent:"space-between", alignItems:"center", zIndex:50, borderTop:"1px solid rgba(255,255,255,0.08)" }}>
            <div>
              <div style={{ fontSize:12, color:"rgba(255,255,255,0.4)", fontWeight:600 }}>{cartCount} productos · {mesa}</div>
              <div style={{ fontFamily:HEAD, fontSize:22, fontWeight:800, color:"#fff" }}>{fmt(cartTotal)}</div>
            </div>
            <button disabled={cartCount===0} onClick={() => setModalOpen(true)} style={{ ...btnStyle(C.red,"#fff",cartCount===0), minWidth:130, fontFamily:HEAD }}>Ver pedido</button>
          </div>
        </div>
      )}

      {/* ── COCINA ── */}
      {screen === "kitchen" && (
        <div style={{ padding:16, maxWidth:1100, margin:"0 auto", width:"100%" }}>
          <div style={{ display:"flex", alignItems:"flex-end", justifyContent:"space-between", marginBottom:16, flexWrap:"wrap", gap:10 }}>
            <h1 style={{ fontFamily:HEAD, fontSize:"clamp(28px,4vw,40px)", fontWeight:800, letterSpacing:"-0.03em" }}>Cocina</h1>
            <button onClick={loadKitchen} style={{ ...btnStyle(C.cream2,C.dark), minHeight:44, padding:"10px 18px", fontSize:13 }}>
              {kitchenLoading ? "Cargando…" : "↻ Actualizar"}
            </button>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:20 }}>
            {[{l:"Nuevos",s:"enviado",bg:C.red,fg:"#fff"},{l:"Preparando",s:"preparando",bg:C.gold,fg:C.dark},{l:"Listos",s:"listo",bg:C.green,fg:"#fff"}].map(({ l, s, bg, fg }) => (
              <div key={l} style={{ background:bg, borderRadius:16, padding:"14px 10px", textAlign:"center" }}>
                <div style={{ fontFamily:HEAD, fontSize:32, fontWeight:800, color:fg, lineHeight:1 }}>{kitchenOrders.filter(o=>o.status===s).length}</div>
                <div style={{ fontSize:11, fontWeight:700, color:fg, opacity:0.75, textTransform:"uppercase", letterSpacing:"0.1em", marginTop:4 }}>{l}</div>
              </div>
            ))}
          </div>
          {kitchenOrders.length === 0 && !kitchenLoading ? (
            <div style={{ textAlign:"center", padding:"60px 20px" }}>
              <div style={{ fontSize:48, marginBottom:12 }}>🧑‍🍳</div>
              <div style={{ fontFamily:HEAD, fontSize:22, fontWeight:800, color:C.muted }}>Sin pedidos activos</div>
            </div>
          ) : (
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))", gap:12 }}>
              {kitchenOrders.map(o => {
                const busy = updating===o.id;
                const next = o.status==="enviado"?"preparando":o.status==="preparando"?"listo":null;
                const nextLabel = next==="preparando"?"Marcar Preparando":next==="listo"?"Marcar Listo":null;
                const time = new Date(o.created_at).toLocaleTimeString("es-EC",{hour:"2-digit",minute:"2-digit"});
                return (
                  <div key={o.id} style={{ ...cardStyle, padding:16, border: o.status==="enviado"?`2px solid ${C.red}`:o.status==="listo"?`2px solid ${C.green}`:`2px solid ${C.border}` }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
                      <div>
                        <div style={{ fontSize:12, fontWeight:700, color:C.muted, marginBottom:2 }}>#{o.order_number} · {time}</div>
                        <div style={{ fontFamily:HEAD, fontSize:22, fontWeight:800 }}>{o.table_label}</div>
                      </div>
                      <span style={badgeStyle(o.status)}>{o.status==="enviado"?"Nuevo":o.status==="preparando"?"Prep.":"Listo"}</span>
                    </div>
                    <div style={{ display:"flex", flexDirection:"column", gap:6, marginBottom:12 }}>
                      {(o.order_items||[]).map(i => (
                        <div key={i.id} style={{ display:"flex", justifyContent:"space-between", background:C.cream, borderRadius:10, padding:"8px 12px", fontSize:14, fontWeight:600 }}>
                          <span>{i.quantity}× {i.product_name}</span>
                          <span style={{ fontWeight:700 }}>{fmt(i.quantity*i.unit_price)}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ background:C.dark, borderRadius:12, padding:"10px 14px", display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                      <span style={{ fontSize:13, color:"rgba(255,255,255,0.5)", fontWeight:600 }}>Total</span>
                      <span style={{ fontFamily:HEAD, fontSize:18, fontWeight:800, color:C.gold }}>{fmt(o.total)}</span>
                    </div>
                    <div style={{ display:"flex", gap:8 }}>
                      {nextLabel && <button disabled={busy} onClick={() => kitchenUpdate(o.id, next as Status)} style={{ ...btnStyle(C.red,"#fff",busy), flex:1 }}>{busy?"Guardando…":nextLabel}</button>}
                      {o.status==="listo" && <button disabled={busy} onClick={() => kitchenUpdate(o.id,"preparando")} style={{ ...btnStyle(C.cream2,C.dark,busy), flex:1 }}>{busy?"…":"Regresar"}</button>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── CAJA ── */}
      {screen === "cashier" && (
        <div style={{ padding:16, maxWidth:900, margin:"0 auto", width:"100%" }}>
          <div style={{ display:"flex", alignItems:"flex-end", justifyContent:"space-between", marginBottom:16, flexWrap:"wrap", gap:10 }}>
            <h1 style={{ fontFamily:HEAD, fontSize:"clamp(28px,4vw,40px)", fontWeight:800, letterSpacing:"-0.03em" }}>Caja</h1>
            <button onClick={loadCashier} style={{ ...btnStyle(C.cream2,C.dark), minHeight:44, padding:"10px 18px", fontSize:13 }}>{cashierLoading?"Cargando…":"↻ Actualizar"}</button>
          </div>
          {(() => {
            const open = cashierOrders.filter(o=>o.status!=="pagado");
            const paid = cashierOrders.filter(o=>o.status==="pagado");
            return (
              <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:8, marginBottom:20 }}>
                {[
                  {v:open.length,l:"Abiertos",bg:C.dark,fg:"#fff",acc:C.gold},
                  {v:open.filter(o=>o.status==="listo").length,l:"Listos",bg:C.red,fg:"#fff",acc:"#fff"},
                  {v:fmt(open.reduce((s,o)=>s+o.total,0)),l:"Por cobrar",bg:C.gold,fg:C.dark,acc:C.dark},
                  {v:fmt(paid.reduce((s,o)=>s+o.total,0)),l:"Cobrado hoy",bg:C.green,fg:"#fff",acc:"#fff"},
                ].map(({ v, l, bg, fg, acc }) => (
                  <div key={l} style={{ background:bg, borderRadius:16, padding:"14px 16px" }}>
                    <div style={{ fontFamily:HEAD, fontSize:"clamp(20px,4vw,28px)", fontWeight:800, color:acc, lineHeight:1 }}>{v}</div>
                    <div style={{ fontSize:11, fontWeight:700, color:fg, opacity:0.6, textTransform:"uppercase", letterSpacing:"0.1em", marginTop:4 }}>{l}</div>
                  </div>
                ))}
              </div>
            );
          })()}
          {cashierOrders.filter(o=>o.status!=="pagado").length===0 && !cashierLoading ? (
            <div style={{ textAlign:"center", padding:"60px 20px" }}>
              <div style={{ fontSize:48, marginBottom:12 }}>✅</div>
              <div style={{ fontFamily:HEAD, fontSize:22, fontWeight:800, color:C.muted }}>Sin pedidos pendientes</div>
            </div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              {cashierOrders.filter(o=>o.status!=="pagado").map(o => {
                const canPay=o.status==="listo", busy=paying===o.id;
                const time = new Date(o.created_at).toLocaleTimeString("es-EC",{hour:"2-digit",minute:"2-digit"});
                return (
                  <div key={o.id} style={{ ...cardStyle, padding:16, border: canPay?`2px solid ${C.green}`:`2px solid ${C.border}` }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
                      <div>
                        <div style={{ fontSize:12, fontWeight:700, color:C.muted, marginBottom:4 }}>#{o.order_number} · {time}</div>
                        <div style={{ fontFamily:HEAD, fontSize:22, fontWeight:800 }}>{o.table_label}</div>
                        <span style={badgeStyle(o.status)}>{o.status==="enviado"?"Nuevo":o.status==="preparando"?"Preparando":"Listo para cobrar"}</span>
                      </div>
                      <div style={{ fontFamily:HEAD, fontSize:"clamp(24px,3vw,30px)", fontWeight:800, color:C.red }}>{fmt(o.total)}</div>
                    </div>
                    {!canPay && <p style={{ fontSize:13, color:C.muted, fontWeight:600, marginBottom:12, background:C.cream2, borderRadius:10, padding:"8px 12px" }}>⏳ Cocina debe marcarlo como Listo</p>}
                    <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                      {(["efectivo","tarjeta","transferencia"] as const).map(m => {
                        const labels={efectivo:"💵 Efectivo",tarjeta:"💳 Tarjeta",transferencia:"📱 Transferencia"};
                        const bgs={efectivo:C.dark,tarjeta:C.red,transferencia:C.gold};
                        const fgs={efectivo:"#fff",tarjeta:"#fff",transferencia:C.dark};
                        return <button key={m} disabled={!canPay||busy} onClick={() => cobrar(o.id,m,o.total)} style={{ ...btnStyle(bgs[m],fgs[m],!canPay||busy), flex:1, minWidth:100, fontSize:13 }}>{busy?"Guardando…":labels[m]}</button>;
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── MODAL ── */}
      {modalOpen && (
        <div onClick={e => { if(e.target===e.currentTarget) setModalOpen(false); }} style={{ position:"fixed", inset:0, background:"rgba(23,18,15,0.75)", backdropFilter:"blur(4px)", zIndex:200, display:"flex", alignItems:"flex-end", justifyContent:"center", padding:12 }}>
          <div style={{ ...cardStyle, padding:20, width:"100%", maxWidth:480, maxHeight:"90vh", overflowY:"auto" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 }}>
              <div>
                <div style={{ fontSize:11, fontWeight:700, letterSpacing:"0.14em", color:C.muted, textTransform:"uppercase", marginBottom:4 }}>Confirmar pedido</div>
                <div style={{ fontFamily:HEAD, fontSize:24, fontWeight:800 }}>{mesa}</div>
              </div>
              <button onClick={() => setModalOpen(false)} style={{ width:40, height:40, borderRadius:99, background:C.cream2, fontSize:18, fontWeight:800, color:C.dark, border:"none", cursor:"pointer" }}>×</button>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:6, marginBottom:14 }}>
              {cartItems.map(i => (
                <div key={i.id} style={{ display:"flex", justifyContent:"space-between", background:C.cream, borderRadius:12, padding:"10px 14px", fontWeight:700 }}>
                  <span>{i.qty}× {i.name}</span><span style={{ color:C.red }}>{fmt(i.qty*i.price)}</span>
                </div>
              ))}
            </div>
            <div style={{ background:C.dark, borderRadius:14, padding:"14px 16px", display:"flex", justifyContent:"space-between", marginBottom:16 }}>
              <span style={{ color:"rgba(255,255,255,0.5)", fontWeight:600 }}>Total</span>
              <span style={{ fontFamily:HEAD, fontSize:22, fontWeight:800, color:C.gold }}>{fmt(cartTotal)}</span>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1.6fr", gap:10 }}>
              <button onClick={() => setModalOpen(false)} style={{ ...btnStyle(C.cream2,C.dark), fontWeight:700 }}>Editar</button>
              <button disabled={sending} onClick={sendToKitchen} style={{ ...btnStyle(C.red,"#fff",sending), fontFamily:HEAD, fontWeight:800, fontSize:15 }}>
                {sending ? "Enviando…" : "🚀 Enviar a cocina"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
