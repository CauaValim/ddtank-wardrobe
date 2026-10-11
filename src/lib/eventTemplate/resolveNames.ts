import { supabase } from "@/integrations/supabase/client";
import { applyNameMatches, fuzzyMatches, nameKey, namesWithoutId, numericIds, pickMatches, type PanelItemRow } from "./nameMatch";
import type { EventSection } from "./types";

const BATCH = 100;
const PARALLEL = 6;
const PAGE = 1000;

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** IDs numéricos das seções que existem na tabela `items`. */
async function existingIds(ids: string[]): Promise<Set<string>> {
  const found = new Set<string>();
  for (let i = 0; i < ids.length; i += BATCH) {
    const { data, error } = await supabase.from("items").select("id").in("id", ids.slice(i, i + BATCH).map(Number));
    if (error) throw error;
    for (const row of data ?? []) found.add(String(row.id));
  }
  return found;
}

/** Todos os itens da base (id, nome, imagem), para a busca por nome parecido. */
async function allItems(): Promise<PanelItemRow[]> {
  const rows: PanelItemRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from("items").select("id, name, image_url").order("id").range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

/**
 * Completa o ID dos itens que vieram sem ID da planilha ou com um ID que não existe no painel,
 * procurando o nome na tabela `items`: nome igual (sem diferença de maiúsculas e acentos) e,
 * se não houver, o nome mais parecido com pelo menos 90% de semelhança.
 */
export async function resolveIdsByName(
  sections: EventSection[],
): Promise<{ sections: EventSection[]; resolved: number; approximate: number; missing: number }> {
  const known = await existingIds(numericIds(sections));
  const names = namesWithoutId(sections, known);
  if (names.length === 0) return { sections, resolved: 0, approximate: 0, missing: 0 };
  const rows: PanelItemRow[] = [];
  for (let i = 0; i < names.length; i += BATCH) {
    const { data, error } = await supabase.from("items").select("id, name, image_url").in("name", names.slice(i, i + BATCH));
    if (error) throw error;
    rows.push(...(data ?? []));
  }
  const found = new Set(rows.map((r) => nameKey(r.name ?? "")));
  const rest = names.filter((n) => !found.has(nameKey(n)));
  for (let i = 0; i < rest.length; i += PARALLEL) {
    const results = await Promise.all(
      rest.slice(i, i + PARALLEL).map((n) => supabase.from("items").select("id, name, image_url").ilike("name", escapeLike(n)).limit(20)),
    );
    for (const { data, error } of results) {
      if (error) throw error;
      rows.push(...(data ?? []));
    }
  }
  const matches = pickMatches(rows);
  // Sem nome igual: o mais parecido (≥ 90%).
  const unmatched = names.filter((n) => !matches.has(nameKey(n)));
  const fuzzy = unmatched.length ? fuzzyMatches(unmatched, await allItems()) : new Map<string, string>();
  for (const [k, id] of fuzzy) matches.set(k, id);
  const out = applyNameMatches(sections, matches, known);
  const approximate = applyNameMatches(sections, fuzzy, known).resolved;
  return { ...out, approximate };
}
