import { supabase } from "@/integrations/supabase/client";
import { canonicalId, canonicalLookupIds, type CanonicalRow } from "@/lib/canonicalItem";
import { collectItemIds, isPanelId } from "./itemLookup";
import type { EventBlock, EventDocument } from "./types";

const BATCH = 500;

/** Linhas da tabela `items` necessárias para decidir o ID padrão dos IDs informados. */
export async function loadCanonicalRows(ids: string[]): Promise<Map<string, CanonicalRow>> {
  const wanted = [...new Set(ids.flatMap(canonicalLookupIds))];
  const rows = new Map<string, CanonicalRow>();
  for (let i = 0; i < wanted.length; i += BATCH) {
    const { data, error } = await supabase
      .from("items")
      .select("id, name, type, pic_path")
      .in("id", wanted.slice(i, i + BATCH).map(Number));
    if (error) throw error;
    for (const row of data ?? []) rows.set(String(row.id), row);
  }
  return rows;
}

/** Troca os IDs pelo padrão (arma na +0, bolinha de EXP em 1120218). Devolve o documento e quantos itens mudaram. */
export function applyCanonicalIds(doc: EventDocument, rows: Map<string, CanonicalRow>): { doc: EventDocument; changed: number } {
  let changed = 0;
  const walk = (blocks: EventBlock[]): EventBlock[] =>
    blocks.map((b) => ({
      ...b,
      groups: Object.fromEntries(
        Object.entries(b.groups).map(([k, items]) => [
          k,
          items.map((item) => {
            const id = item.id.trim();
            if (!isPanelId(id)) return item;
            const next = canonicalId(id, (x) => rows.get(x));
            if (next === id) return item;
            changed += 1;
            return { ...item, id: next };
          }),
        ]),
      ),
      ...(b.children ? { children: walk(b.children) } : {}),
    }));
  const sections = doc.sections.map((s) => ({ ...s, sets: Object.fromEntries(Object.entries(s.sets).map(([k, blocks]) => [k, walk(blocks)])) }));
  return { doc: { ...doc, sections }, changed };
}

export async function canonicalizeDocument(doc: EventDocument): Promise<{ doc: EventDocument; changed: number }> {
  return applyCanonicalIds(doc, await loadCanonicalRows(collectItemIds(doc)));
}
