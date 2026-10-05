import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { LAYOUT_GROUPS, capacitySummary, manifest } from "@/lib/eventTemplate/model";
import type { LayoutSpec } from "@/lib/eventTemplate/types";

export function LayoutPicker({ onPick }: { onPick: (layout: LayoutSpec) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-1"><Plus className="h-4 w-4" /> Adicionar seção</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Escolha o layout da seção</DialogTitle>
          <DialogDescription>Cada layout é uma aba do modelo oficial. A capacidade mostra quantos blocos e itens cabem nela.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {LAYOUT_GROUPS.map((group) => {
            const layouts = manifest.layouts.filter((l) => l.type === group.type);
            if (layouts.length === 0) return null;
            return (
              <section key={group.type} className="space-y-1.5">
                <h3 className="text-sm font-semibold">{group.label}</h3>
                {layouts.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => { onPick(l); setOpen(false); }}
                    className="w-full rounded-md border border-border px-3 py-2 text-left hover:border-primary hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="text-sm font-medium">{l.label}</span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{capacitySummary(l)}</span>
                    </span>
                    <span className="block text-xs text-muted-foreground">{l.description}</span>
                  </button>
                ))}
              </section>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
