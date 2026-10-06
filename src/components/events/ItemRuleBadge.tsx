import { Ban, Check } from "lucide-react";
import { categoryLabel, ruleStatus, type ItemRule } from "@/lib/eventTemplate/itemRules";

/** "Permitido em Recarga" (verde) ou "Proibido em Recarga" (vermelho), conforme o cadastro do item. */
export function ItemRuleBadge({ rule, category }: { rule?: ItemRule; category?: string }) {
  if (!rule || !category) return null;
  const status = ruleStatus(rule, category);
  if (!status) return null;
  const label = categoryLabel(category);
  const title = rule.note ? `${label}: ${rule.note}` : undefined;
  return status === "allowed" ? (
    <span title={title} className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-green-600/60 px-1.5 py-0.5 text-[11px] font-medium text-green-700 dark:text-green-400">
      <Check className="h-3 w-3" /> Permitido em {label}
    </span>
  ) : (
    <span title={title} className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-destructive/70 bg-destructive/10 px-1.5 py-0.5 text-[11px] font-medium text-destructive">
      <Ban className="h-3 w-3" /> Proibido em {label}
    </span>
  );
}
