"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const fmt = (n: number) => "$" + Number(n).toFixed(2);
const MESAS = ["Mesa 1", "Mesa 2", "Mesa 3", "Mesa 4", "Para llevar", "Delivery"];
const ROLES: Record<string, { label: string; screens: string[] }> = {
  waiter:  { label: "Mesero",        screens: ["waiter"] },
  kitchen: { label: "Cocina",        screens: ["kitchen"] },
  cashier: { label: "Caja",          screens: ["cashier"] },
  admin:   { label: "Administrador", screens: ["waiter", "kitchen", "cashier"] },
};
const SCREEN_LABELS: Record<string, string> = { waiter: "Mesero", kitchen: "Cocina", cashier: "Caja" };
type Status = "enviado" | "preparando" | "listo" | "pagado";
interface Product { id: string; name: string; category: string; price: number; is_active: boolean }
interface OrderItem { id: string; order_id: string; product_name: string; quantity: number; unit_price: number }
interface Order { id: string; order_number: number; table_label: string; status: Status; total: number; created_at: string; order_items?: OrderItem[] }
interface CartItem extends Product { qty: number }

export default function App() {
  const [hydrated, setHydrated] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [screen, setScreen] = useState("waiter");
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<Record<string, CartItem>>({});
  const [mesa, setMesa] = useState(MESAS[0]);
  const [cat, setCat] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [sendMsg, setSendMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [kitchenOrders, setKitchenOrders] = useState<Order[]>([]);
  const [kitchenLoading, setKitchenLoading] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);
  const [cashierOrders, setCashierOrders] = useState<Order[]>([]);
  const [cashierLoading, setCashierLoading] = useState(false);
  const [paying, setPaying] = useState<string | null>(null);

  useEffect(() => {
    setHydrated(true);
    const saved = localStorage.getItem("cabane-role");
    if (saved && ROLES[saved]) { setRole(saved); setScreen(ROLES[saved].screens[0]); }
  }, []);

  useEffect(() => {
    if (screen === "waiter" && products.length === 0) {
      db.from("products").select("*").eq("is_active", true).order("category")
        .then(({ data }) => { const p = data || []; setProducts(p); if (p.length > 0) setCat(p[0].category); });
    }
  }, [screen, products.length]);

  const loadKitchen = useCallback(async () => {
    setKitchenLoading(true);
    const { data } = await db.from("orders").select("*, order_items(*)").in("status", ["enviado", "preparando", "listo"]).order("created_at", { ascending: false });
    setKitchenOrders(data || []);
    setKitchenLoading(false);
  }, []);

  const loadCashier = useCallback(async () => {
    setCashierLoading(true);
    const { data } = await db.from("orders").select("*, order_items(*)").order("created_at", { ascending: false });
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
      const product = products.find(p => p.id === id)!;
      const current = prev[id] || { ...product, qty: 0 };
      const newQty = Math.max(0, current.qty + delta);
      if (newQty === 0) { const next = { ...prev }; delete next[id]; return next; }
      return { ...prev, [id]: { ...current, qty: newQty } };
    });
  }

  async function sendToKitchen() {
    const items = Object.values(cart);
    if (!items.length) return;
    const total = items.reduce((s, i) => s + i.price * i.qty, 0);
    setSending(true);
    const { data: order, error } = await db.from("orders").insert({ table_label: mesa, status: "enviado", total }).select().single();
    if (error || !order) { setSending(false); return; }
    await db.from("order_items").insert(items.map(i => ({ order_id: order.id, product_id: i.id, product_name: i.name, quantity: i.qty, unit_price: i.price })));
    setCart({}); setModalOpen(false);
    setSendMsg(`✓ Pedido #${order.order_number} enviado · ${mesa}`);
    setTimeout(() => setSendMsg(""), 3000);
    setSending(false);
  }

  async function kitchenUpdate(id: string, status: Status) {
    setUpdating(id);
    setKitchenOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o));
    await db.from("orders").update({ status }).eq("id", id);
    setUpdating(null);
  }

  async function cobrar(id: string, method: string, amount: number) {
    setPaying(id);
    setCashierOrders(prev => prev.map(o => o.id === id ? { ...o, status: "pagado" } : o));
    await db.from("payments").insert({ order_id: id, method, amount });
    await db.from("orders").update({ status: "pagado" }).eq("id", id);
    setPaying(null);
  }

  if (!hydrated) return null;

  const cartItems = Object.values(cart);
  const cartTotal = cartItems.reduce((s, i) => s + i.price * i.qty, 0);
  const cartCount = cartItems.reduce((s, i) => s + i.qty, 0);
  const cats = [...new Set(products.map(p => p.category))];
  const visibleProducts = products.filter(p => p.category === cat);
  const screens = role ? ROLES[role].screens : [];

  const s = (prop: string) => ({ style: prop } as unknown as React.CSSProperties);
  void s;

  if (!role) return (
    <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:20, gap:20, background:"#FFF4E3" }}>
      <div style={{ textAlign:"center" }}>
        <div style={{ fontSize:11, fontWeight:900, textTransform:"uppercase", letterSpacing:".12em", color:"#E13B2D", marginBottom:6 }}>Cabane Sandwiches</div>
        <div style={{ fontSize:30, fontWeight:900, letterSpacing:"-.03em" }}>Sistema de Pedidos</div>
        <div style={{ fontSize:14, color:"#6a5b50", fontWeight:600, marginTop:6 }}>Selecciona tu rol para entrar</div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, width:"100%", maxWidth:380 }}>
        {[
          { r:"waiter",  tag:"MESERO",  label:"Mesero",        desc:"Toma pedidos y los envía a cocina." },
          { r:"kitchen", tag:"COCINA",  label:"Cocina",        desc:"Recibe pedidos y marca estados." },
          { r:"cashier", tag:"CAJA",    label:"Caja",          desc:"Cobra pedidos y cierra el día." },
          { r:"admin",   tag:"ADMIN",   label:"Administrador", desc:"Acceso completo." },
        ].map(({ r, tag, label, desc }) => (
          <div key={r} style={{ background:"white", borderRadius:18, padding:16, boxShadow:"0 4px 16px rgba(0,0,0,.08)" }}>
            <div style={{ fontSize:10, fontWeight:900, textTransform:"uppercase", letterSpacing:".12em", color:"#E13B2D", marginBottom:4 }}>{tag}</div>
            <div style={{ fontSize:18, fontWeight:900, marginBottom:6 }}>{label}</div>
            <div style={{ fontSize:12, color:"#6a5b50", fontWeight:600, marginBottom:12, lineHeight:1.4 }}>{desc}</div>
            <button onClick={() => login(r)} style={{ width:"100%", padding:12, borderRadius:12, background:"#E13B2D", color:"white", fontWeight:900, fontSize:13, border:"none", cursor:"pointer" }}>
              Entrar como {label}
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div style={{ minHeight:"100vh", background:"#FFF4E3" }}>
      <div style={{ background:"#17120F", padding:"8px 14px", display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:100 }}>
        <div style={{ color:"#F5B233", fontWeight:900, fontSize:13, letterSpacing:".1em", textTransform:"uppercase" }}>Cabane Sandwiches</div>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ fontSize:12, color:"rgba(255,255,255,.6)", fontWeight:700 }}>{ROLES[role].label}</div>
          <button onClick={logout} style={{ background:"#E13B2D", color:"white", borderRadius:8, padding:"5px 10px", fontSize:12, fontWeight:900, border:"none", cursor:"pointer" }}>Salir</button>
        </div>
      </div>

      <div style={{ display:"flex", gap:6, background:"#17120F", padding:"0 12px 10px" }}>
        {screens.map(s => (
          <button key={s} onClick={() => setScreen(s)} style={{ flex:1, padding:"11px 8px", borderRadius:12, fontWeight:900, fontSize:13, border:"none", cursor:"pointer", background: screen===s ? "#E13B2D" : "rgba(255,255,255,.1)", color: screen===s ? "white" : "rgba(255,255,255,.7)" }}>
            {SCREEN_LABELS[s]}
          </button>
        ))}
      </div>

      {screen === "waiter" && (
        <div style={{ padding:14, maxWidth:700, margin:"0 auto", paddingBottom:100 }}>
          <div style={{ fontSize:11, fontWeight:900, textTransform:"uppercase", letterSpacing:".12em", color:"#E13B2D" }}>Mesero</div>
          <div style={{ fontSize:26, fontWeight:900, letterSpacing:"-.03em", marginBottom:14 }}>Nuevo pedido</div>
          {sendMsg && <div style={{ background:"#2F7D32", color:"white", borderRadius:12, padding:"10px 14px", fontWeight:900, fontSize:13, marginBottom:12 }}>{sendMsg}</div>}
          <div style={{ background:"white", borderRadius:20, padding:16, marginBottom:12, boxShadow:"0 2px 12px rgba(0,0,0,.07)" }}>
            <div style={{ fontWeight:900, fontSize:13, marginBottom:10 }}>Mesa</div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}>
              {MESAS.map(m => (
                <button key={m} onClick={() => setMesa(m)} style={{ padding:"13px 8px", borderRadius:14, fontWeight:900, fontSize:13, cursor:"pointer", background: mesa===m ? "#E13B2D" : "white", color: mesa===m ? "white" : "#17120F", border: mesa===m ? "2px solid #E13B2D" : "2px solid #e5e0d8" }}>{m}</button>
              ))}
            </div>
          </div>
          <div style={{ display:"flex", gap:8, overflowX:"auto", paddingBottom:8, marginBottom:12 }}>
            {cats.map(c => (
              <button key={c} onClick={() => setCat(c)} style={{ padding:"9px 16px", borderRadius:99, fontWeight:900, fontSize:13, whiteSpace:"nowrap", border:"none", cursor:"pointer", background: cat===c ? "#E13B2D" : "#F2E3CC", color: cat===c ? "white" : "#17120F" }}>{c}</button>
            ))}
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {visibleProducts.map(p => {
              const qty = cart[p.id]?.qty || 0;
              return (
                <div key={p.id} style={{ background:"white", borderRadius:16, padding:"13px 14px", display:"flex", justifyContent:"space-between", alignItems:"center", boxShadow:"0 2px 8px rgba(0,0,0,.06)" }}>
                  <div>
                    <div style={{ fontSize:15, fontWeight:900 }}>{p.name}</div>
                    <div style={{ fontSize:13, color:"#6a5b50", fontWeight:700, marginTop:2 }}>{fmt(p.price)}</div>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    {qty > 0 && <>
                      <button onClick={() => changeQty(p.id, -1)} style={{ width:40, height:40, borderRadius:10, fontSize:20, fontWeight:900, background:"#F2E3CC", color:"#17120F", border:"none", cursor:"pointer" }}>−</button>
                      <span style={{ fontSize:16, fontWeight:900, minWidth:20, textAlign:"center" }}>{qty}</span>
                    </>}
                    <button onClick={() => changeQty(p.id, 1)} style={{ width:48, height:48, borderRadius:12, fontSize:22, fontWeight:900, background:"#17120F", color:"white", border:"none", cursor:"pointer" }}>{qty > 0 ? qty : "+"}</button>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ position:"fixed", bottom:0, left:0, right:0, background:"#17120F", padding:"12px 16px 20px", display:"flex", justifyContent:"space-between", alignItems:"center", zIndex:50 }}>
            <div>
              <div style={{ fontSize:12, color:"rgba(255,255,255,.6)", fontWeight:700 }}>{cartCount} productos · {mesa}</div>
              <div style={{ fontSize:22, fontWeight:900, color:"white" }}>{fmt(cartTotal)}</div>
            </div>
            <button disabled={cartCount===0} onClick={() => setModalOpen(true)} style={{ padding:"13px 22px", borderRadius:14, fontWeight:900, fontSize:14, background: cartCount===0 ? "rgba(255,255,255,.2)" : "#E13B2D", color:"white", border:"none", cursor: cartCount===0 ? "not-allowed" : "pointer", opacity: cartCount===0 ? 0.5 : 1 }}>Ver pedido</button>
          </div>
        </div>
      )}

      {screen === "kitchen" && (
        <div style={{ padding:14, maxWidth:700, margin:"0 auto" }}>
          <div style={{ fontSize:11, fontWeight:900, textTransform:"uppercase", letterSpacing:".12em", color:"#E13B2D" }}>Cocina</div>
          <div style={{ fontSize:26, fontWeight:900, letterSpacing:"-.03em", marginBottom:14 }}>Pantalla de cocina</div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginBottom:14 }}>
            {[
              { label:"Nuevos", count:kitchenOrders.filter(o=>o.status==="enviado").length, bg:"#E13B2D", color:"white" },
              { label:"Preparando", count:kitchenOrders.filter(o=>o.status==="preparando").length, bg:"#F5B233", color:"#17120F" },
              { label:"Listos", count:kitchenOrders.filter(o=>o.status==="listo").length, bg:"#2F7D32", color:"white" },
            ].map(({ label, count, bg, color }) => (
              <div key={label} style={{ background:bg, color, borderRadius:14, padding:12, textAlign:"center" }}>
                <div style={{ fontSize:26, fontWeight:900 }}>{count}</div>
                <div style={{ fontSize:10, fontWeight:900, opacity:.75, textTransform:"uppercase" }}>{label}</div>
              </div>
            ))}
          </div>
          <button onClick={loadKitchen} style={{ marginBottom:12, padding:"10px 16px", borderRadius:12, fontWeight:900, fontSize:13, background:"#F5B233", color:"#17120F", border:"none", cursor:"pointer" }}>
            {kitchenLoading ? "Cargando…" : "↻ Actualizar"}
          </button>
          {kitchenOrders.length === 0 && !kitchenLoading && <div style={{ textAlign:"center", padding:"40px 20px", color:"#6a5b50", fontWeight:700 }}>No hay pedidos en cocina</div>}
          {kitchenOrders.map(o => {
            const time = new Date(o.created_at).toLocaleTimeString("es-EC", { hour:"2-digit", minute:"2-digit" });
            const next = o.status==="enviado" ? "preparando" : o.status==="preparando" ? "listo" : null;
            const nextLabel = next==="preparando" ? "Marcar Preparando" : next==="listo" ? "Marcar Listo" : null;
            const busy = updating === o.id;
            const badgeBg: Record<string,string> = { enviado:"#E13B2D", preparando:"#F5B233", listo:"#2F7D32" };
            const badgeFg: Record<string,string> = { enviado:"white", preparando:"#17120F", listo:"white" };
            const badgeText: Record<string,string> = { enviado:"Nuevo", preparando:"Preparando", listo:"Listo" };
            return (
              <div key={o.id} style={{ background:"white", borderRadius:20, padding:16, marginBottom:12, boxShadow:"0 2px 12px rgba(0,0,0,.07)" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
                  <div>
                    <div style={{ fontSize:12, fontWeight:900, color:"#E13B2D" }}>#{o.order_number} · {time}</div>
                    <div style={{ fontSize:22, fontWeight:900 }}>{o.table_label}</div>
                  </div>
                  <span style={{ background:badgeBg[o.status], color:badgeFg[o.status], padding:"5px 13px", borderRadius:99, fontSize:11, fontWeight:900 }}>{badgeText[o.status]}</span>
                </div>
                {(o.order_items||[]).map(i => (
                  <div key={i.id} style={{ background:"#FFF4E3", borderRadius:12, padding:"10px 12px", marginBottom:6, display:"flex", justifyContent:"space-between", fontWeight:700, fontSize:14 }}>
                    <span>{i.quantity}× {i.product_name}</span><span>{fmt(i.quantity*i.unit_price)}</span>
                  </div>
                ))}
                <div style={{ background:"#17120F", color:"white", borderRadius:12, padding:"11px 14px", display:"flex", justifyContent:"space-between", marginTop:10, marginBottom:12 }}>
                  <span style={{ opacity:.7, fontWeight:700 }}>Total</span><strong style={{ fontSize:18 }}>{fmt(o.total)}</strong>
                </div>
                <div style={{ display:"flex", gap:8 }}>
                  {nextLabel && <button disabled={busy} onClick={() => kitchenUpdate(o.id, next as Status)} style={{ flex:1, padding:13, borderRadius:14, fontWeight:900, fontSize:14, background:"#E13B2D", color:"white", border:"none", cursor: busy ? "not-allowed" : "pointer", opacity: busy ? .5 : 1 }}>{busy ? "Guardando…" : nextLabel}</button>}
                  {o.status==="listo" && <button disabled={busy} onClick={() => kitchenUpdate(o.id, "preparando")} style={{ flex:1, padding:13, borderRadius:14, fontWeight:900, fontSize:14, background:"#F2E3CC", color:"#17120F", border:"none", cursor: busy ? "not-allowed" : "pointer", opacity: busy ? .5 : 1 }}>{busy ? "Guardando…" : "Regresar"}</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {screen === "cashier" && (
        <div style={{ padding:14, maxWidth:700, margin:"0 auto" }}>
          <div style={{ fontSize:11, fontWeight:900, textTransform:"uppercase", letterSpacing:".12em", color:"#E13B2D" }}>Caja</div>
          <div style={{ fontSize:26, fontWeight:900, letterSpacing:"-.03em", marginBottom:14 }}>Cobro y cierre</div>
          {(() => {
            const open = cashierOrders.filter(o=>o.status!=="pagado");
            const paid = cashierOrders.filter(o=>o.status==="pagado");
            return (
              <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:8, marginBottom:14 }}>
                {[
                  { val:open.length, lbl:"Abiertos", bg:"#17120F", fg:"white" },
                  { val:open.filter(o=>o.status==="listo").length, lbl:"Listos", bg:"#E13B2D", fg:"white" },
                  { val:fmt(open.reduce((s,o)=>s+o.total,0)), lbl:"Por cobrar", bg:"#F5B233", fg:"#17120F" },
                  { val:fmt(paid.reduce((s,o)=>s+o.total,0)), lbl:"Cobrado hoy", bg:"#2F7D32", fg:"white" },
                ].map(({ val, lbl, bg, fg }) => (
                  <div key={lbl} style={{ background:bg, color:fg, borderRadius:14, padding:12, textAlign:"center" }}>
                    <div style={{ fontSize:20, fontWeight:900 }}>{val}</div>
                    <div style={{ fontSize:10, fontWeight:900, opacity:.7, textTransform:"uppercase", marginTop:2 }}>{lbl}</div>
                  </div>
                ))}
              </div>
            );
          })()}
          <button onClick={loadCashier} style={{ marginBottom:12, padding:"10px 16px", borderRadius:12, fontWeight:900, fontSize:13, background:"#F5B233", color:"#17120F", border:"none", cursor:"pointer" }}>
            {cashierLoading ? "Cargando…" : "↻ Actualizar"}
          </button>
          {cashierOrders.filter(o=>o.status!=="pagado").length===0 && !cashierLoading && <div style={{ textAlign:"center", padding:"40px 20px", color:"#6a5b50", fontWeight:700 }}>Sin pedidos abiertos</div>}
          {cashierOrders.filter(o=>o.status!=="pagado").map(o => {
            const canPay = o.status==="listo";
            const busy = paying===o.id;
            const time = new Date(o.created_at).toLocaleTimeString("es-EC", { hour:"2-digit", minute:"2-digit" });
            return (
              <div key={o.id} style={{ background:"white", borderRadius:20, padding:16, marginBottom:12, boxShadow:"0 2px 12px rgba(0,0,0,.07)" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
                  <div>
                    <div style={{ fontSize:12, fontWeight:900, color:"#E13B2D" }}>#{o.order_number} · {time}</div>
                    <div style={{ fontSize:22, fontWeight:900 }}>{o.table_label}</div>
                    <div style={{ fontSize:12, color:"#6a5b50", fontWeight:700, marginTop:2 }}>Estado: {o.status}</div>
                  </div>
                  <strong style={{ fontSize:24 }}>{fmt(o.total)}</strong>
                </div>
                <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                  {(["efectivo","tarjeta","transferencia"] as const).map(method => {
                    const labels: Record<string,string> = { efectivo:"Efectivo", tarjeta:"Tarjeta", transferencia:"Transferencia" };
                    const bgs: Record<string,string> = { efectivo:"#17120F", tarjeta:"#E13B2D", transferencia:"#F5B233" };
                    const fgs: Record<string,string> = { efectivo:"white", tarjeta:"white", transferencia:"#17120F" };
                    return (
                      <button key={method} disabled={!canPay||busy} onClick={() => cobrar(o.id, method, o.total)}
                        style={{ flex:1, minWidth:100, padding:13, borderRadius:14, fontWeight:900, fontSize:13, background:bgs[method], color:fgs[method], border:"none", cursor: (!canPay||busy) ? "not-allowed" : "pointer", opacity: (!canPay||busy) ? .35 : 1 }}>
                        {busy ? "Guardando…" : labels[method]}
                      </button>
                    );
                  })}
                </div>
                {!canPay && <p style={{ marginTop:8, fontSize:12, fontWeight:700, color:"#6a5b50" }}>Cocina debe marcarlo como Listo primero.</p>}
              </div>
            );
          })}
        </div>
      )}

      {modalOpen && (
        <div onClick={e => { if (e.target===e.currentTarget) setModalOpen(false); }} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.5)", zIndex:200, display:"flex", alignItems:"flex-end", justifyContent:"center", padding:12 }}>
          <div style={{ background:"white", borderRadius:24, padding:20, width:"100%", maxWidth:440, maxHeight:"90vh", overflowY:"auto" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 }}>
              <div>
                <div style={{ fontSize:11, fontWeight:900, textTransform:"uppercase", letterSpacing:".12em", color:"#E13B2D" }}>Confirmar pedido</div>
                <div style={{ fontSize:22, fontWeight:900 }}>{mesa}</div>
              </div>
              <button onClick={() => setModalOpen(false)} style={{ width:40, height:40, borderRadius:99, background:"#F2E3CC", fontSize:20, fontWeight:900, color:"#17120F", border:"none", cursor:"pointer" }}>×</button>
            </div>
            {cartItems.map(i => (
              <div key={i.id} style={{ background:"#FFF4E3", borderRadius:12, padding:"10px 12px", marginBottom:6, display:"flex", justifyContent:"space-between", fontWeight:700 }}>
                <span>{i.qty}× {i.name}</span><span>{fmt(i.qty*i.price)}</span>
              </div>
            ))}
            <div style={{ background:"#17120F", color:"white", borderRadius:12, padding:"12px 14px", display:"flex", justifyContent:"space-between", margin:"14px 0" }}>
              <span style={{ opacity:.7, fontWeight:700 }}>Total</span><strong style={{ fontSize:20 }}>{fmt(cartTotal)}</strong>
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={() => setModalOpen(false)} style={{ flex:1, padding:14, borderRadius:14, fontWeight:900, background:"#F2E3CC", color:"#17120F", border:"none", cursor:"pointer" }}>Editar</button>
              <button disabled={sending} onClick={sendToKitchen} style={{ flex:2, padding:14, borderRadius:14, fontWeight:900, background:"#E13B2D", color:"white", border:"none", cursor: sending ? "not-allowed" : "pointer", opacity: sending ? .5 : 1 }}>{sending ? "Enviando…" : "Enviar a cocina"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
