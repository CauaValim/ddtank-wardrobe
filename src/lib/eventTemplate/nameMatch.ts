import { isPanelId } from "./itemLookup";
import type { EventBlock, EventItem, EventSection } from "./types";

/**
 * Planilhas sem ID: o item é procurado na base do painel pelo nome.
 * Aqui fica a parte pura (coletar nomes, escolher o resultado e aplicar nas seções).
 */

/** Chave de comparação: sem diferença de maiúsculas, acentos e espaços. */
export const nameKey = (name: string) =>
  name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

const needsId = (item: EventItem) => !isPanelId(item.id ?? "") && !!item.name?.trim();

function walk(blocks: EventBlock[], fn: (item: EventItem) => EventItem): EventBlock[] {
  return blocks.map((b) => ({
    ...b,
    groups: Object.fromEntries(Object.entries(b.groups).map(([k, items]) => [k, items.map(fn)])),
    ...(b.children ? { children: walk(b.children, fn) } : {}),
  }));
}

/** Nomes (sem repetição) dos itens que estão sem ID numérico. */
export function namesWithoutId(sections: EventSection[]): string[] {
  const names = new Map<string, string>();
  const visit = (item: EventItem) => {
    if (needsId(item)) names.set(nameKey(item.name), item.name.trim());
    return item;
  };
  for (const s of sections) for (const blocks of Object.values(s.sets)) walk(blocks, visit);
  return [...names.values()];
}

export interface PanelItemRow {
  id: number | string;
  name: string | null;
  image_url?: string | null;
}

/**
 * Melhor item da base para cada nome: um só resultado é usado direto; com nomes repetidos,
 * prefere o que tem imagem e, entre eles, o ID mais novo (maior).
 */
export function pickMatches(rows: PanelItemRow[]): Map<string, string> {
  const best = new Map<string, PanelItemRow>();
  for (const row of rows) {
    if (!row.name) continue;
    const key = nameKey(row.name);
    const cur = best.get(key);
    const score = (r: PanelItemRow) => (r.image_url ? 1 : 0) * 1e15 + Number(r.id);
    if (!cur || score(row) > score(cur)) best.set(key, row);
  }
  return new Map([...best].map(([k, r]) => [k, String(r.id)]));
}

/** Preenche o ID dos itens sem ID cujo nome foi encontrado. Devolve as seções novas e quantos itens foram completados. */
export function applyNameMatches(sections: EventSection[], matches: Map<string, string>): { sections: EventSection[]; resolved: number; missing: number } {
  let resolved = 0;
  let missing = 0;
  const fill = (item: EventItem) => {
    if (!needsId(item)) return item;
    const id = matches.get(nameKey(item.name));
    if (!id) {
      missing += 1;
      return item;
    }
    resolved += 1;
    return { ...item, id };
  };
  const out = sections.map((s) => ({ ...s, sets: Object.fromEntries(Object.entries(s.sets).map(([k, blocks]) => [k, walk(blocks, fill)])) }));
  return { sections: out, resolved, missing };
}
