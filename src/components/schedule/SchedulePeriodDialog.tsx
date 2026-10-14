import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { addDays, dayLabel, mondayOf, periodDays, periodTitle, type PeriodEntries, type ScheduleApi, type ScheduleItem, type SchedulePeriod } from "@/hooks/useSchedule";

export type PeriodDraft = Omit<SchedulePeriod, "id" | "created_at" | "updated_at"> & { id?: string };

interface Props {
  schedule: ScheduleApi;
  /** Período a editar; `null` fecha. Sem `id` = período novo. */
  period: PeriodDraft | null;
  onClose: () => void;
}

const NO_DATE = "__none__";

/** Atividades de uma categoria: cada uma com o dia em que deve ser inserida e a descrição. */
function ItemsEditor({ items, days, onChange, label }: { items: ScheduleItem[]; days: string[]; onChange: (items: ScheduleItem[]) => void; label: string }) {
  const set = (i: number, patch: Partial<ScheduleItem>) => onChange(items.map((it, k) => (k === i ? { ...it, ...patch } : it)));
  // Novo item: o dia seguinte ao da última atividade com data (ou o primeiro dia do período).
  const lastDate = [...items].reverse().find((it) => it.date)?.date;
  const nextDate = lastDate ? days[Math.min(days.indexOf(lastDate) + 1, days.length - 1)] ?? null : days[0] ?? null;
  return (
    <div className="space-y-1.5">
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <Select value={it.date && days.includes(it.date) ? it.date : NO_DATE} onValueChange={(v) => set(i, { date: v === NO_DATE ? null : v })}>
            <SelectTrigger className="h-8 w-[118px] shrink-0 text-xs" aria-label={`Data da atividade ${i + 1} de ${label}`}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_DATE}>Sem data</SelectItem>
              {days.map((d) => <SelectItem key={d} value={d}>{dayLabel(d)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input className="h-8 text-xs" value={it.text} placeholder="Ex.: Faça se Puder - Dinâmica Halloween" onChange={(e) => set(i, { text: e.target.value })} />
          <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0" title="Remover atividade" onClick={() => onChange(items.filter((_, k) => k !== i))}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <Button type="button" size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => onChange([...items, { text: "", date: nextDate }])}>
        <Plus className="h-3.5 w-3.5" /> Adicionar atividade
      </Button>
    </div>
  );
}

/** Datas, nome, tema e as atividades de cada categoria (com o dia de cada uma) de um período do cronograma. */
export function SchedulePeriodDialog({ schedule, period, onClose }: Props) {
  const [draft, setDraft] = useState<PeriodDraft | null>(null);
  const [lists, setLists] = useState<PeriodEntries>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!period) return;
    setDraft(period);
    const current = period.id ? schedule.entriesByPeriod.get(period.id) ?? {} : {};
    setLists(Object.fromEntries(Object.entries(current).map(([k, v]) => [k, v.map((it) => ({ ...it }))])));
    // Só ao abrir: as entradas salvas não devem sobrescrever o que está sendo digitado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  if (!draft) return null;
  const set = (patch: Partial<PeriodDraft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  const submit = async () => {
    if (!draft.start_date || !draft.end_date) {
      toast.error("Informe o início e o fim do período");
      return;
    }
    if (draft.end_date < draft.start_date) {
      toast.error("O fim do período é antes do início");
      return;
    }
    setBusy(true);
    try {
      const byCategory: PeriodEntries = {};
      const days = periodDays(draft);
      for (const c of schedule.categories) {
        // Linhas vazias saem; datas fora do período (o período mudou) viram "sem data".
        const items = (lists[c.id] ?? [])
          .map((it) => ({ text: it.text.trim(), date: it.date && days.includes(it.date) ? it.date : null }))
          .filter((it) => it.text);
        if (items.length) byCategory[c.id] = items;
      }
      await schedule.savePeriod({ ...draft, label: draft.label.trim(), theme: draft.theme.trim(), notes: draft.notes.trim() }, byCategory);
      toast.success("Período salvo");
      onClose();
    } catch (e) {
      toast.error(`Não foi possível salvar: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!period} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{draft.id ? `Editar período ${periodTitle(draft)}` : "Novo período"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="space-y-1">
            <Label htmlFor="sp-start">Início</Label>
            <Input
              id="sp-start"
              type="date"
              value={draft.start_date}
              onChange={(e) => {
                // A semana sempre começa na segunda-feira e vai até o domingo.
                const start = e.target.value ? mondayOf(e.target.value) : "";
                set({ start_date: start, end_date: start ? addDays(start, 6) : draft.end_date });
              }}
            />
            <p className="text-[10px] text-muted-foreground">Sempre segunda-feira</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="sp-end">Fim</Label>
            <Input id="sp-end" type="date" value={draft.end_date} onChange={(e) => set({ end_date: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sp-label">Nome (opcional)</Label>
            <Input id="sp-label" placeholder={periodTitle({ ...draft, label: "" })} value={draft.label} onChange={(e) => set({ label: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sp-theme">Tema</Label>
            <Input id="sp-theme" placeholder="Halloween Week 1" value={draft.theme} onChange={(e) => set({ theme: e.target.value })} />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="sp-notes">Observações</Label>
          <Textarea id="sp-notes" rows={2} value={draft.notes} onChange={(e) => set({ notes: e.target.value })} />
        </div>

        {schedule.sections.length === 0 && (
          <p className="text-sm text-muted-foreground">Crie seções e categorias na aba "Estrutura" para lançar eventos neste período.</p>
        )}
        <p className="text-xs text-muted-foreground">Cada atividade com o dia em que deve ser inserida (ou "Sem data"). Categorias vazias não aparecem no cronograma.</p>
        {schedule.sections.map((section) => {
          const cats = schedule.categories.filter((c) => c.section_id === section.id);
          if (cats.length === 0) return null;
          return (
            <section key={section.id} className="space-y-2">
              <h3 className="text-sm font-semibold">{section.name}</h3>
              <div className="grid gap-3">
                {cats.map((c) => (
                  <div key={c.id} className="space-y-1">
                    <Label className="flex items-center gap-1.5">
                      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                      {c.name}
                    </Label>
                    <ItemsEditor
                      label={c.name}
                      items={lists[c.id] ?? []}
                      days={draft.start_date && draft.end_date && draft.start_date <= draft.end_date ? periodDays(draft) : []}
                      onChange={(items) => setLists((prev) => ({ ...prev, [c.id]: items }))}
                    />
                  </div>
                ))}
              </div>
            </section>
          );
        })}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button onClick={submit} disabled={busy}>{busy ? "Salvando..." : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
