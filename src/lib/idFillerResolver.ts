import { canonicalId, type CanonicalRow } from "@/lib/canonicalItem";
import { parseItemLabel } from "@/lib/eventTemplate/format";
import { nameSimilarity } from "@/lib/packageDescParser";

/**
 * Busca do item pelo nome (e pela imagem) para a ferramenta "Preencher IDs no documento".
 *
 * 1. Nome igual, sem diferença de maiúsculas, acentos e espaços (com e sem os colchetes do nome).
 * 2. Sem nome igual: nomes pelo menos 90% parecidos (o mais parecido).
 * 3. Os candidatos viram o ID padrão (arma no nível +0, bolinha de EXP em 1120218).
 * 4. Sobrando mais de um, a imagem do item no documento escolhe; sem nome parecido o bastante,
 *    a imagem ainda confirma um nome pelo menos 70% parecido.
 */

export interface FillerItemRow extends CanonicalRow {
  image_url?: string | null;
}

/** Hash perceptual de 64 bits de uma imagem (ou null se não der para ler). */
export type ImageHasher = (source: Uint8Array | string) => Promise<bigint | null>;

export type Resolution = { id: number; how: "name" | "similar" | "image" } | { error: string };

export const FUZZY_NAME = 0.9;
const IMAGE_NAME = 0.7;
const IMAGE_MAX_DISTANCE = 10;

export const fillerKey = (name: string) =>
  name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\n/g, " ").toLowerCase().replace(/\s+/g, " ").trim();

/** Nomes a tentar para o texto da célula: sem validade/vínculo e, depois, sem nenhum colchete. */
export function nameVariants(raw: string): string[] {
  const text = raw.replace(/\n/g, " ");
  const label = parseItemLabel(text).name;
  const noBrackets = text.replace(/\s*\[.*?\]/g, "");
  return [...new Set([label, noBrackets, text].map(fillerKey).filter(Boolean))];
}

const hamming = (a: bigint, b: bigint) => {
  let x = a ^ b;
  let n = 0;
  while (x) {
    n += Number(x & 1n);
    x >>= 1n;
  }
  return n;
};

export class ItemResolver {
  private byId = new Map<string, FillerItemRow>();
  private byKey = new Map<string, FillerItemRow[]>();
  private keys: { key: string; rows: FillerItemRow[] }[] = [];
  private hashCache = new Map<string, Promise<bigint | null>>();

  constructor(rows: FillerItemRow[], private hasher?: ImageHasher) {
    for (const row of rows) {
      this.byId.set(String(row.id), row);
      if (!row.name) continue;
      const k = fillerKey(row.name);
      const list = this.byKey.get(k);
      if (list) list.push(row);
      else this.byKey.set(k, [row]);
    }
    this.keys = [...this.byKey].map(([key, list]) => ({ key, rows: list }));
  }

  /** Índice antigo (nome em minúsculas → IDs), usado nos testes. */
  static fromNameIndex(index: Map<string, number[]>, hasher?: ImageHasher): ItemResolver {
    return new ItemResolver([...index].flatMap(([name, ids]) => ids.map((id) => ({ id, name }))), hasher);
  }

  private canonical(rows: FillerItemRow[]): string[] {
    return [...new Set(rows.map((r) => canonicalId(String(r.id), (x) => this.byId.get(x))))];
  }

  private similar(variants: string[], min: number): { rows: FillerItemRow[]; sim: number } {
    let best: FillerItemRow[] = [];
    let bestSim = 0;
    for (const v of variants) {
      for (const { key, rows } of this.keys) {
        // A distância é pelo menos a diferença de tamanho: nem compara nomes muito diferentes.
        if (Math.min(v.length, key.length) / Math.max(v.length, key.length) < min) continue;
        const sim = nameSimilarity(v, key);
        if (sim < min) continue;
        if (sim > bestSim) {
          best = [...rows];
          bestSim = sim;
        } else if (sim === bestSim) best.push(...rows);
      }
    }
    return { rows: best, sim: bestSim };
  }

  private itemHash(id: string): Promise<bigint | null> {
    if (!this.hasher) return Promise.resolve(null);
    const url = this.byId.get(id)?.image_url;
    if (!url) return Promise.resolve(null);
    if (!this.hashCache.has(id)) this.hashCache.set(id, this.hasher(url).catch(() => null));
    return this.hashCache.get(id) as Promise<bigint | null>;
  }

  /** O candidato cuja imagem é claramente a mais parecida com a do documento. */
  private async byImage(ids: string[], image: Uint8Array): Promise<string | null> {
    if (!this.hasher) return null;
    const docHash = await this.hasher(image).catch(() => null);
    if (docHash == null) return null;
    const scored = (await Promise.all(ids.map(async (id) => ({ id, hash: await this.itemHash(id) }))))
      .filter((x): x is { id: string; hash: bigint } => x.hash != null)
      .map((x) => ({ id: x.id, d: hamming(docHash, x.hash) }))
      .sort((a, b) => a.d - b.d);
    if (scored.length === 0 || scored[0].d > IMAGE_MAX_DISTANCE) return null;
    if (scored.length > 1 && scored[1].d === scored[0].d) return null;
    return scored[0].id;
  }

  async resolve(rawName: string, image?: Uint8Array | null): Promise<Resolution> {
    const variants = nameVariants(rawName);
    let rows = variants.flatMap((v) => this.byKey.get(v) ?? []);
    let how: "name" | "similar" = "name";
    if (rows.length === 0) {
      rows = this.similar(variants, FUZZY_NAME).rows;
      how = "similar";
    }
    let ids = this.canonical(rows);
    if (ids.length === 1) return { id: Number(ids[0]), how };
    if (ids.length > 1) {
      const chosen = image ? await this.byImage(ids, image) : null;
      if (chosen) return { id: Number(chosen), how: "image" };
      return { error: `Múltiplos IDs encontrados: ${ids.join(", ")}` };
    }
    // Nenhum nome parecido o bastante: a imagem pode confirmar um nome um pouco mais diferente.
    if (image && this.hasher) {
      ids = this.canonical(this.similar(variants, IMAGE_NAME).rows).slice(0, 20);
      const chosen = ids.length ? await this.byImage(ids, image) : null;
      if (chosen) return { id: Number(chosen), how: "image" };
    }
    return { error: "Não encontrado no banco" };
  }
}
