import { useMemo, useState } from "react";
import { CheckCircle2, CircleDot, Paperclip, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { periodTitle, type ScheduleApi } from "@/hooks/useSchedule";
import type { PendenciesApi, Pendency } from "@/hooks/usePendencies";
import { PendencyDialog } from "@/components/schedule/PendencyDialog";

const formatDay = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

/** Aba "Pendências" do cronograma: lista das abertas ou resolvidas e o botão de criar. */
export function PendenciesPanel({ api, schedule, userId, canManage }: {
  api: PendenciesApi;
  schedule: ScheduleApi;
  userId: string | null;
  /** Permissão "Editar cronograma": altera qualquer pendência. */
  canManage: boolean;
}) {
  const [show, setShow] = useState<Pendency["status"]>("open");
  const [selected, setSelected] = useState<Pendency | null | undefined>(undefined);
  const periodById = useMemo(() => new Map(schedule.periods.map((p) => [p.id, p])), [schedule.periods]);
  const counts = useMemo(() => ({
    open: api.pendencies.filter((p) => p.status === "open").length,
    resolved: api.pendencies.filter((p) => p.status === "resolved").length,
  }), [api.pendencies]);
  const list = api.pendencies.filter((p) => p.status === show);
  const canEdit = (p: Pendency) => canManage || (!!userId && p.created_by === userId);

  if (!api.loading && !api.available) {
    return <p className="px-2 py-3 text-xs text-muted-foreground">As pendências ainda não foram criadas no banco de dados.</p>;
  }

  return (
    <div className="space-y-2 px-1 pb-4">
      <div className="flex items-center gap-1 px-1">
        {(["open", "resolved"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setShow(s)}
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
              show === s ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-muted"
            }`}
          >
            {s === "open" ? "Abertas" : "Resolvidas"} ({counts[s]})
          </button>
        ))}
        <span className="flex-1" />
        <Button size="icon" variant="ghost" className="h-7 w-7" title="Nova pendência" onClick={() => setSelected(null)}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {api.loading && <p className="px-2 text-[11px] text-muted-foreground">Carregando...</p>}
      {!api.loading && list.length === 0 && (
        <p className="px-2 text-[11px] text-muted-foreground">
          {show === "open" ? "Nenhuma pendência aberta. Use o + para criar." : "Nenhuma pendência resolvida."}
        </p>
      )}

      {list.map((p) => {
        const period = p.period_id ? periodById.get(p.period_id) : undefined;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => setSelected(p)}
            className="w-full rounded-lg border border-border px-2.5 py-2 text-left transition-colors hover:bg-muted/60"
          >
            <div className="flex items-start gap-1.5">
              {p.status === "open"
                ? <CircleDot className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                : <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />}
              <span className="flex-1 text-xs font-semibold leading-tight text-foreground line-clamp-2">{p.title}</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1 pl-5">
              {p.tab && <Badge variant="secondary" className="h-4 border-0 px-1.5 text-[10px]">{p.tab}</Badge>}
              {period && <span className="text-[10px] text-muted-foreground">{periodTitle(period)}</span>}
              {p.attachments?.length > 0 && (
                <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground"><Paperclip className="h-3 w-3" />{p.attachments.length}</span>
              )}
              <span className="ml-auto text-[10px] text-muted-foreground">{formatDay(p.created_at)}</span>
            </div>
            {p.context && <p className="mt-1 pl-5 text-[11px] leading-tight text-muted-foreground line-clamp-2">{p.context}</p>}
          </button>
        );
      })}

      <PendencyDialog
        api={api}
        periods={schedule.periods}
        categoryNames={schedule.categories.map((c) => c.name)}
        pendency={selected}
        canEdit={canEdit}
        onClose={() => setSelected(undefined)}
      />
    </div>
  );
}
