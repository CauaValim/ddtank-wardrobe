import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { imageCandidates, isJpeg, repairImage } from "./images.ts";
import { accessOf, allows } from "../_shared/permissions.ts";
import { BOX_SOURCE, packageRows, syncPackageContents } from "./packages.ts";
import { TITLE_SOURCE, syncTitleImages } from "./titles.ts";
import { ACTIVITY_SOURCE, QUEST_SOURCE, activityEntries, questEntries, syncEventEntries } from "./events.ts";
import { GAME_BASE } from "../_shared/gameApi.ts";

const SOURCE = `${GAME_BASE}TemplateAllList.xml`;
const MAX_IMAGES = 200;

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function loadXml(source = SOURCE): Promise<string> {
  const resp = await fetch(source);
  if (!resp.ok) throw new Error(`Jogo respondeu HTTP ${resp.status}`);
  const buf = new Uint8Array(await resp.arrayBuffer());
  if (buf[0] === 0x3c || buf[0] === 0xef) return new TextDecoder().decode(buf);
  const ds = new DecompressionStream("deflate");
  const stream = new Blob([buf]).stream().pipeThrough(ds);
  return await new Response(stream).text();
}

function parseItems(xml: string) {
  const out: Record<string, string>[] = [];
  const re = /<Item\s([^>]*?)\/>/g;
  const attrRe = /(\w+)="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const a: Record<string, string> = {};
    let x: RegExpExecArray | null;
    attrRe.lastIndex = 0;
    while ((x = attrRe.exec(m[1]))) a[x[1]] = x[2].replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
    out.push(a);
  }
  return out;
}

