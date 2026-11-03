// Download de imagens de endereços informados por usuários (importar imagens de itens), sem abrir
// caminho para SSRF: só http(s) em portas padrão, nada de endereços internos/privados, tamanho
// limitado e o conteúdo precisa ser mesmo uma imagem (PNG, JPEG, GIF ou WebP).

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** IPv4 privado, loopback, link-local (inclui metadados de nuvem 169.254.169.254), CGNAT etc. */
function privateIPv4(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

/** Recusa endereços que não são públicos. Devolve o motivo, ou null se a URL pode ser baixada. */
export function unsafeUrlReason(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "URL inválida";
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return "só http e https";
  if (url.username || url.password) return "URL com usuário/senha";
  if (url.port && url.port !== "80" && url.port !== "443") return "porta não permitida";
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host.includes(".") || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    return "endereço interno";
  }
  if (host.includes(":")) return "endereço IPv6 não permitido";
  if (privateIPv4(host)) return "endereço interno";
  // Formas numéricas alternativas de IP (ex.: 2130706433, 0x7f000001).
  if (/^(0x[0-9a-f]+|\d+)$/i.test(host)) return "endereço interno";
  return null;
}

function isImage(buf: Uint8Array): boolean {
  const s = (i: number, bytes: number[]) => bytes.every((b, j) => buf[i + j] === b);
  return s(0, [0x89, 0x50, 0x4e, 0x47]) || s(0, [0xff, 0xd8, 0xff]) || s(0, [0x47, 0x49, 0x46, 0x38]) ||
    (s(0, [0x52, 0x49, 0x46, 0x46]) && s(8, [0x57, 0x45, 0x42, 0x50]));
}

/** Baixa uma imagem de um endereço público, sem seguir redirecionamentos para endereços internos. */
export async function fetchPublicImage(raw: string): Promise<Uint8Array> {
  let current = raw;
  for (let hop = 0; hop < 4; hop++) {
    const reason = unsafeUrlReason(current);
    if (reason) throw new Error(reason);
    const resp = await fetch(current, { redirect: "manual", signal: AbortSignal.timeout(15_000) });
    if (resp.status >= 300 && resp.status < 400) {
      await resp.body?.cancel();
      const next = resp.headers.get("location");
      if (!next) throw new Error(`HTTP ${resp.status}`);
      current = new URL(next, current).toString();
      continue;
    }
    if (!resp.ok) {
      await resp.body?.cancel();
      throw new Error(`HTTP ${resp.status}`);
    }
    const declared = Number(resp.headers.get("content-length") ?? 0);
    if (declared > MAX_IMAGE_BYTES) {
      await resp.body?.cancel();
      throw new Error("imagem maior que 5 MB");
    }
    const reader = resp.body?.getReader();
    if (!reader) throw new Error("resposta vazia");
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_IMAGE_BYTES) {
        await reader.cancel();
        throw new Error("imagem maior que 5 MB");
      }
      chunks.push(value);
    }
    const buf = new Uint8Array(size);
    let offset = 0;
    for (const c of chunks) {
      buf.set(c, offset);
      offset += c.length;
    }
    if (!isImage(buf)) throw new Error("o arquivo não é uma imagem (PNG, JPEG, GIF ou WebP)");
    return buf;
  }
  throw new Error("redirecionamentos demais");
}

/** Lista de { id, url } recebida do painel, validada (até 2.000 linhas). */
export function parseImageMappings(body: unknown): { id: number; url: string }[] {
  const list = (body as { mappings?: unknown })?.mappings;
  if (!Array.isArray(list) || list.length === 0 || list.length > 2000) throw new Error("Lista de imagens inválida (1 a 2.000 itens)");
  return list.map((m) => {
    const id = Number((m as { id?: unknown })?.id);
    const url = (m as { url?: unknown })?.url;
    if (!Number.isSafeInteger(id) || typeof url !== "string" || url.length > 2048) throw new Error("Lista de imagens inválida");
    return { id, url: url.trim() };
  });
}
