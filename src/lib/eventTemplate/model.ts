import manifestJson from "./manifest.json";
import requestsJson from "./requestsManifest.json";
import codesJson from "./codesManifest.json";
import { parseItemLabel } from "./format";
import { applyDailyLength, normalizeSection } from "./rules";
import type { BlockSpec, EventBlock, EventDocument, EventItem, EventSection, LayoutSpec, RequestsManifest, SetSpec, TemplateManifest } from "./types";

/** Arquivo separado das solicitações manuais (não faz parte do modelo oficial). */
export const requestsManifest = requestsJson as RequestsManifest;

/**
 * Modelo oficial (versão, arquivo, SHA-256) com os layouts dele e os das solicitações manuais.
 * As abas das solicitações vêm do arquivo separado e são juntadas ao final na exportação.
 */
export const manifest: TemplateManifest = {
  ...(manifestJson as TemplateManifest),
  layouts: [...(manifestJson as TemplateManifest).layouts, ...requestsManifest.layouts],
};

export const newId = () => Math.random().toString(36).slice(2, 10);

/** Modelo das solicitações de códigos (KickSub, Lives e Torneios): separado dos eventos, sem capa. */
export const codesManifest = codesJson as TemplateManifest;

export function getLayout(id: string): LayoutSpec | undefined {
  return manifest.layouts.find((l) => l.id === id) ?? codesManifest.layouts.find((l) => l.id === id);
}

export const LAYOUT_GROUPS: { type: string; label: string }[] = [
  { type: "daily", label: "Entrada Diária" },
  { type: "mission", label: "Missões" },
  { type: "doit", label: "Faça se Puder" },
  { type: "tribe", label: "Desafio da Tribo" },
  { type: "exchange", label: "Troca" },
  { type: "ammo", label: "Venda de Munição" },
  { type: "recharge", label: "Recarga" },
  { type: "consume", label: "Consumo" },
  { type: "recharge_extra", label: "Recarga Extra" },
  { type: "consume_extra", label: "Consumo Extra" },
  { type: "ranking_recharge", label: "Ranking de Recarga" },
  { type: "ranking_consume", label: "Ranking de Consumo" },
  { type: "request", label: "Solicitação manual" },
];

export function emptyBlock(spec: BlockSpec): EventBlock {
  const block: EventBlock = { fields: {}, groups: {} };
  for (const f of spec.fields) if (f.default) block.fields[f.key] = f.default;
  for (const g of spec.groups) block.groups[g.key] = [];
  if (spec.children) block.children = Array.from({ length: spec.children.minBlocks }, (_, i) => emptyBlock(spec.children!.blocks[i]));
  return block;
}

export function emptySet(set: SetSpec): EventBlock[] {
  return Array.from({ length: set.minBlocks }, (_, i) => emptyBlock(set.blocks[i]));
}

export function newSection(layout: LayoutSpec, servers: string): EventSection {
  const sets: Record<string, EventBlock[]> = {};
  for (const set of layout.sets) sets[set.key] = emptySet(set);
  const fields: Record<string, string> = {};
  for (const f of layout.fields) if (f.default) fields[f.key] = f.default;
  const section: EventSection = { id: newId(), layoutId: layout.id, servers, fields, sets };
  return layout.type === "daily" ? applyDailyLength(layout, section, 14) : section;
}

/** Solicitação manual (Activity request): parte extra que sempre vai no final do documento. */
export const isRequestSection = (s: Pick<EventSection, "layoutId">) => getLayout(s.layoutId)?.type === "request";

/** Seções principais primeiro e as solicitações manuais no final, mantendo a ordem dentro de cada parte. */
export function orderSections<T extends Pick<EventSection, "layoutId">>(sections: T[]): T[] {
  return [...sections.filter((s) => !isRequestSection(s)), ...sections.filter(isRequestSection)];
}

/** A seção tem algum prêmio (item) em qualquer bloco? */
export function hasPrizes(section: Pick<EventSection, "sets"> | null | undefined): boolean {
  const any = (blocks: EventBlock[]): boolean =>
    blocks.some((b) => Object.values(b.groups).some((items) => items.length > 0) || any(b.children ?? []));
  return !!section && Object.values(section.sets).some(any);
}

/** Entrada Diária (capa) com premiação: só então a aba entra no documento exportado. */
export const coverWithPrizes = (doc: Pick<EventDocument, "sections">) =>
  doc.sections.some((s) => s.layoutId === manifest.coverLayout && hasPrizes(s));

export function newItem(partial: Partial<EventItem> = {}): EventItem {
  return { id: "XXX", name: "", qty: 1, duration: "Permanent", bind: "Bound", ...partial };
}

/** Number of item slots a layout offers (used in the layout picker). */
export function capacitySummary(layout: LayoutSpec): string {
  if (layout.sets.length === 0) return "datas e servidores";
  return layout.sets
    .map((set) => {
      const first = set.blocks[0];
      const items = first?.groups.reduce((n, g) => n + (g.kind === "items" ? g.slots.length : 0), 0) ?? 0;
      if (first?.children) return `${set.blocks.length} ${set.blockLabel.toLowerCase()}(s)`;
      return set.blocks.length > 1 ? `${set.blocks.length} × ${items} itens` : `${items} itens`;
    })
    .join(" + ");
}

