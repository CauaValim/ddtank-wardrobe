import { supabase } from "@/integrations/supabase/client";
import type { EventBlock, EventSection } from "./types";

/** Resultado da consulta ao painel: `null` quando o ID não existe na tabela `items`. */
export type ItemLookup = Map<string, { name: string; imageUrl: string } | null>;
export type IdStatus = "known" | "unknown" | "checking";

const BATCH = 500;

export const isPanelId = (id: string) => /^\d+$/.test(id.trim());

/** IDs numéricos usados em todas as seções do documento (XXX e vazios ficam de fora). */
export function collectItemIds(doc: { sections: EventSection[] }): string[] {
  const ids = new Set<string>();
  const walk = (blocks: EventBlock[]) => {
    for (const b of blocks) {
      for (const items of Object.values(b.groups)) {
        for (const item of items) if (isPanelId(item.id)) ids.add(item.id.trim());
      }
      if (b.children) walk(b.children);
    }
  };
  for (const s of doc.sections) for (const blocks of Object.values(s.sets)) walk(blocks);
  return [...ids];
}

/** Consulta os IDs direto na tabela `items` do painel. */
export async function lookupItems(ids: string[]): Promise<ItemLookup> {
  const out: ItemLookup = new Map(ids.map((id) => [id, null]));
  for (let i = 0; i < ids.length; i += BATCH) {
    const { data, error } = await supabase
      .from("items")
      .select("id, name, image_url")
      .in("id", ids.slice(i, i + BATCH).map(Number));
    if (error) throw error;
    for (const row of data ?? []) out.set(String(row.id), { name: row.name ?? "", imageUrl: row.image_url ?? "" });
  }
  return out;
}

export function validationOptions(lookup: ItemLookup) {
  return {
    knownIds: new Set([...lookup].filter(([, v]) => v).map(([k]) => k)),
    hasImage: (id: string) => !!lookup.get(id)?.imageUrl,
  };
}
