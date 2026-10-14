// deno-lint-ignore-file no-explicit-any
// Imagens dos títulos (NewTitleInfo.xml, campo Pic) copiadas para o bucket público "item-images"
// em titles/<Pic>.png: o servidor de recursos do jogo só tem http, que o painel (https) não exibe.
import { GAME_BASE } from "../_shared/gameApi.ts";
import { RES_HOSTS } from "./images.ts";

export const TITLE_SOURCE = `${GAME_BASE}NewTitleInfo.xml`;
const BUCKET = "item-images";
const FOLDER = "titles";
/** Por execução: o resto entra nas próximas sincronizações. */
const MAX_PER_RUN = 80;

/** Códigos de imagem dos títulos (Pic diferente de 0), sem repetição. */
export function titlePics(rows: Record<string, string>[]): string[] {
  return [...new Set(rows.map((r) => (r.Pic ?? "").trim()).filter((p) => /^\d+$/.test(p) && p !== "0"))];
}

export async function syncTitleImages(admin: any, rows: Record<string, string>[], deadline: number) {
  const pics = titlePics(rows);
  const existing = new Set<string>();
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await admin.storage.from(BUCKET).list(FOLDER, { limit: 1000, offset });
    if (error) throw error;
    for (const f of data ?? []) existing.add(String(f.name).replace(/\.png$/, ""));
    if (!data || data.length < 1000) break;
  }
  const missing = pics.filter((p) => !existing.has(p));
  let uploaded = 0;
  for (const pic of missing.slice(0, MAX_PER_RUN)) {
    if (Date.now() > deadline) break;
    for (const host of RES_HOSTS) {
      try {
        const resp = await fetch(`${host}/image/title/${pic}/icon.png`);
        if (!resp.ok || !(resp.headers.get("content-type") ?? "").includes("image")) {
          await resp.body?.cancel();
          continue;
        }
        const buf = new Uint8Array(await resp.arrayBuffer());
        const { error } = await admin.storage.from(BUCKET).upload(`${FOLDER}/${pic}.png`, buf, { upsert: true, contentType: "image/png" });
        if (!error) uploaded++;
        break;
      } catch { /* próximo servidor */ }
    }
  }
  return { titles: pics.length, uploaded, missing: missing.length - uploaded };
}
