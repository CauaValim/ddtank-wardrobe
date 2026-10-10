import { NS, Range, SheetGeometry, Worksheet, XlsxPackage, childrenByName, descendants, firstChild, relsPathOf } from "./ooxml";

const IMAGE_REL = `${NS.rel}/image`;
/** Tamanho das imagens de itens: 1,4 cm (1 cm = 360.000 EMU). */
export const ITEM_IMAGE_EMU = Math.round(1.4 * 360000);

export interface ImageData {
  /** PNG bytes. */
  data: Uint8Array;
  width: number;
  height: number;
}

/** One visual object in the drawing (a picture, a shape or a group). */
export interface AnchorUnit {
  /** Element removed/replaced as a whole (anchor or mc:AlternateContent wrapper). */
  element: Element;
  anchor: Element;
  kind: "pic" | "shape";
  rect: { x1: number; y1: number; x2: number; y2: number };
  media: string | null;
}

function intText(parent: Element | null, name: string): number {
  return Number((parent ? firstChild(parent, name) : null)?.textContent ?? "0");
}

export class Drawing {
  private units: AnchorUnit[] | null = null;
  private nextId = 0;

  constructor(
    public pkg: XlsxPackage,
    public sheet: Worksheet,
    public path: string,
    public doc: Document,
    private geometry: SheetGeometry,
  ) {
    // Declare the relationships prefix once on the root, so new pictures are written as r:embed
    // (otherwise the serializer invents ns1:, ns2:... prefixes).
    const root = doc.documentElement;
    if (!root.hasAttribute("xmlns:r")) root.setAttributeNS("http://www.w3.org/2000/xmlns/", "xmlns:r", NS.rel);
  }

  static async open(sheet: Worksheet): Promise<Drawing | null> {
    const path = await sheet.drawingPath();
    if (!path) return null;
    return new Drawing(sheet.pkg, sheet, path, await sheet.pkg.xml(path), sheet.geometry());
  }

  private position(marker: Element | null) {
    return {
      x: this.geometry.x(intText(marker, "col") + 1) + intText(marker, "colOff"),
      y: this.geometry.y(intText(marker, "row") + 1) + intText(marker, "rowOff"),
    };
  }

  private async mediaByRel(): Promise<Map<string, string>> {
    const rels = await this.pkg.rels(this.path);
    return new Map(rels.filter((r) => r.path).map((r) => [r.id, r.path as string]));
  }

  async list(): Promise<AnchorUnit[]> {
    if (this.units) return this.units;
    const media = await this.mediaByRel();
    const root = this.doc.documentElement;
    const units: AnchorUnit[] = [];
    for (const top of Array.from(root.children)) {
      const anchor = top.localName === "AlternateContent"
        ? descendants(top, "twoCellAnchor")[0] ?? descendants(top, "oneCellAnchor")[0] ?? descendants(top, "absoluteAnchor")[0]
        : top;
      if (!anchor || !["twoCellAnchor", "oneCellAnchor", "absoluteAnchor"].includes(anchor.localName)) continue;
      let x1 = 0;
      let y1 = 0;
      let x2 = 0;
      let y2 = 0;
      if (anchor.localName === "absoluteAnchor") {
        const pos = firstChild(anchor, "pos");
        const ext = firstChild(anchor, "ext");
        x1 = Number(pos?.getAttribute("x") ?? 0);
        y1 = Number(pos?.getAttribute("y") ?? 0);
        x2 = x1 + Number(ext?.getAttribute("cx") ?? 0);
        y2 = y1 + Number(ext?.getAttribute("cy") ?? 0);
      } else {
        const from = this.position(firstChild(anchor, "from"));
        x1 = from.x;
        y1 = from.y;
        if (anchor.localName === "twoCellAnchor") {
          const to = this.position(firstChild(anchor, "to"));
          x2 = to.x;
          y2 = to.y;
        } else {
          const ext = firstChild(anchor, "ext");
          x2 = x1 + Number(ext?.getAttribute("cx") ?? 0);
          y2 = y1 + Number(ext?.getAttribute("cy") ?? 0);
        }
      }
      const pic = firstChild(anchor, "pic");
      const blip = pic ? descendants(pic, "blip")[0] : null;
      const embed = blip?.getAttributeNS(NS.rel, "embed") ?? blip?.getAttribute("r:embed") ?? null;
      units.push({
        element: top,
        anchor,
        kind: pic ? "pic" : "shape",
        rect: { x1, y1, x2, y2 },
        media: embed ? media.get(embed) ?? null : null,
      });
    }
    for (const el of descendants(this.doc, "cNvPr")) this.nextId = Math.max(this.nextId, Number(el.getAttribute("id") ?? 0));
    this.units = units;
    return units;
  }

