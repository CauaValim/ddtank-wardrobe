import { supabase } from "@/integrations/supabase/client";
import legacyAsset from "@/assets/templates/ddtank-events-16-years.xlsx.asset.json";
import type { TemplateFile } from "./types";

/**
 * O modelo oficial (e o arquivo separado das solicitações manuais) ficam no bucket privado
 * "event-templates" do Supabase, em "<versão>/<arquivo>". Só é aceito o arquivo cujo SHA-256
 * bate com o manifesto, para que a exportação nunca use um modelo diferente do mapeado.
 */
export const TEMPLATE_BUCKET = "event-templates";

export const templateObjectPath = (m: TemplateFile) => `${m.version}/${m.fileName}`;

export async function sha256(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const cache = new Map<string, Promise<ArrayBuffer>>();

async function fromStorage(m: TemplateFile): Promise<ArrayBuffer | null> {
  const { data, error } = await supabase.storage.from(TEMPLATE_BUCKET).download(templateObjectPath(m));
  if (error || !data) return null;
  return data.arrayBuffer();
}

/** Cópia antiga registrada na Lovable; só funciona no domínio da Lovable e serve de transição. */
async function fromLegacyAsset(): Promise<ArrayBuffer | null> {
  try {
    const response = await fetch(legacyAsset.url);
    if (!response.ok) return null;
    const data = await response.arrayBuffer();
    const head = new Uint8Array(data.slice(0, 2));
    return head[0] === 0x50 && head[1] === 0x4b ? data : null;
  } catch {
    return null;
  }
}

export function loadTemplate(m: TemplateFile): Promise<ArrayBuffer> {
  const key = m.version;
  if (!cache.has(key)) {
    const p = (async () => {
      // A cópia antiga da Lovable é só do modelo oficial.
      const sources = m.fileName === legacyAsset.original_filename ? [fromStorage, fromLegacyAsset] : [fromStorage];
      for (const source of sources) {
        const data = await source(m);
        if (data && (await sha256(data)) === m.sha256) return data;
      }
      throw new Error(`O arquivo ${m.fileName} ainda não foi enviado para o painel. Peça a um Super Admin para enviá-lo em Criação de Eventos.`);
    })();
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return cache.get(key) as Promise<ArrayBuffer>;
}

export type TemplateStatus = "ready" | "missing" | "checking";

export async function templateAvailable(m: TemplateFile): Promise<boolean> {
  try {
    await loadTemplate(m);
    return true;
  } catch {
    return false;
  }
}

export async function uploadTemplate(file: File, m: TemplateFile): Promise<void> {
  const data = await file.arrayBuffer();
  const hash = await sha256(data);
  if (hash !== m.sha256) {
    throw new Error(`Este arquivo não é o mapeado (${m.fileName}). Para usar outro, é preciso gerar um novo manifesto.`);
  }
  const { error } = await supabase.storage.from(TEMPLATE_BUCKET).upload(templateObjectPath(m), new Blob([data], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  }), { upsert: true });
  if (error) throw new Error(error.message);
  cache.delete(m.version);
}
