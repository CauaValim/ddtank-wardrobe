import { useState } from "react";
import { Package, Search } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useGameData, n } from "@/hooks/useGameData";
import type { ItemLookup } from "@/components/GameDataModal";

interface Props {
  open: boolean;
  onClose: () => void;
  lookup: ItemLookup;
}

const STATS: [string, string, string][] = [
  ["Ataque", "AddAttack", "AttackRate"],
  ["Defesa", "AddDefend", "DefendRate"],
  ["Agilidade", "AddAgility", "AgilityRate"],
  ["Sorte", "AddLucky", "LuckyRate"],
  ["Dano", "AddDamage", "DamageRate"],
  ["Armadura", "AddGuard", "GuardRate"],
];

export function CardsInfoModal({ open, onClose, lookup }: Props) {
  const { data, isLoading, error } = useGameData(["CardTemplateInfo", "CardBuffList"], open);
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();

  const cards = (data?.CardTemplateInfo ?? []).filter((c) => {
    if (!query) return true;
    return c.CardID.includes(query) || (lookup(c.CardID)?.name ?? "").toLowerCase().includes(query);
  });
  const buffs = (data?.CardBuffList ?? []).filter((b) => !query || b.Description?.toLowerCase().includes(query));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl border-border bg-card p-4">
        <DialogTitle className="text-sm font-bold text-card-foreground">Cards info</DialogTitle>
        <div className="relative">
          <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pesquisar carta ou efeito..." className="w-full rounded-md border border-border bg-secondary py-1.5 pl-7 pr-2 text-xs text-card-foreground outline-none" />
        </div>
        {isLoading && <p className="py-8 text-center text-xs text-muted-foreground">Carregando cartas...</p>}
        {error && <p className="py-8 text-center text-xs text-destructive">Erro: {(error as Error).message}</p>}
        {data && (
          <Tabs defaultValue="cards">
            <TabsList>
              <TabsTrigger value="cards">Cartas ({cards.length})</TabsTrigger>
              <TabsTrigger value="buffs">Efeitos de conjunto ({buffs.length})</TabsTrigger>
            </TabsList>
            <div className="mt-2 max-h-[65vh] overflow-y-auto pr-1">
              <TabsContent value="cards" className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {cards.map((c, i) => {
                  const it = lookup(c.CardID);
                  const stats = STATS.map(([label, add, rate]) => ({ label, add: n(c[add]), rate: n(c[rate]) })).filter((s) => s.add || s.rate > 1);
                  return (
                    <div key={`${c.CardID}-${i}`} className="flex gap-2 rounded-lg border border-border p-2">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded bg-secondary">
                        {it?.image ? <img src={it.image} alt="" loading="lazy" className="h-full w-full object-contain" /> : <Package className="h-5 w-5 text-muted-foreground/40" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-bold text-card-foreground">{it?.name ?? `Carta ${c.CardID}`}</p>
                        <p className="text-[10px] text-muted-foreground">ID {c.CardID} · Tipo {c.CardType}</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {stats.length === 0 && <span className="text-[10px] text-muted-foreground">Sem atributos</span>}
                          {stats.map((s) => (
                            <span key={s.label} className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                              {s.label} {s.add ? `+${s.add}` : ""}{s.rate > 1 ? ` x${s.rate}` : ""}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </TabsContent>
              <TabsContent value="buffs" className="space-y-2">
                {buffs.map((b, i) => {
                  const vals = (b.value ?? "").split("|");
                  return (
                    <div key={i} className="rounded-lg border border-border p-2">
                      <p className="text-xs text-card-foreground">{b.Description?.replace("{0}", vals[0] ?? "")}</p>
                      <p className="text-[10px] text-muted-foreground">Por nível: {vals.join(" / ")} · Condição {b.condition}</p>
                    </div>
                  );
                })}
              </TabsContent>
            </div>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
