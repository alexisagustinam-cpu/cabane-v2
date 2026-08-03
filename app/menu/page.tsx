// Menú público — sin login, pensado para el QR de las mesas. Usa la
// service_role key en el servidor (no expuesta al cliente) para no
// depender de una política RLS nueva que abra products/categories a
// "anon"; esto solo lee nombre/precio/descripción, nada sensible.
import { createClient } from "@supabase/supabase-js";
import type { Metadata } from "next";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Menú · Cabane Sandwiches",
  description: "Menú de Cabane Sandwiches",
};

const FONT = "'Nunito', sans-serif";
const CREAM = "#EDE0CE", GOLD = "#B5894A";

interface Category { id: string; name: string; sort: number }
interface MenuProduct { id: string; name: string; category: string; price: number; description: string | null }

async function getMenu(): Promise<{ categories: Category[]; products: MenuProduct[] }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { categories: [], products: [] };
  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const [{ data: categories }, { data: products }] = await Promise.all([
    admin.from("categories").select("id,name,sort").order("sort"),
    admin.from("products").select("id,name,category,price,description").eq("is_active", true).order("name"),
  ]);
  return { categories: (categories || []) as Category[], products: (products || []) as MenuProduct[] };
}

const $ = (n: number) => `$${n.toFixed(2)}`;

export default async function MenuPage() {
  const { categories, products } = await getMenu();
  const orderedCats = [
    ...categories.map(c => c.name),
    ...[...new Set(products.map(p => p.category))].filter(c => !categories.some(cc => cc.name === c)),
  ];

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(160deg, #1A0D12 0%, #2A1A1F 55%, #1A0D12 100%)", fontFamily: FONT, padding: "32px 16px 60px" }}>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <div style={{ textAlign: "center" as const, marginBottom: 32 }}>
          <img
            src="/logo.jpg"
            alt="Cabane Sandwiches"
            style={{ width: 96, height: 96, objectFit: "contain" as const, borderRadius: 20, margin: "0 auto 16px", display: "block", boxShadow: "0 12px 40px rgba(0,0,0,0.4)" }}
          />
          <h1 style={{ color: CREAM, fontSize: 26, fontWeight: 900, margin: 0, letterSpacing: "0.02em" }}>Cabane Sandwiches</h1>
          <p style={{ color: "rgba(232,213,183,0.5)", fontSize: 12, fontWeight: 700, letterSpacing: "0.25em", textTransform: "uppercase" as const, marginTop: 6 }}>Menú</p>
        </div>

        {orderedCats.map(cat => {
          const items = products.filter(p => p.category === cat);
          if (!items.length) return null;
          return (
            <div key={cat} style={{ marginBottom: 28 }}>
              <h2 style={{ color: GOLD, fontSize: 15, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.12em", marginBottom: 12, paddingBottom: 8, borderBottom: "1px solid rgba(181,137,74,0.25)" }}>
                {cat}
              </h2>
              <div style={{ display: "flex", flexDirection: "column" as const, gap: 14 }}>
                {items.map(p => (
                  <div key={p.id} style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ color: CREAM, fontSize: 15, fontWeight: 700, margin: 0 }}>{p.name}</p>
                      {p.description && (
                        <p style={{ color: "rgba(232,213,183,0.55)", fontSize: 12.5, fontWeight: 500, margin: "4px 0 0", lineHeight: 1.4 }}>{p.description}</p>
                      )}
                    </div>
                    <span style={{ color: GOLD, fontSize: 15, fontWeight: 900, whiteSpace: "nowrap" as const, flexShrink: 0 }}>{$(p.price)}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {!products.length && (
          <p style={{ color: "rgba(232,213,183,0.5)", textAlign: "center" as const, fontSize: 14, fontWeight: 600 }}>El menú no está disponible en este momento.</p>
        )}

        <p style={{ textAlign: "center" as const, color: "rgba(232,213,183,0.3)", fontSize: 11, fontWeight: 600, marginTop: 36 }}>Precios sujetos a cambio sin previo aviso.</p>
      </div>
    </div>
  );
}
