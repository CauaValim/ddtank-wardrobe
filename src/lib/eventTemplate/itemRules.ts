import { LAYOUT_GROUPS, getLayout } from "./model";
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

/** Avisos para itens usados em seções de uma categoria proibida no cadastro. */
export function ruleIssues(doc: EventDocument, rules: Map<string, ItemRule>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  doc.sections.forEach((section, i) => {
    const layout = getLayout(section.layoutId);
    if (!layout) return;
    const seen = new Set<string>();
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
