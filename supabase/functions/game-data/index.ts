import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const BASE = "http://quest132-ddt.337.com/";
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
]);
const TTL = 30 * 60 * 1000;
const cache = new Map<string, { at: number; rows: Record<string, string>[] }>();

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const unescape = (s: string) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&apos;/g, "'").replace(/&amp;/g, "&");

async function load(file: string) {
  const hit = cache.get(file);
  if (hit && Date.now() - hit.at < TTL) return hit.rows;
  const resp = await fetch(`${BASE}${file}.xml`, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!resp.ok) throw new Error(`Jogo respondeu HTTP ${resp.status}`);
  const buf = new Uint8Array(await resp.arrayBuffer());
  let xml: string;
  if (buf[0] === 0x3c || buf[0] === 0xef) xml = new TextDecoder().decode(buf);
  else xml = await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream("deflate"))).text();
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
