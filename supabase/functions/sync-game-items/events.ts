// deno-lint-ignore-file no-explicit-any
// Registro de entrada dos itens nos eventos (tabela item_event_entries). O jogo só lista os eventos
// configurados no momento (GmActivityInfo.xml) e a última versão de cada missão (QuestList.xml);
// a cada sincronização os prêmios encontrados são gravados, e o que já foi gravado fica.
import { GAME_BASE } from "../_shared/gameApi.ts";

export const ACTIVITY_SOURCE = `${GAME_BASE}GmActivityInfo.xml`;
export const QUEST_SOURCE = `${GAME_BASE}QuestList.xml`;

export interface EventEntryRow {
  item_id: number;
  entry_date: string;
  event_name: string;
  event_kind: string | null;
  source_key: string;
  /** Quanto custou para o jogador: itens da troca, andar da recarga/consumo ou preço na Venda de Munição. */
  cost: string | null;
}

/** Tipo da atividade (activityType/activityChildType) como aparece para a equipe. */
const KINDS: Record<string, string> = {
  "2/0": "Troca",
  "1/1": "Consumo",
  "0/6": "Recarga",
  "0/2": "Recarga com desconto",
  "61/0": "Mestre de Recarga",
  "12/0": "Ranking",
  "60/0": "Recarga contínua",
  "19/5": "Venda de Munição",
  "31/0": "Login",
  "25/0": "Oficina de Forja",
  "24/0": "Mapa do Tesouro",
  "101/1": "Casamento",
};

/** Moeda da Venda de Munição (condição 2): -1 Cupons, -8 L.Cupons (confere com a planilha do financeiro). */
const AMMO_CURRENCY: Record<string, string> = { "-1": "Cupons", "-8": "L.Cupons" };

const unescape = (s: string) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&apos;/g, "'").replace(/&amp;/g, "&");

const attrs = (s: string) => {
  const a: Record<string, string> = {};
  for (const x of s.matchAll(/(\w+)="([^"]*)"/g)) a[x[1]] = unescape(x[2]);
  return a;
};

const day = (v?: string) => (/^\d{4}-\d{2}-\d{2}/.test(v ?? "") ? v!.slice(0, 10) : null);

/** 120000 -> "120.000" */
const thousands = (v: string | number) => String(Math.round(Number(v))).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

/**
 * Custo de um prêmio pelo tipo da atividade e pelas condições do pacote dele (giftbag): itens
 * entregues na troca, valor mínimo do andar na recarga/consumo, valor por dia na recarga contínua e
 * preço na Venda de Munição. Nos outros tipos (login, missões...) não há custo.
 */
function rewardCost(kindKey: string, cond: Record<string, string>, given: string[]): string | null {
  if (kindKey === "2/0") return given.length ? given.join(" + ") : null;
  if (kindKey === "19/5") return Number(cond["3"]) ? `${thousands(cond["3"])} ${AMMO_CURRENCY[cond["2"]] ?? "Cupons"}` : null;
  if (kindKey === "0/6" || kindKey === "0/2" || kindKey === "1/1") return Number(cond["0"]) ? `${thousands(cond["0"])} cupons` : null;
  if (kindKey === "60/0") return Number(cond["2"]) ? `${thousands(cond["2"])} cupons por dia` : null;
  return null;
}

/**
 * Prêmios das atividades que ainda não terminaram (`today` = AAAA-MM-DD). Ficam de fora as
 * permanentes (até 2050) e as de teste do servidor; nas trocas, o item que o jogador entrega
 * (rewardType 0) não conta como prêmio, vira o custo.
 */
