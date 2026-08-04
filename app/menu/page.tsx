// Menú público — sin login, pensado para el QR de las mesas. Usa la
// service_role key en el servidor (no expuesta al cliente) para no
// depender de una política RLS nueva que abra products/categories a
// "anon"; esto solo lee nombre/precio/descripción, nada sensible.
import { createClient } from "@supabase/supabase-js";
import type { Metadata } from "next";
import MenuClient from "./MenuClient";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Menú · Cabane Sandwiches",
  description: "Menú de Cabane Sandwiches",
};

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

export default async function MenuPage() {
  const { categories, products } = await getMenu();
  return <MenuClient categories={categories} products={products} />;
}
