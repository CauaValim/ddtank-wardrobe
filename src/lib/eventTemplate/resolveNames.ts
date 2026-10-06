import { supabase } from "@/integrations/supabase/client";
import { applyNameMatches, nameKey, namesWithoutId, pickMatches, type PanelItemRow } from "./nameMatch";
import type { EventSection } from "./types";

const BATCH = 100;
const PARALLEL = 6;

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * Completa o ID dos itens que vieram sem ID da planilha, procurando o nome na tabela `items`
 * (nome igual; depois, igual sem diferença de maiúsculas).
 */
export async function resolveIdsByName(sections: EventSection[]): Promise<{ sections: EventSection[]; resolved: number; missing: number }> {
  const names = namesWithoutId(sections);
  if (names.length === 0) return { sections, resolved: 0, missing: 0 };
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
  return applyNameMatches(sections, pickMatches(rows));
}
