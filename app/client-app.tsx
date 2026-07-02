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
type Status = "enviado" | "preparando" | "listo" | "pagado" | "cancelado";
interface Profile { id: string; name: string; role: Role; email?: string }
interface Product { id: string; name: string; category: string; price: number; description?: string }
interface OrderItem { id: string; product_id: string; product_name: string; quantity: number; unit_price: number; notes?: string }
interface Ingredient { id: string; name: string; unit: string; stock_current: number; stock_min: number }
interface Recipe { id: string; product_id: string; ingredient_id: string; quantity: number }
interface Order { id: string; order_number: number; table_label: string; status: Status; total: number; created_at: string; table_note?: string; order_items?: OrderItem[] }
interface CartItem extends Product { qty: number; notes: string[]; customNote: string }
interface AdminStats { todayRevenue:number; monthRevenue:number; todayCount:number; monthCount:number; topProducts:{name:string;qty:number;revenue:number}[]; payBreakdown:{efectivo:number;tarjeta:number;transferencia:number}; hourlyData:number[] }

function playBeep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = 820;
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.6);
  } catch(_) { /* silently ignore */ }
}

function elapsed(created_at: string): string {
  const mins = Math.floor((Date.now() - new Date(created_at).getTime()) / 60000);
  if (mins < 1) return "ahora";
  if (mins === 1) return "1 min";
  return `${mins} min`;
}

const $ = (n: number) => `$${n.toFixed(2)}`;
const MESAS = ["Mesa 0","Mesa 1","Mesa 2","Mesa 3","Mesa 4","Mesa 5","Mesa 6","Mesa 7","Mesa 8","Mesa 9","Para llevar","Delivery"];
const CAT_ORDER = ["Sánduches","Desayunos","Clásicos","Ensaladas","Tablitas","Para Compartir","Bebidas","Cafés","Postres"];
const NOTES_BY_CAT: Record<string, string[]> = {
  "Sánduches":      ["Sin cebolla","Sin mayonesa","Sin tomate","Sin lechuga","Sin pepinillo","Extra queso","Extra salsa","Bien tostado","Sin picante"],
  "Clásicos":       ["Sin cebolla","Sin mayonesa","Sin tomate","Sin lechuga","Sin pepinillo","Extra queso","Extra salsa","Bien tostado","Sin picante"],
  "Desayunos":      ["Sin sal","Huevos revueltos","Huevos fritos","Sin tocino","Extra fruta","Bien cocido","Término medio"],
  "Ensaladas":      ["Sin cebolla","Sin aderezo","Aderezo aparte","Extra pollo","Sin queso","Sin crutones"],
  "Tablitas":       ["Sin aceitunas","Sin pepinillo","Extra queso","Sin salami","Pan extra"],
  "Para Compartir": ["Sin aceitunas","Sin pepinillo","Extra queso","Sin salami","Pan extra"],
  "Bebidas":        ["Sin azúcar","Poca azúcar","Extra dulce","Sin hielo","Extra hielo","Leche de avena","Sin leche"],
  "Cafés":          ["Sin azúcar","Poca azúcar","Extra dulce","Sin hielo","Extra hielo","Leche de avena","Sin leche"],
  "Postres":        ["Sin crema","Extra salsa","Porción pequeña"],
};
const ROLE_SCREENS: Record<Role, string[]> = { waiter:["waiter"], kitchen:["kitchen"], cashier:["cashier"], admin:["waiter","kitchen","cashier","admin"] };
const SL: Record<string,string> = { waiter:"Mesero", kitchen:"Cocina", cashier:"Caja", admin:"Admin" };

