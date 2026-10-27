import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { imageCandidates, isJpeg, repairImage } from "./images.ts";
import { accessOf, allows } from "../_shared/permissions.ts";
import { BOX_SOURCE, packageRows, syncPackageContents } from "./packages.ts";
import { TITLE_SOURCE, syncTitleImages } from "./titles.ts";
import { GAME_BASE } from "../_shared/gameApi.ts";

const SOURCE = `${GAME_BASE}TemplateAllList.xml`;
const MAX_IMAGES = 200;

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function loadXml(source = SOURCE): Promise<string> {
  const resp = await fetch(source);
  if (!resp.ok) throw new Error(`Jogo respondeu HTTP ${resp.status}`);
  const buf = new Uint8Array(await resp.arrayBuffer());
  if (buf[0] === 0x3c) return new TextDecoder().decode(buf);
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

/** AddTime do jogo ("2026/9/24 5:19:21") -> "2026-09-24 05:19:21" (data em que o item entrou no jogo). */
export function gameAddedAt(v?: string): string | null {
  const m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec((v ?? "").trim());
  if (!m) return null;
  const p2 = (x?: string) => (x ?? "0").padStart(2, "0");
  return `${m[1]}-${p2(m[2])}-${p2(m[3])} ${p2(m[4])}:${p2(m[5])}:${p2(m[6])}`;
}
/** Por execução: itens antigos que ganham a data do jogo (o resto entra nas próximas). */
const MAX_BACKFILL_GROUPS = 400;

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

    // IDs existentes (append-only) e quais ainda não têm a data do jogo.
    const existing = new Set<number>();
    const withoutDate = new Set<number>();
    // Banco sem a coluna game_added_at (migração ainda não aplicada): segue sem a data.
    let hasDateColumn = true;
    const page = (from: number) =>
      admin.from("items").select(hasDateColumn ? "id, game_added_at" : "id").order("id", { ascending: true }).range(from, from + 999);
    for (let from = 0; ; from += 1000) {
      let { data, error } = await page(from);
      if (error && from === 0 && hasDateColumn) {
        hasDateColumn = false;
        ({ data, error } = await page(from));
      }
      if (error) throw error;
      (data ?? []).forEach((r: { id: number; game_added_at?: string | null }) => {
        existing.add(Number(r.id));
        if (hasDateColumn && !r.game_added_at) withoutDate.add(Number(r.id));
      });
      if (!data || data.length < 1000) break;
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
      ...(hasDateColumn ? { game_added_at: gameAddedAt(a.AddTime) } : {}),
    }));

    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await admin.from("items").upsert(rows.slice(i, i + 500), { onConflict: "id", ignoreDuplicates: true });
      if (error) throw error;
    }

    // Itens antigos sem a data do jogo: atualiza em grupos com a mesma data (poucas chamadas).
    let datesFilled = 0;
    if (hasDateColumn && withoutDate.size) {
      const byDate = new Map<string, number[]>();
      for (const a of raw) {
        const id = Number(a.TemplateID);
        const at = gameAddedAt(a.AddTime);
        if (!at || !withoutDate.has(id)) continue;
        const list = byDate.get(at);
        if (list) list.push(id);
        else byDate.set(at, [id]);
      }
      for (const [at, ids] of [...byDate].slice(0, MAX_BACKFILL_GROUPS)) {
        if (Date.now() - startedAt > 40_000) break;
        for (let i = 0; i < ids.length; i += 500) {
          const { error } = await admin.from("items").update({ game_added_at: at }).in("id", ids.slice(i, i + 500));
          if (!error) datesFilled += Math.min(500, ids.length - i);
        }
      }
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

    return json({ totalGame: raw.length, added: rows.length, newIds: rows.map((r) => r.id), images, stillMissing, packages, titles, datesFilled });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
