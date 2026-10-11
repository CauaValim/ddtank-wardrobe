import { useEffect, useState } from "react";
import { CheckSquare } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { sectionsFor } from "@/lib/itemDetail";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Categorias que existem nos itens carregados. */
  categories: string[];
  selected: Set<string>;
  onApply: (next: Set<string>) => void;
  /** Modo seleção: atalho para selecionar todos os itens da categoria. */
  onSelectAllOf?: (category: string) => void;
}

/** Filtro de categorias em seções, com várias categorias marcadas ao mesmo tempo (como no outro painel). */
export function CategoryFilterDialog({ open, onOpenChange, categories, selected, onApply, onSelectAllOf }: Props) {
  const [draft, setDraft] = useState<Set<string>>(new Set(selected));
  useEffect(() => {
    if (open) setDraft(new Set(selected));
  }, [open, selected]);

  const toggle = (c: string) => setDraft((prev) => {
    const next = new Set(prev);
    if (next.has(c)) next.delete(c);
    else next.add(c);
    return next;
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Categorias</DialogTitle>
          <DialogDescription>Marque uma ou mais categorias. Sem nenhuma marcada, a lista mostra todas.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {sectionsFor(categories).map((section) => (
            <section key={section.label} className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-primary">
                {section.icon} {section.label} <span className="font-normal text-muted-foreground">({section.categories.length})</span>
              </h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {section.categories.map((c) => {
                  const on = draft.has(c);
                  return (
                    <div key={c} className="flex items-stretch gap-1">
                      <button
                        type="button"
                        onClick={() => toggle(c)}
                        aria-pressed={on}
                        className={`flex-1 truncate rounded-md border px-2 py-2 text-left text-xs font-medium transition-colors ${
                          on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-secondary text-secondary-foreground hover:bg-muted"
                        }`}
                        title={c}
                      >
                        {c}
                      </button>
                      {onSelectAllOf && (
                        <button
                          type="button"
                          onClick={() => onSelectAllOf(c)}
                          className="rounded-md border border-border px-1.5 text-muted-foreground hover:bg-muted hover:text-primary"
                          title={`Selecionar todos os itens de "${c}"`}
                        >
                          <CheckSquare className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={() => setDraft(new Set())} disabled={draft.size === 0}>Limpar</Button>
          <Button onClick={() => { onApply(draft); onOpenChange(false); }}>
            Concluir seleção{draft.size ? ` (${draft.size})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
