import type { BlockSpec, EventBlock, EventItem, EventSection, LayoutSpec, SetSpec } from "./types";
import type { ValidationIssue } from "./validate";

/**
 * Regras de negócio por layout que não cabem no manifesto (que só descreve células do modelo):
 * missões sem limite (abas de continuação), Fila da Entrada Diária, escada de pisos e limite de troca.
 */

// ------------------------------------------------------------------ missões sem limite

interface Pagination {
  set: string;
  /** Grupo que só existe no último bloco da aba: a missão que o usa ocupa essa posição e fecha a aba. */
  lastBlockGroup?: string;
}

const PAGINATED: Record<string, Pagination> = {
  "missions-8x5": { set: "missions" },
  "missions-3x3-choice": { set: "missions", lastBlockGroup: "choice" },
};

export function pagination(layout: LayoutSpec, setKey: string): Pagination | null {
  const p = PAGINATED[layout.id];
  return p && p.set === setKey ? p : null;
}

/** Quantos blocos o editor aceita no conjunto (Infinity nas missões com abas de continuação). */
export function setCapacity(layout: LayoutSpec, set: SetSpec): number {
  return pagination(layout, set.key) ? Infinity : set.blocks.length;
}

/** Spec usada no editor para o bloco `index` (nas missões com escolha, todas podem ter as 4 opções). */
export function editorBlockSpec(layout: LayoutSpec, set: SetSpec, index: number): BlockSpec {
  const p = pagination(layout, set.key);
  if (!p) return set.blocks[index];
  if (p.lastBlockGroup) return set.blocks[set.blocks.length - 1];
  return set.blocks[index % set.blocks.length];
}

const hasItems = (block: EventBlock | undefined, group: string) => (block?.groups[group]?.length ?? 0) > 0;

/**
 * Divide uma seção em páginas que cabem no modelo; cada página vira uma aba (a 2ª em diante é a
 * continuação, "BR-Missions s1-s401 2"). Posições sem missão ficam `undefined` e são ocultadas.
 */
export function paginateSection(layout: LayoutSpec, section: EventSection): EventSection[] {
  const set = layout.sets.find((s) => pagination(layout, s.key));
  const p = set ? pagination(layout, set.key) : null;
  if (!set || !p) return [section];
  const blocks = section.sets[set.key] ?? [];
  const size = set.blocks.length;
  const pages: (EventBlock | undefined)[][] = [];
  let page: (EventBlock | undefined)[] = [];
  const flush = () => {
    if (page.some(Boolean)) pages.push(page);
    page = [];
  };
  for (const block of blocks) {
    if (p.lastBlockGroup && hasItems(block, p.lastBlockGroup)) {
      while (page.length < size - 1) page.push(undefined);
      page.push(block);
      flush();
      continue;
    }
    const strip = p.lastBlockGroup && page.length < size - 1
      ? { ...block, groups: Object.fromEntries(Object.entries(block.groups).filter(([k]) => k !== p.lastBlockGroup)) }
      : block;
    page.push(strip);
    if (page.length === size) flush();
  }
  flush();
  if (pages.length <= 1 && blocks.length <= size && !blocks.some((b, i) => p.lastBlockGroup && i < size - 1 && hasItems(b, p.lastBlockGroup))) {
    return [section];
  }
  return pages.map((blocksOfPage, i) => ({
    ...section,
    id: i === 0 ? section.id : `${section.id}-p${i + 1}`,
    sets: { ...section.sets, [set.key]: blocksOfPage as EventBlock[] },
  }));
}

// ------------------------------------------------------------------ Entrada Diária: 7 ou 14 dias

export const DAILY_LENGTHS = [7, 14] as const;
export type DailyLength = (typeof DAILY_LENGTHS)[number];

const QUEUES: Record<DailyLength, number[]> = { 7: [3, 7], 14: [3, 7, 14] };

export const queueLabel = (days: number) => `Queue ${days}`;

export function dailyLength(section: EventSection): DailyLength {
  if (section.fields.days === "7") return 7;
  if (section.fields.days === "14") return 14;
  return (section.sets.queues?.length ?? 0) === 2 ? 7 : 14;
}