const FONT = "'Nunito', sans-serif";
const RED = "#7A1E3A", DARK = "#2A1A1F", CREAM = "#EDE0CE", GOLD = "#B5894A", GREEN = "#2F7D32", MUTED = "#7A6555", BORDER = "#C4A882", CARD = "#F7F0E6", CREAM2 = "#D4BFA0";

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
  const goTo = (s: string) => { localStorage.setItem("cabane_screen", s); setScreen(s); };
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [loginErr, setLoginErr] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<Record<string,CartItem>>({});
  const [mesa, setMesa] = useState(MESAS[0]);
  const [cat, setCat] = useState("");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(false);
  const [sentMsg, setSentMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [kOrders, setKOrders] = useState<Order[]>([]);
  const [kLoading, setKLoading] = useState(false);
  const [updating, setUpdating] = useState<string|null>(null);
  const [cOrders, setCOrders] = useState<Order[]>([]);
  const [cPayBreakdown, setCPayBreakdown] = useState({efectivo:0,tarjeta:0,transferencia:0});
  const [cLoading, setCLoading] = useState(false);
  const [paying, setPaying] = useState<string|null>(null);
  const [expandedOrder, setExpandedOrder] = useState<string|null>(null);
  const [splitModal, setSplitModal] = useState<Order|null>(null);
  const [splitAmounts, setSplitAmounts] = useState({efectivo:"",tarjeta:"",transferencia:""});
  const [adminStats, setAdminStats] = useState<AdminStats|null>(null);
  const [adminProducts, setAdminProducts] = useState<Product[]>([]);
  const [adminSection, setAdminSection] = useState<"stats"|"products"|"notes"|"inventory"|"users">("stats");
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [invTab, setInvTab] = useState<"stock"|"recetas">("stock");
  const [newIngr, setNewIngr] = useState({name:"",unit:"unidades",stock_current:"",stock_min:""});
  const [restockId, setRestockId] = useState<string|null>(null);
  const [restockAmt, setRestockAmt] = useState("");
  const [editIngr, setEditIngr] = useState<{id:string;name:string;unit:string;stock_min:string}|null>(null);
  const [recipeProductId, setRecipeProductId] = useState("");
  const [newRecipeLine, setNewRecipeLine] = useState({ingredient_id:"",quantity:""});
  const [notesBycat, setNotesByCat] = useState<Record<string,{id:string;note:string}[]>>({});
  const [newNote, setNewNote] = useState({category:CAT_ORDER[0],note:""});
  const [adminMode, setAdminMode] = useState<"day"|"month">("day");
  const [adminDate, setAdminDate] = useState(()=>new Date().toISOString().slice(0,10));
  const [adminMonth, setAdminMonth] = useState(()=>new Date().toISOString().slice(0,7));
  const [adminLoading, setAdminLoading] = useState(false);
  const [newProd, setNewProd] = useState({name:"",category:CAT_ORDER[0],price:"",description:""});
  const [editProd, setEditProd] = useState<{id:string,name:string,category:string,price:string,description:string}|null>(null);
  const [tableNote, setTableNote] = useState("");
  const [expandedDesc, setExpandedDesc] = useState<string|null>(null);
  const [tick, setTick] = useState(0);
  const [kSummary, setKSummary] = useState<{name:string;qty:number}[]>([]);
  const [adminUsers, setAdminUsers] = useState<Profile[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [newUser, setNewUser] = useState({name:"",email:"",password:"",role:"waiter" as Role});
  const [userMsg, setUserMsg] = useState("");
  const [editRole, setEditRole] = useState<{id:string;role:Role}|null>(null);
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
    const saved = localStorage.getItem("cabane_screen");
    const allowed = ROLE_SCREENS[p.role];
    setScreen(saved && allowed.includes(saved) ? saved : allowed[0]);
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

  async function loadNotes() {
    const { data } = await getDB().from("category_notes").select("id,category,note").order("category").order("note");
    const map: Record<string,{id:string;note:string}[]> = {};
    (data||[]).forEach((r:{id:string;category:string;note:string}) => {
      if (!map[r.category]) map[r.category] = [];
      map[r.category].push({id:r.id, note:r.note});
    });
    setNotesByCat(map);
  }

  async function addNote() {
    if (!newNote.note.trim()) return;
    await getDB().from("category_notes").insert({category:newNote.category, note:newNote.note.trim()});
    setNewNote(n=>({...n,note:""}));
    loadNotes();
  }

  async function deleteNote(id:string) {
    await getDB().from("category_notes").delete().eq("id",id);
    loadNotes();
  }

  async function loadUsers() {
    setUsersLoading(true);
    const { data } = await getDB().from("profiles").select("*").order("name");
    setAdminUsers(data||[]);
    setUsersLoading(false);
  }

  async function createUser() {
    if (!newUser.name||!newUser.email||!newUser.password) return;
    setUserMsg("Creando usuario…");
    const { data, error } = await getDB().auth.signUp({
      email: newUser.email,
      password: newUser.password,
      options: { data: { name: newUser.name } },
    });
    if (error) { setUserMsg(`Error: ${error.message}`); return; }
    if (data.user) {
      await getDB().from("profiles").upsert({ id: data.user.id, name: newUser.name, role: newUser.role, email: newUser.email });
      setNewUser({name:"",email:"",password:"",role:"waiter"});
      setUserMsg("Usuario creado. Ya puede ingresar con esas credenciales.");
      loadUsers();
    }
  }

  async function updateUserRole(id: string, role: Role) {
    await getDB().from("profiles").update({ role }).eq("id", id);
    setAdminUsers(prev=>prev.map(u=>u.id===id?{...u,role}:u));
    setEditRole(null);
  }

  async function removeUserProfile(id: string) {
    await getDB().from("profiles").delete().eq("id", id);
    setAdminUsers(prev=>prev.filter(u=>u.id!==id));
  }

  useEffect(() => {
    if (screen==="waiter" && profile) {
      if (products.length===0) {
        getDB().from("products").select("*").eq("is_active",true).order("category")
          .then(({ data }: { data: Product[]|null }) => {
            const p = data||[]; setProducts(p); if (p.length) setCat(p[0].category);
          });
      }
      if (Object.keys(notesBycat).length===0) loadNotes();
    }
  }, [screen, products.length, profile]);

  const loadKitchen = useCallback(async () => {
    setKLoading(true);
    const todayStart = new Date(); todayStart.setHours(0,0,0,0);
    const [{ data: orders }, { data: summaryItems }] = await Promise.all([
      getDB().from("orders").select("*, order_items(*)").in("status",["enviado","preparando","listo"]).order("created_at",{ascending:false}),
      getDB().from("order_items").select("product_name,quantity,orders!inner(created_at,status)")
        .neq("orders.status","cancelado").gte("orders.created_at",todayStart.toISOString()),
    ]);
    setKOrders(orders||[]);
    const sMap: Record<string,number> = {};
    (summaryItems||[]).forEach((i:{product_name:string;quantity:number}) => {
      sMap[i.product_name] = (sMap[i.product_name]||0) + i.quantity;
    });
    setKSummary(Object.entries(sMap).map(([name,qty])=>({name,qty})).sort((a,b)=>b.qty-a.qty).slice(0,6));
    setKLoading(false);
  }, []);

  const loadCashier = useCallback(async () => {
    setCLoading(true);
    const today = new Date(); today.setHours(0,0,0,0);
    // Pedidos abiertos: sin filtro de fecha (pueden venir de días anteriores)
    const { data: openOrders } = await getDB().from("orders").select("*, order_items(*)").in("status",["enviado","preparando","listo"]).order("created_at",{ascending:false});
    // Pedidos pagados hoy: solo para el resumen del día
    const { data: paidToday } = await getDB().from("orders").select("*, order_items(*)").eq("status","pagado").gte("created_at",today.toISOString()).order("created_at",{ascending:false});
    const orders = [...(openOrders||[]), ...(paidToday||[])];
    const paidIds = (paidToday||[]).map((o:Order)=>o.id);
    const pb = {efectivo:0,tarjeta:0,transferencia:0};
    if (paidIds.length) {
      const { data: payments } = await getDB().from("payments").select("order_id,method,amount").in("order_id",paidIds);
      // Deduplicar: un pago por pedido (evita duplicados de pruebas anteriores)
      const seen = new Set<string>();
      (payments||[]).forEach((p:{order_id:string;method:string;amount:number}) => {
        if (seen.has(p.order_id)) return;
        seen.add(p.order_id);
        if (p.method in pb) pb[p.method as keyof typeof pb] += p.amount;
      });
    }
    setCOrders(orders||[]);
    setCPayBreakdown(pb);
    setCLoading(false);
  }, []);

  useEffect(() => {
    if (screen==="kitchen") loadKitchen();
    if (screen==="cashier") loadCashier();
    if (screen==="admin") { loadAdminStats(); loadAdminProducts(); loadNotes(); loadInventory(); }
  }, [screen, loadKitchen, loadCashier]);

  // Realtime caja
  useEffect(() => {
    if (screen!=="cashier") return;
    const ch = getDB().channel("cashier-rt")
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"orders"},
        (p: {new: Order}) => { setCOrders((prev:Order[])=>[{...p.new,order_items:[]}, ...prev]); })
      .on("postgres_changes",{event:"UPDATE",schema:"public",table:"orders"},
        (p: {new: Order}) => { setCOrders((prev:Order[])=>prev.map((o:Order)=>o.id===p.new.id?{...o,...p.new}:o)); })
      .subscribe();
    return () => { getDB().removeChannel(ch); };
  }, [screen]);

  // Realtime cocina
  useEffect(() => {
    if (screen!=="kitchen") return;
    const ch = getDB().channel("kitchen-rt")
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"orders"},
        (p: {new: Order}) => { playBeep(); setKOrders((prev:Order[])=>[{...p.new,order_items:[]}, ...prev]); })
      .on("postgres_changes",{event:"UPDATE",schema:"public",table:"orders"},
        (p: {new: Order}) => {
          setKOrders((prev:Order[])=>prev
            .map((o:Order)=>o.id===p.new.id?{...o,...p.new}:o)
            .filter((o:Order)=>["enviado","preparando","listo"].includes(o.status)));
        })
      .subscribe();
    return () => { getDB().removeChannel(ch); };
  }, [screen]);

  // Timer para tiempo transcurrido en cocina
  useEffect(() => {
    const id = setInterval(()=>setTick((t:number)=>t+1), 60000);
    return () => clearInterval(id);
  }, []);

  async function loadAdminStats() {
    setAdminLoading(true);
    // Rango según modo seleccionado
    let start: string, end: string;
    if (adminMode==="day") {
      const d = new Date(adminDate+"T00:00:00");
      start = d.toISOString();
      const de = new Date(adminDate+"T00:00:00"); de.setDate(de.getDate()+1);
      end = de.toISOString();
    } else {
      const [y,m] = adminMonth.split("-").map(Number);
      start = new Date(y,m-1,1).toISOString();
      end = new Date(y,m,1).toISOString();
    }

    const [{ data: periodOrders }, { data: items }] = await Promise.all([
      getDB().from("orders").select("id,total,created_at").eq("status","pagado").gte("created_at",start).lt("created_at",end),
      getDB().from("order_items").select("product_name,quantity,unit_price,orders!inner(status,created_at)")
        .eq("orders.status","pagado").gte("orders.created_at",start).lt("orders.created_at",end),
    ]);

    // payments no tiene created_at — filtrar por order_id de los pedidos del período
    const periodIds = (periodOrders||[]).map((o:{id:string})=>o.id);
    const pMap: Record<string,number> = {efectivo:0,tarjeta:0,transferencia:0};
    if (periodIds.length) {
      const { data: payments } = await getDB().from("payments").select("order_id,method,amount").in("order_id",periodIds);
      const seen = new Set<string>();
      (payments||[]).forEach((p:{order_id:string;method:string;amount:number}) => {
        if (seen.has(p.order_id)) return;
        seen.add(p.order_id);
        if (p.method in pMap) pMap[p.method] += p.amount;
      });
    }

    const hourlyData = Array(24).fill(0);
    (periodOrders||[]).forEach((o:{total:number;created_at:string}) => {
      const h = new Date(o.created_at).getHours();
      hourlyData[h] += o.total;
    });

    const prodMap: Record<string,{qty:number;revenue:number}> = {};
    (items||[]).forEach((i: {product_name:string;quantity:number;unit_price:number}) => {
      if (!prodMap[i.product_name]) prodMap[i.product_name]={qty:0,revenue:0};
      prodMap[i.product_name].qty+=i.quantity;
      prodMap[i.product_name].revenue+=i.quantity*i.unit_price;
    });
    const topProducts = Object.entries(prodMap)
      .map(([name,v])=>({name,...v}))
      .sort((a,b)=>b.revenue-a.revenue).slice(0,10);

    const total = (periodOrders||[]).reduce((s:number,o:{total:number})=>s+o.total,0);
    setAdminStats({
      todayRevenue: total,
      monthRevenue: total,
      todayCount:(periodOrders||[]).length,
      monthCount:(periodOrders||[]).length,
      topProducts,
      payBreakdown:pMap as AdminStats["payBreakdown"],
      hourlyData,
    });
    setAdminLoading(false);
  }

  async function loadAdminProducts() {
    const { data } = await getDB().from("products").select("*").order("category").order("name");
    setAdminProducts(data||[]);
  }

  async function addProduct() {
    if (!newProd.name||!newProd.price) return;
    await getDB().from("products").insert({name:newProd.name,category:newProd.category,price:parseFloat(newProd.price),is_active:true,description:newProd.description||null});
    setNewProd({name:"",category:CAT_ORDER[0],price:"",description:""});
    loadAdminProducts();
  }

  async function saveEditProd() {
    if (!editProd||!editProd.name||!editProd.price) return;
    await getDB().from("products").update({name:editProd.name,category:editProd.category,price:parseFloat(editProd.price),description:editProd.description||null}).eq("id",editProd.id);
    setEditProd(null);
    loadAdminProducts();
  }

  async function toggleProduct(id: string, is_active: boolean) {
    setAdminProducts((prev:Product[])=>prev.map((p:Product)=>p.id===id?{...p,is_active:!is_active}:p));
    await getDB().from("products").update({is_active:!is_active}).eq("id",id);
  }

  async function deleteProduct(id: string) {
    if (!confirm("¿Eliminar producto?")) return;
    setAdminProducts((prev:Product[])=>prev.filter((p:Product)=>p.id!==id));
    await getDB().from("products").delete().eq("id",id);
  }

  function changeQty(id: string, delta: number) {
    setCart(prev => {
      const p = products.find(x=>x.id===id)!;
      const cur = prev[id]||{...p,qty:0,notes:[],customNote:""};
      const qty = Math.max(0, cur.qty+delta);
      if (!qty) { const n={...prev}; delete n[id]; return n; }
      return {...prev,[id]:{...cur,qty}};
    });
  }

  function toggleNote(id: string, note: string) {
    setCart(prev => {
      const cur = prev[id]; if (!cur) return prev;
      const notes = cur.notes.includes(note) ? cur.notes.filter(n=>n!==note) : [...cur.notes, note];
      return {...prev,[id]:{...cur,notes}};
    });
  }

  function setCustomNote(id: string, customNote: string) {
    setCart(prev => { const cur=prev[id]; if(!cur) return prev; return {...prev,[id]:{...cur,customNote}}; });
  }

  async function sendToKitchen() {
    const items = Object.values(cart) as CartItem[];
    if (!items.length) return;
    const total = items.reduce((s,i)=>s+i.price*i.qty,0);
    setSending(true);
    try {
      const { data: order, error }: { data: Order|null; error: unknown } = await getDB().from("orders").insert({table_label:mesa,status:"enviado",total,table_note:tableNote||null}).select().single();
      if (error||!order) { setSentMsg("Error al enviar. Revisa tu conexión e intenta de nuevo."); setSending(false); return; }
      const { error: itemsError } = await getDB().from("order_items").insert(items.map((i:CartItem)=>({
        order_id:order.id, product_id:i.id, product_name:i.name,
        quantity:i.qty, unit_price:i.price,
        notes:[...i.notes, i.customNote].filter(Boolean).join(", ")||null
      })));
      if (itemsError) { setSentMsg("Pedido creado pero hubo un error con los items. Avisa al admin."); setSending(false); return; }
      setCart({}); setModal(false); setTableNote("");
      setSentMsg(`Pedido #${order.order_number} confirmado — cocina ya lo recibió`);
      setTimeout(()=>setSentMsg(""),5000);
    } catch(_) {
      setSentMsg("Sin conexión. Verifica internet e intenta de nuevo.");
    }
    setSending(false);
  }

  async function cancelOrder(id: string) {
    if (!confirm("¿Cancelar este pedido?")) return;
    setKOrders((prev:Order[])=>prev.filter((o:Order)=>o.id!==id));
    await getDB().from("orders").update({status:"cancelado"}).eq("id",id);
  }

  async function kitchenUpdate(id: string, status: Status) {
    setUpdating(id);
    setKOrders(prev=>prev.map(o=>o.id===id?{...o,status}:o));
    await getDB().from("orders").update({status}).eq("id",id);
    setUpdating(null);
  }

  async function loadInventory() {
    const [{ data: ingr }, { data: rec }] = await Promise.all([
      getDB().from("ingredients").select("*").order("name"),
      getDB().from("recipes").select("*"),
    ]);
    setIngredients(ingr||[]);
    setRecipes(rec||[]);
  }

  async function addIngredient() {
    if (!newIngr.name||!newIngr.stock_current) return;
    await getDB().from("ingredients").insert({name:newIngr.name,unit:newIngr.unit,stock_current:parseFloat(newIngr.stock_current),stock_min:parseFloat(newIngr.stock_min)||5});
    setNewIngr({name:"",unit:"unidades",stock_current:"",stock_min:""});
    loadInventory();
  }

  async function saveEditIngr() {
    if (!editIngr||!editIngr.name||!editIngr.stock_min) return;
    await getDB().from("ingredients").update({name:editIngr.name,unit:editIngr.unit,stock_min:parseFloat(editIngr.stock_min)}).eq("id",editIngr.id);
    setEditIngr(null);
    loadInventory();
  }

  async function doRestock() {
    if (!restockId||!restockAmt) return;
    const ingr = ingredients.find(i=>i.id===restockId);
    if (!ingr) return;
    await getDB().from("ingredients").update({stock_current:ingr.stock_current+parseFloat(restockAmt)}).eq("id",restockId);
    setRestockId(null); setRestockAmt("");
    loadInventory();
  }

  async function deleteIngredient(id: string) {
    if (!confirm("¿Eliminar ingrediente?")) return;
    await getDB().from("ingredients").delete().eq("id",id);
    loadInventory();
  }

  async function addRecipeLine() {
    if (!recipeProductId||!newRecipeLine.ingredient_id||!newRecipeLine.quantity) return;
    await getDB().from("recipes").upsert({product_id:recipeProductId,ingredient_id:newRecipeLine.ingredient_id,quantity:parseFloat(newRecipeLine.quantity)},{onConflict:"product_id,ingredient_id"});
    setNewRecipeLine({ingredient_id:"",quantity:""});
    loadInventory();
  }

  async function deleteRecipeLine(id: string) {
    await getDB().from("recipes").delete().eq("id",id);
    loadInventory();
  }

  async function deductInventory(order: Order) {
    const items = order.order_items||[];
    if (!items.length) return;
    const productIds = [...new Set(items.map(i=>i.product_id).filter(Boolean))];
    if (!productIds.length) return;
    const { data: recipeLines } = await getDB().from("recipes").select("*").in("product_id",productIds);
    if (!recipeLines?.length) return;
    const usage: Record<string,number> = {};
    for (const item of items) {
      const lines = (recipeLines as Recipe[]).filter(r=>r.product_id===item.product_id);
      for (const line of lines) {
        usage[line.ingredient_id] = (usage[line.ingredient_id]||0) + line.quantity * item.quantity;
      }
    }
    const { data: currentIngr } = await getDB().from("ingredients").select("id,stock_current").in("id",Object.keys(usage));
    for (const ingr of (currentIngr||[])) {
      const newStock = Math.max(0, ingr.stock_current - (usage[ingr.id]||0));
      await getDB().from("ingredients").update({stock_current:newStock}).eq("id",ingr.id);
    }
  }

  async function cobrar(id: string, method: string, amount: number) {
    setPaying(id);
    setCOrders((prev:Order[])=>prev.map(o=>o.id===id?{...o,status:"pagado"}:o));
    setCPayBreakdown((prev:{efectivo:number;tarjeta:number;transferencia:number})=>({...prev,[method]:(prev[method as keyof typeof prev]||0)+amount}));
    await getDB().from("payments").insert({order_id:id,method,amount});
    await getDB().from("orders").update({status:"pagado"}).eq("id",id);
    const order = cOrders.find(o=>o.id===id); if (order) deductInventory(order);
    setPaying(null);
  }

  async function cobrarSplit(order: Order, parts: {method:string; amount:number}[]) {
    setPaying(order.id);
    setSplitModal(null);
    setCOrders((prev:Order[])=>prev.map(o=>o.id===order.id?{...o,status:"pagado"}:o));
    setCPayBreakdown((prev:{efectivo:number;tarjeta:number;transferencia:number})=>{
      const next = {...prev};
      parts.forEach(p=>{ next[p.method as keyof typeof next] = (next[p.method as keyof typeof next]||0) + p.amount; });
      return next;
    });
    await Promise.all(parts.map(p=>getDB().from("payments").insert({order_id:order.id,method:p.method,amount:p.amount})));
    await getDB().from("orders").update({status:"pagado"}).eq("id",order.id);
    deductInventory(order);
    setPaying(null);
  }

  if (!ok) return null;

  const cartItems = Object.values(cart);
  const cartTotal = cartItems.reduce((s,i)=>s+i.price*i.qty,0);
  const cartCount = cartItems.reduce((s,i)=>s+i.qty,0);
  const cats = [...new Set(products.map(p=>p.category))].sort((a,b)=>{
    const ai = CAT_ORDER.indexOf(a); const bi = CAT_ORDER.indexOf(b);
    return (ai===-1?99:ai) - (bi===-1?99:bi);
  });
  const visProd = products.filter(p=>{
    if (search.trim()) return p.name.toLowerCase().includes(search.toLowerCase());
    return p.category===cat;
  });
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
      enviado: [RED,"#fff"], preparando:[GOLD,DARK], listo:[GREEN,"#fff"], pagado:["#E0D0C0",MUTED], cancelado:["#D0C0B0",MUTED]
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
    <div style={{minHeight:"100vh",background:`linear-gradient(160deg, #1A0D12 0%, #2A1A1F 50%, #1A0D12 100%)`,display:"flex",alignItems:"center",justifyContent:"center",padding:"24px 16px",fontFamily:FONT,position:"relative",overflow:"hidden"}}>
      {/* Decorative glows */}
      <div style={{position:"absolute",top:"10%",left:"50%",transform:"translateX(-50%)",width:"70%",height:"50%",background:`radial-gradient(ellipse, rgba(122,30,58,0.25) 0%, transparent 70%)`,pointerEvents:"none"}}/>
      <div style={{position:"absolute",bottom:"-10%",right:"-10%",width:"50%",height:"50%",background:`radial-gradient(ellipse, rgba(181,137,74,0.1) 0%, transparent 70%)`,pointerEvents:"none"}}/>
      <div style={{position:"absolute",top:"50%",left:"-15%",width:"40%",height:"40%",background:`radial-gradient(ellipse, rgba(122,30,58,0.12) 0%, transparent 70%)`,pointerEvents:"none"}}/>

      <div style={{width:"100%",maxWidth:380,position:"relative",zIndex:1,animation:"fadeUp .5s ease both"}}>

        {/* Logo centrado */}
        <div style={{textAlign:"center" as const,marginBottom:36}}>
          <div style={{
            display:"inline-block",
            padding:6,
            borderRadius:28,
            background:`linear-gradient(145deg, rgba(122,30,58,0.5), rgba(181,137,74,0.2))`,
            border:"1px solid rgba(181,137,74,0.25)",
            boxShadow:"0 20px 60px rgba(0,0,0,0.5), 0 0 40px rgba(122,30,58,0.3)",
            marginBottom:24,
          }}>
            <img
              src="/640524393_18019556534658854_3130895744895686814_n.jpg"
              alt="Cabane Sandwiches"
              onError={(e)=>{ (e.currentTarget as HTMLImageElement).style.display="none"; }}
              style={{width:180,height:180,objectFit:"contain" as const,borderRadius:22,display:"block"}}
            />
          </div>
          <div style={{height:1,background:"linear-gradient(90deg, transparent, rgba(181,137,74,0.4), transparent)",marginBottom:20}}/>
          <p style={{color:"rgba(232,213,183,0.4)",fontSize:11,fontWeight:700,letterSpacing:"0.3em",textTransform:"uppercase" as const}}>Sistema de pedidos</p>
        </div>

        {/* Form */}
        <div style={{
          background:"rgba(255,255,255,0.04)",
          border:"1px solid rgba(181,137,74,0.15)",
          borderRadius:24,
          padding:"28px 24px",
          backdropFilter:"blur(12px)",
          boxShadow:"0 24px 64px rgba(0,0,0,0.4)",
        }}>
          <div style={{marginBottom:16}}>
            <label style={{fontSize:11,fontWeight:700,color:"rgba(232,213,183,0.45)",textTransform:"uppercase" as const,letterSpacing:"0.12em",display:"block",marginBottom:8}}>Email</label>
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&login()} placeholder="tu@email.com"
              style={{width:"100%",padding:"14px 16px",borderRadius:12,border:"1.5px solid rgba(181,137,74,0.2)",background:"rgba(255,255,255,0.05)",color:"#E8D5B7",fontSize:15,fontWeight:600,outline:"none",fontFamily:FONT}}/>
          </div>
          <div style={{marginBottom:24}}>
            <label style={{fontSize:11,fontWeight:700,color:"rgba(232,213,183,0.45)",textTransform:"uppercase" as const,letterSpacing:"0.12em",display:"block",marginBottom:8}}>Contraseña</label>
            <input type="password" value={pass} onChange={e=>setPass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&login()} placeholder="••••••••"
              style={{width:"100%",padding:"14px 16px",borderRadius:12,border:"1.5px solid rgba(181,137,74,0.2)",background:"rgba(255,255,255,0.05)",color:"#E8D5B7",fontSize:15,fontWeight:600,outline:"none",fontFamily:FONT}}/>
          </div>
          {loginErr && (
            <div style={{background:"rgba(122,30,58,0.25)",border:"1px solid rgba(122,30,58,0.5)",borderRadius:10,padding:"10px 14px",color:"#F0A0B0",fontSize:13,fontWeight:600,marginBottom:16}}>
              {loginErr}
            </div>
          )}
          <button disabled={loginLoading||!email||!pass} onClick={login} style={{
            width:"100%",height:52,borderRadius:14,fontSize:15,fontWeight:800,fontFamily:FONT,border:"none",cursor:loginLoading||!email||!pass?"not-allowed":"pointer",
            background:loginLoading||!email||!pass?"rgba(122,30,58,0.3)":`linear-gradient(135deg, ${RED}, #5C142C)`,
            color:loginLoading||!email||!pass?"rgba(255,255,255,0.3)":"#E8D5B7",
            boxShadow:loginLoading||!email||!pass?"none":"0 8px 24px rgba(122,30,58,0.5)",
            letterSpacing:"0.04em",
            transition:"all .2s",
          }}>
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
          <img src="/640524393_18019556534658854_3130895744895686814_n.jpg" alt="Cabane" onError={(e)=>{(e.currentTarget as HTMLImageElement).style.display="none"}}
            style={{width:34,height:34,borderRadius:8,objectFit:"contain" as const,background:DARK}}/>
          <span style={{fontWeight:900,fontSize:16,color:"#fff",letterSpacing:"-0.01em"}}><span style={{color:"#E8D5B7"}}>CABANE</span> <span style={{color:"rgba(255,255,255,0.5)",fontWeight:600,fontSize:13}}>Sandwiches</span></span>
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
            <button key={s} onClick={()=>goTo(s)} style={{flex:1,padding:"9px",borderRadius:10,fontWeight:700,fontSize:13,border:"none",cursor:"pointer",fontFamily:FONT,
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
              .product-grid{display:grid!important;grid-template-columns:repeat(2,1fr)!important;gap:10px!important}
            }
            @media(min-width:1200px){
              .product-grid{grid-template-columns:repeat(3,1fr)!important}
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
              {/* Sticky header: búsqueda + categorías */}
              <div style={{position:"sticky" as const,top:0,zIndex:10,background:CREAM,borderBottom:`1px solid ${BORDER}`,padding:"10px 16px"}}>
                {/* Búsqueda */}
                <input
                  type="search"
                  placeholder="Buscar producto..."
                  value={search}
                  onChange={e=>{setSearch(e.target.value);}}
                  style={{width:"100%",padding:"11px 16px",borderRadius:12,border:`1.5px solid ${search?RED:BORDER}`,
                    background:CARD,color:DARK,fontSize:15,fontWeight:600,fontFamily:FONT,outline:"none",marginBottom:10}}
                />
                {/* Mesa selector — solo en móvil */}
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
                {/* Category chips — ocultos cuando hay búsqueda activa */}
                {!search && <div style={{display:"flex",gap:8,overflowX:"auto",scrollbarWidth:"none" as const,paddingTop:2}}>
                  {cats.map(c=>(
                    <button key={c} onClick={()=>setCat(c)} style={{
                      padding:"10px 20px",borderRadius:99,fontWeight:700,fontSize:14,
                      whiteSpace:"nowrap" as const,border:"none",cursor:"pointer",fontFamily:FONT,flexShrink:0,
                      background:cat===c?RED:CREAM2,color:cat===c?"#fff":DARK,
                      boxShadow:cat===c?`0 4px 12px rgba(122,30,58,0.25)`:"none"}}>
                      {c}
                    </button>
                  ))}
                </div>}
              </div>

              {/* Success message */}
              {sentMsg && (
                <div style={{margin:"12px 16px 0",background:"rgba(47,125,50,0.1)",border:`1.5px solid ${GREEN}`,borderRadius:12,padding:"12px 16px",fontSize:14,fontWeight:700,color:GREEN}}>
                  {sentMsg}
                </div>
              )}

              {/* Product list — vertical en móvil, grid en desktop */}
              <div className="product-grid" style={{padding:"12px 12px 0",display:"flex",flexDirection:"column",gap:8}}>
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
                          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
                            <p style={{fontSize:17,fontWeight:800,color:DARK,lineHeight:1.2}}>{p.name}</p>
                            {p.description && (
                              <button onClick={()=>setExpandedDesc(expandedDesc===p.id?null:p.id)}
                                style={{flexShrink:0,width:20,height:20,borderRadius:"50%",background:CREAM2,border:"none",
                                  cursor:"pointer",fontSize:11,fontWeight:900,color:MUTED,fontFamily:FONT,
                                  display:"flex",alignItems:"center",justifyContent:"center"}}>
                                ?
                              </button>
                            )}
                          </div>
                          {expandedDesc===p.id && p.description && (
                            <p style={{fontSize:12,fontWeight:600,color:MUTED,marginBottom:4,lineHeight:1.4}}>{p.description}</p>
                          )}
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

                      {/* Notes — only when product is in cart */}
                      {qty>0 && (
                        <div style={{borderTop:`1px solid ${BORDER}`,paddingTop:10}}>
                          {/* Quick note chips */}
                          <div style={{display:"flex",gap:6,flexWrap:"wrap" as const,marginBottom:8}}>
                            {(notesBycat[p.category]||[]).map(({note:n})=>{
                              const active = cart[p.id]?.notes.includes(n);
                              return (
                                <button key={n} onClick={()=>toggleNote(p.id,n)} style={{
                                  padding:"6px 12px",borderRadius:99,fontSize:12,fontWeight:700,fontFamily:FONT,
                                  border:`1.5px solid ${active?RED:BORDER}`,cursor:"pointer",
                                  background:active?`rgba(225,59,45,0.08)`:"transparent",
                                  color:active?RED:MUTED}}>
                                  {active?"✓ ":""}{n}
                                </button>
                              );
                            })}
                          </div>
                          {/* Free text note */}
                          <input
                            type="text"
                            placeholder="Nota adicional (ej: sin sal, extra picante…)"
                            value={cart[p.id]?.customNote||""}
                            onChange={e=>setCustomNote(p.id,e.target.value)}
                            style={{width:"100%",padding:"10px 12px",borderRadius:10,border:`1.5px solid ${BORDER}`,
                              fontSize:13,fontWeight:600,fontFamily:FONT,color:DARK,background:"#fafafa",outline:"none"}}
                          />
                        </div>
                      )}
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

          {/* Resumen del día */}
          {kSummary.length>0 && (
            <div style={{...card,padding:"12px 16px",marginBottom:16}}>
              <p style={{fontSize:11,fontWeight:700,color:MUTED,textTransform:"uppercase" as const,letterSpacing:"0.1em",marginBottom:10}}>Más pedido hoy</p>
              <div style={{display:"flex",gap:8,flexWrap:"wrap" as const}}>
                {kSummary.map((s,i)=>(
                  <div key={s.name} style={{
                    padding:"6px 14px",borderRadius:99,fontSize:13,fontWeight:800,
                    background:i===0?RED:i===1?GOLD:CREAM2,
                    color:i===0?"#fff":i===1?DARK:DARK,
                  }}>
                    {s.name} <span style={{opacity:0.7}}>×{s.qty}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {kOrders.length===0&&!kLoading ? (
            <div style={{textAlign:"center" as const,padding:"60px 20px"}}>
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
                const mins=Math.floor((Date.now()-new Date(o.created_at).getTime())/60000);
                void tick;
                return (
                  <div key={o.id} style={{...card,padding:16,
                    border:o.status==="enviado"?`2px solid ${RED}`:o.status==="listo"?`2px solid ${GREEN}`:`1px solid ${BORDER}`}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
                      <div>
                        <p style={{fontSize:12,fontWeight:600,color:MUTED,marginBottom:2}}>#{o.order_number} · {time} · <span style={{color:mins>=15?RED:mins>=8?GOLD:GREEN,fontWeight:800}}>{elapsed(o.created_at)}</span></p>
                        <p style={{fontSize:22,fontWeight:900,color:DARK}}>{o.table_label}</p>
                        {o.table_note && <p style={{fontSize:12,fontWeight:700,color:DARK,background:GOLD,borderRadius:6,padding:"3px 8px",marginTop:4,display:"inline-block"}}>Nota mesa: {o.table_note}</p>}
                      </div>
                      <span style={badge(o.status)}>{o.status==="enviado"?"Nuevo":o.status==="preparando"?"Prep.":"Listo"}</span>
                    </div>
                    <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:12}}>
                      {(o.order_items||[]).map(i=>(
                        <div key={i.id} style={{background:CREAM,borderRadius:8,padding:"8px 12px"}}>
                          <div style={{display:"flex",justifyContent:"space-between",fontSize:14,fontWeight:700,color:DARK}}>
                            <span>{i.quantity}× {i.product_name}</span>
                            <span style={{fontWeight:800}}>{$(i.quantity*i.unit_price)}</span>
                          </div>
                          {i.notes && (
                            <p style={{fontSize:12,fontWeight:700,color:RED,marginTop:4,display:"flex",alignItems:"center",gap:4}}>
                              Nota: {i.notes}
                            </p>
                          )}
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
                      {o.status==="enviado" && <button disabled={busy} onClick={()=>cancelOrder(o.id)} style={{...btn(CREAM2,MUTED,busy),height:50,padding:"0 14px",fontSize:13}}>Cancelar</button>}
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
        <div style={{padding:16,maxWidth:1200,margin:"0 auto",width:"100%"}}>
          <style>{`.cashier-grid{display:block}.cashier-sidebar{display:none}@media(min-width:900px){.cashier-grid{display:grid!important;grid-template-columns:1fr 340px;gap:20px;align-items:start}.cashier-sidebar{display:flex!important}}`}</style>

          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20,flexWrap:"wrap" as const,gap:10}}>
            <div>
              <p style={{fontSize:12,fontWeight:700,color:MUTED,textTransform:"uppercase" as const,letterSpacing:"0.1em",marginBottom:2}}>Módulo</p>
              <h1 style={{fontSize:"clamp(26px,4vw,36px)",fontWeight:900,letterSpacing:"-0.02em",color:DARK}}>Caja</h1>
            </div>
            <button onClick={loadCashier} style={{...btn(CREAM2,DARK),height:44,padding:"0 18px",fontSize:14}}>
              {cLoading?"Cargando…":"↻ Actualizar"}
            </button>
          </div>

          {/* Métricas — visibles en móvil arriba, en desktop se mueven al sidebar */}
          <div className="cashier-sidebar" style={{display:"none"}}/>

          <div className="cashier-grid">
            {/* Columna izquierda: pedidos */}
            <div>
              {/* Métricas en móvil */}
              {(()=>{
                const open=cOrders.filter(o=>o.status!=="pagado"&&o.status!=="cancelado");
                const paid=cOrders.filter(o=>o.status==="pagado");
                return (
                  <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10,marginBottom:16}}>
                    {[
                      {v:String(open.length),l:"Abiertos",bg:DARK,fg:"#fff",acc:GOLD},
                      {v:String(open.filter(o=>o.status==="listo").length),l:"Listos p/ cobrar",bg:RED,fg:"#fff",acc:"#fff"},
                      {v:$(open.reduce((s,o)=>s+o.total,0)),l:"Por cobrar",bg:GOLD,fg:DARK,acc:DARK},
                      {v:$(paid.reduce((s,o)=>s+o.total,0)),l:"Cobrado hoy",bg:GREEN,fg:"#fff",acc:"#fff"},
                    ].map(({v,l,bg,fg,acc})=>(
                      <div key={l} style={{background:bg,borderRadius:14,padding:"14px",boxShadow:`0 4px 16px ${bg}33`}}>
                        <p style={{fontSize:"clamp(18px,3vw,26px)",fontWeight:900,color:acc,lineHeight:1,marginBottom:4}}>{v}</p>
                        <p style={{fontSize:11,fontWeight:700,color:fg,opacity:0.6,textTransform:"uppercase" as const,letterSpacing:"0.08em"}}>{l}</p>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {(()=>{
                const overdue=cOrders.filter(o=>o.status==="listo"&&(Date.now()-new Date(o.created_at).getTime())>20*60*1000);
                return overdue.length>0?(
                  <div style={{background:"#FEF3C7",border:"2px solid #D97706",borderRadius:12,padding:"12px 16px",marginBottom:14,display:"flex",alignItems:"center",gap:10}}>
                    <span style={{fontSize:20}}>⚠️</span>
                    <div>
                      <p style={{fontSize:14,fontWeight:900,color:"#92400E",margin:0}}>
                        {overdue.length} {overdue.length===1?"pedido listo lleva":"pedidos listos llevan"} más de 20 min sin cobrar
                      </p>
                      <p style={{fontSize:12,fontWeight:600,color:"#B45309",margin:0}}>
                        {overdue.map(o=>o.table_label).join(" · ")}
                      </p>
                    </div>
                  </div>
                ):null;
              })()}

              {cOrders.filter(o=>o.status!=="pagado"&&o.status!=="cancelado").length===0&&!cLoading ? (
                <div style={{textAlign:"center" as const,padding:"60px 20px"}}>
                  <p style={{fontWeight:800,fontSize:20,color:MUTED}}>Sin pedidos pendientes</p>
                </div>
              ) : (
                <div style={{display:"flex",flexDirection:"column",gap:12}}>
                  {cOrders.filter(o=>o.status!=="pagado"&&o.status!=="cancelado").map(o=>{
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
                      <div style={{display:"flex",flexDirection:"column" as const,alignItems:"flex-end",gap:8}}>
                        <p style={{fontSize:"clamp(22px,3vw,28px)",fontWeight:900,color:RED}}>{$(o.total)}</p>
                        <button onClick={()=>setExpandedOrder(expandedOrder===o.id?null:o.id)}
                          style={{fontSize:12,fontWeight:700,color:MUTED,background:CREAM2,border:"none",borderRadius:8,padding:"5px 10px",cursor:"pointer",fontFamily:FONT}}>
                          {expandedOrder===o.id?"Ocultar ▲":`Ver ${(o.order_items||[]).length} items ▼`}
                        </button>
                      </div>
                    </div>

                    {/* Order items expandable */}
                    {expandedOrder===o.id && (
                      <div style={{background:CREAM,borderRadius:10,padding:"10px 12px",marginBottom:12,display:"flex",flexDirection:"column" as const,gap:6}}>
                        {(o.order_items||[]).map(i=>(
                          <div key={i.id} style={{borderBottom:`1px solid ${BORDER}`,paddingBottom:6,marginBottom:2}}>
                            <div style={{display:"flex",justifyContent:"space-between",fontSize:14,fontWeight:700,color:DARK}}>
                              <span>{i.quantity}× {i.product_name}</span>
                              <span>{$(i.quantity*i.unit_price)}</span>
                            </div>
                            {i.notes && <p style={{fontSize:12,fontWeight:600,color:MUTED,marginTop:2}}>Nota: {i.notes}</p>}
                          </div>
                        ))}
                      </div>
                    )}

                    {!canPay && <p style={{fontSize:13,color:MUTED,fontWeight:600,marginBottom:12,background:CREAM2,borderRadius:8,padding:"8px 12px"}}>Esperando que cocina marque como Listo</p>}
                    <div style={{display:"flex",gap:8,flexWrap:"wrap" as const}}>
                      {(["efectivo","tarjeta","transferencia"] as const).map(m=>{
                        const labels={efectivo:"Efectivo",tarjeta:"Tarjeta",transferencia:"Transferencia"};
                        const bgs={efectivo:DARK,tarjeta:RED,transferencia:GOLD};
                        const fgs={efectivo:"#fff",tarjeta:"#fff",transferencia:DARK};
                        return (
                          <button key={m} disabled={!canPay||busy} onClick={()=>cobrar(o.id,m,o.total)}
                            style={{...btn(bgs[m],fgs[m],!canPay||busy),flex:1,minWidth:100,height:50,fontSize:13}}>
                            {busy?"Guardando…":labels[m]}
                          </button>
                        );
                      })}
                      <button disabled={!canPay||busy} onClick={()=>{setSplitModal(o);setSplitAmounts({efectivo:"",tarjeta:"",transferencia:""});}}
                        style={{...btn(CREAM2,DARK,!canPay||busy),flex:1,minWidth:100,height:50,fontSize:13,border:`1px solid ${BORDER}`}}>
                        Dividir
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

            {/* Columna derecha sticky — resumen del día (solo desktop) */}
            <aside className="cashier-sidebar" style={{flexDirection:"column",gap:12,position:"sticky" as const,top:72}}>
              {(()=>{
                const paid=cOrders.filter(o=>o.status==="pagado");
                return (
                  <>
                    <div style={{...card,padding:16}}>
                      <p style={{fontSize:11,fontWeight:700,color:MUTED,textTransform:"uppercase" as const,letterSpacing:"0.1em",marginBottom:12}}>Resumen del día</p>
                      <p style={{fontSize:32,fontWeight:900,color:DARK,lineHeight:1}}>{$(paid.reduce((s,o)=>s+o.total,0))}</p>
                      <p style={{fontSize:13,fontWeight:600,color:MUTED,marginTop:4,marginBottom:16}}>{paid.length} pedidos cobrados</p>
                      {[
                        {l:"Efectivo",k:"efectivo",bg:DARK,fg:"#fff"},
                        {l:"Tarjeta",k:"tarjeta",bg:CREAM2,fg:DARK},
                        {l:"Transferencia",k:"transferencia",bg:CREAM2,fg:DARK},
                      ].map(({l,k,bg,fg})=>(
                        <div key={l} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 12px",borderRadius:10,background:bg,marginBottom:6}}>
                          <span style={{fontSize:13,fontWeight:700,color:fg,opacity:0.8}}>{l}</span>
                          <span style={{fontSize:15,fontWeight:900,color:fg}}>{$(cPayBreakdown[k as keyof typeof cPayBreakdown])}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{...card,padding:16}}>
                      <p style={{fontSize:11,fontWeight:700,color:MUTED,textTransform:"uppercase" as const,letterSpacing:"0.1em",marginBottom:12}}>Últimos cobros</p>
                      {paid.slice(0,5).map(o=>(
                        <div key={o.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:`1px solid ${BORDER}`}}>
                          <div>
                            <p style={{fontSize:13,fontWeight:700,color:DARK}}>#{o.order_number} · {o.table_label}</p>
                            <p style={{fontSize:11,fontWeight:600,color:MUTED}}>{new Date(o.created_at).toLocaleTimeString("es-EC",{hour:"2-digit",minute:"2-digit"})}</p>
                          </div>
                          <span style={{fontSize:14,fontWeight:900,color:GREEN}}>{$(o.total)}</span>
                        </div>
                      ))}
                      {paid.length===0 && <p style={{fontSize:13,color:MUTED,fontWeight:600}}>Sin cobros aún</p>}
                    </div>
                  </>
                );
              })()}
            </aside>
          </div>
        </div>
      )}

      {/* ── ADMIN ──────────────────────────────────────────────── */}
      {screen==="admin" && (
        <div style={{padding:16,maxWidth:1000,margin:"0 auto",width:"100%"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20,flexWrap:"wrap" as const,gap:10}}>
            <div>
              <p style={{fontSize:12,fontWeight:700,color:MUTED,textTransform:"uppercase" as const,letterSpacing:"0.1em",marginBottom:2}}>Panel</p>
              <h1 style={{fontSize:"clamp(26px,4vw,36px)",fontWeight:900,letterSpacing:"-0.02em",color:DARK}}>Administración</h1>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>{setAdminSection("stats");loadAdminStats();}} style={{...btn(adminSection==="stats"?RED:CREAM2, adminSection==="stats"?"#fff":DARK),height:40,padding:"0 16px",fontSize:13}}>Reportes</button>
              <button onClick={()=>{setAdminSection("products");loadAdminProducts();}} style={{...btn(adminSection==="products"?RED:CREAM2, adminSection==="products"?"#fff":DARK),height:40,padding:"0 16px",fontSize:13}}>Productos</button>
              <button onClick={()=>{setAdminSection("notes");loadNotes();}} style={{...btn(adminSection==="notes"?RED:CREAM2, adminSection==="notes"?"#fff":DARK),height:40,padding:"0 16px",fontSize:13}}>Notas</button>
              <button onClick={()=>{setAdminSection("inventory");loadInventory();}} style={{...btn(adminSection==="inventory"?RED:CREAM2, adminSection==="inventory"?"#fff":DARK),height:40,padding:"0 16px",fontSize:13}}>Inventario</button>
              <button onClick={()=>{setAdminSection("users");loadUsers();}} style={{...btn(adminSection==="users"?RED:CREAM2, adminSection==="users"?"#fff":DARK),height:40,padding:"0 16px",fontSize:13}}>Usuarios</button>
            </div>
          </div>

          {adminSection==="stats" && (
            <div>
              {/* Selector período */}
              <div style={{display:"flex",flexWrap:"wrap" as const,gap:8,marginBottom:16,alignItems:"center"}}>
                <button onClick={()=>setAdminMode("day")} style={{...btn(adminMode==="day"?RED:CREAM2,adminMode==="day"?"#fff":DARK),height:38,padding:"0 16px",fontSize:13}}>Por día</button>
                <button onClick={()=>setAdminMode("month")} style={{...btn(adminMode==="month"?RED:CREAM2,adminMode==="month"?"#fff":DARK),height:38,padding:"0 16px",fontSize:13}}>Por mes</button>
                {adminMode==="day"
                  ? <input type="date" value={adminDate} onChange={e=>setAdminDate(e.target.value)}
                      style={{height:38,padding:"0 12px",borderRadius:10,border:`1.5px solid ${BORDER}`,fontSize:13,fontWeight:600,fontFamily:FONT,color:DARK,background:CARD,outline:"none"}}/>
                  : <input type="month" value={adminMonth} onChange={e=>setAdminMonth(e.target.value)}
                      style={{height:38,padding:"0 12px",borderRadius:10,border:`1.5px solid ${BORDER}`,fontSize:13,fontWeight:600,fontFamily:FONT,color:DARK,background:CARD,outline:"none"}}/>
                }
                <button onClick={loadAdminStats} style={{...btn(CREAM2,DARK),height:38,padding:"0 16px",fontSize:13}}>{adminLoading?"Cargando…":"↻"}</button>
              </div>

              {/* Métricas principales */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10,marginBottom:20}}>
                {[
                  {v:$(adminStats?.todayRevenue||0),l:adminMode==="day"?`Facturado el ${adminDate}`:`Facturado en ${adminMonth}`,bg:RED,fg:"#fff"},
                  {v:String(adminStats?.todayCount||0),l:"Pedidos",bg:DARK,fg:"#fff"},
                  {v:$(adminStats?.payBreakdown.efectivo||0),l:"Efectivo",bg:GOLD,fg:DARK},
                  {v:$(adminStats?.payBreakdown.tarjeta||0),l:"Tarjeta",bg:GREEN,fg:"#fff"},
                ].map(({v,l,bg,fg})=>(
                  <div key={l} style={{background:bg,borderRadius:14,padding:"16px",boxShadow:`0 4px 16px ${bg}33`}}>
                    <p style={{fontSize:"clamp(20px,4vw,28px)",fontWeight:900,color:fg,lineHeight:1,marginBottom:4}}>{v}</p>
                    <p style={{fontSize:11,fontWeight:700,color:fg,opacity:0.65,textTransform:"uppercase" as const,letterSpacing:"0.1em"}}>{l}</p>
                  </div>
                ))}
              </div>

              {/* Transferencia */}
              <div style={{...card,padding:14,marginBottom:20,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <p style={{fontSize:13,fontWeight:700,color:MUTED,textTransform:"uppercase" as const,letterSpacing:"0.08em"}}>Transferencia</p>
                <p style={{fontSize:22,fontWeight:900,color:DARK}}>{$(adminStats?.payBreakdown.transferencia||0)}</p>
              </div>

              {/* Top productos */}
              <div style={{...card,padding:16}}>
                <p style={{fontSize:12,fontWeight:700,color:MUTED,textTransform:"uppercase" as const,letterSpacing:"0.1em",marginBottom:14}}>Top productos</p>
                {(adminStats?.topProducts||[]).length===0 ? (
                  <p style={{fontSize:14,color:MUTED,fontWeight:600}}>Sin datos aún</p>
                ) : (
                  <div style={{display:"flex",flexDirection:"column" as const,gap:8}}>
                    {(adminStats?.topProducts||[]).map((p,i)=>(
                      <div key={p.name} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 12px",background:i===0?`rgba(122,30,58,0.06)`:CREAM,borderRadius:10}}>
                        <span style={{fontSize:13,fontWeight:900,color:MUTED,minWidth:20}}>{i+1}</span>
                        <span style={{flex:1,fontSize:14,fontWeight:700,color:DARK}}>{p.name}</span>
                        <span style={{fontSize:13,fontWeight:700,color:MUTED}}>{p.qty} uds</span>
                        <span style={{fontSize:15,fontWeight:900,color:RED}}>{$(p.revenue)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Gráfica ventas por hora */}
              <div style={{...card,padding:16,marginTop:16}}>
                <p style={{fontSize:12,fontWeight:700,color:MUTED,textTransform:"uppercase" as const,letterSpacing:"0.1em",marginBottom:16}}>Ventas por hora — hoy</p>
                {(()=>{
                  const data = adminStats?.hourlyData||Array(24).fill(0);
                  const max = Math.max(...data, 1);
                  const now = new Date().getHours();
                  return (
                    <div style={{display:"flex",alignItems:"flex-end",gap:3,height:140,overflowX:"auto" as const}}>
                      {data.map((v:number,h:number)=>(
                        <div key={h} style={{display:"flex",flexDirection:"column" as const,alignItems:"center",flex:1,minWidth:20,gap:4}}>
                          <div style={{
                            width:"100%",borderRadius:"4px 4px 0 0",
                            height:`${Math.max((v/max)*110,v>0?4:0)}px`,
                            background:h===now?GOLD:v>0?RED:"rgba(196,168,130,0.2)",
                            transition:"height .3s",
                          }}/>
                          <span style={{fontSize:9,fontWeight:700,color:h===now?GOLD:MUTED,lineHeight:1}}>{h}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
                {!adminStats && <p style={{fontSize:13,color:MUTED,fontWeight:600,marginTop:8}}>Sin datos aún</p>}
              </div>
            </div>
          )}

          {adminSection==="products" && (
            <div>
              {/* Agregar producto */}
              <div style={{...card,padding:16,marginBottom:20}}>
                <p style={{fontSize:12,fontWeight:700,color:MUTED,textTransform:"uppercase" as const,letterSpacing:"0.1em",marginBottom:14}}>Agregar producto</p>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                  <input placeholder="Nombre" value={newProd.name} onChange={e=>setNewProd(p=>({...p,name:e.target.value}))}
                    style={{padding:"12px 14px",borderRadius:10,border:`1.5px solid ${BORDER}`,fontSize:14,fontWeight:600,fontFamily:FONT,color:DARK,background:CARD,outline:"none"}}/>
                  <input placeholder="Precio" type="number" value={newProd.price} onChange={e=>setNewProd(p=>({...p,price:e.target.value}))}
                    style={{padding:"12px 14px",borderRadius:10,border:`1.5px solid ${BORDER}`,fontSize:14,fontWeight:600,fontFamily:FONT,color:DARK,background:CARD,outline:"none"}}/>
                </div>
                <select value={newProd.category} onChange={e=>setNewProd(p=>({...p,category:e.target.value}))}
                  style={{width:"100%",padding:"12px 14px",borderRadius:10,border:`1.5px solid ${BORDER}`,fontSize:14,fontWeight:600,fontFamily:FONT,color:DARK,background:CARD,outline:"none",marginBottom:10}}>
                  {CAT_ORDER.map(c=><option key={c} value={c}>{c}</option>)}
                </select>
                <textarea placeholder="Descripción (opcional) — ej: Pan artesanal, pollo a la plancha, queso gouda, lechuga y tomate"
                  value={newProd.description} onChange={e=>setNewProd(p=>({...p,description:e.target.value}))}
                  rows={2} style={{width:"100%",padding:"12px 14px",borderRadius:10,border:`1.5px solid ${BORDER}`,
                    fontSize:13,fontWeight:600,fontFamily:FONT,color:DARK,background:CARD,outline:"none",marginBottom:10,resize:"vertical" as const}}/>
                <button onClick={addProduct} disabled={!newProd.name||!newProd.price}
                  style={{...btn(RED,"#fff",!newProd.name||!newProd.price),width:"100%",height:48}}>
                  Agregar producto
                </button>
              </div>

              {/* Lista productos */}
              <div style={{...card,padding:16}}>
                <p style={{fontSize:12,fontWeight:700,color:MUTED,textTransform:"uppercase" as const,letterSpacing:"0.1em",marginBottom:14}}>Productos ({adminProducts.length})</p>
                <div style={{display:"flex",flexDirection:"column" as const,gap:6}}>
                  {CAT_ORDER.filter(c=>adminProducts.some(p=>p.category===c)).map(cat=>(
                    <div key={cat}>
                      <p style={{fontSize:11,fontWeight:700,color:MUTED,textTransform:"uppercase" as const,letterSpacing:"0.1em",padding:"8px 0 4px"}}>{cat}</p>
                      {adminProducts.filter(p=>p.category===cat).map(p=>(
                        <div key={p.id} style={{marginBottom:6}}>
                          <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",background:CREAM,
                            borderRadius:editProd?.id===p.id?"10px 10px 0 0":"10px",
                            opacity:(p as Product & {is_active?:boolean}).is_active===false?0.5:1}}>
                            <span style={{flex:1,fontSize:14,fontWeight:700,color:DARK}}>{p.name}</span>
                            <span style={{fontSize:14,fontWeight:900,color:RED,minWidth:50,textAlign:"right" as const}}>{$(p.price)}</span>
                            <button onClick={()=>setEditProd(editProd?.id===p.id?null:{id:p.id,name:p.name,category:p.category,price:String(p.price),description:p.description||""})}
                              style={{padding:"6px 10px",borderRadius:8,fontSize:12,fontWeight:700,fontFamily:FONT,border:`1px solid ${BORDER}`,cursor:"pointer",
                                background:editProd?.id===p.id?GOLD:CREAM2,color:editProd?.id===p.id?"#fff":DARK}}>
                              {editProd?.id===p.id?"Cerrar":"Editar"}
                            </button>
                            <button onClick={()=>toggleProduct(p.id,(p as Product & {is_active?:boolean}).is_active!==false)}
                              style={{padding:"6px 10px",borderRadius:8,fontSize:12,fontWeight:700,fontFamily:FONT,border:`1px solid ${BORDER}`,cursor:"pointer",
                                background:(p as Product & {is_active?:boolean}).is_active===false?CREAM2:GREEN,color:(p as Product & {is_active?:boolean}).is_active===false?DARK:"#fff"}}>
                              {(p as Product & {is_active?:boolean}).is_active===false?"Activar":"Activo"}
                            </button>
                            <button onClick={()=>deleteProduct(p.id)}
                              style={{padding:"6px 10px",borderRadius:8,fontSize:12,fontWeight:700,fontFamily:FONT,border:"none",cursor:"pointer",background:"rgba(122,30,58,0.1)",color:RED}}>
                              Eliminar
                            </button>
                          </div>
                          {editProd?.id===p.id && (
                            <div style={{background:CARD,border:`1.5px solid ${BORDER}`,borderTop:"none",borderRadius:"0 0 10px 10px",padding:"12px 12px 14px"}}>
                              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                                <input placeholder="Nombre" value={editProd.name} onChange={e=>setEditProd(ep=>ep?{...ep,name:e.target.value}:ep)}
                                  style={{padding:"9px 12px",borderRadius:8,border:`1.5px solid ${BORDER}`,fontSize:13,fontWeight:600,fontFamily:FONT,color:DARK,background:"#fff",outline:"none"}}/>
                                <input placeholder="Precio" type="number" value={editProd.price} onChange={e=>setEditProd(ep=>ep?{...ep,price:e.target.value}:ep)}
                                  style={{padding:"9px 12px",borderRadius:8,border:`1.5px solid ${BORDER}`,fontSize:13,fontWeight:600,fontFamily:FONT,color:DARK,background:"#fff",outline:"none"}}/>
                              </div>
                              <select value={editProd.category} onChange={e=>setEditProd(ep=>ep?{...ep,category:e.target.value}:ep)}
                                style={{width:"100%",padding:"9px 12px",borderRadius:8,border:`1.5px solid ${BORDER}`,fontSize:13,fontWeight:600,fontFamily:FONT,color:DARK,background:"#fff",outline:"none",marginBottom:8}}>
                                {CAT_ORDER.map(c=><option key={c} value={c}>{c}</option>)}
                              </select>
                              <textarea placeholder="Descripción (opcional)" value={editProd.description} onChange={e=>setEditProd(ep=>ep?{...ep,description:e.target.value}:ep)}
                                rows={2} style={{width:"100%",padding:"9px 12px",borderRadius:8,border:`1.5px solid ${BORDER}`,fontSize:13,fontWeight:600,fontFamily:FONT,color:DARK,background:"#fff",outline:"none",resize:"vertical" as const,marginBottom:10}}/>
                              <button onClick={saveEditProd} disabled={!editProd.name||!editProd.price}
                                style={{...btn(RED,"#fff",!editProd.name||!editProd.price),width:"100%",height:42,fontSize:13}}>
                                Guardar cambios
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {adminSection==="inventory" && (() => {
            const stockColor = (i:Ingredient) => i.stock_current < i.stock_min ? "#C62828" : i.stock_current < i.stock_min*2 ? "#D4A000" : "#2E7D32";
            const stockLabel = (i:Ingredient) => i.stock_current < i.stock_min ? "Reponer ya" : i.stock_current < i.stock_min*2 ? "Stock bajo" : "OK";
            const prodRecipes = recipes.filter(r=>r.product_id===recipeProductId);
            return (
              <div>
                {/* Tabs */}
                <div style={{display:"flex",gap:8,marginBottom:16}}>
                  <button onClick={()=>setInvTab("stock")} style={{...btn(invTab==="stock"?RED:CREAM2,invTab==="stock"?"#fff":DARK),height:38,padding:"0 20px",fontSize:13}}>Stock</button>
                  <button onClick={()=>setInvTab("recetas")} style={{...btn(invTab==="recetas"?RED:CREAM2,invTab==="recetas"?"#fff":DARK),height:38,padding:"0 20px",fontSize:13}}>Recetas</button>
                  <button onClick={loadInventory} style={{...btn(CREAM2,DARK),height:38,padding:"0 14px",fontSize:13}}>↻</button>
                </div>

                {invTab==="stock" && (() => {
                  const critical = ingredients.filter(i=>i.stock_current < i.stock_min);
                  const low = ingredients.filter(i=>i.stock_current >= i.stock_min && i.stock_current < i.stock_min*2);
                  const ok = ingredients.filter(i=>i.stock_current >= i.stock_min*2);
                  const sorted = [...critical, ...low, ...ok];

                  const sendWhatsApp = (mode:"critical"|"critical+low"|"all") => {
                    const date = new Date().toLocaleDateString("es-EC",{day:"2-digit",month:"2-digit",year:"numeric"});
                    let text = `🛒 *Lista de compras — Cabane Sandwiches*\n📅 ${date}\n\n`;
                    const toSend = mode==="critical" ? critical : mode==="critical+low" ? [...critical,...low] : sorted.filter(i=>i.stock_current < i.stock_min*2);
                    if (critical.length && (mode==="critical"||mode==="critical+low"||mode==="all")) {
                      const list = (mode==="critical"?critical:critical).filter(i=>toSend.includes(i));
                      if (list.length) { text += `🔴 *URGENTE — Reponer ya:*\n`; list.forEach(i=>{text+=`• ${i.name}: ${i.stock_current} ${i.unit} (mín ${i.stock_min})\n`;}); text+="\n"; }
                    }
                    if (low.length && mode!=="critical") {
                      const list = low.filter(i=>toSend.includes(i));
                      if (list.length) { text += `🟡 *Stock bajo:*\n`; list.forEach(i=>{text+=`• ${i.name}: ${i.stock_current} ${i.unit} (mín ${i.stock_min})\n`;}); text+="\n"; }
                    }
                    if (mode==="all" && ok.length) { text += `✅ *OK:*\n`; ok.forEach(i=>{text+=`• ${i.name}: ${i.stock_current} ${i.unit}\n`;}); text+="\n"; }
                    text += `_Enviado desde el sistema de Cabane_`;
                    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`,"_blank");
                  };

                  return (
                    <div>
                      {/* Tarjetas resumen */}
                      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:16}}>
                        {[
                          {label:"Reponer ya",count:critical.length,bg:"#C62828",fg:"#fff"},
                          {label:"Stock bajo",count:low.length,bg:"#D4A000",fg:"#fff"},
                          {label:"OK",count:ok.length,bg:"#2E7D32",fg:"#fff"},
                        ].map(({label,count,bg,fg})=>(
                          <div key={label} style={{background:bg,borderRadius:14,padding:"14px 16px",textAlign:"center" as const}}>
                            <p style={{fontSize:28,fontWeight:900,color:fg,lineHeight:1}}>{count}</p>
                            <p style={{fontSize:11,fontWeight:700,color:fg,opacity:0.8,textTransform:"uppercase" as const,letterSpacing:"0.08em",marginTop:4}}>{label}</p>
                          </div>
                        ))}
                      </div>

                      {/* Banner alerta crítica */}
                      {critical.length>0 && (
                        <div style={{background:"#FFEBEE",border:"1.5px solid #C62828",borderRadius:12,padding:"12px 16px",marginBottom:16,display:"flex",alignItems:"center",gap:10}}>
                          <span style={{fontSize:18}}>⚠️</span>
                          <span style={{fontSize:13,fontWeight:700,color:"#C62828",flex:1}}>
                            {critical.length} ingrediente{critical.length>1?"s":""} agotado{critical.length>1?"s":""}: {critical.map(i=>i.name).join(", ")}
                          </span>
                        </div>
                      )}

                      {/* Enviar por WhatsApp */}
                      {(critical.length>0||low.length>0) && (
                        <div style={{...card,padding:14,marginBottom:16}}>
                          <p style={{fontSize:12,fontWeight:700,color:MUTED,textTransform:"uppercase" as const,letterSpacing:"0.1em",marginBottom:10}}>Enviar lista por WhatsApp</p>
                          <div style={{display:"flex",gap:8,flexWrap:"wrap" as const}}>
                            {critical.length>0 && (
                              <button onClick={()=>sendWhatsApp("critical")}
                                style={{display:"flex",alignItems:"center",gap:6,padding:"8px 14px",borderRadius:10,border:"none",cursor:"pointer",background:"#C62828",color:"#fff",fontSize:13,fontWeight:700,fontFamily:FONT}}>
                                📲 Solo urgentes ({critical.length})
                              </button>
                            )}
                            {(critical.length>0||low.length>0) && (
                              <button onClick={()=>sendWhatsApp("critical+low")}
                                style={{display:"flex",alignItems:"center",gap:6,padding:"8px 14px",borderRadius:10,border:"none",cursor:"pointer",background:"#D4A000",color:"#fff",fontSize:13,fontWeight:700,fontFamily:FONT}}>
                                📲 Urgentes + bajos ({critical.length+low.length})
                              </button>
                            )}
                            <button onClick={()=>sendWhatsApp("all")}
                              style={{display:"flex",alignItems:"center",gap:6,padding:"8px 14px",borderRadius:10,border:`1.5px solid ${BORDER}`,cursor:"pointer",background:CARD,color:DARK,fontSize:13,fontWeight:700,fontFamily:FONT}}>
                              📲 Lista completa
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Lista ingredientes */}
                      <div style={{...card,padding:16,marginBottom:20}}>
                        <p style={{fontSize:12,fontWeight:700,color:MUTED,textTransform:"uppercase" as const,letterSpacing:"0.1em",marginBottom:14}}>
                          Ingredientes ({ingredients.length}) — ordenados por urgencia
                        </p>
                        {ingredients.length===0 && <p style={{fontSize:13,color:MUTED,fontWeight:600}}>Sin ingredientes — agrega el primero abajo</p>}
                        <div style={{display:"flex",flexDirection:"column" as const,gap:8}}>
                          {sorted.map(ingr=>{
                            const pct = Math.min(100, (ingr.stock_current / (ingr.stock_min*2))*100);
                            const isRestock = restockId===ingr.id;
                            const isEdit = editIngr?.id===ingr.id;
                            const open = isRestock||isEdit;
                            return (
                              <div key={ingr.id} style={{border:`2px solid ${stockColor(ingr)}22`,borderRadius:open?"12px 12px 0 0":"12px",overflow:"hidden"}}>
                                {/* Fila principal */}
                                <div style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",background:"#fff",borderLeft:`4px solid ${stockColor(ingr)}`}}>
                                  <div style={{flex:1,minWidth:0}}>
                                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                                      <span style={{fontSize:14,fontWeight:800,color:DARK,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" as const}}>{ingr.name}</span>
                                      <span style={{fontSize:11,fontWeight:700,color:stockColor(ingr),background:`${stockColor(ingr)}18`,borderRadius:20,padding:"2px 8px",whiteSpace:"nowrap" as const,flexShrink:0}}>{stockLabel(ingr)}</span>
                                    </div>
                                    {/* Barra de progreso */}
                                    <div style={{height:6,background:CREAM,borderRadius:4,overflow:"hidden",marginBottom:4}}>
                                      <div style={{height:"100%",width:`${pct}%`,background:stockColor(ingr),borderRadius:4,transition:"width 0.3s"}}/>
                                    </div>
                                    <span style={{fontSize:12,fontWeight:600,color:MUTED}}>{ingr.stock_current} {ingr.unit} · mín {ingr.stock_min}</span>
                                  </div>
                                  <div style={{display:"flex",gap:6,flexShrink:0}}>
                                    <button onClick={()=>{setRestockId(isRestock?null:ingr.id);setRestockAmt("");setEditIngr(null);}}
                                      style={{padding:"6px 12px",borderRadius:8,fontSize:12,fontWeight:700,fontFamily:FONT,border:`1px solid ${BORDER}`,cursor:"pointer",background:isRestock?GREEN:CREAM2,color:isRestock?"#fff":DARK}}>
                                      {isRestock?"✕":"+ Stock"}
                                    </button>
                                    <button onClick={()=>{setEditIngr(isEdit?null:{id:ingr.id,name:ingr.name,unit:ingr.unit,stock_min:String(ingr.stock_min)});setRestockId(null);setRestockAmt("");}}
                                      style={{padding:"6px 12px",borderRadius:8,fontSize:12,fontWeight:700,fontFamily:FONT,border:`1px solid ${BORDER}`,cursor:"pointer",background:isEdit?GOLD:CREAM2,color:isEdit?"#fff":DARK}}>
                                      {isEdit?"✕":"Editar"}
                                    </button>
                                    <button onClick={()=>deleteIngredient(ingr.id)}
                                      style={{padding:"6px 10px",borderRadius:8,fontSize:12,fontWeight:700,fontFamily:FONT,border:"none",cursor:"pointer",background:"rgba(122,30,58,0.1)",color:RED}}>
                                      ✕
                                    </button>
                                  </div>
                                </div>
                                {/* Panel restock */}
                                {isRestock && (
                                  <div style={{background:CARD,borderTop:`1.5px solid ${BORDER}`,padding:"10px 14px",display:"flex",gap:8,alignItems:"center"}}>
                                    <span style={{fontSize:13,fontWeight:700,color:GREEN}}>+ Agregar stock:</span>
                                    <input type="number" placeholder="Cantidad" value={restockAmt} onChange={e=>setRestockAmt(e.target.value)}
                                      style={{flex:1,padding:"8px 12px",borderRadius:8,border:`1.5px solid ${BORDER}`,fontSize:13,fontWeight:600,fontFamily:FONT,color:DARK,background:"#fff",outline:"none"}}/>
                                    <span style={{fontSize:13,fontWeight:600,color:MUTED}}>{ingr.unit}</span>
                                    <button onClick={doRestock} disabled={!restockAmt}
                                      style={{...btn(GREEN,"#fff",!restockAmt),padding:"0 16px",height:38,fontSize:13}}>Guardar</button>
                                  </div>
                                )}
                                {/* Panel editar */}
                                {isEdit && editIngr && (
                                  <div style={{background:CARD,borderTop:`1.5px solid ${BORDER}`,padding:"12px 14px"}}>
                                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:10}}>
                                      <input placeholder="Nombre" value={editIngr.name} onChange={e=>setEditIngr(ei=>ei?{...ei,name:e.target.value}:ei)}
                                        style={{padding:"8px 12px",borderRadius:8,border:`1.5px solid ${BORDER}`,fontSize:13,fontWeight:600,fontFamily:FONT,color:DARK,background:"#fff",outline:"none"}}/>
                                      <input placeholder="Unidad" value={editIngr.unit} onChange={e=>setEditIngr(ei=>ei?{...ei,unit:e.target.value}:ei)}
                                        style={{padding:"8px 12px",borderRadius:8,border:`1.5px solid ${BORDER}`,fontSize:13,fontWeight:600,fontFamily:FONT,color:DARK,background:"#fff",outline:"none"}}/>
                                      <input type="number" placeholder="Mínimo" value={editIngr.stock_min} onChange={e=>setEditIngr(ei=>ei?{...ei,stock_min:e.target.value}:ei)}
                                        style={{padding:"8px 12px",borderRadius:8,border:`1.5px solid ${BORDER}`,fontSize:13,fontWeight:600,fontFamily:FONT,color:DARK,background:"#fff",outline:"none"}}/>
                                    </div>
                                    <button onClick={saveEditIngr} style={{...btn(GOLD,"#fff"),width:"100%",height:40,fontSize:13}}>Guardar cambios</button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Agregar ingrediente */}
                      <div style={{...card,padding:16}}>
                        <p style={{fontSize:12,fontWeight:700,color:MUTED,textTransform:"uppercase" as const,letterSpacing:"0.1em",marginBottom:14}}>Agregar ingrediente</p>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                          <input placeholder="Nombre" value={newIngr.name} onChange={e=>setNewIngr(n=>({...n,name:e.target.value}))}
                            style={{padding:"10px 12px",borderRadius:8,border:`1.5px solid ${BORDER}`,fontSize:13,fontWeight:600,fontFamily:FONT,color:DARK,background:CARD,outline:"none"}}/>
                          <input placeholder="Unidad (porciones, litros, kg…)" value={newIngr.unit} onChange={e=>setNewIngr(n=>({...n,unit:e.target.value}))}
                            style={{padding:"10px 12px",borderRadius:8,border:`1.5px solid ${BORDER}`,fontSize:13,fontWeight:600,fontFamily:FONT,color:DARK,background:CARD,outline:"none"}}/>
                          <input type="number" placeholder="Stock inicial" value={newIngr.stock_current} onChange={e=>setNewIngr(n=>({...n,stock_current:e.target.value}))}
                            style={{padding:"10px 12px",borderRadius:8,border:`1.5px solid ${BORDER}`,fontSize:13,fontWeight:600,fontFamily:FONT,color:DARK,background:CARD,outline:"none"}}/>
                          <input type="number" placeholder="Mínimo para alertar" value={newIngr.stock_min} onChange={e=>setNewIngr(n=>({...n,stock_min:e.target.value}))}
                            style={{padding:"10px 12px",borderRadius:8,border:`1.5px solid ${BORDER}`,fontSize:13,fontWeight:600,fontFamily:FONT,color:DARK,background:CARD,outline:"none"}}/>
                        </div>
                        <button onClick={addIngredient} disabled={!newIngr.name||!newIngr.stock_current}
                          style={{...btn(RED,"#fff",!newIngr.name||!newIngr.stock_current),width:"100%",height:44,fontSize:13}}>
                          Agregar ingrediente
                        </button>
                      </div>
                    </div>
                  );
                })()}

                {invTab==="recetas" && (
                  <div>
                    {/* Selector de producto */}
                    <div style={{...card,padding:16,marginBottom:16}}>
                      <p style={{fontSize:12,fontWeight:700,color:MUTED,textTransform:"uppercase" as const,letterSpacing:"0.1em",marginBottom:10}}>Seleccionar producto</p>
                      <select value={recipeProductId} onChange={e=>setRecipeProductId(e.target.value)}
                        style={{width:"100%",padding:"12px 14px",borderRadius:10,border:`1.5px solid ${BORDER}`,fontSize:14,fontWeight:600,fontFamily:FONT,color:DARK,background:CARD,outline:"none"}}>
                        <option value="">— Elegir producto —</option>
                        {CAT_ORDER.map(cat=>{
                          const prods = adminProducts.filter(p=>p.category===cat);
                          if (!prods.length) return null;
                          return <optgroup key={cat} label={cat}>{prods.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>;
                        })}
                      </select>
                    </div>

                    {recipeProductId && (
                      <div>
                        {/* Receta actual */}
                        <div style={{...card,padding:16,marginBottom:16}}>
                          <p style={{fontSize:12,fontWeight:700,color:MUTED,textTransform:"uppercase" as const,letterSpacing:"0.1em",marginBottom:14}}>
                            Ingredientes de: <span style={{color:RED}}>{adminProducts.find(p=>p.id===recipeProductId)?.name}</span>
                          </p>
                          {prodRecipes.length===0 && <p style={{fontSize:13,color:MUTED,fontWeight:600}}>Sin ingredientes definidos — agrega abajo</p>}
                          <div style={{display:"flex",flexDirection:"column" as const,gap:6}}>
                            {prodRecipes.map(r=>{
                              const ingr = ingredients.find(i=>i.id===r.ingredient_id);
                              return (
                                <div key={r.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",background:CREAM,borderRadius:10}}>
                                  <span style={{flex:1,fontSize:14,fontWeight:700,color:DARK}}>{ingr?.name||"?"}</span>
                                  <span style={{fontSize:14,fontWeight:900,color:RED}}>{r.quantity} {ingr?.unit}</span>
                                  <button onClick={()=>deleteRecipeLine(r.id)}
                                    style={{padding:"5px 10px",borderRadius:8,fontSize:12,fontWeight:700,fontFamily:FONT,border:"none",cursor:"pointer",background:"rgba(122,30,58,0.1)",color:RED}}>
                                    Quitar
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Agregar línea de receta */}
                        <div style={{...card,padding:16}}>
                          <p style={{fontSize:12,fontWeight:700,color:MUTED,textTransform:"uppercase" as const,letterSpacing:"0.1em",marginBottom:10}}>Agregar ingrediente a la receta</p>
                          <div style={{display:"flex",gap:8,marginBottom:10}}>
                            <select value={newRecipeLine.ingredient_id} onChange={e=>setNewRecipeLine(r=>({...r,ingredient_id:e.target.value}))}
                              style={{flex:2,padding:"10px 12px",borderRadius:8,border:`1.5px solid ${BORDER}`,fontSize:13,fontWeight:600,fontFamily:FONT,color:DARK,background:CARD,outline:"none"}}>
                              <option value="">— Ingrediente —</option>
                              {ingredients.map(i=><option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
                            </select>
                            <input type="number" placeholder="Cantidad" value={newRecipeLine.quantity} onChange={e=>setNewRecipeLine(r=>({...r,quantity:e.target.value}))}
                              style={{flex:1,padding:"10px 12px",borderRadius:8,border:`1.5px solid ${BORDER}`,fontSize:13,fontWeight:600,fontFamily:FONT,color:DARK,background:CARD,outline:"none"}}/>
                          </div>
                          <button onClick={addRecipeLine} disabled={!newRecipeLine.ingredient_id||!newRecipeLine.quantity}
                            style={{...btn(RED,"#fff",!newRecipeLine.ingredient_id||!newRecipeLine.quantity),width:"100%",height:44,fontSize:13}}>
                            Agregar a la receta
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {adminSection==="users" && (() => {
            const roleLabels: Record<Role,string> = { waiter:"Mesero", kitchen:"Cocina", cashier:"Caja", admin:"Admin" };
            const roleBg: Record<Role,string> = { waiter:DARK, kitchen:GOLD, cashier:GREEN, admin:RED };
            const roleFg: Record<Role,string> = { waiter:"#fff", kitchen:DARK, cashier:"#fff", admin:"#fff" };
            return (
              <div>
                {/* Crear usuario */}
                <div style={{...card,padding:20,marginBottom:20}}>
                  <p style={{fontSize:12,fontWeight:700,color:MUTED,textTransform:"uppercase" as const,letterSpacing:"0.1em",marginBottom:14}}>Agregar nuevo usuario</p>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                    <input placeholder="Nombre completo" value={newUser.name} onChange={e=>setNewUser(u=>({...u,name:e.target.value}))}
                      style={{padding:"12px 14px",borderRadius:10,border:`1.5px solid ${BORDER}`,fontSize:14,fontWeight:600,fontFamily:FONT,color:DARK,background:"#fff",outline:"none"}}/>
                    <input placeholder="Email" type="email" value={newUser.email} onChange={e=>setNewUser(u=>({...u,email:e.target.value}))}
                      style={{padding:"12px 14px",borderRadius:10,border:`1.5px solid ${BORDER}`,fontSize:14,fontWeight:600,fontFamily:FONT,color:DARK,background:"#fff",outline:"none"}}/>
                    <input placeholder="Contraseña inicial" type="password" value={newUser.password} onChange={e=>setNewUser(u=>({...u,password:e.target.value}))}
                      style={{padding:"12px 14px",borderRadius:10,border:`1.5px solid ${BORDER}`,fontSize:14,fontWeight:600,fontFamily:FONT,color:DARK,background:"#fff",outline:"none"}}/>
                    <select value={newUser.role} onChange={e=>setNewUser(u=>({...u,role:e.target.value as Role}))}
                      style={{padding:"12px 14px",borderRadius:10,border:`1.5px solid ${BORDER}`,fontSize:14,fontWeight:600,fontFamily:FONT,color:DARK,background:"#fff",outline:"none"}}>
                      {(["waiter","kitchen","cashier","admin"] as Role[]).map(r=><option key={r} value={r}>{roleLabels[r]}</option>)}
                    </select>
                  </div>
                  <button onClick={createUser} disabled={!newUser.name||!newUser.email||!newUser.password}
                    style={{...btn(RED,"#fff",!newUser.name||!newUser.email||!newUser.password),width:"100%",height:48}}>
                    Crear usuario
                  </button>
                  {userMsg && (
                    <div style={{marginTop:10,padding:"10px 14px",borderRadius:10,background:userMsg.startsWith("Error")?`rgba(122,30,58,0.12)`:`rgba(46,125,50,0.12)`,
                      border:`1px solid ${userMsg.startsWith("Error")?"rgba(122,30,58,0.3)":"rgba(46,125,50,0.3)"}`,
                      fontSize:13,fontWeight:600,color:userMsg.startsWith("Error")?RED:GREEN}}>
                      {userMsg}
                    </div>
                  )}
                </div>

                {/* Lista de usuarios */}
                <div style={{...card,padding:20}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                    <p style={{fontSize:12,fontWeight:700,color:MUTED,textTransform:"uppercase" as const,letterSpacing:"0.1em"}}>Equipo activo ({adminUsers.length})</p>
                    <button onClick={loadUsers} style={{...btn(CREAM2,DARK),height:34,padding:"0 14px",fontSize:12}}>{usersLoading?"…":"↻"}</button>
                  </div>
                  {adminUsers.length===0 && !usersLoading && (
                    <p style={{fontSize:13,color:MUTED,fontWeight:600,padding:"8px 0"}}>No hay usuarios aún</p>
                  )}
                  {adminUsers.map(u=>(
                    <div key={u.id} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 0",borderBottom:`1px solid ${BORDER}`}}>
                      <div style={{width:40,height:40,borderRadius:"50%",background:roleBg[u.role],display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                        <span style={{fontSize:15,fontWeight:900,color:roleFg[u.role]}}>{u.name.charAt(0).toUpperCase()}</span>
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <p style={{fontSize:14,fontWeight:700,color:DARK,marginBottom:2}}>{u.name}</p>
                        <p style={{fontSize:12,color:MUTED,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" as const}}>{u.email||"—"}</p>
                      </div>
                      {editRole?.id===u.id ? (
                        <div style={{display:"flex",gap:6,alignItems:"center"}}>
                          <select value={editRole.role} onChange={e=>setEditRole({id:u.id,role:e.target.value as Role})}
                            style={{padding:"6px 10px",borderRadius:8,border:`1.5px solid ${BORDER}`,fontSize:13,fontWeight:600,fontFamily:FONT,color:DARK,background:"#fff",outline:"none"}}>
                            {(["waiter","kitchen","cashier","admin"] as Role[]).map(r=><option key={r} value={r}>{roleLabels[r]}</option>)}
                          </select>
                          <button onClick={()=>updateUserRole(u.id,editRole.role)}
                            style={{...btn(GREEN,"#fff"),height:34,padding:"0 12px",fontSize:13,minHeight:34}}>OK</button>
                          <button onClick={()=>setEditRole(null)}
                            style={{...btn(CREAM2,DARK),height:34,padding:"0 12px",fontSize:13,minHeight:34}}>×</button>
                        </div>
                      ) : (
                        <div style={{display:"flex",gap:6,alignItems:"center"}}>
                          <span style={{background:roleBg[u.role],color:roleFg[u.role],padding:"4px 10px",borderRadius:999,fontSize:11,fontWeight:700,letterSpacing:"0.05em"}}>{roleLabels[u.role]}</span>
                          {u.id!==profile?.id && (
                            <>
                              <button onClick={()=>setEditRole({id:u.id,role:u.role})}
                                style={{...btn(CREAM2,DARK),height:32,padding:"0 10px",fontSize:12,minHeight:32}}>Rol</button>
                              <button onClick={()=>removeUserProfile(u.id)}
                                style={{...btn("rgba(122,30,58,0.1)",RED),height:32,padding:"0 10px",fontSize:12,minHeight:32}}>Quitar</button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {adminSection==="notes" && (
            <div>
              {/* Agregar nota */}
              <div style={{...card,padding:16,marginBottom:20}}>
                <p style={{fontSize:12,fontWeight:700,color:MUTED,textTransform:"uppercase" as const,letterSpacing:"0.1em",marginBottom:14}}>Agregar nota / extra</p>
                <select value={newNote.category} onChange={e=>setNewNote(n=>({...n,category:e.target.value}))}
                  style={{width:"100%",padding:"12px 14px",borderRadius:10,border:`1.5px solid ${BORDER}`,fontSize:14,fontWeight:600,fontFamily:FONT,color:DARK,background:CARD,outline:"none",marginBottom:10}}>
                  {CAT_ORDER.map(c=><option key={c} value={c}>{c}</option>)}
                </select>
                <div style={{display:"flex",gap:8}}>
                  <input placeholder="Ej: Sin picante, Extra queso..." value={newNote.note}
                    onChange={e=>setNewNote(n=>({...n,note:e.target.value}))}
                    onKeyDown={e=>e.key==="Enter"&&addNote()}
                    style={{flex:1,padding:"12px 14px",borderRadius:10,border:`1.5px solid ${BORDER}`,fontSize:14,fontWeight:600,fontFamily:FONT,color:DARK,background:CARD,outline:"none"}}/>
                  <button onClick={addNote} disabled={!newNote.note.trim()}
                    style={{...btn(RED,"#fff",!newNote.note.trim()),padding:"0 20px",height:48,whiteSpace:"nowrap" as const}}>
                    Agregar
                  </button>
                </div>
              </div>

              {/* Lista por categoría */}
              <div style={{...card,padding:16}}>
                <p style={{fontSize:12,fontWeight:700,color:MUTED,textTransform:"uppercase" as const,letterSpacing:"0.1em",marginBottom:14}}>Notas por categoría</p>
                {CAT_ORDER.map(cat=>{
                  const notes = notesBycat[cat]||[];
                  return (
                    <div key={cat} style={{marginBottom:16}}>
                      <p style={{fontSize:11,fontWeight:700,color:MUTED,textTransform:"uppercase" as const,letterSpacing:"0.1em",marginBottom:8}}>
                        {cat} <span style={{fontWeight:600,opacity:0.6}}>({notes.length})</span>
                      </p>
                      {notes.length===0 ? (
                        <p style={{fontSize:13,color:MUTED,fontWeight:600,padding:"8px 0"}}>Sin notas — agrega la primera arriba</p>
                      ) : (
                        <div style={{display:"flex",flexWrap:"wrap" as const,gap:8}}>
                          {notes.map(({id,note})=>(
                            <div key={id} style={{display:"flex",alignItems:"center",gap:6,background:CREAM,borderRadius:20,padding:"6px 10px 6px 14px",border:`1px solid ${BORDER}`}}>
                              <span style={{fontSize:13,fontWeight:700,color:DARK}}>{note}</span>
                              <button onClick={()=>deleteNote(id)}
                                style={{width:22,height:22,borderRadius:"50%",background:"rgba(122,30,58,0.12)",border:"none",cursor:"pointer",
                                  fontWeight:900,fontSize:13,color:RED,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:FONT,flexShrink:0}}>
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── MODAL CONFIRMAR ────────────────────────────────────── */}
      {splitModal && (
        <div onClick={e=>{if(e.target===e.currentTarget)setSplitModal(null)}}
          style={{position:"fixed" as const,inset:0,background:"rgba(23,18,15,0.65)",backdropFilter:"blur(6px)",zIndex:200,display:"flex",alignItems:"flex-end",justifyContent:"center",padding:12}}>
          <div style={{...card,padding:20,width:"100%",maxWidth:460,maxHeight:"90vh",overflowY:"auto" as const,animation:"fadeUp .25s ease both"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
              <div>
                <p style={{fontSize:12,fontWeight:700,color:MUTED,textTransform:"uppercase" as const,letterSpacing:"0.08em",marginBottom:4}}>Pago dividido</p>
                <p style={{fontSize:22,fontWeight:900,color:DARK}}>{splitModal.table_label}</p>
                <p style={{fontSize:14,fontWeight:700,color:RED,marginTop:4}}>Total: {$(splitModal.total)}</p>
              </div>
              <button onClick={()=>setSplitModal(null)}
                style={{background:CREAM2,border:"none",borderRadius:10,width:36,height:36,fontWeight:900,fontSize:18,cursor:"pointer",color:DARK,fontFamily:FONT}}>×</button>
            </div>

            <p style={{fontSize:13,fontWeight:600,color:MUTED,marginBottom:12}}>Ingresa cuánto paga con cada método. La suma debe ser igual al total.</p>

            {(["efectivo","tarjeta","transferencia"] as const).map(m=>{
              const labels={efectivo:"Efectivo",tarjeta:"Tarjeta",transferencia:"Transferencia"};
              const bgs={efectivo:DARK,tarjeta:RED,transferencia:GOLD};
              const fgs={efectivo:"#fff",tarjeta:"#fff",transferencia:DARK};
              return (
                <div key={m} style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                  <div style={{background:bgs[m],borderRadius:8,padding:"6px 12px",minWidth:110}}>
                    <span style={{fontSize:13,fontWeight:700,color:fgs[m]}}>{labels[m]}</span>
                  </div>
                  <input type="number" min="0" step="0.01" placeholder="0.00"
                    value={splitAmounts[m]}
                    onChange={e=>setSplitAmounts(p=>({...p,[m]:e.target.value}))}
                    style={{flex:1,height:44,borderRadius:10,border:`1px solid ${BORDER}`,padding:"0 12px",fontSize:16,fontWeight:700,fontFamily:FONT,color:DARK,background:"#fff"}}/>
                </div>
              );
            })}

            {(()=>{
              const sum=["efectivo","tarjeta","transferencia"].reduce((s,m)=>s+(parseFloat(splitAmounts[m as keyof typeof splitAmounts])||0),0);
              const diff=Math.round((splitModal.total-sum)*100)/100;
              const ok=Math.abs(diff)<0.01;
              return (
                <>
                  <div style={{display:"flex",justifyContent:"space-between",background:ok?GREEN:CREAM2,borderRadius:10,padding:"10px 14px",marginTop:6,marginBottom:14}}>
                    <span style={{fontSize:13,fontWeight:700,color:ok?"#fff":MUTED}}>
                      {ok?"Suma correcta":diff>0?`Faltan ${$(diff)}`:`Excede ${$(-diff)}`}
                    </span>
                    <span style={{fontSize:15,fontWeight:900,color:ok?"#fff":DARK}}>{$(sum)} / {$(splitModal.total)}</span>
                  </div>
                  <button disabled={!ok||paying===splitModal.id}
                    onClick={()=>{
                      const parts=(["efectivo","tarjeta","transferencia"] as const)
                        .map(m=>({method:m,amount:parseFloat(splitAmounts[m])||0}))
                        .filter(p=>p.amount>0);
                      cobrarSplit(splitModal,parts);
                    }}
                    style={{...btn(RED,"#fff",!ok||paying===splitModal.id),width:"100%",height:54,fontSize:16}}>
                    {paying===splitModal.id?"Guardando…":"Confirmar pago dividido"}
                  </button>
                </>
              );
            })()}
          </div>
        </div>
      )}

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
              {cartItems.map(i=>{
                const allNotes = [...i.notes, i.customNote].filter(Boolean).join(", ");
                return (
                  <div key={i.id} style={{background:CREAM,borderRadius:10,padding:"10px 14px"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <span style={{background:RED,color:"#fff",width:22,height:22,borderRadius:"50%",fontSize:12,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center"}}>{i.qty}</span>
                        <span style={{fontSize:14,fontWeight:700,color:DARK}}>{i.name}</span>
                      </div>
                      <span style={{fontSize:14,fontWeight:900,color:RED}}>{$(i.qty*i.price)}</span>
                    </div>
                    {allNotes && <p style={{fontSize:12,fontWeight:600,color:MUTED,marginTop:4,paddingLeft:30}}>Nota: {allNotes}</p>}
                  </div>
                );
              })}
            </div>

            <div style={{background:DARK,borderRadius:12,padding:"14px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <span style={{fontSize:14,color:"rgba(255,255,255,0.5)",fontWeight:600}}>Total a cobrar</span>
              <span style={{fontSize:24,fontWeight:900,color:GOLD}}>{$(cartTotal)}</span>
            </div>

            <input type="text" placeholder="Nota de mesa (opcional) — ej: alérgico al gluten, misma cuenta…"
              value={tableNote} onChange={e=>setTableNote(e.target.value)}
              style={{width:"100%",padding:"11px 14px",borderRadius:10,border:`1.5px solid ${BORDER}`,
                fontSize:13,fontWeight:600,fontFamily:FONT,color:DARK,background:CARD,outline:"none",marginBottom:12}}/>

            <div style={{display:"grid",gridTemplateColumns:"1fr 1.6fr",gap:10}}>
              <button onClick={()=>setModal(false)} style={{...btn(CREAM2,DARK),height:52}}>Editar</button>
              <button disabled={sending} onClick={sendToKitchen} style={{...btn(RED,"#fff",sending),height:52,fontSize:16,fontWeight:800}}>
                {sending?"Enviando…":"Enviar a cocina"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