// ------------------------------------------------------------------ documentos antigos

interface LegacyItem { id?: string; name?: string; qty?: number; validity?: string; condition?: string; price?: string }
interface LegacyGroup { label?: string; value?: string; items?: LegacyItem[] }
interface LegacySection {
  id?: string; type?: string; titleEn?: string; titlePt?: string; descPt?: string; servers?: string;
  start?: string; end?: string; notes?: string; exchangeItem?: string; groups?: LegacyGroup[];
}

const LEGACY_LAYOUT: Record<string, string> = {
  daily: "daily-14d", mission: "missions-8x5", doit: "doit-double", tribe: "tribe", exchange: "exchange-11groups",
  ammo: "ammo-7x6", recharge: "recharge-13", consume: "consume-10", recharge_extra: "recharge-extra-5",
  consume_extra: "consume-extra-5", ranking_recharge: "ranking-recharge", ranking_consume: "ranking-consume",
};

function legacyItem(i: LegacyItem): EventItem {
  const parsed = parseItemLabel(`x ${i.validity ?? ""}`);
  const item = newItem({ id: i.id || "XXX", name: i.name ?? "", qty: Number(i.qty) || 1, duration: parsed.duration, bind: parsed.bind });
  const extra: Record<string, string> = {};
  if (i.price) extra.price = i.price.replace(/[^\d.,]/g, "");
  if (i.condition) extra.condition = i.condition;
  if (Object.keys(extra).length) item.extra = { currency: "Coupons", ...extra };
  return item;
}

export function isLegacySection(s: unknown): s is LegacySection {
  return !!s && typeof s === "object" && !("layoutId" in (s as object)) && "type" in (s as object);
}

/** Converts a section saved by the first version of the editor. Returns null if the type has no layout. */
export function convertLegacySection(old: LegacySection): EventSection | null {
  const layout = getLayout(LEGACY_LAYOUT[old.type ?? ""] ?? "");
  if (!layout) return null;
  const section = newSection(layout, old.servers || "s1-s401");
  section.fields.start = old.start ?? "";
  section.fields.end = old.end ?? "";
  const groups = old.groups ?? [];
  const set = layout.sets[layout.type === "exchange" ? 1 : 0];
  const blocks: EventBlock[] = [];
  groups.slice(0, set.blocks.length).forEach((g, gi) => {
    const spec = set.blocks[gi];
    const block = emptyBlock(spec);
    const items = (g.items ?? []).map(legacyItem);
    if (layout.type === "exchange") {
      block.fields.title = g.label ?? "";
      block.children = items.slice(0, spec.children?.blocks.length ?? 0).map((item, k) => {
        const child = emptyBlock(spec.children!.blocks[k]);
        child.fields.value = g.value ?? "";
        child.fields.total = String(item.qty);
        child.groups.items = [item];
        return child;
      });
    } else {
      const key = spec.groups.find((x) => x.kind === "items")?.key ?? "items";
      const capacity = spec.groups.find((x) => x.key === key)?.slots.length ?? 0;
      block.groups[key] = items.slice(0, capacity);
      if (layout.type === "daily") block.fields.label = g.label ?? "";
      if (/recharge|consume/.test(layout.type)) block.fields.value = (g.label ?? "").replace(/^\D+/, "");
      if (["mission", "doit", "tribe"].includes(layout.type) && gi === 0) {
        block.fields.titleEn = old.titleEn ?? "";
        block.fields.titlePt = old.titlePt ?? "";
        block.fields.descPt = old.descPt ?? "";
        block.fields.start = old.start ?? "";
        block.fields.end = old.end ?? "";
      }
    }
    blocks.push(block);
  });
  if (layout.type === "daily") {
    section.sets.queues = blocks;
    section.sets.days = emptySet(layout.sets[1]);
  } else if (blocks.length) section.sets[set.key] = blocks;
  if (layout.type === "exchange" && old.exchangeItem) {
    const id = /(\d{3,})/.exec(old.exchangeItem)?.[1] ?? "XXX";
    section.sets.coins = [{ fields: {}, groups: { items: [newItem({ id, name: old.exchangeItem.replace(/\s*-?\s*ID\s*\d+/i, "").trim() })] } }];
  }
  return section;
}

export function normalizeSections(raw: unknown): { sections: EventSection[]; converted: number; dropped: number } {
  const list = Array.isArray(raw) ? raw : [];
  let converted = 0;
  let dropped = 0;
  const sections: EventSection[] = [];
  for (const s of list) {
    if (isLegacySection(s)) {
      const c = convertLegacySection(s);
      if (c) {
        sections.push(c);
        converted += 1;
      } else dropped += 1;
    } else sections.push(normalizeSection(getLayout((s as EventSection).layoutId), s as EventSection));
  }
  return { sections, converted, dropped };
}
