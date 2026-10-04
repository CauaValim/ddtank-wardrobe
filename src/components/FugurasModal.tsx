import { useState } from "react";
import { Search } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useGameData, n } from "@/hooks/useGameData";
import type { ItemLookup } from "@/components/GameDataModal";

interface Props {
  open: boolean;
  onClose: () => void;
  lookup: ItemLookup;
}

export function FugurasModal({ open, onClose, lookup }: Props) {
  const { data, isLoading, error } = useGameData(["MountDrawTemplate"], open);
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();

  const fuguras = (data?.MountDrawTemplate ?? []).filter(
    (m) => !query || m.Name?.toLowerCase().includes(query) || m.TemplateId?.includes(query)
  );

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl border-border bg-card p-4">
        <DialogTitle className="text-sm font-bold text-card-foreground">
          Fuguras ({fuguras.length})
        </DialogTitle>
        <div className="relative">
          <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Pesquisar fugura..."
            className="w-full rounded-md border border-border bg-secondary py-1.5 pl-7 pr-2 text-xs text-card-foreground outline-none"
          />
        </div>
        {isLoading && <p className="py-8 text-center text-xs text-muted-foreground">Carregando fuguras...</p>}
        {error && <p className="py-8 text-center text-xs text-destructive">Erro: {(error as Error).message}</p>}
        {data && (
          <div className="mt-2 grid max-h-[65vh] grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
            {fuguras.map((m) => {
              const it = lookup(m.TemplateId);
              const stats: [string, number][] = [
                ["Dano", n(m.AddHurt)],
                ["Armadura", n(m.AddGuard)],
                ["Ataque Mágico", n(m.MagicAttack)],
                ["Resistência Mágica", n(m.MagicDefence)],
                ["Vida", n(m.AddBlood)],
              ];
              return (
                <div key={m.ID} className="space-y-1 rounded-lg border border-border p-2">
                  <div className="flex items-center gap-2 rounded-md bg-secondary px-2 py-1" title={`ID ${m.TemplateId}`}>
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded bg-muted">
                      {it?.image ? (
                        <img src={it.image} alt="" loading="lazy" className="h-full w-full object-contain" />
                      ) : (
                        <span className="text-[9px] text-muted-foreground/40">?</span>
                      )}
                    </div>
                    <span className="truncate text-[11px] font-semibold text-card-foreground">
                      {m.Name || it?.name || `ID ${m.TemplateId}`}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {stats.filter(([, v]) => v).map(([k, v]) => (
                      <span key={k} className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                        {k} +{v}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