/** Ajusta as filas (3/7 ou 3/7/14) mantendo os itens de cada posição. */
export function applyDailyLength(layout: LayoutSpec, section: EventSection, days: DailyLength): EventSection {
  const set = layout.sets.find((s) => s.key === "queues");
  if (!set) return section;
  const current = section.sets.queues ?? [];
  const queues = QUEUES[days].map((d, i): EventBlock => {
    const prev = current[i];
    const groups = prev?.groups ?? Object.fromEntries(set.blocks[i].groups.map((g) => [g.key, []]));
    return { ...(prev ?? {}), fields: { ...(prev?.fields ?? {}), label: queueLabel(d) }, groups };
  });
  return { ...section, fields: { ...section.fields, days: String(days) }, sets: { ...section.sets, queues } };
}

// ------------------------------------------------------------------ pisos (Recarga / Consumo e Extras)

export interface TierLadder {
  values: string[];
  repeatable: string[];
}

const RECHARGE = ["500", "1.000", "2.000", "5.000", "8.000", "15.000", "30.000", "50.000", "100.000", "150.000", "200.000", "300.000", "400.000"];
const CONSUME = ["1.000", "5.000", "10.000", "30.000", "50.000", "100.000", "150.000", "200.000", "300.000", "400.000"];

const LADDERS: Record<string, TierLadder> = {
  "recharge-13": { values: RECHARGE, repeatable: ["500", "1.000", "2.000"] },
  "consume-10": { values: CONSUME, repeatable: ["1.000"] },
  "recharge-extra-5": { values: ["10.000", "15.000", "20.000", "30.000", "50.000"], repeatable: [] },
  "consume-extra-5": { values: ["10.000", "20.000", "30.000", "40.000", "50.000"], repeatable: [] },
};

export const REPEATABLE = "Can be repeated";
export const NOT_REPEATABLE = "Cannot be repeated";

export function tierLadder(layout: LayoutSpec): TierLadder | null {
  return LADDERS[layout.id] ?? null;
}

/** "1000" / "1,000" / "1.000" -> "1.000". */
export function normalizeTier(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (!digits) return value.trim();
  return Number(digits).toLocaleString("de-DE");
}

export const tierNumber = (value: string) => Number(value.replace(/\D/g, "")) || 0;

export function tierCondition(ladder: TierLadder, value: string): string {
  return ladder.repeatable.includes(normalizeTier(value)) ? REPEATABLE : NOT_REPEATABLE;
}

/**
 * Monta as faixas até o piso escolhido (inclusive). Faixas já preenchidas com o mesmo valor mantêm
 * os itens; faixas com valor manual continuam na lista, na ordem do valor.
 */
export function tiersUpTo(layout: LayoutSpec, section: EventSection, upTo: string): EventSection {
  const ladder = tierLadder(layout);
  const set = layout.sets.find((s) => s.key === "tiers");
  if (!ladder || !set) return section;
  const current = section.sets.tiers ?? [];
  const byValue = new Map(current.map((b) => [normalizeTier(b.fields.value ?? ""), b]));
  const limit = tierNumber(upTo);
  const standard = ladder.values.filter((v) => tierNumber(v) <= limit);
  const manual = current.filter((b) => !ladder.values.includes(normalizeTier(b.fields.value ?? "")) && (b.fields.value ?? "").trim());
  const values = [...standard, ...manual.map((b) => normalizeTier(b.fields.value))]
    .sort((a, b) => tierNumber(a) - tierNumber(b))
    .slice(0, set.blocks.length);
  const tiers = values.map((v, i): EventBlock => {
    const prev = byValue.get(v);
    const groups = prev?.groups ?? Object.fromEntries(set.blocks[i].groups.map((g) => [g.key, []]));
    const condition = prev?.fields.condition || tierCondition(ladder, v);
    return { ...(prev ?? {}), fields: { ...(prev?.fields ?? {}), value: v, condition }, groups };
  });
  return { ...section, sets: { ...section.sets, tiers } };
}

/** Maior piso padrão já presente na seção (para mostrar no seletor "até"). */
export function highestStandardTier(layout: LayoutSpec, section: EventSection): string {
  const ladder = tierLadder(layout);
  if (!ladder) return "";
  const present = (section.sets.tiers ?? []).map((b) => normalizeTier(b.fields.value ?? "")).filter((v) => ladder.values.includes(v));
  return present.sort((a, b) => tierNumber(b) - tierNumber(a))[0] ?? "";
}

// ------------------------------------------------------------------ limite de troca

export const NO_LIMIT = "No limit";
export const exchangeLimitText = (n: number) => `LIMIT OF ${n} ITEMS PER EXCHANGE`;

