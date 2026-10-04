import { useMemo, useState } from "react";
import { Package, Search } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useGameData, n } from "@/hooks/useGameData";
import type { ItemLookup } from "@/components/GameDataModal";

interface Props {
  open: boolean;
  onClose: () => void;
  lookup: ItemLookup;
}

export function FugurasModal({ open, onClose, lookup }: Props) {
  const { data, isLoading, error } = useGameData(["ClothPropertyTemplateInfo", "ClothGroupTemplateInfo"], open);
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();

  const sets = useMemo(() => {
    if (!data) return [];
    const pieces = new Map<string, string[]>();
    for (const g of data.ClothGroupTemplateInfo ?? []) {
      const k = `${g.ID}|${g.Sex}`;
      if (!pieces.has(k)) pieces.set(k, []);
      pieces.get(k)!.push(g.TemplateID);
    }
    return (data.ClothPropertyTemplateInfo ?? []).map((p) => ({ p, pieces: pieces.get(`${p.ID}|${p.Sex}`) ?? [] }));
  }, [data]);

  const filtered = sets.filter(({ p }) => !query || p.Name?.toLowerCase().includes(query) || p.ID?.includes(query));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl border-border bg-card p-4">
        <DialogTitle className="text-sm font-bold text-card-foreground">
          Fuguras ({filtered.length})
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
          <div className="mt-2 max-h-[65vh] space-y-2 overflow-y-auto pr-1">
            {filtered.map(({ p, pieces }) => (
              <div key={`${p.ID}-${p.Sex}`} className="rounded-lg border border-border p-2">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-card-foreground">{p.Name}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {p.Sex === "1" ? "Masculino" : "Feminino"} · {pieces.length} peças
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {(
                    [
                      ["Ataque", n(p.Attack)],
                      ["Defesa", n(p.Defend)],
                      ["Agilidade", n(p.Agility)],
                      ["Sorte", n(p.Luck)],
                      ["Vida", n(p.Blood)],
                      ["Dano", n(p.Damage)],
                      ["Armadura", n(p.Guard)],
                    ] as [string, number][]
                  )
                    .filter(([, v]) => v)
                    .map(([k, v]) => (
                      <span key={k} className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                        {k} +{v}
                      </span>
                    ))}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-4">
                  {pieces.map((id) => {
                    const it = lookup(id);
                    return (
                      <div key={id} className="flex items-center gap-2 rounded-md bg-secondary px-2 py-1" title={`ID ${id}`}>
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded bg-muted">
                          {it?.image ? (
                            <img src={it.image} alt="" loading="lazy" className="h-full w-full object-contain" />
                          ) : (
                            <Package className="h-4 w-4 text-muted-foreground/40" />
                          )}
                        </div>
                        <span className="truncate text-[11px] text-card-foreground">{it?.name ?? `ID ${id}`}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
