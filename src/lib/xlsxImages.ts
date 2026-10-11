import JSZip from "jszip";

/** Imagem de uma aba da planilha: célula do canto superior esquerdo (1-based) e os bytes. */
export interface SheetImage {
  row: number;
  col: number;
  data: Uint8Array;
}

const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

const byLocalName = (node: Document | Element, name: string) => Array.from(node.getElementsByTagNameNS("*", name));

function resolvePath(baseFile: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const parts = baseFile.split("/").slice(0, -1);
  for (const p of target.split("/")) {
    if (!p || p === ".") continue;
    if (p === "..") parts.pop();
    else parts.push(p);
  }
  return parts.join("/");
}

const relsPathOf = (file: string) => {
  const i = file.lastIndexOf("/");
  return `${file.slice(0, i)}/_rels/${file.slice(i + 1)}.rels`;
};

async function readXml(zip: JSZip, path: string): Promise<Document | null> {
  const f = zip.file(path);
  if (!f) return null;
  return new DOMParser().parseFromString(await f.async("string"), "application/xml");
}

async function rels(zip: JSZip, file: string): Promise<Map<string, string>> {
  const doc = await readXml(zip, relsPathOf(file));
  const out = new Map<string, string>();
  for (const r of doc ? byLocalName(doc, "Relationship") : []) {
    const id = r.getAttribute("Id");
    const target = r.getAttribute("Target");
    if (id && target && r.getAttribute("TargetMode") !== "External") out.set(id, resolvePath(file, target));
  }
  return out;
}

/** Imagens de todas as abas, por nome da aba. Falhas de leitura deixam a aba sem imagens. */
export async function readSheetImages(buffer: ArrayBuffer): Promise<Map<string, SheetImage[]>> {
  const out = new Map<string, SheetImage[]>();
  const zip = await JSZip.loadAsync(buffer);
  const workbook = await readXml(zip, "xl/workbook.xml");
  if (!workbook) return out;
  const wbRels = await rels(zip, "xl/workbook.xml");
  for (const sheet of byLocalName(workbook, "sheet")) {
    const name = sheet.getAttribute("name");
    const rid = sheet.getAttributeNS(REL_NS, "id") ?? sheet.getAttribute("r:id");
    const sheetPath = rid ? wbRels.get(rid) : undefined;
    if (!name || !sheetPath) continue;
    try {
      const sheetDoc = await readXml(zip, sheetPath);
      if (!sheetDoc) continue;
      const sheetRels = await rels(zip, sheetPath);
      const images: SheetImage[] = [];
      for (const d of byLocalName(sheetDoc, "drawing")) {
        const drawingPath = sheetRels.get(d.getAttributeNS(REL_NS, "id") ?? d.getAttribute("r:id") ?? "");
        if (!drawingPath) continue;
        const drawing = await readXml(zip, drawingPath);
        if (!drawing) continue;
        const drawingRels = await rels(zip, drawingPath);
        const anchors = [...byLocalName(drawing, "twoCellAnchor"), ...byLocalName(drawing, "oneCellAnchor")];
        for (const anchor of anchors) {
          const from = byLocalName(anchor, "from")[0];
          const blip = byLocalName(anchor, "blip")[0];
          if (!from || !blip) continue;
          const embed = blip.getAttributeNS(REL_NS, "embed") ?? blip.getAttribute("r:embed");
          const mediaPath = embed ? drawingRels.get(embed) : undefined;
          const media = mediaPath ? zip.file(mediaPath) : null;
          if (!media) continue;
          const col = Number(byLocalName(from, "col")[0]?.textContent ?? "0") + 1;
          const row = Number(byLocalName(from, "row")[0]?.textContent ?? "0") + 1;
          images.push({ row, col, data: await media.async("uint8array") });
        }
      }
      if (images.length) out.set(name, images);
    } catch {
      // Aba com desenho em formato inesperado: segue sem imagens.
    }
  }
  return out;
}

/** Imagem mais próxima de uma célula de nome (até 2 linhas e 3 colunas de distância). */
export function imageNear(images: SheetImage[] | undefined, row: number, col: number): Uint8Array | null {
  let best: SheetImage | null = null;
  let bestD = Infinity;
  for (const img of images ?? []) {
    const dr = Math.abs(img.row - row);
    const dc = Math.abs(img.col - col);
    if (dr > 2 || dc > 3) continue;
    const d = dr * 10 + dc;
    if (d < bestD) {
      best = img;
      bestD = d;
    }
  }
  return best?.data ?? null;
}
