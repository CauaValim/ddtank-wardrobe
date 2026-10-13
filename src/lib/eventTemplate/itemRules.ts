import { LAYOUT_GROUPS, getLayout, manifest } from "./model";
import { normalizeTier, tierLadder, tierNumber } from "./rules";
import type { EventBlock, EventDocument, EventItem } from "./types";
import type { ValidationIssue } from "./validate";

/**
 * Cadastro de itens com as categorias (tipos de seção) em que podem entrar e as proibidas.
 * Aparece ao lado do nome do item na busca da seção e vira aviso na validação.
 */
export interface ItemRule {
  id: string;
  item_id: string;
  item_name: string;
  allowed: string[];
  forbidden: string[];
  note: string | null;
  /** Recarga/Consumo (e Extras): andar a partir do qual o item pode entrar, por categoria (ex.: { recharge: "8.000" }). */
  min_tiers?: Record<string, string>;
}

export type RuleStatus = "allowed" | "forbidden" | null;

export const CATEGORIES = LAYOUT_GROUPS;

export const categoryLabel = (type: string) => CATEGORIES.find((c) => c.type === type)?.label ?? type;

/** Situação do item na categoria da seção (proibido vence permitido). */
export function ruleStatus(rule: ItemRule | undefined, category: string): RuleStatus {
  if (!rule) return null;
  if (rule.forbidden.includes(category)) return "forbidden";
  if (rule.allowed.includes(category)) return "allowed";
  return null;
}

function eachItem(blocks: EventBlock[], fn: (item: EventItem) => void) {
  for (const b of blocks) {
    for (const items of Object.values(b.groups)) items.forEach(fn);
    eachItem(b.children ?? [], fn);
  }
}

/** Andares (pisos) de cada categoria com andares: Recarga, Consumo e os Extras. */
export const TIER_CATEGORIES: Record<string, string[]> = Object.fromEntries(
  manifest.layouts.flatMap((l) => {
    const ladder = tierLadder(l);
    return ladder ? [[l.type, ladder.values] as const] : [];
  }),
);

/** Andar mínimo cadastrado do item na categoria (ou null = qualquer andar). */
export const minTier = (rule: ItemRule | undefined, category: string): string | null => rule?.min_tiers?.[category] || null;

/** O item pode entrar neste andar da categoria? */
export function tierAllowed(rule: ItemRule | undefined, category: string, tier: string): boolean {
  const min = minTier(rule, category);
  if (!min || !tier.trim()) return true;
  return tierNumber(normalizeTier(tier)) >= tierNumber(min);
}

/** Avisos para itens usados em seções de uma categoria proibida no cadastro ou abaixo do andar liberado. */
export function ruleIssues(doc: EventDocument, rules: Map<string, ItemRule>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  doc.sections.forEach((section, i) => {
    const layout = getLayout(section.layoutId);
    if (!layout) return;
    const seen = new Set<string>();
    // Recarga/Consumo: item num andar abaixo do liberado no cadastro.
    if (TIER_CATEGORIES[layout.type]) {
      for (const block of section.sets.tiers ?? []) {
        const tier = block.fields.value ?? "";
        eachItem([block], (item) => {
          const id = item.id.trim();
          const rule = rules.get(id);
          if (!rule || ruleStatus(rule, layout.type) === "forbidden" || tierAllowed(rule, layout.type, tier)) return;
          issues.push({
            level: "warning",
            where: `${i + 1}. ${layout.label}`,
            message: `${item.name || id} (ID ${id}) só está liberado a partir do andar ${minTier(rule, layout.type)} em ${categoryLabel(layout.type)} (está no andar ${normalizeTier(tier)})`,
          });
        });
      }
    }
    eachItem(Object.values(section.sets).flat(), (item) => {
      const id = item.id.trim();
      if (seen.has(id) || ruleStatus(rules.get(id), layout.type) !== "forbidden") return;
      seen.add(id);
      const note = rules.get(id)?.note;
      issues.push({
        level: "warning",
        where: `${i + 1}. ${layout.label}`,
        message: `${item.name || id} (ID ${id}) está proibido em ${categoryLabel(layout.type)}${note ? ` (${note})` : ""}`,
      });
    });
  });
  return issues;
}
