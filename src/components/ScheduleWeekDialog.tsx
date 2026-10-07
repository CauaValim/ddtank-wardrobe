import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SCHEDULE_CATEGORIES, periodFor, type ScheduleWeek } from "@/hooks/useSchedule";

interface Props {
  /** Semana a editar; `null` fecha o diálogo. Sem `id` = semana nova. */
  week: ScheduleWeek | null;
  onClose: () => void;
  onSave: (week: ScheduleWeek) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

const toLines = (list: string[] | undefined) => (list ?? []).join("\n");
const fromLines = (text: string) => text.split("\n").map((l) => l.trim()).filter(Boolean);

/** Edição de uma semana do cronograma (ADM): tema, eventos por categoria e Cronograma Econômica. */
export function ScheduleWeekDialog({ week, onClose, onSave, onDelete }: Props) {
  const [startDate, setStartDate] = useState("");
  const [periodo, setPeriodo] = useState("");
  const [tema, setTema] = useState("");
  const [lists, setLists] = useState<Record<string, string>>({});
  const [economica, setEconomica] = useState("");
  const [busy, setBusy] = useState(false);

  // Categorias fixas + as que já existirem na semana.
  const categories = [...SCHEDULE_CATEGORIES, ...Object.keys(week?.eventos ?? {}).filter((c) => !SCHEDULE_CATEGORIES.includes(c))];

  useEffect(() => {
    if (!week) return;
    setStartDate(week.startDate);
    setPeriodo(week.periodo);
    setTema(week.tema);
    setLists(Object.fromEntries(Object.entries(week.eventos).map(([k, v]) => [k, toLines(v)])));
    setEconomica(toLines(week.economica));
  }, [week]);

  const changeStart = (value: string) => {
    // O período acompanha a data enquanto não foi escrito à mão.
    if (!periodo || periodo === periodFor(startDate)) setPeriodo(periodFor(value));
    setStartDate(value);
  };

  const submit = async () => {
    if (!week) return;
    if (!startDate) {
      toast.error("Informe a data de início da semana");
      return;
    }
    setBusy(true);
    try {
      await onSave({
        id: week.id,
        startDate,
        periodo: periodo.trim() || periodFor(startDate),
        tema: tema.trim(),
        eventos: Object.fromEntries(categories.map((c) => [c, fromLines(lists[c] ?? "")])),
        economica: fromLines(economica),
      });
      toast.success("Cronograma salvo");
      onClose();
    } catch (e) {
      toast.error(`Não foi possível salvar: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!week?.id || !confirm(`Excluir a semana ${week.periodo} do cronograma?`)) return;
    setBusy(true);
    try {
      await onDelete(week.id);
      toast.success("Semana excluída");
      onClose();
    } catch (e) {
      toast.error(`Não foi possível excluir: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!week} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{week?.id ? `Editar semana ${week.periodo}` : "Nova semana no cronograma"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="sw-start">Início (segunda-feira)</Label>
            <Input id="sw-start" type="date" value={startDate} onChange={(e) => changeStart(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sw-period">Período</Label>
            <Input id="sw-period" placeholder="05/10 - 11/10" value={periodo} onChange={(e) => setPeriodo(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sw-theme">Tema</Label>
            <Input id="sw-theme" placeholder="Halloween Week 1" value={tema} onChange={(e) => setTema(e.target.value)} />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Um evento por linha. Categorias vazias não aparecem no cronograma.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {categories.map((c) => (
            <div key={c} className="space-y-1">
              <Label htmlFor={`sw-${c}`}>{c}</Label>
              <Textarea id={`sw-${c}`} rows={2} value={lists[c] ?? ""} onChange={(e) => setLists((prev) => ({ ...prev, [c]: e.target.value }))} />
            </div>
          ))}
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="sw-eco">Cronograma Econômica</Label>
            <Textarea id="sw-eco" rows={3} placeholder="Ranking de Recarga - 200k (07/10 - 11/10)" value={economica} onChange={(e) => setEconomica(e.target.value)} />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {week?.id ? <Button variant="destructive" onClick={remove} disabled={busy}>Excluir semana</Button> : <span />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={busy}>Cancelar</Button>
            <Button onClick={submit} disabled={busy}>{busy ? "Salvando..." : "Salvar"}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
