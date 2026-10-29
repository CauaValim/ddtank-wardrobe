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

/**
 * Prêmios das atividades que ainda não terminaram (`today` = AAAA-MM-DD). Ficam de fora as
 * permanentes (até 2050) e as de teste do servidor; nas trocas, o item que o jogador entrega
 * (rewardType 0) não conta.
 */
export function activityEntries(xml: string, today: string): EventEntryRow[] {
  const out: EventEntryRow[] = [];
  for (const block of xml.matchAll(/<ActiveInfo>([\s\S]*?)<\/ActiveInfo>/g)) {
    const act = /<Activity\s([^<>]*?)\/?>/.exec(block[1]);
    if (!act) continue;
    const a = attrs(act[1]);
    const date = day(a.beginTime);
    const end = day(a.endTime) ?? "";
    if (!date || !a.activityId || end < today || end >= "2049" || /\btest\b/i.test(a.activityName ?? "")) continue;
    const kindKey = `${a.activityType}/${a.activityChildType}`;
    for (const r of block[1].matchAll(/<Reward\s([^<>]*?)\/>/g)) {
      const x = attrs(r[1]);
      const id = Number(x.templateId);
      if (!(id > 0)) continue;
      if (kindKey === "2/0" && x.rewardType === "0") continue;
      out.push({
        item_id: id,
        entry_date: date,
        event_name: (a.activityName ?? "").trim() || "Atividade sem nome",
        event_kind: KINDS[kindKey] ?? null,
        source_key: `act:${a.activityId}:${a.beginTime}`,
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
      });
    }
  }
  return out;
}

/** Grava as entradas novas; as que já estão no registro ficam como foram gravadas na primeira vez. */
export async function syncEventEntries(admin: any, rows: EventEntryRow[]) {
  const unique = [...new Map(rows.map((r) => [`${r.item_id}|${r.source_key}`, r])).values()];
  for (let i = 0; i < unique.length; i += 1000) {
    const { error } = await admin.from("item_event_entries")
      .upsert(unique.slice(i, i + 1000), { onConflict: "item_id,source_key", ignoreDuplicates: true });
    if (error) throw error;
  }
  return { entries: unique.length };
}
