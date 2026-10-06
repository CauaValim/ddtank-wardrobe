import { ArrowLeftRight, Clock, Trophy } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { isoToUs } from "@/lib/eventTemplate/format";
import { RECENT_DAYS, type ItemUsage, type UsageKind } from "@/lib/eventTemplate/usage";

export type UsageByKind = Record<UsageKind, ItemUsage[]>;

const KINDS: { kind: UsageKind; label: string; title: string; icon: typeof Trophy; className: string }[] = [
  { kind: "exchange", label: "Troca", title: "Já usado em troca", icon: ArrowLeftRight, className: "border-amber-500/60 text-amber-700 dark:text-amber-400" },
  { kind: "ranking", label: "Ranking", title: "Já usado em ranking", icon: Trophy, className: "border-violet-500/60 text-violet-700 dark:text-violet-400" },
  { kind: "sale", label: `${RECENT_DAYS} dias`, title: `Venda de munição, recarga ou consumo nos últimos ${RECENT_DAYS} dias`, icon: Clock, className: "border-sky-500/60 text-sky-700 dark:text-sky-400" },
];

const MAX = 12;

/** Selos "Troca", "Ranking" e "30 dias" com a lista de eventos (data, evento e detalhe). */
export function ItemUsageBadges({ usage }: { usage?: UsageByKind }) {
  if (!usage) return null;
  return (
    <>
      {KINDS.filter((k) => usage[k.kind].length > 0).map(({ kind, label, title, icon: Icon, className }) => {
        const list = usage[kind];
        return (
          <Popover key={kind}>
            <PopoverTrigger asChild>
              <button type="button" title={title} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${className}`}>
                <Icon className="h-3 w-3" /> {label} {list.length > 1 ? `(${list.length})` : ""}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-96 p-2" align="start">
              <p className="px-1 pb-1 text-xs font-semibold">{title}</p>
              <ul className="max-h-72 space-y-1 overflow-y-auto text-xs">
                {list.slice(0, MAX).map((u, i) => (
                  <li key={i} className="rounded px-1 py-0.5 hover:bg-muted">
                    <span className="tabular-nums text-muted-foreground">{isoToUs(u.date) || "sem data"}</span>
                    {" · "}<span className="font-medium">{u.docTitle || "Evento sem nome"}</span>
                    {u.detail && <span className="block text-muted-foreground">{u.detail}</span>}
                  </li>
                ))}
              </ul>
              {list.length > MAX && <p className="px-1 pt-1 text-xs text-muted-foreground">e mais {list.length - MAX} evento(s)</p>}
            </PopoverContent>
          </Popover>
        );
      })}
    </>
  );
}
