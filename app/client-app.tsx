"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient, type Session } from "@supabase/supabase-js";

let _db: ReturnType<typeof createClient> | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getDB(): any {
  if (!_db) _db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  return _db;
}

type Role = "waiter" | "kitchen" | "cashier" | "admin";
type Status = "enviado" | "preparando" | "listo" | "pagado";
interface Profile { id: string; name: string; role: Role }
interface Product { id: string; name: string; category: string; price: number }
interface OrderItem { id: string; product_name: string; quantity: number; unit_price: number }
interface Order { id: string; order_number: number; table_label: string; status: Status; total: number; created_at: string; order_items?: OrderItem[] }
interface CartItem extends Product { qty: number }

const $ = (n: number) => `$${n.toFixed(2)}`;
const MESAS = ["Mesa 1","Mesa 2","Mesa 3","Mesa 4","Para llevar","Delivery"];
const ROLE_SCREENS: Record<Role, string[]> = { waiter:["waiter"], kitchen:["kitchen"], cashier:["cashier"], admin:["waiter","kitchen","cashier"] };
const SL: Record<string,string> = { waiter:"Mesero", kitchen:"Cocina", cashier:"Caja" };

const FONT = "'Nunito', sans-serif";
const RED = "#E13B2D", DARK = "#17120F", CREAM = "#FFF4E3", GOLD = "#F5B233", GREEN = "#2F7D32", MUTED = "#8B6F5E", BORDER = "#EDE0CC", CARD = "#FFFFFF", CREAM2 = "#F5E4CC";