  /** Units whose centre falls inside the range, sorted top-to-bottom, left-to-right. */
  async inBox(range: Range, kind: "pic" | "any" = "pic"): Promise<AnchorUnit[]> {
    const box = this.geometry.rect(range);
    return (await this.list())
      .filter((u) => kind === "any" || u.kind === "pic")
      .filter((u) => {
        const cx = (u.rect.x1 + u.rect.x2) / 2;
        const cy = (u.rect.y1 + u.rect.y2) / 2;
        return cx >= box.x1 && cx < box.x2 && cy >= box.y1 && cy < box.y2;
      })
      .sort((a, b) => (a.rect.y1 - b.rect.y1) || (a.rect.x1 - b.rect.x1));
  }

  /** Units whose centre sits in hidden rows/columns of the sheet. */
  async removeHidden(isRowHidden: (row: number) => boolean, isColHidden: (col: number) => boolean) {
    for (const u of await this.list()) {
      const at = this.geometry.cellAt((u.rect.x1 + u.rect.x2) / 2, (u.rect.y1 + u.rect.y2) / 2);
      if (isRowHidden(at.row) || isColHidden(at.col)) this.remove(u);
    }
  }

  remove(unit: AnchorUnit) {
    unit.element.parentNode?.removeChild(unit.element);
    if (this.units) this.units = this.units.filter((u) => u !== unit);
    this.pkg.touch(this.path);
  }

  private async addMedia(image: ImageData): Promise<string> {
    const mediaPath = this.pkg.uniquePath((n) => `xl/media/event-item-${n}.png`);
    this.pkg.writeBinary(mediaPath, image.data);
    return this.pkg.addRel(this.path, IMAGE_REL, mediaPath);
  }

  private fit(image: ImageData, box: { x1: number; y1: number; x2: number; y2: number }) {
    const bw = box.x2 - box.x1;
    const bh = box.y2 - box.y1;
    const iw = Math.max(1, image.width);
    const ih = Math.max(1, image.height);
    const scale = Math.min(bw / iw, bh / ih);
    const w = Math.round(iw * scale);
    const h = Math.round(ih * scale);
    return { x: Math.round(box.x1 + (bw - w) / 2), y: Math.round(box.y1 + (bh - h) / 2), w, h };
  }

  private buildAnchor(rect: { x: number; y: number; w: number; h: number }, relId: string, name: string): Element {
    const d = this.doc;
    const el = (ns: string, tag: string, attrs: Record<string, string> = {}, children: (Element | string)[] = []) => {
      const e = d.createElementNS(ns, tag);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
      for (const c of children) e.appendChild(typeof c === "string" ? d.createTextNode(c) : c);
      return e;
    };
    const at = this.geometry.cellAt(rect.x, rect.y);
    this.nextId += 1;
    const blip = el(NS.a, "a:blip");
    blip.setAttributeNS(NS.rel, "r:embed", relId);
    return el(NS.xdr, "xdr:oneCellAnchor", {}, [
      el(NS.xdr, "xdr:from", {}, [
        el(NS.xdr, "xdr:col", {}, [String(at.col - 1)]),
        el(NS.xdr, "xdr:colOff", {}, [String(at.colOff)]),
        el(NS.xdr, "xdr:row", {}, [String(at.row - 1)]),
        el(NS.xdr, "xdr:rowOff", {}, [String(at.rowOff)]),
      ]),
      el(NS.xdr, "xdr:ext", { cx: String(rect.w), cy: String(rect.h) }),
      el(NS.xdr, "xdr:pic", {}, [
        el(NS.xdr, "xdr:nvPicPr", {}, [
          el(NS.xdr, "xdr:cNvPr", { id: String(this.nextId), name }),
          el(NS.xdr, "xdr:cNvPicPr", {}, [el(NS.a, "a:picLocks", { noChangeAspect: "1" })]),
        ]),
        el(NS.xdr, "xdr:blipFill", {}, [blip, el(NS.a, "a:stretch", {}, [el(NS.a, "a:fillRect")])]),
        el(NS.xdr, "xdr:spPr", {}, [
          el(NS.a, "a:xfrm", {}, [
            el(NS.a, "a:off", { x: String(rect.x), y: String(rect.y) }),
            el(NS.a, "a:ext", { cx: String(rect.w), cy: String(rect.h) }),
          ]),
          el(NS.a, "a:prstGeom", { prst: "rect" }, [el(NS.a, "a:avLst")]),
        ]),
      ]),
      el(NS.xdr, "xdr:clientData"),
    ]);
  }