export function activityEntries(xml: string, today: string, names: Map<number, string> = new Map()): EventEntryRow[] {
  const out: EventEntryRow[] = [];
  for (const block of xml.matchAll(/<ActiveInfo>([\s\S]*?)<\/ActiveInfo>/g)) {
    const act = /<Activity\s([^<>]*?)\/?>/.exec(block[1]);
    if (!act) continue;
    const a = attrs(act[1]);
    const date = day(a.beginTime);
    const end = day(a.endTime) ?? "";
    if (!date || !a.activityId || end < today || end >= "2049" || /\btest\b/i.test(a.activityName ?? "")) continue;
    const kindKey = `${a.activityType}/${a.activityChildType}`;

    // Condições de cada pacote de prêmios e, nas trocas, os itens que o jogador entrega.
    const conds = new Map<string, Record<string, string>>();
    for (const c of block[1].matchAll(/<Condition\s([^<>]*?)\/>/g)) {
      const x = attrs(c[1]);
      conds.set(x.giftbagId, { ...(conds.get(x.giftbagId) ?? {}), [x.conditionIndex]: x.conditionValue });
    }
    const rewards = [...block[1].matchAll(/<Reward\s([^<>]*?)\/>/g)].map((r) => attrs(r[1]));
    const given = new Map<string, string[]>();
    if (kindKey === "2/0") {
      for (const x of rewards.filter((r) => r.rewardType === "0")) {
        const name = names.get(Number(x.templateId)) || (x.remain1 ?? "").trim() || `#${x.templateId}`;
        given.set(x.giftId, [...(given.get(x.giftId) ?? []), `${thousands(x.count || 1)}x ${name}`]);
      }
    }

    for (const x of rewards) {
      const id = Number(x.templateId);
      if (!(id > 0)) continue;
      if (kindKey === "2/0" && x.rewardType === "0") continue;
      out.push({
        item_id: id,
        entry_date: date,
        event_name: (a.activityName ?? "").trim() || "Atividade sem nome",
        event_kind: KINDS[kindKey] ?? null,
        source_key: `act:${a.activityId}:${a.beginTime}`,
        cost: rewardCost(kindKey, conds.get(x.giftId) ?? {}, given.get(x.giftId) ?? []),
      });
    }
  }
  return out;
}

/**
 * Prêmios das missões de evento que ainda não terminaram. As permanentes (até 2050) ficam de fora, e
 * as que já acabaram também: o arquivo guarda a última versão de missões antigas, de anos atrás.
 */
export function questEntries(xml: string, today: string): EventEntryRow[] {
  const out: EventEntryRow[] = [];
  for (const m of xml.matchAll(/<Item\s([^<>]*?)>([\s\S]*?)<\/Item>/g)) {
    const a = attrs(m[1]);
    const date = day(a.StartDate);
    const end = day(a.EndDate) ?? "";
    if (!date || end < today || end >= "2049") continue;
    for (const g of m[2].matchAll(/<Item_Good\s([^<>]*?)\/>/g)) {
      const id = Number(attrs(g[1]).RewardItemID);
      if (!(id > 0)) continue;
      out.push({
        item_id: id,
        entry_date: date,
        event_name: (a.Title ?? "").trim() || `Missão ${a.ID}`,
        event_kind: "Missão",
        source_key: `quest:${a.ID}:${a.StartDate}`,
        cost: null,
      });
    }
  }
  return out;
}

/**
 * Uma linha por item e evento. Quando o item sai mais de uma vez no mesmo evento (vários andares ou
 * opções de troca), os custos diferentes ficam juntos, separados por " / ".
 */
export function mergeEntries(rows: EventEntryRow[]): EventEntryRow[] {
  const out = new Map<string, EventEntryRow>();
  for (const r of rows) {
    const key = `${r.item_id}|${r.source_key}`;
    const cur = out.get(key);
    if (!cur) out.set(key, { ...r });
    else if (r.cost && !(cur.cost ?? "").split(" / ").includes(r.cost)) cur.cost = cur.cost ? `${cur.cost} / ${r.cost}` : r.cost;
  }
  // Do menor para o maior valor (andares e quantidades).
  const lead = (s: string) => Number(/^[\d.]+/.exec(s)?.[0].replace(/\./g, "") ?? 0);
  for (const r of out.values()) if (r.cost?.includes(" / ")) r.cost = r.cost.split(" / ").sort((a, b) => lead(a) - lead(b)).join(" / ");
  return [...out.values()];
}

/** Grava as entradas; as já gravadas são atualizadas com os dados atuais do evento (inclusive o custo). */
export async function syncEventEntries(admin: any, rows: EventEntryRow[]) {
  const unique = mergeEntries(rows);
  for (let i = 0; i < unique.length; i += 1000) {
    const { error } = await admin.from("item_event_entries")
      .upsert(unique.slice(i, i + 1000), { onConflict: "item_id,source_key" });
    if (error) throw error;
  }
  return { entries: unique.length };
}