const num = (v?: string) => (v == null || v === "" || isNaN(Number(v)) ? null : Number(v));
const bool = (v?: string) => (v == null ? null : v === "true" || v === "1");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Auth: sincronização automática (pg_cron, com o segredo GAME_SYNC_CRON_SECRET no cabeçalho)
    // ou usuário com a permissão "Sincronizar com o jogo".
    const cronSecret = Deno.env.get("GAME_SYNC_CRON_SECRET");
    const fromCron = !!cronSecret && req.headers.get("x-cron-secret") === cronSecret;
    if (!fromCron) {
      const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
      if (!token) return json({ error: "Não autenticado" }, 401);
      const { data: u, error: uErr } = await admin.auth.getUser(token);
      if (uErr || !u.user) return json({ error: "Sessão inválida" }, 401);
      if (!allows(await accessOf(admin, u.user.id), "items.game_sync")) return json({ error: "Sem permissão" }, 403);
    }

    const startedAt = Date.now();
    const all = parseItems(await loadXml());
    const raw = all.filter((a) => Number(a.TemplateID) > 0 && a.Name);
    // Nomes de todos os itens do jogo, inclusive moedas e pontos (IDs negativos), para os pacotes.
    const names = new Map(all.filter((a) => a.TemplateID && a.Name).map((a) => [Number(a.TemplateID), a.Name]));

    // IDs existentes (append-only)
    const existing = new Set<number>();
    for (let from = 0; ; from += 1000) {
      const { data, error } = await admin.from("items").select("id").order("id", { ascending: true }).range(from, from + 999);
      if (error) throw error;
      data.forEach((r) => existing.add(Number(r.id)));
      if (data.length < 1000) break;
    }

    const fresh = raw.filter((a) => !existing.has(Number(a.TemplateID)));
    const rows = fresh.map((a) => ({
      id: Number(a.TemplateID),
      name: a.Name,
      desc: a.Description || null,
      type: num(a.CategoryID),
      pic_path: a.Pic || null,
      need_sex: num(a.NeedSex),
      need_grade: num(a.NeedLevel),
      attack: num(a.Attack),
      defence: num(a.Defence),
      agility: num(a.Agility),
      luck: num(a.Luck),
      item_grade: num(a.Quality),
      pile_count: num(a.MaxCount),
      bind_type: num(a.BindType),
      floor_price: num(a.FloorPrice),
      suit_id: num(a.SuitId),
      script: a.Script || null,
      data: a.Data || null,
      is_compose: bool(a.CanCompose),
      is_delete: bool(a.CanDelete),
      is_equip: bool(a.CanEquip),
      is_strengthen: bool(a.CanStrengthen),
      is_use: bool(a.CanUse),
      can_transfer: bool(a.CanTransfer),
      attribute1: a.Property1 ?? null, attribute2: a.Property2 ?? null, attribute3: a.Property3 ?? null, attribute4: a.Property4 ?? null,
      attribute5: a.Property5 ?? null, attribute6: a.Property6 ?? null, attribute7: a.Property7 ?? null, attribute8: a.Property8 ?? null,
    }));

    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await admin.from("items").upsert(rows.slice(i, i + 500), { onConflict: "id", ignoreDuplicates: true });
      if (error) throw error;
    }

    // Verificação de imagens: todos os itens sem imagem (novos e antigos)
    const { data: missing } = await admin.from("items").select("id,type,need_sex,pic_path")
      // Mais novos primeiro: itens que o jogo não serve (antigos) não travam os recém-sincronizados.
      .is("image_url", null).not("pic_path", "is", null).order("id", { ascending: false }).limit(MAX_IMAGES);
    let images = 0;
    // Conteúdo dos pacotes (LoadBoxTemp.xml). Uma falha aqui não impede o resto da sincronização.
    let packages: { packages: number; updated: number; rows: number } | { error: string };
    try {
      packages = await syncPackageContents(admin, packageRows(parseItems(await loadXml(BOX_SOURCE)), names));
    } catch (e) {
      packages = { error: (e as Error).message };
    }

    // Imagens dos títulos (aba Títulos em Dados do jogo). Uma falha aqui não impede o resto.
    let titles: { titles: number; uploaded: number; missing: number } | { error: string };
    try {
      titles = await syncTitleImages(admin, parseItems(await loadXml(TITLE_SOURCE)), startedAt + 60_000);
    } catch (e) {
      titles = { error: (e as Error).message };
    }

    // Registro de entrada dos itens nos eventos (atividades e missões). Uma falha aqui não impede o resto.
    let events: { entries: number } | { error: string };
    try {
      const today = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10); // horário de Brasília
      const [activities, quests] = await Promise.all([loadXml(ACTIVITY_SOURCE), loadXml(QUEST_SOURCE)]);
      events = await syncEventEntries(admin, [...activityEntries(activities, today), ...questEntries(quests, today)]);
    } catch (e) {
      events = { error: (e as Error).message };
    }

    const started = startedAt; // o tempo das imagens conta desde o início da função
    for (const r of missing ?? []) {
      if (Date.now() - started > 110_000) break;
      const pic = String(r.pic_path);
      const cands = pic.startsWith("http") ? [pic] : imageCandidates(r.type ?? 0, r.need_sex ?? 0, pic);
      for (const c of cands) {
        try {
          const resp = await fetch(c);
          if (!resp.ok || !(resp.headers.get("content-type") ?? "").includes("image")) { await resp.body?.cancel(); continue; }
          const buf = repairImage(new Uint8Array(await resp.arrayBuffer()));
          const jpg = isJpeg(buf);
          const path = `${r.id}/${Date.now()}.${jpg ? "jpg" : "png"}`;
          const { error } = await admin.storage.from("item-images").upload(path, buf, { upsert: true, contentType: jpg ? "image/jpeg" : "image/png" });
          if (error) break;
          const pub = admin.storage.from("item-images").getPublicUrl(path).data.publicUrl;
          await admin.from("items").update({ image_url: pub }).eq("id", r.id);
          images++;
          break;
        } catch { /* próximo */ }
      }
    }
    const { count: stillMissing } = await admin.from("items").select("id", { count: "exact", head: true }).is("image_url", null);

    return json({ totalGame: raw.length, added: rows.length, newIds: rows.map((r) => r.id), images, stillMissing, packages, titles, events });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