  /**
   * Puts the images of the slots that share `range` into it: each one 1,4 cm (the longer side,
   * keeping the aspect ratio) and exactly in the middle of the range (the exporter grows it to
   * the merged cell). Slots that share a box are laid out in a grid; pictures there are replaced.
   */
  async fillBox(range: Range, images: (ImageData | null)[], label: string) {
    const existing = await this.inBox(range);
    const box = this.geometry.rect(range);
    const cols = Math.ceil(Math.sqrt(images.length));
    const rows = Math.ceil(images.length / Math.max(1, cols));
    for (let i = 0; i < Math.max(images.length, existing.length); i += 1) {
      const unit = existing[i];
      const image = images[i];
      if (!image) {
        if (unit) this.remove(unit);
        continue;
      }
      const cw = (box.x2 - box.x1) / cols;
      const ch = (box.y2 - box.y1) / rows;
      const cx = box.x1 + (i % cols) * cw + cw / 2;
      const cy = box.y1 + Math.floor(i / cols) * ch + ch / 2;
      // 1,4 cm; menor só se a célula não comportar.
      const side = Math.min(ITEM_IMAGE_EMU, cw, ch);
      const frame = { x1: cx - side / 2, y1: cy - side / 2, x2: cx + side / 2, y2: cy + side / 2 };
      const relId = await this.addMedia(image);
      const anchor = this.buildAnchor(this.fit(image, frame), relId, label);
      if (unit) {
        unit.element.parentNode?.replaceChild(anchor, unit.element);
        if (this.units) this.units = this.units.filter((u) => u !== unit);
      } else {
        this.doc.documentElement.appendChild(anchor);
      }
      this.pkg.touch(this.path);
    }
  }

  /**
   * Clones a picture that uses `mediaName` into `range` (same offsets relative to its row).
   * With `offset` ([colOff, rowOff] in EMU from the range's top-left cell) the picture is moved there.
   */
  async ensureDecoration(mediaName: string, range: Range, wanted: boolean, offset?: [number, number]) {
    const inside = (await this.inBox(range)).filter((u) => u.media?.endsWith(`/${mediaName}`));
    if (!wanted) {
      inside.forEach((u) => this.remove(u));
      return;
    }
    if (inside.length === 0) await this.cloneDecoration(mediaName, range);
    if (!offset) return;
    const [keep, ...extra] = (await this.inBox(range)).filter((u) => u.media?.endsWith(`/${mediaName}`));
    extra.forEach((u) => this.remove(u));
    const from = keep && keep.anchor.localName === "oneCellAnchor" ? firstChild(keep.anchor, "from") : null;
    if (!from) return;
    const set = (name: string, value: number) => {
      const el = firstChild(from, name);
      if (el) el.textContent = String(value);
    };
    set("col", range.c1 - 1);
    set("colOff", offset[0]);
    set("row", range.r1 - 1);
    set("rowOff", offset[1]);
    this.units = null;
    this.pkg.touch(this.path);
  }

  private async cloneDecoration(mediaName: string, range: Range) {
    const units = await this.list();
    const proto = units.find((u) => u.media?.endsWith(`/${mediaName}`));
    if (!proto) return;
    const protoRow = this.geometry.cellAt((proto.rect.x1 + proto.rect.x2) / 2, (proto.rect.y1 + proto.rect.y2) / 2).row;
    const delta = range.r1 - protoRow;
    const clone = proto.element.cloneNode(true) as Element;
    for (const marker of [...descendants(clone, "from"), ...descendants(clone, "to")]) {
      const row = firstChild(marker, "row");
      if (row) row.textContent = String(Number(row.textContent) + delta);
    }
    for (const nv of descendants(clone, "cNvPr")) {
      this.nextId += 1;
      nv.setAttribute("id", String(this.nextId));
    }
    this.doc.documentElement.appendChild(clone);
    this.units = null;
    this.pkg.touch(this.path);
  }

  /** Drops image relationships no picture uses any more, so the media is removed with the orphans. */
  async pruneUnusedRels() {
    const used = new Set(descendants(this.doc, "blip").map((b) => b.getAttributeNS(NS.rel, "embed") ?? b.getAttribute("r:embed")));
    for (const el of descendants(this.doc, "*")) {
      for (const at of Array.from(el.attributes)) if (at.namespaceURI === NS.rel) used.add(at.value);
    }
    const relsDoc = await this.pkg.relsDoc(this.path);
    for (const rel of childrenByName(relsDoc.documentElement, "Relationship")) {
      if (rel.getAttribute("Type") === IMAGE_REL && !used.has(rel.getAttribute("Id"))) rel.parentNode?.removeChild(rel);
    }
    this.pkg.touch(relsPathOf(this.path));
  }
}
