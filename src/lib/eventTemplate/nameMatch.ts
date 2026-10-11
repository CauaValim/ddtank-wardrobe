import { nameSimilarity } from "@/lib/packageDescParser";
import { isPanelId } from "./itemLookup";
import type { EventBlock, EventItem, EventSection } from "./types";

/**
 * Importação de planilhas: o item é procurado na base do painel pelo nome quando vem sem ID
 * ou com um ID que não existe no painel (nome igual; senão, nome pelo menos 90% parecido).
 * Aqui fica a parte pura (coletar nomes, escolher o resultado e aplicar nas seções).
 */

/** Chave de comparação: sem diferença de maiúsculas, acentos e espaços. */
export const nameKey = (name: string) =>
  name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Semelhança mínima para aceitar um nome parecido quando não há um igual. */
export const FUZZY_THRESHOLD = 0.9;

/**
 * Item que precisa ser procurado pelo nome: sem ID numérico ou, quando a lista de IDs do painel
 * é conhecida, com um ID que não existe nela.
 */
const needsId = (item: EventItem, knownIds?: Set<string>) => {
  if (!item.name?.trim()) return false;
  const id = (item.id ?? "").trim();
  if (!isPanelId(id)) return true;
  return !!knownIds && !knownIds.has(id);
};

function walk(blocks: EventBlock[], fn: (item: EventItem) => EventItem): EventBlock[] {
  return blocks.map((b) => ({
    ...b,
    groups: Object.fromEntries(Object.entries(b.groups).map(([k, items]) => [k, items.map(fn)])),
    ...(b.children ? { children: walk(b.children, fn) } : {}),
  }));
}

function visitItems(sections: EventSection[], fn: (item: EventItem) => void) {
  for (const s of sections) for (const blocks of Object.values(s.sets)) walk(blocks, (item) => (fn(item), item));
}

/** IDs numéricos usados nas seções (sem repetição). */
export function numericIds(sections: EventSection[]): string[] {
  const ids = new Set<string>();
  visitItems(sections, (item) => {
    const id = (item.id ?? "").trim();
    if (isPanelId(id)) ids.add(id);
  });
  return [...ids];
}

/** Nomes (sem repetição) dos itens sem ID numérico ou, com `knownIds`, com ID que não existe no painel. */
export function namesWithoutId(sections: EventSection[], knownIds?: Set<string>): string[] {
  const names = new Map<string, string>();
  visitItems(sections, (item) => {
    if (needsId(item, knownIds)) names.set(nameKey(item.name), item.name.trim());
  });
  return [...names.values()];
}

export interface PanelItemRow {
  id: number | string;
  name: string | null;
  image_url?: string | null;
}

const score = (r: PanelItemRow) => (r.image_url ? 1 : 0) * 1e15 + Number(r.id);

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
    if (!cur || score(row) > score(cur)) best.set(key, row);
  }
  return new Map([...best].map(([k, r]) => [k, String(r.id)]));
}

/**
 * Nomes sem um igual na base: o item da base com o nome mais parecido, se tiver pelo menos
 * `threshold` de semelhança (empate: com imagem e ID mais novo).
 */
export function fuzzyMatches(names: string[], rows: PanelItemRow[], threshold = FUZZY_THRESHOLD): Map<string, string> {
  const candidates = rows.filter((r) => r.name).map((r) => ({ row: r, key: nameKey(r.name as string) }));
  const out = new Map<string, string>();
  for (const name of names) {
    const key = nameKey(name);
    let best: { row: PanelItemRow; sim: number } | null = null;
    for (const c of candidates) {
      // A distância é pelo menos a diferença de tamanho: nomes muito mais curtos ou longos nem são comparados.
      if (Math.min(key.length, c.key.length) / Math.max(key.length, c.key.length) < threshold) continue;
      const sim = nameSimilarity(key, c.key);
      if (sim < threshold) continue;
      if (!best || sim > best.sim || (sim === best.sim && score(c.row) > score(best.row))) best = { row: c.row, sim };
    }
    if (best) out.set(key, String(best.row.id));
  }
  return out;
}

/** Preenche o ID dos itens procurados pelo nome. Devolve as seções novas e quantos itens foram completados. */
export function applyNameMatches(
  sections: EventSection[],
  matches: Map<string, string>,
  knownIds?: Set<string>,
): { sections: EventSection[]; resolved: number; missing: number } {
  let resolved = 0;
  let missing = 0;
  const fill = (item: EventItem) => {
    if (!needsId(item, knownIds)) return item;
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
