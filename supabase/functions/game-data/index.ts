import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { GAME_BASE } from "../_shared/gameApi.ts";

const BASE = GAME_BASE;
const ALLOWED = new Set([
  "ClothPropertyTemplateInfo",
  "ClothGroupTemplateInfo",
  "MountDrawTemplate",
  "CardTemplateInfo",
  "CardBuffList",
  "NewTitleInfo",
  "PetTemplateInfo",
  "PetSkillInfo",
  "RuneTemplateList",
  "MagicStoneTemplate",
  "TemplateAllList",
  "SuitTemplateInfoList",
  "SuitPartEquipInfoList",
  "QuestList",
  "ShopItemList",
]);

/** Campos da loja usados no painel (aba Renovação): o arquivo inteiro tem 37 campos por linha. */
const SHOP_KEYS = ["TemplateID", "ShopID", "BuyType", "IsBind", "AUnit", "APrice1", "AValue1", "BUnit", "BPrice1", "BValue1", "CUnit", "CPrice1", "CValue1"];
const TTL = 10 * 60 * 1000;
const cache = new Map<string, { at: number; rows: Record<string, string>[] }>();

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

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

const QUEST_KEYS = ["ID", "QuestID", "Title", "Detail", "Objective", "NeedMinLevel", "NeedMaxLevel", "PreQuestID", "NextQuestID", "CanRepeat", "RepeatInterval", "RewardGP", "RewardGold", "RewardBindMoney", "RewardOffer", "RewardRiches", "TimeMode", "StartDate", "EndDate"];

/** QuestList nests conditions and rewards inside each quest; flatten them into JSON fields. */
function parseQuests(xml: string) {
  const out: Record<string, string>[] = [];
  for (const m of xml.matchAll(/<Item\s([^<>]*?)>([\s\S]*?)<\/Item>/g)) {
    const a = attrs(m[1]);
    const q: Record<string, string> = {};
    for (const k of QUEST_KEYS) if (a[k]) q[k] = a[k];
    const conds = [...m[2].matchAll(/<Item_Condiction\s([^<>]*?)\/>/g)].map((c) => {
      const x = attrs(c[1]);
      return { t: x.CondictionTitle ?? "", ty: x.CondictionType ?? "", p1: x.Para1 ?? "", p2: x.Para2 ?? "" };
    });
    const goods = [...m[2].matchAll(/<Item_Good\s([^<>]*?)\/>/g)].map((g) => {
      const x = attrs(g[1]);
      return { id: x.RewardItemID ?? "", c: x.RewardItemCount1 ?? "1", v: x.RewardItemValid ?? "0", s: x.StrengthenLevel ?? "0" };
    });
    q.Conds = JSON.stringify(conds);
    q.Goods = JSON.stringify(goods);
    out.push(q);
  }
  return out;
}


let namesCache: { at: number; names: Map<string, string> } | null = null;

/** Nome de todos os itens do jogo (inclusive moedas, com ID negativo). */
async function itemNames(): Promise<Map<string, string>> {
  if (namesCache && Date.now() - namesCache.at < TTL) return namesCache.names;
  const resp = await fetch(`${BASE}TemplateAllList.xml`, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!resp.ok) throw new Error(`Jogo respondeu HTTP ${resp.status}`);
  const buf = new Uint8Array(await resp.arrayBuffer());
  const xml = buf[0] === 0x3c || buf[0] === 0xef
    ? new TextDecoder().decode(buf)
    : await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream("deflate"))).text();
  const names = new Map<string, string>();
  for (const m of xml.matchAll(/<Item\s([^<>]*?)\/>/g)) {
    const id = /TemplateID="(-?\d+)"/.exec(m[1])?.[1];
    const name = /Name="([^"]*)"/.exec(m[1])?.[1];
    if (id && name) names.set(id, unescape(name));
  }
  namesCache = { at: Date.now(), names };
  return names;
}

async function load(file: string) {
  const hit = cache.get(file);
  if (hit && Date.now() - hit.at < TTL) return hit.rows;
  const resp = await fetch(`${BASE}${file}.xml`, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!resp.ok) throw new Error(`Jogo respondeu HTTP ${resp.status}`);
  const buf = new Uint8Array(await resp.arrayBuffer());
  let xml: string;
  if (buf[0] === 0x3c || buf[0] === 0xef) xml = new TextDecoder().decode(buf);
  else xml = await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream("deflate"))).text();
  if (file === "ShopItemList") {
    const names = await itemNames();
    const shop = [...xml.matchAll(/<Item\s([^<>]*?)\/>/g)].map((m) => {
      const a = attrs(m[1]);
      const row: Record<string, string> = {};
      for (const k of SHOP_KEYS) if (a[k] != null) row[k] = a[k];
      // Preço cobrado em outro item (ex.: Moeda da Mansão): manda o nome junto.
      for (const p of ["APrice1", "BPrice1", "CPrice1"]) {
        const id = Number(a[p]);
        if (id && (id > 0 || id <= -100) && names.has(a[p])) row[`${p}Name`] = names.get(a[p])!;
      }
      return row;
    });
    cache.set(file, { at: Date.now(), rows: shop });
    return shop;
  }
  if (file === "QuestList") {
    const quests = parseQuests(xml);
    cache.set(file, { at: Date.now(), rows: quests });
    return quests;
  }
  const rows: Record<string, string>[] = [];
  const re = /<(\w+)\s([^<>]*?)\/>/g;
  const attrRe = /(\w+)="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    if (m[1] === "Result") continue;
    const a: Record<string, string> = {};
    let x: RegExpExecArray | null;
    attrRe.lastIndex = 0;
    while ((x = attrRe.exec(m[2]))) a[x[1]] = unescape(x[2]);
    rows.push(a);
  }
  const filteredRows = file === "TemplateAllList"
    ? rows.filter((row) => row.SuitId && row.SuitId !== "0")
    : rows;
  cache.set(file, { at: Date.now(), rows: filteredRows });
  return filteredRows;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    if (!token) return json({ error: "Não autenticado" }, 401);
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data, error } = await sb.auth.getUser(token);
    if (error || !data.user) return json({ error: "Não autenticado" }, 401);

    const body = await req.json().catch(() => ({}));
    const files: unknown = body?.files;
    if (!Array.isArray(files) || files.length === 0 || files.length > 10 || !files.every((f) => typeof f === "string" && ALLOWED.has(f))) {
      return json({ error: "Arquivos inválidos" }, 400);
    }
    const out: Record<string, Record<string, string>[]> = {};
    await Promise.all((files as string[]).map(async (f) => (out[f] = await load(f))));
    return json(out);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