/** "No limit" -> null; "LIMIT OF 2 ITEM(S) PER EXCHANGE" -> 2; outro texto -> undefined. */
export function parseExchangeLimit(text: string): number | null | undefined {
  const t = (text ?? "").trim();
  if (!t || /^no\s+limit$/i.test(t)) return null;
  const m = /^LIMIT\s+OF\s+(\d+)\s+ITEMS?\s+PER\s+EXCHANGE$/i.exec(t);
  return m ? Number(m[1]) : undefined;
}

export const isExchangeCondition = (layout: LayoutSpec, setKey: string, fieldKey: string) =>
  layout.type === "exchange" && setKey === "groups" && fieldKey === "condition";

// ------------------------------------------------------------------ venda de munição

export const ammoLimitText = (n: number) => `Limit ${n} items per server`;

/** "No limit"/vazio -> null; "Limit 10 item(s) per server" -> 10; outro texto -> undefined. */
export function parseAmmoLimit(text: string): number | null | undefined {
  const t = (text ?? "").trim();
  if (!t || /^no\s+limit$/i.test(t)) return null;
  const m = /^limit\s+(?:of\s+)?(\d+)\s+items?\s+per\s+server$/i.exec(t);
  return m ? Number(m[1]) : undefined;
}

/** "120000" / "120.000" / "120 000" -> "120.000". Texto com letras fica como está. */
export function formatPrice(value: string): string {
  const t = (value ?? "").trim();
  if (!/^[\d.,\s]+$/.test(t)) return t;
  const digits = t.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function normalizeAmmoItem(item: EventItem): EventItem {
  const extra = item.extra ?? {};
  const limit = parseAmmoLimit(extra.condition ?? "");
  const condition = limit === undefined ? extra.condition ?? "" : limit === null ? NO_LIMIT : ammoLimitText(limit);
  const price = formatPrice(extra.price ?? "");
  if (condition === extra.condition && price === (extra.price ?? "")) return item;
  return { ...item, extra: { ...extra, price, condition } };
}

// ------------------------------------------------------------------ validade renovável

/** "30 Days - renewable" / "7 Days - non-renewable": nome com fundo laranja (Ênfase 2, 80%). */
export const isRenewable = (duration: string) => /renewable/i.test(duration ?? "");

// ------------------------------------------------------------------ hooks usados por editor, validação e importação

/** Limite de itens de um grupo (a lista de dias segue a duração da Entrada Diária). */
export function groupLimit(layout: LayoutSpec, section: EventSection, setKey: string, groupKey: string, slots: number): number {
  if (layout.type === "daily" && setKey === "days" && groupKey === "items") return Math.min(slots, dailyLength(section));
  return slots;
}

/** Campos preenchidos automaticamente (não editáveis no editor). */
export function isAutoField(layout: LayoutSpec, setKey: string, fieldKey: string): boolean {
  return layout.type === "daily" && setKey === "queues" && fieldKey === "label";
}

/** O editor mostra os blocos desse conjunto em quantidade fixa (definida por outra regra). */
export function isFixedSet(layout: LayoutSpec, setKey: string): boolean {
  return layout.type === "daily" && setKey === "queues";
}

export function sectionIssues(layout: LayoutSpec, section: EventSection, where: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (layout.type === "daily") {
    const days = dailyLength(section);
    const count = section.sets.days?.[0]?.groups.items?.length ?? 0;
    if (count > days) issues.push({ level: "error", where, message: `Entrada Diária de ${days} dias com ${count} itens na lista de dias` });
  }
  return issues;
}

/** Ajustes aplicados ao abrir ou importar documentos (textos antigos do modelo). */
export function normalizeSection(layout: LayoutSpec | undefined, section: EventSection): EventSection {
  if (!layout) return section;
  if (layout.type === "exchange" && section.sets.groups) {
    const groups = section.sets.groups.map((g) => {
      const n = parseExchangeLimit(g.fields.condition ?? "");
      if (n == null || g.fields.condition === exchangeLimitText(n)) return g;
      return { ...g, fields: { ...g.fields, condition: exchangeLimitText(n) } };
    });
    return { ...section, sets: { ...section.sets, groups } };
  }
  if (layout.type === "ammo" && section.sets.blocks) {
    const blocks = section.sets.blocks.map((b) => ({ ...b, groups: { ...b.groups, items: (b.groups.items ?? []).map(normalizeAmmoItem) } }));
    return { ...section, sets: { ...section.sets, blocks } };
  }
  if (layout.type === "daily" && !section.fields.days) {
    return { ...section, fields: { ...section.fields, days: String(dailyLength(section)) } };
  }
  return section;
}