const GLOBAL_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
html,body{height:100%;font-family:'Nunito',sans-serif;background:${CREAM}}
button{cursor:pointer;border:none;font-family:'Nunito',sans-serif;transition:transform .1s,box-shadow .1s}
button:not(:disabled):active{transform:scale(.97)}
input{font-family:'Nunito',sans-serif}
::-webkit-scrollbar{width:4px;height:4px}
::-webkit-scrollbar-thumb{background:${BORDER};border-radius:99px}
@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
`;

export default function App() {
  const [ok, setOk] = useState(false);
  const [session, setSession] = useState<Session|null>(null);
  const [profile, setProfile] = useState<Profile|null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [screen, setScreen] = useState("waiter");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [loginErr, setLoginErr] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<Record<string,CartItem>>({});
  const [mesa, setMesa] = useState(MESAS[0]);
  const [cat, setCat] = useState("");
  const [modal, setModal] = useState(false);
  const [sentMsg, setSentMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [kOrders, setKOrders] = useState<Order[]>([]);
  const [kLoading, setKLoading] = useState(false);
  const [updating, setUpdating] = useState<string|null>(null);
  const [cOrders, setCOrders] = useState<Order[]>([]);
  const [cLoading, setCLoading] = useState(false);
  const [paying, setPaying] = useState<string|null>(null);
  const styleRef = useRef(false);

  useEffect(() => {
    if (!styleRef.current) {
      const s = document.createElement("style");
      s.textContent = GLOBAL_CSS;
      document.head.insertBefore(s, document.head.firstChild);
      styleRef.current = true;
    }
    setOk(true);
    const db = getDB();
    db.auth.getSession().then(({ data: { session: s } }: { data: { session: Session|null } }) => {
      setSession(s);
      if (s) loadProfile(s.user.id);
      else setAuthLoading(false);
    });
    const { data: { subscription } } = db.auth.onAuthStateChange((_: string, s: Session|null) => {
      setSession(s);
      if (s) loadProfile(s.user.id);
      else { setProfile(null); setAuthLoading(false); }
    });
    return () => subscription.unsubscribe();
  }, []);

  async function loadProfile(uid: string) {
    const { data, error } = await getDB().from("profiles").select("*").eq("id", uid).single();
    if (error || !data) { await getDB().auth.signOut(); setAuthLoading(false); return; }
    const p = data as Profile;
    setProfile(p);
    setScreen(ROLE_SCREENS[p.role][0]);
    setAuthLoading(false);
  }

  async function login() {
    if (!email || !pass) return;
    setLoginLoading(true); setLoginErr("");
    const { error } = await getDB().auth.signInWithPassword({ email, password: pass });
    if (error) { setLoginErr("Email o contraseña incorrectos"); setLoginLoading(false); }
  }

  async function logout() {
    await getDB().auth.signOut();
    setProfile(null); setSession(null); setCart({});
  }

  useEffect(() => {
    if (screen==="waiter" && products.length===0 && profile) {
      getDB().from("products").select("*").eq("is_active",true).order("category")
        .then(({ data }: { data: Product[]|null }) => {
          const p = data||[]; setProducts(p); if (p.length) setCat(p[0].category);
        });
    }
  }, [screen, products.length, profile]);

  const loadKitchen = useCallback(async () => {
    setKLoading(true);
    const { data }: { data: Order[]|null } = await getDB().from("orders").select("*, order_items(*)").in("status",["enviado","preparando","listo"]).order("created_at",{ascending:false});
    setKOrders(data||[]); setKLoading(false);
  }, []);

  const loadCashier = useCallback(async () => {
    setCLoading(true);
    const { data }: { data: Order[]|null } = await getDB().from("orders").select("*, order_items(*)").order("created_at",{ascending:false});
    setCOrders(data||[]); setCLoading(false);
  }, []);

  useEffect(() => {
    if (screen==="kitchen") loadKitchen();
    if (screen==="cashier") loadCashier();
  }, [screen, loadKitchen, loadCashier]);

  function changeQty(id: string, delta: number) {
    setCart(prev => {
      const p = products.find(x=>x.id===id)!;
      const cur = prev[id]||{...p,qty:0};
      const qty = Math.max(0, cur.qty+delta);
      if (!qty) { const n={...prev}; delete n[id]; return n; }
      return {...prev,[id]:{...cur,qty}};
    });
  }

  async function sendToKitchen() {
    const items = Object.values(cart);
    if (!items.length) return;
    const total = items.reduce((s,i)=>s+i.price*i.qty,0);
    setSending(true);
    const { data: order, error }: { data: Order|null; error: unknown } = await getDB().from("orders").insert({table_label:mesa,status:"enviado",total}).select().single();
    if (error||!order) { setSending(false); return; }
    await getDB().from("order_items").insert(items.map(i=>({order_id:order.id,product_id:i.id,product_name:i.name,quantity:i.qty,unit_price:i.price})));
    setCart({}); setModal(false);
    setSentMsg(`✓ Pedido #${order.order_number} enviado a cocina`);
    setTimeout(()=>setSentMsg(""),3500);
    setSending(false);
  }

  async function kitchenUpdate(id: string, status: Status) {
    setUpdating(id);
    setKOrders(prev=>prev.map(o=>o.id===id?{...o,status}:o));
    await getDB().from("orders").update({status}).eq("id",id);
    setUpdating(null);
  }

  async function cobrar(id: string, method: string, amount: number) {
    setPaying(id);
    setCOrders(prev=>prev.map(o=>o.id===id?{...o,status:"pagado"}:o));
    await getDB().from("payments").insert({order_id:id,method,amount});
    await getDB().from("orders").update({status:"pagado"}).eq("id",id);
    setPaying(null);
  }

  if (!ok) return null;

  const cartItems = Object.values(cart);
  const cartTotal = cartItems.reduce((s,i)=>s+i.price*i.qty,0);
  const cartCount = cartItems.reduce((s,i)=>s+i.qty,0);
  const cats = [...new Set(products.map(p=>p.category))];
  const visProd = products.filter(p=>p.category===cat);
  const screens = profile ? ROLE_SCREENS[profile.role] : [];

  // ── Shared component styles ─────────────────────────────────────
  const card = { background:CARD, borderRadius:16, boxShadow:`0 1px 0 ${BORDER}, 0 4px 20px rgba(23,18,15,0.06)`, border:`1px solid ${BORDER}` };
  
  const btn = (bg:string, fg:string, dis=false) => ({
    display:"flex" as const, alignItems:"center" as const, justifyContent:"center" as const,
    padding:"0 20px", borderRadius:12, fontWeight:700, fontSize:15, fontFamily:FONT,
    background: dis ? "#E8D8C4" : bg, color: dis ? "#B09080" : fg,
    minHeight:52, border:"none", opacity:1, cursor: dis?"not-allowed":"pointer" as const,
    boxShadow: dis ? "none" : bg===RED ? `0 4px 12px rgba(225,59,45,0.3)` : "none",
  });

  const badge = (s: Status) => {
    const m: Record<Status,[string,string]> = {
      enviado: [RED,"#fff"], preparando:[GOLD,DARK], listo:[GREEN,"#fff"], pagado:["#E0D0C0",MUTED]
    };
    return { background:m[s][0], color:m[s][1], padding:"4px 12px", borderRadius:99, fontSize:12, fontWeight:800, letterSpacing:"0.03em", display:"inline-block" as const };
  };

  // ── LOADING ─────────────────────────────────────────────────────
  if (authLoading) return (
    <div style={{minHeight:"100vh",background:DARK,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16,fontFamily:FONT}}>
      <div style={{width:40,height:40,border:`3px solid ${GOLD}`,borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
      <p style={{color:"rgba(255,255,255,0.4)",fontSize:14,fontWeight:600}}>Verificando sesión…</p>
    </div>
  );

  // ── LOGIN ───────────────────────────────────────────────────────
  if (!session||!profile) return (
    <div style={{minHeight:"100vh",background:DARK,display:"flex",alignItems:"center",justifyContent:"center",padding:"24px 16px",fontFamily:FONT,position:"relative",overflow:"hidden"}}>
      {/* Warm glow backgrounds */}
      <div style={{position:"absolute",top:"-20%",left:"50%",transform:"translateX(-50%)",width:"80%",height:"60%",background:`radial-gradient(ellipse, rgba(245,178,51,0.15) 0%, transparent 70%)`,pointerEvents:"none"}}/>
      <div style={{position:"absolute",bottom:0,left:0,width:"40%",height:"40%",background:`radial-gradient(ellipse, rgba(225,59,45,0.08) 0%, transparent 70%)`,pointerEvents:"none"}}/>

      <div style={{width:"100%",maxWidth:400,position:"relative",zIndex:1,animation:"fadeUp .4s ease both"}}>
        {/* Logo */}
        <div style={{textAlign:"center",marginBottom:40}}>
          <div style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:64,height:64,background:`linear-gradient(135deg, ${GOLD}, #D4952A)`,borderRadius:20,fontSize:28,marginBottom:16,boxShadow:`0 8px 24px rgba(245,178,51,0.4)`}}>
            🥪
          </div>
          <h1 style={{fontSize:32,fontWeight:900,color:"#fff",letterSpacing:"-0.02em",lineHeight:1.1,marginBottom:6}}>
            <span style={{color:GOLD}}>Cabane</span> Sandwiches
          </h1>
          <p style={{color:"rgba(255,255,255,0.4)",fontSize:14,fontWeight:500}}>Sistema de pedidos</p>
        </div>

        {/* Form */}
        <div style={{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:20,padding:28}}>
          <div style={{marginBottom:16}}>
            <label style={{fontSize:13,fontWeight:700,color:"rgba(255,255,255,0.5)",textTransform:"uppercase" as const,letterSpacing:"0.08em",display:"block",marginBottom:8}}>Email</label>
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&login()} placeholder="tu@email.com"
              style={{width:"100%",padding:"14px 16px",borderRadius:12,border:"1.5px solid rgba(255,255,255,0.15)",background:"rgba(255,255,255,0.08)",color:"#fff",fontSize:15,fontWeight:600,outline:"none",fontFamily:FONT}}/>
          </div>
          <div style={{marginBottom:20}}>
            <label style={{fontSize:13,fontWeight:700,color:"rgba(255,255,255,0.5)",textTransform:"uppercase" as const,letterSpacing:"0.08em",display:"block",marginBottom:8}}>Contraseña</label>
            <input type="password" value={pass} onChange={e=>setPass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&login()} placeholder="••••••••"
              style={{width:"100%",padding:"14px 16px",borderRadius:12,border:"1.5px solid rgba(255,255,255,0.15)",background:"rgba(255,255,255,0.08)",color:"#fff",fontSize:15,fontWeight:600,outline:"none",fontFamily:FONT}}/>
          </div>
          {loginErr && <div style={{background:"rgba(225,59,45,0.15)",border:"1px solid rgba(225,59,45,0.4)",borderRadius:10,padding:"10px 14px",color:"#FF8070",fontSize:13,fontWeight:600,marginBottom:16}}>⚠️ {loginErr}</div>}
          <button disabled={loginLoading||!email||!pass} onClick={login}
            style={{...btn(RED,"#fff",loginLoading||!email||!pass),width:"100%",fontSize:16,fontWeight:800,height:52}}>
            {loginLoading ? "Ingresando…" : "Ingresar"}
          </button>
        </div>
      </div>
    </div>
  );

  // ── APP SHELL ───────────────────────────────────────────────────
  return (
    <div style={{minHeight:"100vh",background:CREAM,display:"flex",flexDirection:"column",fontFamily:FONT}}>
      
      {/* Top bar */}
      <header style={{background:DARK,padding:"0 16px",height:56,display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:100,boxShadow:`0 2px 12px rgba(23,18,15,0.3)`}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:20}}>🥪</span>
          <span style={{fontWeight:900,fontSize:16,color:"#fff",letterSpacing:"-0.01em"}}><span style={{color:GOLD}}>Cabane</span> Sandwiches</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{textAlign:"right" as const}}>
            <div style={{fontSize:13,fontWeight:800,color:"#fff"}}>{profile.name}</div>
            <div style={{fontSize:11,fontWeight:600,color:"rgba(255,255,255,0.4)",textTransform:"uppercase" as const,letterSpacing:"0.06em"}}>{SL[profile.role]||profile.role}</div>
          </div>
          <button onClick={logout} style={{background:"rgba(255,255,255,0.08)",color:"rgba(255,255,255,0.7)",borderRadius:8,padding:"7px 12px",fontSize:12,fontWeight:700,border:"1px solid rgba(255,255,255,0.12)",cursor:"pointer",fontFamily:FONT}}>
            Salir
          </button>
        </div>
      </header>

      {/* Tabs */}
      {screens.length>1 && (
        <nav style={{background:DARK,padding:"0 12px 10px",display:"flex",gap:6}}>
          {screens.map(s=>(
            <button key={s} onClick={()=>setScreen(s)} style={{flex:1,padding:"9px",borderRadius:10,fontWeight:700,fontSize:13,border:"none",cursor:"pointer",fontFamily:FONT,
              background:screen===s?RED:"rgba(255,255,255,0.07)",color:screen===s?"#fff":"rgba(255,255,255,0.5)"}}>
              {SL[s]}
            </button>
          ))}
        </nav>
      )}

      {/* ── MESERO ─────────────────────────────────────────────── */}
      {screen==="waiter" && (
        <div style={{flex:1,display:"flex",flexDirection:"column"}}>
          <style>{`
            .waiter-sidebar{display:none}
            @media(min-width:768px){
              .waiter-wrap{display:grid!important;grid-template-columns:300px 1fr;min-height:calc(100vh - 56px)}
              .mobile-cart-bar{display:none!important}
              .waiter-sidebar{display:flex!important;height:calc(100vh - 56px);overflow-y:auto;position:sticky;top:56px}
              .product-list-item{flex-direction:row!important}
              .mesa-chips-row{display:none!important}
            }
          `}</style>
          <div className="waiter-wrap" style={{display:"block",flex:1}}>
            
            {/* Sidebar */}
            <aside className="waiter-sidebar" style={{background:DARK,padding:20,flexDirection:"column",gap:16}}>
              <div>
                <p style={{fontSize:11,fontWeight:700,color:"rgba(255,255,255,0.35)",textTransform:"uppercase" as const,letterSpacing:"0.12em",marginBottom:10}}>Seleccionar mesa</p>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                  {MESAS.map(m=>(
                    <button key={m} onClick={()=>setMesa(m)} style={{padding:"11px 8px",borderRadius:10,fontSize:13,fontWeight:700,fontFamily:FONT,cursor:"pointer",
                      border:mesa===m?`2px solid ${RED}`:"2px solid rgba(255,255,255,0.1)",
                      background:mesa===m?"rgba(225,59,45,0.2)":"rgba(255,255,255,0.05)",
                      color:mesa===m?"#fff":"rgba(255,255,255,0.55)"}}>
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{background:"rgba(255,255,255,0.05)",borderRadius:14,padding:14,border:"1px solid rgba(255,255,255,0.08)",flex:1}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                  <p style={{fontSize:11,fontWeight:700,color:"rgba(255,255,255,0.35)",textTransform:"uppercase" as const,letterSpacing:"0.12em"}}>Pedido</p>
                  <span style={{fontSize:12,fontWeight:700,color:"rgba(255,255,255,0.35)"}}>{mesa}</span>
                </div>
                {cartItems.length===0 ? (
                  <p style={{fontSize:13,color:"rgba(255,255,255,0.2)",fontWeight:500,fontStyle:"italic" as const}}>Sin productos aún</p>
                ) : (
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {cartItems.map(i=>(
                      <div key={i.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <span style={{background:RED,color:"#fff",width:20,height:20,borderRadius:"50%",fontSize:11,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center"}}>{i.qty}</span>
                          <span style={{fontSize:13,color:"rgba(255,255,255,0.75)",fontWeight:600}}>{i.name}</span>
                        </div>
                        <span style={{fontSize:13,fontWeight:800,color:GOLD}}>{$(i.qty*i.price)}</span>
                      </div>
                    ))}
                    <div style={{borderTop:"1px solid rgba(255,255,255,0.1)",paddingTop:10,marginTop:4,display:"flex",justifyContent:"space-between"}}>
                      <span style={{fontSize:14,fontWeight:700,color:"rgba(255,255,255,0.5)"}}>Total</span>
                      <span style={{fontSize:20,fontWeight:900,color:GOLD}}>{$(cartTotal)}</span>
                    </div>
                  </div>
                )}
              </div>

              {sentMsg && (
                <div style={{background:"rgba(47,125,50,0.2)",border:`1px solid ${GREEN}`,borderRadius:12,padding:"12px 14px",fontSize:13,fontWeight:700,color:"#7ECF81"}}>
                  {sentMsg}
                </div>
              )}

              <button disabled={cartCount===0} onClick={()=>setModal(true)}
                style={{...btn(RED,"#fff",cartCount===0),height:54,fontSize:16,fontWeight:800,width:"100%"}}>
                {cartCount>0 ? `Ver pedido · ${$(cartTotal)}` : "Agrega productos"}
              </button>
            </aside>

            {/* Products area — mobile-first vertical list */}
            <main style={{paddingBottom:100}}>
              {/* Sticky category chips */}
              <div style={{position:"sticky" as const,top:0,zIndex:10,background:CREAM,borderBottom:`1px solid ${BORDER}`,padding:"10px 16px"}}>
                {/* Mesa selector — solo en móvil (desktop lo muestra el sidebar) */}
                <div className="mesa-chips-row" style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:8,scrollbarWidth:"none" as const}}>
                  {MESAS.map(m=>(
                    <button key={m} onClick={()=>setMesa(m)} style={{
                      padding:"8px 14px",borderRadius:99,fontSize:13,fontWeight:700,whiteSpace:"nowrap" as const,
                      border:"none",cursor:"pointer",fontFamily:FONT,flexShrink:0,
                      background:mesa===m?DARK:"rgba(23,18,15,0.07)",
                      color:mesa===m?"#fff":MUTED}}>
                      {m}
                    </button>
                  ))}
                </div>
                {/* Category chips */}
                <div style={{display:"flex",gap:8,overflowX:"auto",scrollbarWidth:"none" as const,paddingTop:2}}>
                  {cats.map(c=>(
                    <button key={c} onClick={()=>setCat(c)} style={{
                      padding:"10px 20px",borderRadius:99,fontWeight:700,fontSize:14,
                      whiteSpace:"nowrap" as const,border:"none",cursor:"pointer",fontFamily:FONT,flexShrink:0,
                      background:cat===c?RED:CREAM2,color:cat===c?"#fff":DARK,
                      boxShadow:cat===c?`0 4px 12px rgba(225,59,45,0.25)`:"none"}}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              {/* Success message */}
              {sentMsg && (
                <div style={{margin:"12px 16px 0",background:"rgba(47,125,50,0.1)",border:`1.5px solid ${GREEN}`,borderRadius:12,padding:"12px 16px",fontSize:14,fontWeight:700,color:GREEN}}>
                  {sentMsg}
                </div>
              )}

              {/* Product list — vertical, one per row, big touch targets */}
              <div style={{padding:"12px 12px 0",display:"flex",flexDirection:"column",gap:8}}>
                {visProd.map(p=>{
                  const qty=cart[p.id]?.qty||0;
                  return (
                    <div key={p.id} className="product-list-item" style={{
                      background:qty>0?"#fff":"#fff",
                      borderRadius:16,
                      border:qty>0?`2px solid ${RED}`:`1px solid ${BORDER}`,
                      padding:"14px 14px",
                      display:"flex",
                      flexDirection:"column" as const,
                      gap:10,
                      boxShadow:qty>0?`0 4px 20px rgba(225,59,45,0.12)`:`0 1px 4px rgba(0,0,0,0.06)`,
                      transition:"all .15s"}}>

                      {/* Top row: name + price + add button */}
                      <div style={{display:"flex",alignItems:"center",gap:12}}>
                        <div style={{flex:1,minWidth:0}}>
                          <p style={{fontSize:17,fontWeight:800,color:DARK,lineHeight:1.2,marginBottom:3}}>{p.name}</p>
                          <p style={{fontSize:20,fontWeight:900,color:RED,lineHeight:1}}>{$(p.price)}</p>
                        </div>

                        {/* Controls */}
                        <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
                          {qty>0 && (
                            <>
                              <button onClick={()=>changeQty(p.id,-1)} style={{
                                width:52,height:52,borderRadius:14,fontSize:24,fontWeight:900,
                                background:CREAM2,color:DARK,border:"none",cursor:"pointer",fontFamily:FONT,
                                display:"flex",alignItems:"center",justifyContent:"center"}}>
                                −
                              </button>
                              <span style={{fontSize:20,fontWeight:900,color:DARK,minWidth:28,textAlign:"center" as const}}>{qty}</span>
                            </>
                          )}
                          <button onClick={()=>changeQty(p.id,1)} style={{
                            width:62,height:62,borderRadius:16,fontSize:28,fontWeight:900,
                            background:qty>0?RED:DARK,color:"#fff",border:"none",cursor:"pointer",fontFamily:FONT,
                            display:"flex",alignItems:"center",justifyContent:"center",
                            boxShadow:qty>0?`0 4px 14px rgba(225,59,45,0.4)`:`0 4px 14px rgba(23,18,15,0.2)`}}>
                            {qty>0?"+":"＋"}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </main>
          </div>

          {/* Mobile cart bar */}
          <div className="mobile-cart-bar" style={{position:"fixed" as const,bottom:0,left:0,right:0,background:DARK,padding:"12px 16px 24px",display:"flex",alignItems:"center",gap:12,zIndex:50,boxShadow:"0 -8px 32px rgba(23,18,15,0.35)"}}>
            <div style={{flex:1}}>
              <p style={{fontSize:12,color:"rgba(255,255,255,0.4)",fontWeight:600,marginBottom:2}}>{cartCount===0?"Sin productos":cartCount===1?"1 producto":`${cartCount} productos`} · {mesa}</p>
              <p style={{fontSize:26,fontWeight:900,color: cartCount>0?"#fff":"rgba(255,255,255,0.3)",lineHeight:1}}>{$(cartTotal)}</p>
            </div>
            <button disabled={cartCount===0} onClick={()=>setModal(true)} style={{
              height:58,padding:"0 24px",borderRadius:16,fontSize:16,fontWeight:800,fontFamily:FONT,
              background:cartCount>0?RED:"rgba(255,255,255,0.1)",color:cartCount>0?"#fff":"rgba(255,255,255,0.3)",
              border:"none",cursor:cartCount>0?"pointer":"not-allowed",
              boxShadow:cartCount>0?`0 4px 20px rgba(225,59,45,0.5)`:"none",
              minWidth:150}}>
              {cartCount>0?"Revisar pedido →":"Agrega algo"}
            </button>
          </div>
        </div>
      )}

      {/* ── COCINA ─────────────────────────────────────────────── */}
      {screen==="kitchen" && (
        <div style={{padding:16,maxWidth:1100,margin:"0 auto",width:"100%"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20,flexWrap:"wrap" as const,gap:10}}>
            <div>
              <p style={{fontSize:12,fontWeight:700,color:MUTED,textTransform:"uppercase" as const,letterSpacing:"0.1em",marginBottom:2}}>Módulo</p>
              <h1 style={{fontSize:"clamp(26px,4vw,36px)",fontWeight:900,letterSpacing:"-0.02em",color:DARK}}>Cocina</h1>
            </div>
            <button onClick={loadKitchen} style={{...btn(CREAM2,DARK),height:44,padding:"0 18px",fontSize:14}}>
              {kLoading?"Cargando…":"↻ Actualizar"}
            </button>
          </div>

          {/* Status counters */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:20}}>
            {[
              {label:"Nuevos",status:"enviado",count:kOrders.filter(o=>o.status==="enviado").length,bg:RED,fg:"#fff"},
              {label:"Preparando",status:"preparando",count:kOrders.filter(o=>o.status==="preparando").length,bg:GOLD,fg:DARK},
              {label:"Listos",status:"listo",count:kOrders.filter(o=>o.status==="listo").length,bg:GREEN,fg:"#fff"},
            ].map(({label,count,bg,fg})=>(
              <div key={label} style={{background:bg,borderRadius:14,padding:"14px 10px",textAlign:"center" as const,boxShadow:`0 4px 16px ${bg}44`}}>
                <p style={{fontSize:36,fontWeight:900,color:fg,lineHeight:1}}>{count}</p>
                <p style={{fontSize:11,fontWeight:700,color:fg,opacity:.8,textTransform:"uppercase" as const,letterSpacing:"0.1em",marginTop:4}}>{label}</p>
              </div>
            ))}
          </div>

          {kOrders.length===0&&!kLoading ? (
            <div style={{textAlign:"center" as const,padding:"60px 20px"}}>
              <p style={{fontSize:48,marginBottom:12}}>👨‍🍳</p>
              <p style={{fontWeight:800,fontSize:20,color:MUTED}}>Sin pedidos activos</p>
              <p style={{fontSize:14,color:MUTED,marginTop:4}}>Los nuevos pedidos aparecerán aquí</p>
            </div>
          ) : (
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(290px,1fr))",gap:12}}>
              {kOrders.map(o=>{
                const busy=updating===o.id;
                const next=o.status==="enviado"?"preparando":o.status==="preparando"?"listo":null;
                const nextLabel=next==="preparando"?"Marcar Preparando":next==="listo"?"Marcar Listo":null;
                const time=new Date(o.created_at).toLocaleTimeString("es-EC",{hour:"2-digit",minute:"2-digit"});
                return (
                  <div key={o.id} style={{...card,padding:16,
                    border:o.status==="enviado"?`2px solid ${RED}`:o.status==="listo"?`2px solid ${GREEN}`:`1px solid ${BORDER}`}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
                      <div>
                        <p style={{fontSize:12,fontWeight:600,color:MUTED,marginBottom:2}}>#{o.order_number} · {time}</p>
                        <p style={{fontSize:22,fontWeight:900,color:DARK}}>{o.table_label}</p>
                      </div>
                      <span style={badge(o.status)}>{o.status==="enviado"?"Nuevo":o.status==="preparando"?"Prep.":"Listo"}</span>
                    </div>
                    <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:12}}>
                      {(o.order_items||[]).map(i=>(
                        <div key={i.id} style={{display:"flex",justifyContent:"space-between",background:CREAM,borderRadius:8,padding:"8px 12px",fontSize:14,fontWeight:600,color:DARK}}>
                          <span>{i.quantity}× {i.product_name}</span>
                          <span style={{fontWeight:800}}>{$(i.quantity*i.unit_price)}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{background:DARK,borderRadius:10,padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                      <span style={{fontSize:13,color:"rgba(255,255,255,0.45)",fontWeight:600}}>Total pedido</span>
                      <span style={{fontSize:20,fontWeight:900,color:GOLD}}>{$(o.total)}</span>
                    </div>
                    <div style={{display:"flex",gap:8}}>
                      {nextLabel && <button disabled={busy} onClick={()=>kitchenUpdate(o.id,next as Status)} style={{...btn(RED,"#fff",busy),flex:1,height:50}}>{busy?"Guardando…":nextLabel}</button>}
                      {o.status==="listo" && <button disabled={busy} onClick={()=>kitchenUpdate(o.id,"preparando")} style={{...btn(CREAM2,DARK,busy),flex:1,height:50}}>{busy?"…":"Regresar"}</button>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── CAJA ───────────────────────────────────────────────── */}
      {screen==="cashier" && (
        <div style={{padding:16,maxWidth:900,margin:"0 auto",width:"100%"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20,flexWrap:"wrap" as const,gap:10}}>
            <div>
              <p style={{fontSize:12,fontWeight:700,color:MUTED,textTransform:"uppercase" as const,letterSpacing:"0.1em",marginBottom:2}}>Módulo</p>
              <h1 style={{fontSize:"clamp(26px,4vw,36px)",fontWeight:900,letterSpacing:"-0.02em",color:DARK}}>Caja</h1>
            </div>
            <button onClick={loadCashier} style={{...btn(CREAM2,DARK),height:44,padding:"0 18px",fontSize:14}}>
              {cLoading?"Cargando…":"↻ Actualizar"}
            </button>
          </div>

          {/* Metrics */}
          {(()=>{
            const open=cOrders.filter(o=>o.status!=="pagado");
            const paid=cOrders.filter(o=>o.status==="pagado");
            const metrics=[
              {v:String(open.length),l:"Abiertos",bg:DARK,fg:"#fff",acc:GOLD},
              {v:String(open.filter(o=>o.status==="listo").length),l:"Listos",bg:RED,fg:"#fff",acc:"#fff"},
              {v:$(open.reduce((s,o)=>s+o.total,0)),l:"Por cobrar",bg:GOLD,fg:DARK,acc:DARK},
              {v:$(paid.reduce((s,o)=>s+o.total,0)),l:"Cobrado hoy",bg:GREEN,fg:"#fff",acc:"#fff"},
            ];
            return (
              <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10,marginBottom:20}}>
                {metrics.map(({v,l,bg,fg,acc})=>(
                  <div key={l} style={{background:bg,borderRadius:14,padding:"16px",boxShadow:`0 4px 16px ${bg}33`}}>
                    <p style={{fontSize:"clamp(22px,4vw,30px)",fontWeight:900,color:acc,lineHeight:1,marginBottom:4}}>{v}</p>
                    <p style={{fontSize:11,fontWeight:700,color:fg,opacity:0.6,textTransform:"uppercase" as const,letterSpacing:"0.1em"}}>{l}</p>
                  </div>
                ))}
              </div>
            );
          })()}

          {cOrders.filter(o=>o.status!=="pagado").length===0&&!cLoading ? (
            <div style={{textAlign:"center" as const,padding:"60px 20px"}}>
              <p style={{fontSize:48,marginBottom:12}}>✅</p>
              <p style={{fontWeight:800,fontSize:20,color:MUTED}}>Sin pedidos pendientes</p>
            </div>
          ) : (
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              {cOrders.filter(o=>o.status!=="pagado").map(o=>{
                const canPay=o.status==="listo", busy=paying===o.id;
                const time=new Date(o.created_at).toLocaleTimeString("es-EC",{hour:"2-digit",minute:"2-digit"});
                return (
                  <div key={o.id} style={{...card,padding:16,border:canPay?`2px solid ${GREEN}`:`1px solid ${BORDER}`}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
                      <div>
                        <p style={{fontSize:12,fontWeight:600,color:MUTED,marginBottom:4}}>#{o.order_number} · {time}</p>
                        <p style={{fontSize:22,fontWeight:900,color:DARK,marginBottom:6}}>{o.table_label}</p>
                        <span style={badge(o.status)}>{o.status==="enviado"?"Nuevo":o.status==="preparando"?"Preparando":"Listo para cobrar"}</span>
                      </div>
                      <p style={{fontSize:"clamp(22px,3vw,28px)",fontWeight:900,color:RED}}>{$(o.total)}</p>
                    </div>
                    {!canPay && <p style={{fontSize:13,color:MUTED,fontWeight:600,marginBottom:12,background:CREAM2,borderRadius:8,padding:"8px 12px"}}>⏳ Esperando que cocina marque como Listo</p>}
                    <div style={{display:"flex",gap:8,flexWrap:"wrap" as const}}>
                      {(["efectivo","tarjeta","transferencia"] as const).map(m=>{
                        const labels={efectivo:"💵 Efectivo",tarjeta:"💳 Tarjeta",transferencia:"📱 Transferencia"};
                        const bgs={efectivo:DARK,tarjeta:RED,transferencia:GOLD};
                        const fgs={efectivo:"#fff",tarjeta:"#fff",transferencia:DARK};
                        return (
                          <button key={m} disabled={!canPay||busy} onClick={()=>cobrar(o.id,m,o.total)}
                            style={{...btn(bgs[m],fgs[m],!canPay||busy),flex:1,minWidth:110,height:50,fontSize:13}}>
                            {busy?"Guardando…":labels[m]}
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

      {/* ── MODAL CONFIRMAR ────────────────────────────────────── */}
      {modal && (
        <div onClick={e=>{if(e.target===e.currentTarget)setModal(false)}}
          style={{position:"fixed" as const,inset:0,background:"rgba(23,18,15,0.65)",backdropFilter:"blur(6px)",zIndex:200,display:"flex",alignItems:"flex-end",justifyContent:"center",padding:12}}>
          <div style={{...card,padding:20,width:"100%",maxWidth:480,maxHeight:"90vh",overflowY:"auto",animation:"fadeUp .25s ease both"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
              <div>
                <p style={{fontSize:12,fontWeight:700,color:MUTED,textTransform:"uppercase" as const,letterSpacing:"0.08em",marginBottom:4}}>Confirmar pedido</p>
                <p style={{fontSize:24,fontWeight:900,color:DARK}}>{mesa}</p>
              </div>
              <button onClick={()=>setModal(false)} style={{width:40,height:40,borderRadius:99,background:CREAM2,fontSize:18,fontWeight:900,color:DARK,border:"none",cursor:"pointer",fontFamily:FONT}}>×</button>
            </div>

            <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:14}}>
              {cartItems.map(i=>(
                <div key={i.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:CREAM,borderRadius:10,padding:"10px 14px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{background:RED,color:"#fff",width:22,height:22,borderRadius:"50%",fontSize:12,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center"}}>{i.qty}</span>
                    <span style={{fontSize:14,fontWeight:700,color:DARK}}>{i.name}</span>
                  </div>
                  <span style={{fontSize:14,fontWeight:900,color:RED}}>{$(i.qty*i.price)}</span>
                </div>
              ))}
            </div>

            <div style={{background:DARK,borderRadius:12,padding:"14px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <span style={{fontSize:14,color:"rgba(255,255,255,0.5)",fontWeight:600}}>Total a cobrar</span>
              <span style={{fontSize:24,fontWeight:900,color:GOLD}}>{$(cartTotal)}</span>
            </div>

            <div style={{display:"grid",gridTemplateColumns:"1fr 1.6fr",gap:10}}>
              <button onClick={()=>setModal(false)} style={{...btn(CREAM2,DARK),height:52}}>Editar</button>
              <button disabled={sending} onClick={sendToKitchen} style={{...btn(RED,"#fff",sending),height:52,fontSize:16,fontWeight:800}}>
                {sending?"Enviando…":"🚀 Enviar a cocina"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
