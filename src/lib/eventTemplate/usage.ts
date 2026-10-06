import { getLayout } from "./model";
import { isPanelId } from "./itemLookup";
import type { EventBlock, EventItem, EventSection } from "./types";

/**
 * Onde cada item já foi usado nos eventos da mesma base (servidores antigos ou novos):
 * trocas e rankings (todo o histórico) e vendas/recargas/consumos (últimos 30 dias).
 */
export type UsageKind = "exchange" | "ranking" | "sale";

export interface ItemUsage {
  kind: UsageKind;
  docId: string;
  docTitle: string;
  /** "YYYY-MM-DD" ou "" quando o evento não tem data. */
  date: string;
  /** Ex.: "Troca – Grupo A · custo 11664*8", "1º e 3º lugar", "Recarga · piso 5.000". */
  detail: string;
}

export interface UsageDoc {
  id: string;
  title: string;
  theme?: string | null;
  start_date?: string | null;
  sections: EventSection[];
}

export const RECENT_DAYS = 30;

const day = (iso: string | null | undefined) => (/^\d{4}-\d{2}-\d{2}/.exec(iso ?? "")?.[0] ?? "");

function eachItem(blocks: EventBlock[] | undefined, fn: (item: EventItem, block: EventBlock, index: number) => void) {
  (blocks ?? []).forEach((block, index) => {
    for (const items of Object.values(block.groups)) for (const item of items) fn(item, block, index);
  });
}

const SALE_LABEL: Record<string, string> = {
  ammo: "Venda de munição",
  recharge: "Recarga",
  consume: "Consumo",
  recharge_extra: "Recarga Extra",
  consume_extra: "Consumo Extra",
};

function ordinalList(positions: number[]): string {
  const list = [...new Set(positions)].sort((a, b) => a - b).map((p) => `${p}º`);
  const text = list.length > 1 ? `${list.slice(0, -1).join(", ")} e ${list[list.length - 1]}` : list[0];
  return `${text} lugar`;
}

export function buildUsageIndex(docs: UsageDoc[]): Map<string, ItemUsage[]> {
  const index = new Map<string, ItemUsage[]>();
  const add = (item: EventItem, usage: Omit<ItemUsage, "docId" | "docTitle">, doc: UsageDoc) => {
    const id = item.id?.trim();
    if (!id || !isPanelId(id)) return;
    const list = index.get(id) ?? [];
    list.push({ ...usage, docId: doc.id, docTitle: (doc.title || doc.theme || "").trim() });
    index.set(id, list);
  };
  for (const doc of docs) {
    for (const section of doc.sections ?? []) {
      const layout = getLayout(section.layoutId);
      if (!layout) continue;
      const date = day(section.fields?.start) || day(doc.start_date);
      if (layout.type === "exchange") {
        eachItem(section.sets.coins, (item) => add(item, { kind: "exchange", date, detail: "Moeda de troca" }, doc));
        for (const group of section.sets.groups ?? []) {
          const title = group.fields.title?.trim();
          eachItem(group.children, (item, child) => {
            const cost = child.fields.value?.trim();
            const parts = [title && `Grupo ${title}`, cost && `custo ${cost}`, group.fields.condition?.trim()].filter(Boolean);
            add(item, { kind: "exchange", date, detail: parts.join(" · ") }, doc);
          });
        }
      } else if (layout.type.startsWith("ranking")) {
        const positions = new Map<string, { item: EventItem; places: number[] }>();
        eachItem(section.sets.places, (item, _block, i) => {
          const id = item.id?.trim();
          if (!id) return;
          const entry = positions.get(id) ?? { item, places: [] };
          entry.places.push(i + 1);
          positions.set(id, entry);
        });
        const label = layout.type === "ranking_recharge" ? "Ranking de Recarga" : "Ranking de Consumo";
        for (const { item, places } of positions.values()) add(item, { kind: "ranking", date, detail: `${label} · ${ordinalList(places)}` }, doc);
      } else if (SALE_LABEL[layout.type]) {
        for (const blocks of Object.values(section.sets)) {
          eachItem(blocks, (item, block) => {
            const tier = block.fields.value?.trim();
            const price = item.extra?.price?.trim();
            const detail = [SALE_LABEL[layout.type], tier && `piso ${tier}`, price && `preço ${price} ${item.extra?.currency ?? ""}`.trim()].filter(Boolean).join(" · ");
            add(item, { kind: "sale", date, detail }, doc);
          });
        }
      }
    }
  }
  for (const list of index.values()) list.sort((a, b) => b.date.localeCompare(a.date));
  return index;
}

/** Resumo curto para a busca de itens: "Troca 2× · Ranking 1×". */
export function usageSummary(usage?: Record<UsageKind, ItemUsage[]>): string {
  if (!usage) return "";
  const parts: string[] = [];
  if (usage.exchange.length) parts.push(`Troca ${usage.exchange.length}×`);
  if (usage.ranking.length) parts.push(`Ranking ${usage.ranking.length}×`);
  if (usage.sale.length) parts.push(recentText(usage.sale.length));
  return parts.join(" · ");
}

/** "Entrou 1 vez nos últimos 30 dias" / "Entrou 3 vezes nos últimos 30 dias". */
export const recentText = (n: number) => `Entrou ${n} ${n === 1 ? "vez" : "vezes"} nos últimos ${RECENT_DAYS} dias`;

/** Usos a mostrar para um item: trocas e rankings sempre; vendas só dos últimos 30 dias. */
export function visibleUsage(list: ItemUsage[] | undefined, excludeDocId: string | null, today = new Date()): Record<UsageKind, ItemUsage[]> {
  const cutoff = new Date(today.getTime() - RECENT_DAYS * 86_400_000).toISOString().slice(0, 10);
  const out: Record<UsageKind, ItemUsage[]> = { exchange: [], ranking: [], sale: [] };
  for (const u of list ?? []) {
    if (u.docId === excludeDocId) continue;
    if (u.kind === "sale" && (!u.date || u.date < cutoff)) continue;
    out[u.kind].push(u);
  }
  return out;
}
