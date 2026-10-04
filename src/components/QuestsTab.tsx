import { useMemo, useState } from "react";
import { ChevronDown, Package } from "lucide-react";
import { n, type GameRow } from "@/hooks/useGameData";
import type { ItemLookup } from "@/components/GameDataModal";

const CATEGORIES: Record<string, string> = {
  "0": "Principal",
  "1": "Secundária",
  "2": "Diária",
  "3": "Evento",
  "6": "Troca / Síntese",
  "7": "Veteranos",
  "10": "Caça ao Tesouro",
  "11": "Evolução",
  "12": "Caçador de Prêmios",
  "13": "Objetivo Básico",
  "24": "Recarga",
  "25": "Batalha de Casal",
  "66": "Encantamento",
  "504": "Missão Prática",
  "4001": "Consumo / Casamento",
};

const COND_TYPES: Record<string, string> = {
  "3": "Fortalecer equipamento",
  "5": "Derrotar jogadores",
  "6": "Compor equipamento",
  "13": "Alcançar nível",
  "15": "Concluir batalhas",
  "16": "Vencer batalhas",
  "21": "Concluir fase/instância",
  "23": "Derrotar monstro",
  "24": "Usar item",
  "26": "Ringue / duelo",
  "30": "Entregar item",
  "31": "Gastar cupons no shop",
};

const PAGE = 60;
const catLabel = (c: string) => CATEGORIES[c] ?? `Outra (${c})`;
const parse = <T,>(s?: string): T[] => {
  try {
    return s ? JSON.parse(s) : [];
  } catch {
    return [];
  }
};

interface Cond { t: string; ty: string; p1: string; p2: string }
interface Good { id: string; c: string; v: string; s: string }

export function QuestsTab({ quests, query, lookup }: { quests: GameRow[]; query: string; lookup: ItemLookup }) {
  const [cat, setCat] = useState("all");
  const [repeat, setRepeat] = useState("all");
  const [limit, setLimit] = useState(PAGE);
  const [openId, setOpenId] = useState<string | null>(null);

  const cats = useMemo(() => {
    const m = new Map<string, number>();
    for (const q of quests) m.set(q.QuestID, (m.get(q.QuestID) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [quests]);

  const filtered = useMemo(
    () =>
      quests.filter((q) => {
        if (cat !== "all" && q.QuestID !== cat) return false;
        if (repeat !== "all" && (q.CanRepeat === "true") !== (repeat === "yes")) return false;
        if (!query) return true;
        return q.ID === query || q.Title?.toLowerCase().includes(query) || q.Detail?.toLowerCase().includes(query);
      }),
    [quests, cat, repeat, query],
  );

  const select = "rounded-md border border-border bg-secondary px-2 py-1 text-xs text-card-foreground outline-none";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <select value={cat} onChange={(e) => { setCat(e.target.value); setLimit(PAGE); }} className={select}>
          <option value="all">Todas as categorias ({quests.length})</option>
          {cats.map(([c, count]) => (
            <option key={c} value={c}>{catLabel(c)} ({count})</option>
          ))}
        </select>
        <select value={repeat} onChange={(e) => { setRepeat(e.target.value); setLimit(PAGE); }} className={select}>
          <option value="all">Repetível: todas</option>
          <option value="yes">Repetíveis</option>
          <option value="no">Únicas</option>
        </select>
        <span className="text-[11px] text-muted-foreground">{filtered.length} missões</span>
      </div>

      {filtered.slice(0, limit).map((q, i) => {
        const key = `${q.ID}-${i}`;
        const open = openId === key;
        const conds = open ? parse<Cond>(q.Conds) : [];
        const goods = open ? parse<Good>(q.Goods) : [];
        const rewards: [string, number][] = [["EXP", n(q.RewardGP)], ["Ouro", n(q.RewardGold)], ["Cupons vinc.", n(q.RewardBindMoney)], ["Honra", n(q.RewardOffer)], ["Riqueza", n(q.RewardRiches)]];
        return (
          <div key={key} className="rounded-lg border border-border">
            <button onClick={() => setOpenId(open ? null : key)} className="flex w-full items-center gap-2 p-2 text-left">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-card-foreground">{q.Title || `Missão ${q.ID}`}</p>
                <p className="text-[10px] text-muted-foreground">
                  ID {q.ID} · {catLabel(q.QuestID)} · Nv {q.NeedMinLevel}–{q.NeedMaxLevel} · {q.CanRepeat === "true" ? `Repetível (${q.RepeatInterval}d)` : "Única"}
                </p>
              </div>
              <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
            {open && (
              <div className="space-y-2 border-t border-border p-2">
                {q.Detail && <p className="text-[11px] text-muted-foreground">{q.Detail}</p>}
                <div className="flex flex-wrap gap-1">
                  {rewards.filter(([, v]) => v).map(([k, v]) => (
                    <span key={k} className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">{k} +{v.toLocaleString("pt-BR")}</span>
                  ))}
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-card-foreground">Condições</p>
                  {conds.length === 0 && <p className="text-[10px] text-muted-foreground">Sem condições cadastradas</p>}
                  {conds.map((c, j) => (
                    <p key={j} className="text-[10px] text-muted-foreground">
                      • {c.t || COND_TYPES[c.ty] || `Tipo ${c.ty}`} <span className="opacity-70">(tipo {c.ty}{COND_TYPES[c.ty] ? ` – ${COND_TYPES[c.ty]}` : ""} · Para1 {c.p1} · Para2 {c.p2})</span>
                    </p>
                  ))}
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-card-foreground">Itens de recompensa</p>
                  {goods.length === 0 && <p className="text-[10px] text-muted-foreground">Nenhum item</p>}
                  <div className="mt-1 grid grid-cols-1 gap-1 sm:grid-cols-2">
                    {goods.map((g, j) => {
                      const it = lookup(g.id);
                      return (
                        <div key={j} className="flex items-center gap-2 rounded-md bg-secondary px-2 py-1">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded bg-muted">
                            {it?.image ? <img src={it.image} alt="" loading="lazy" className="h-full w-full object-contain" /> : <Package className="h-4 w-4 text-muted-foreground/40" />}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-[11px] text-card-foreground">{it?.name ?? `ID ${g.id}`} x{g.c}{g.s !== "0" ? ` (+${g.s})` : ""}</p>
                            <p className="text-[10px] text-muted-foreground">ID {g.id} · {g.v === "0" ? "Permanente" : `${g.v} dias`}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                {(q.PreQuestID?.replace(/[,0]/g, "") || q.NextQuestID?.replace(/[,0]/g, "")) && (
                  <p className="text-[10px] text-muted-foreground">Anterior: {q.PreQuestID?.replace(/,$/, "") || "—"} · Próxima: {q.NextQuestID?.replace(/,$/, "") || "—"}</p>
                )}
              </div>
            )}
          </div>
        );
      })}
      {filtered.length > limit && (
        <button onClick={() => setLimit((l) => l + PAGE)} className="w-full rounded-md border border-border py-1.5 text-xs text-card-foreground hover:bg-secondary">
          Carregar mais ({filtered.length - limit} restantes)
        </button>
      )}
    </div>
  );
}
