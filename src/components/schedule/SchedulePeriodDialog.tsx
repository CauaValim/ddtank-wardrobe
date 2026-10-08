import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { periodTitle, type PeriodEntries, type ScheduleApi, type SchedulePeriod } from "@/hooks/useSchedule";

export type PeriodDraft = Omit<SchedulePeriod, "id" | "created_at" | "updated_at"> & { id?: string };

interface Props {
  schedule: ScheduleApi;
  /** Período a editar; `null` fecha. Sem `id` = período novo. */
  period: PeriodDraft | null;
  onClose: () => void;
}

const toLines = (list: string[] | undefined) => (list ?? []).join("\n");
const fromLines = (text: string) => text.split("\n").map((l) => l.trim()).filter(Boolean);

/** Datas, nome, tema e os eventos de cada categoria (um por linha) de um período do cronograma. */
export function SchedulePeriodDialog({ schedule, period, onClose }: Props) {
  const [draft, setDraft] = useState<PeriodDraft | null>(null);
  const [lists, setLists] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!period) return;
    setDraft(period);
    const current = period.id ? schedule.entriesByPeriod.get(period.id) ?? {} : {};
    setLists(Object.fromEntries(Object.entries(current).map(([k, v]) => [k, toLines(v)])));
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
      for (const c of schedule.categories) {
        const items = fromLines(lists[c.id] ?? "");
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
            <Input id="sp-start" type="date" value={draft.start_date} onChange={(e) => set({ start_date: e.target.value })} />
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
        <p className="text-xs text-muted-foreground">Um evento por linha. Categorias vazias não aparecem no cronograma.</p>
        {schedule.sections.map((section) => {
          const cats = schedule.categories.filter((c) => c.section_id === section.id);
          if (cats.length === 0) return null;
          return (
            <section key={section.id} className="space-y-2">
              <h3 className="text-sm font-semibold">{section.name}</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {cats.map((c) => (
                  <div key={c.id} className="space-y-1">
                    <Label htmlFor={`sp-${c.id}`} className="flex items-center gap-1.5">
                      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                      {c.name}
                    </Label>
                    <Textarea id={`sp-${c.id}`} rows={2} value={lists[c.id] ?? ""} onChange={(e) => setLists((prev) => ({ ...prev, [c.id]: e.target.value }))} />
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
