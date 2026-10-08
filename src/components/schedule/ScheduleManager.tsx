import { useState } from "react";
import { ArrowDown, ArrowUp, Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CATEGORY_COLORS, addDays, isCurrentPeriod, periodTitle, toIsoDay, type ScheduleApi, type ScheduleCategory, type ScheduleSection,
} from "@/hooks/useSchedule";
import { SchedulePeriodDialog, type PeriodDraft } from "./SchedulePeriodDialog";

interface Props {
  schedule: ScheduleApi;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Executa uma alteração mostrando o erro, se houver. */
async function attempt(op: () => Promise<unknown>, done?: string) {
  try {
    await op();
    if (done) toast.success(done);
  } catch (e) {
    toast.error((e as Error).message);
  }
}

/** Personalização do cronograma (ADM): seções, categorias com cor e períodos com os eventos. */
export function ScheduleManager({ schedule, open, onOpenChange }: Props) {
  const [period, setPeriod] = useState<PeriodDraft | null>(null);

  const newPeriod = () => {
    const last = schedule.periods[schedule.periods.length - 1];
    const start = last ? addDays(last.end_date, 1) : toIsoDay(new Date());
    setPeriod({ start_date: start, end_date: addDays(start, 6), label: "", theme: "", notes: "" });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Personalizar cronograma</DialogTitle>
            <DialogDescription>Monte as seções e categorias do jeito que a equipe usa e lance os eventos de cada período.</DialogDescription>
          </DialogHeader>
          <Tabs defaultValue={schedule.sections.length ? "periods" : "structure"}>
            <TabsList>
              <TabsTrigger value="structure">Estrutura</TabsTrigger>
              <TabsTrigger value="periods">Períodos ({schedule.periods.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="structure" className="space-y-4">
              {schedule.sections.map((s, i) => (
                <SectionEditor key={s.id} schedule={schedule} section={s} isFirst={i === 0} isLast={i === schedule.sections.length - 1} />
              ))}
              <NewNameForm placeholder="Nova seção (ex.: Cronograma de Eventos)" label="Adicionar seção" onAdd={(name) => attempt(() => schedule.saveSection({ name }))} />
            </TabsContent>

            <TabsContent value="periods" className="space-y-2">
              <div className="flex justify-end">
                <Button size="sm" className="gap-1" onClick={newPeriod}><Plus className="h-4 w-4" /> Novo período</Button>
              </div>
              {schedule.periods.length === 0 && <p className="text-sm text-muted-foreground">Nenhum período ainda.</p>}
              {[...schedule.periods].reverse().map((p) => {
                const count = Object.values(schedule.entriesByPeriod.get(p.id) ?? {}).reduce((n, l) => n + l.length, 0);
                return (
                  <div key={p.id} className={`flex flex-wrap items-center gap-2 rounded-md border p-2 text-sm ${isCurrentPeriod(p) ? "border-primary/50 bg-primary/5" : "border-border"}`}>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{periodTitle(p)}{p.theme && <span className="font-normal text-muted-foreground"> · {p.theme}</span>}</p>
                      <p className="text-xs text-muted-foreground">{count} evento(s){isCurrentPeriod(p) && " · período atual"}</p>
                    </div>
                    <Button size="icon" variant="ghost" title="Editar" onClick={() => setPeriod(p)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" title="Duplicar para o período seguinte" onClick={() => attempt(() => schedule.duplicatePeriod(p), "Período duplicado")}><Copy className="h-4 w-4" /></Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Excluir"
                      onClick={() => confirm(`Excluir o período ${periodTitle(p)} e os eventos dele?`) && attempt(() => schedule.deletePeriod(p.id), "Período excluído")}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
      <SchedulePeriodDialog schedule={schedule} period={period} onClose={() => setPeriod(null)} />
    </>
  );
}

function NewNameForm({ placeholder, label, onAdd }: { placeholder: string; label: string; onAdd: (name: string) => Promise<unknown> }) {
  const [name, setName] = useState("");
  const add = async () => {
    if (!name.trim()) return;
    await onAdd(name.trim());
    setName("");
  };
  return (
    <div className="flex gap-2">
      <Input placeholder={placeholder} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
      <Button variant="outline" className="shrink-0 gap-1" onClick={add} disabled={!name.trim()}><Plus className="h-4 w-4" /> {label}</Button>
    </div>
  );
}

function SectionEditor({ schedule, section, isFirst, isLast }: { schedule: ScheduleApi; section: ScheduleSection; isFirst: boolean; isLast: boolean }) {
  const [name, setName] = useState(section.name);
  const cats = schedule.categories.filter((c) => c.section_id === section.id);
  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <div className="flex items-center gap-1">
        <Input
          className="font-semibold"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name !== section.name && attempt(() => schedule.saveSection({ id: section.id, name: name.trim() }))}
        />
        <Button size="icon" variant="ghost" title="Subir seção" disabled={isFirst} onClick={() => attempt(() => schedule.moveSection(section.id, -1))}><ArrowUp className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" title="Descer seção" disabled={isLast} onClick={() => attempt(() => schedule.moveSection(section.id, 1))}><ArrowDown className="h-4 w-4" /></Button>
        <Button
          size="icon"
          variant="ghost"
          title="Excluir seção"
          onClick={() => confirm(`Excluir a seção "${section.name}" com as categorias e os eventos dela?`) && attempt(() => schedule.deleteSection(section.id), "Seção excluída")}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <div className="space-y-1 pl-2">
        {cats.map((c, i) => <CategoryRow key={c.id} schedule={schedule} category={c} isFirst={i === 0} isLast={i === cats.length - 1} />)}
        <NewNameForm
          placeholder="Nova categoria (ex.: Faça se Puder)"
          label="Adicionar categoria"
          onAdd={(n) => attempt(() => schedule.saveCategory({ section_id: section.id, name: n, color: CATEGORY_COLORS[cats.length % CATEGORY_COLORS.length] }))}
        />
      </div>
    </div>
  );
}

function CategoryRow({ schedule, category, isFirst, isLast }: { schedule: ScheduleApi; category: ScheduleCategory; isFirst: boolean; isLast: boolean }) {
  const [name, setName] = useState(category.name);
  const [color, setColor] = useState(category.color);
  const save = (patch: Partial<ScheduleCategory>) => attempt(() => schedule.saveCategory({ ...category, ...patch }));
  return (
    <div className="flex items-center gap-1">
      <input
        type="color"
        className="h-8 w-8 shrink-0 cursor-pointer rounded border border-border bg-transparent p-0.5"
        title="Cor da categoria"
        value={color}
        onChange={(e) => setColor(e.target.value)}
        onBlur={() => color !== category.color && save({ color })}
      />
      <Input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== category.name && save({ name: name.trim() })} />
      <Button size="icon" variant="ghost" title="Subir" disabled={isFirst} onClick={() => attempt(() => schedule.moveCategory(category.id, -1))}><ArrowUp className="h-4 w-4" /></Button>
      <Button size="icon" variant="ghost" title="Descer" disabled={isLast} onClick={() => attempt(() => schedule.moveCategory(category.id, 1))}><ArrowDown className="h-4 w-4" /></Button>
      <Button
        size="icon"
        variant="ghost"
        title="Excluir categoria"
        onClick={() => confirm(`Excluir a categoria "${category.name}" e os eventos dela?`) && attempt(() => schedule.deleteCategory(category.id), "Categoria excluída")}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
