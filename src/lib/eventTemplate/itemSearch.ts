import { supabase } from "@/integrations/supabase/client";

export type ItemSearchResult = { id: string; name: string; imageUrl: string };

const LIMIT = 30;

// Busca direto na tabela `items` do painel, para não depender do catálogo
// carregado no navegador (que chega aos poucos e pode estar desatualizado).
export async function searchItems(term: string, limit = LIMIT): Promise<ItemSearchResult[]> {
  const pattern = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const byName = supabase.from("items").select("id, name, image_url").ilike("name", pattern).order("id").limit(limit);
  const byId = /^\d+$/.test(term)
    ? supabase.from("items").select("id, name, image_url").eq("id", Number(term)).limit(1)
    : null;
  const [names, ids] = await Promise.all([byName, byId]);
  if (names.error) throw names.error;
  if (ids?.error) throw ids.error;
  const seen = new Set<string>();
  const out: ItemSearchResult[] = [];
  for (const row of [...(ids?.data ?? []), ...(names.data ?? [])]) {
    const id = String(row.id);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name: row.name ?? `Item #${id}`, imageUrl: row.image_url ?? "" });
  }
  return out.slice(0, limit);
}

/** Item da base pelo ID exato (ou null). */
export async function itemById(id: string): Promise<ItemSearchResult | null> {
  if (!/^\d+$/.test(id)) return null;
  const { data, error } = await supabase.from("items").select("id, name, image_url").eq("id", Number(id)).maybeSingle();
  if (error || !data) return null;
  return { id: String(data.id), name: data.name ?? `Item #${data.id}`, imageUrl: data.image_url ?? "" };
}
