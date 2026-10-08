import { useState } from "react";
import { BookmarkPlus, ListChecks } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { applyPreset, presetFromBlock, type EventPreset, type PresetData } from "@/lib/eventTemplate/presets";
import type { BlockSpec, EventBlock } from "@/lib/eventTemplate/types";

export interface PresetApi {
  list: EventPreset[];
  canSave: boolean;
  save: (name: string, data: PresetData) => Promise<boolean>;
}

/** Aplicar uma pré-definição na missão, ou salvar a missão como pré-definição (permissão "Editar pré-definições"). */
export function PresetControls({ api, spec, block, onChange }: { api: PresetApi; spec: BlockSpec; block: EventBlock; onChange: (b: EventBlock) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const term = q.trim().toLowerCase();
  const shown = api.list.filter((p) => !term || p.name.toLowerCase().includes(term) || (p.data.fields.titlePt ?? "").toLowerCase().includes(term));

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" size="sm" variant="outline" className="h-7 gap-1"><ListChecks className="h-3.5 w-3.5" /> Pré-definição</Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-2" align="end">
          <Input autoFocus placeholder="Buscar pré-definição..." value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="mt-2 max-h-64 space-y-1 overflow-y-auto">
            {shown.map((p) => {
              const count = Object.values(p.data.groups).reduce((n, items) => n + items.length, 0);
              return (
                <button
                  key={p.id}
                  type="button"
                  className="w-full rounded px-2 py-1 text-left text-sm hover:bg-muted"
                  onClick={() => {
                    const { block: next, dropped } = applyPreset(spec, block, p.data);
                    onChange(next);
                    setOpen(false);
                    if (dropped > 0) toast.warning(`"${p.name}" aplicada; ${dropped} item(ns) não couberam nesta aba`);
                    else toast.success(`"${p.name}" aplicada`);
                  }}
                >
                  <span className="block truncate font-medium">{p.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{p.data.fields.titlePt || p.data.fields.titleEn || "Sem título"} · {count} item(ns)</span>
                </button>
              );
            })}
            {shown.length === 0 && <p className="p-2 text-xs text-muted-foreground">Nenhuma pré-definição{term ? " encontrada" : " ainda"}.</p>}
          </div>
        </PopoverContent>
      </Popover>
      {api.canSave && (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          title="Salvar esta missão como pré-definição"
          onClick={async () => {
            const name = window.prompt("Nome da pré-definição", block.fields.titlePt || "");
            if (!name?.trim()) return;
            await api.save(name, presetFromBlock(block));
          }}
        >
          <BookmarkPlus className="h-4 w-4" />
        </Button>
      )}
    </>
  );
}
