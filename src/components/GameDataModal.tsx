import { useMemo, useState } from "react";
import { Package, Search } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useGameData, n, type GameRow } from "@/hooks/useGameData";
import { QuestsTab } from "@/components/QuestsTab";

export interface ItemLookup {
  (id: string): { name: string; image: string } | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  lookup: ItemLookup;
}

function Thumb({ id, lookup }: { id: string; lookup: ItemLookup }) {
  const it = lookup(id);
  return (
    <div className="flex items-center gap-2 rounded-md bg-secondary px-2 py-1" title={`ID ${id}`}>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded bg-muted">
        {it?.image ? <img src={it.image} alt="" loading="lazy" className="h-full w-full object-contain" /> : <Package className="h-4 w-4 text-muted-foreground/40" />}
      </div>
      <span className="truncate text-[11px] text-card-foreground">{it?.name ?? `ID ${id}`}</span>
    </div>
  );
}

function Stats({ items }: { items: [string, number][] }) {
  const shown = items.filter(([, v]) => v);
  if (!shown.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map(([k, v]) => (
        <span key={k} className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
          {k} +{v}
        </span>
      ))}
    </div>
  );
}

const match = (q: string, ...vals: (string | undefined)[]) => !q || vals.some((v) => v?.toLowerCase().includes(q));

const CARD_STATS: [string, string, string][] = [
  ["Ataque", "AddAttack", "AttackRate"],
  ["Defesa", "AddDefend", "DefendRate"],
  ["Agilidade", "AddAgility", "AgilityRate"],
  ["Sorte", "AddLucky", "LuckyRate"],
  ["Dano", "AddDamage", "DamageRate"],
  ["Armadura", "AddGuard", "GuardRate"],
];

const FILES = [
  "NewTitleInfo",
  "RuneTemplateList",
  "MagicStoneTemplate",
  "CardTemplateInfo",
  "CardBuffList",
  "QuestList",
] as const;

export function GameDataModal({ open, onClose, lookup }: Props) {
  const { data, isLoading, error } = useGameData([...FILES], open);
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();

  const stones = useMemo(() => {
    const m = new Map<string, GameRow[]>();
    for (const s of data?.MagicStoneTemplate ?? []) {
      if (!m.has(s.TemplateID)) m.set(s.TemplateID, []);
      m.get(s.TemplateID)!.push(s);
    }
    return [...m.entries()];
  }, [data]);

  const cards = useMemo(() => {
    return (data?.CardTemplateInfo ?? []).filter((c) => {
      if (!query) return true;
      return c.CardID.includes(query) || (lookup(c.CardID)?.name ?? "").toLowerCase().includes(query);
    });
  }, [data, query, lookup]);

  const buffs = useMemo(() => {
    return (data?.CardBuffList ?? []).filter((b) => !query || b.Description?.toLowerCase().includes(query));
  }, [data, query]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl border-border bg-card p-4">
        <DialogTitle className="text-sm font-bold text-card-foreground">Dados do Jogo</DialogTitle>
        <div className="relative">
          <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pesquisar..." className="w-full rounded-md border border-border bg-secondary py-1.5 pl-7 pr-2 text-xs text-card-foreground outline-none" />
        </div>
        {isLoading && <p className="py-8 text-center text-xs text-muted-foreground">Carregando dados do jogo...</p>}
        {error && <p className="py-8 text-center text-xs text-destructive">Erro: {(error as Error).message}</p>}
        {data && (
          <Tabs defaultValue="cards">
            <TabsList className="flex-wrap">
              <TabsTrigger value="cards">Cartas ({cards.length})</TabsTrigger>
              <TabsTrigger value="buffs">Efeitos de Cartas ({buffs.length})</TabsTrigger>
              <TabsTrigger value="titles">Títulos ({data.NewTitleInfo?.length ?? 0})</TabsTrigger>
              <TabsTrigger value="runes">Runas ({data.RuneTemplateList?.length ?? 0})</TabsTrigger>
              <TabsTrigger value="stones">Pedras Mágicas ({stones.length})</TabsTrigger>
              <TabsTrigger value="quests">Missões ({data.QuestList?.length ?? 0})</TabsTrigger>
            </TabsList>
            <div className="mt-2 max-h-[65vh] overflow-y-auto pr-1">
              <TabsContent value="quests">
                <QuestsTab quests={data.QuestList ?? []} query={query} lookup={lookup} />
              </TabsContent>
              <TabsContent value="cards" className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {cards.map((c, i) => {
                  const it = lookup(c.CardID);
                  const stats = CARD_STATS.map(([label, add, rate]) => ({ label, add: n(c[add]), rate: n(c[rate]) })).filter((s) => s.add || s.rate > 1);
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
              <TabsContent value="titles" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {(data.NewTitleInfo ?? []).filter((t) => match(query, t.Name, t.Desc)).map((t) => (
                  <div key={t.ID} className="space-y-1 rounded-lg border border-border p-2">
                    <p className="text-xs font-bold text-card-foreground">{t.Name}</p>
                    {t.Desc && <p className="text-[10px] text-muted-foreground">{t.Desc}</p>}
                    <Stats items={[["Ataque", n(t.Att)], ["Defesa", n(t.Def)], ["Agilidade", n(t.Agi)], ["Sorte", n(t.Luck)]]} />
                  </div>
                ))}
              </TabsContent>
              <TabsContent value="runes" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {(data.RuneTemplateList ?? []).filter((r) => match(query, r.Name, r.TemplateID)).map((r) => (
                  <div key={r.TemplateID} className="space-y-1 rounded-lg border border-border p-2">
                    <Thumb id={r.TemplateID} lookup={lookup} />
                    <p className="text-[10px] text-muted-foreground">
                      {r.Name} · Nível {r.BaseLevel}–{r.MaxLevel}
                      {[1, 2, 3].map((i) => (r[`Type${i}`] && r[`Type${i}`] !== "0" ? ` · Atributo ${i}: ${r[`Attribute${i}`]}` : "")).join("")}
                    </p>
                  </div>
                ))}
              </TabsContent>
              <TabsContent value="stones" className="space-y-2">
                {stones.filter(([id]) => match(query, id, lookup(id)?.name)).map(([id, levels]) => (
                  <div key={id} className="space-y-1 rounded-lg border border-border p-2">
                    <Thumb id={id} lookup={lookup} />
                    <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                      {levels.map((l) => (
                        <div key={l.Level} className="flex items-center gap-2">
                          <span className="w-10 text-[10px] text-muted-foreground">Nv {l.Level}</span>
                          <Stats items={[["Ataque", n(l.Attack)], ["Defesa", n(l.Defence)], ["Agilidade", n(l.Agility)], ["Sorte", n(l.Luck)], ["Atq. Mág.", n(l.MagicAttack)], ["Res. Mág.", n(l.MagicDefence)]]} />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </TabsContent>
            </div>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
