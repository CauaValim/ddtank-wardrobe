import JSZip from "jszip";

/**
 * Camada OOXML usada pela exportação de documentos de eventos.
 *
 * Tudo é feito sobre o pacote original do modelo: só os pontos mapeados no
 * manifesto são alterados. Estilos, mesclagens, larguras, alturas e imagens
 * que não pertencem a uma vaga de item ficam exatamente como no modelo.
 */

export const NS = {
  main: "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
  rel: "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
  pkgRel: "http://schemas.openxmlformats.org/package/2006/relationships",
  ct: "http://schemas.openxmlformats.org/package/2006/content-types",
  xdr: "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing",
  a: "http://schemas.openxmlformats.org/drawingml/2006/main",
  mc: "http://schemas.openxmlformats.org/markup-compatibility/2006",
};

const REL_TYPE = {
  worksheet: `${NS.rel}/worksheet`,
  drawing: `${NS.rel}/drawing`,
  image: `${NS.rel}/image`,
  externalLink: `${NS.rel}/externalLink`,
  calcChain: `${NS.rel}/calcChain`,
  vmlDrawing: `${NS.rel}/vmlDrawing`,
};

const CONTENT_TYPE = {
  worksheet: "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml",
  drawing: "application/vnd.openxmlformats-officedocument.drawing+xml",
};

// ------------------------------------------------------------------ helpers

export function colToIndex(col: string): number {
  let n = 0;
  for (const ch of col.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

export function indexToCol(index: number): string {
  let s = "";
  let n = index;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export interface CellPos {
  col: number; // 1-based
  row: number; // 1-based
}

export function parseRef(ref: string): CellPos {
  const m = /^([A-Z]+)(\d+)$/i.exec(ref.trim());
  if (!m) throw new Error(`Referência de célula inválida: ${ref}`);
  return { col: colToIndex(m[1]), row: Number(m[2]) };
}

export function formatRef(pos: CellPos): string {
  return `${indexToCol(pos.col)}${pos.row}`;
}

export interface Range {
  c1: number;
  r1: number;
  c2: number;
  r2: number;
}

export function parseRange(range: string): Range {
  const [a, b] = range.split(":");
  const p1 = parseRef(a);
  const p2 = parseRef(b ?? a);
  return { c1: Math.min(p1.col, p2.col), r1: Math.min(p1.row, p2.row), c2: Math.max(p1.col, p2.col), r2: Math.max(p1.row, p2.row) };
}

export function inRange(pos: CellPos, r: Range): boolean {
  return pos.col >= r.c1 && pos.col <= r.c2 && pos.row >= r.r1 && pos.row <= r.r2;
}

function posixJoin(base: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const parts = base.split("/").filter(Boolean);
  for (const seg of target.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg !== "." && seg !== "") parts.push(seg);
  }
  return parts.join("/");
}

function dirname(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? "" : path.slice(0, i);
}

function basename(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

export function relsPathOf(partPath: string): string {
  return `${dirname(partPath)}/_rels/${basename(partPath)}.rels`.replace(/^\//, "");
}

/** Relative target from `fromPart` to `toPart` (both package paths without leading slash). */
function relativeTarget(fromPart: string, toPart: string): string {
  const from = dirname(fromPart).split("/").filter(Boolean);
  const to = toPart.split("/").filter(Boolean);
  let i = 0;
  while (i < from.length && i < to.length - 1 && from[i] === to[i]) i += 1;
  return [...Array(from.length - i).fill(".."), ...to.slice(i)].join("/");
}

export function childrenByName(parent: Element, localName: string): Element[] {
  return Array.from(parent.children).filter((el) => el.localName === localName);
}

export function firstChild(parent: Element, localName: string): Element | null {
  return childrenByName(parent, localName)[0] ?? null;
}

export function descendants(parent: Document | Element, localName: string): Element[] {
  return Array.from(parent.getElementsByTagNameNS("*", localName));
}

// ------------------------------------------------------------------ relationships

export interface Relationship {
  id: string;
  type: string;
  target: string;
  external: boolean;
  /** Resolved package path (only for internal targets). */
  path: string | null;
}

// ------------------------------------------------------------------ package

export interface SheetEntry {
  name: string;
  sheetId: string;
  rId: string;
  path: string;
  element: Element;
}

export class XlsxPackage {
  private docs = new Map<string, Document>();
  private dirty = new Set<string>();
  private parser = new DOMParser();
  private serializer = new XMLSerializer();
  private sharedStringCount: number | null = null;

  private constructor(public zip: JSZip) {}

  static async load(data: ArrayBuffer | Uint8Array): Promise<XlsxPackage> {
    return new XlsxPackage(await JSZip.loadAsync(data));
  }

  has(path: string): boolean {
    return this.zip.file(path) != null;
  }

  async xml(path: string): Promise<Document> {
    const cached = this.docs.get(path);
    if (cached) return cached;
    const file = this.zip.file(path);
    if (!file) throw new Error(`Parte não encontrada no modelo: ${path}`);
    const doc = this.parser.parseFromString(await file.async("string"), "application/xml");
    if (doc.getElementsByTagName("parsererror").length > 0) throw new Error(`XML inválido em ${path}`);
    this.docs.set(path, doc);
    return doc;
  }

  touch(path: string) {
    this.dirty.add(path);
  }

  setXml(path: string, doc: Document) {
    this.docs.set(path, doc);
    this.dirty.add(path);
  }

  writeBinary(path: string, data: ArrayBuffer | Uint8Array) {
    this.zip.file(path, data);
  }

  remove(path: string) {
    this.zip.remove(path);
    this.docs.delete(path);
    this.dirty.delete(path);
  }

  async copyPart(from: string, to: string) {
    if (this.docs.has(from) || from.endsWith(".xml") || from.endsWith(".rels") || from.endsWith(".vml")) {
      const doc = await this.xml(from);
      const clone = this.parser.parseFromString(this.serializer.serializeToString(doc), "application/xml");
      this.setXml(to, clone);
    } else {
      const file = this.zip.file(from);
      if (!file) throw new Error(`Parte não encontrada: ${from}`);
      this.zip.file(to, await file.async("uint8array"));
    }
  }

  paths(): string[] {
    return Object.keys(this.zip.files).filter((p) => !this.zip.files[p].dir);
  }

  uniquePath(pattern: (n: number) => string): string {
    let n = 1;
    while (this.has(pattern(n)) || this.docs.has(pattern(n))) n += 1;
    return pattern(n);
  }

  // ---------------------------------------------------------------- rels

  async rels(partPath: string): Promise<Relationship[]> {
    const rp = relsPathOf(partPath);
    if (!this.has(rp) && !this.docs.has(rp)) return [];
    const doc = await this.xml(rp);
    return descendants(doc, "Relationship").map((el) => {
      const external = el.getAttribute("TargetMode") === "External";
      const target = el.getAttribute("Target") ?? "";
      return {
        id: el.getAttribute("Id") ?? "",
        type: el.getAttribute("Type") ?? "",
        target,
        external,
        path: external ? null : posixJoin(dirname(partPath), target),
      };
    });
  }

  async relsDoc(partPath: string): Promise<Document> {
    const rp = relsPathOf(partPath);
    if (!this.has(rp) && !this.docs.has(rp)) {
      const doc = this.parser.parseFromString(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${NS.pkgRel}"/>`, "application/xml");
      this.setXml(rp, doc);
      return doc;
    }
    return this.xml(rp);
  }

  async addRel(partPath: string, type: string, targetPath: string): Promise<string> {
    const doc = await this.relsDoc(partPath);
    const used = new Set(descendants(doc, "Relationship").map((r) => r.getAttribute("Id")));
    let n = 1;
    while (used.has(`rIdEv${n}`)) n += 1;
    const id = `rIdEv${n}`;
    const el = doc.createElementNS(NS.pkgRel, "Relationship");
    el.setAttribute("Id", id);
    el.setAttribute("Type", type);
    el.setAttribute("Target", relativeTarget(partPath, targetPath));
    doc.documentElement.appendChild(el);
    this.touch(relsPathOf(partPath));
    return id;
  }

  async removeRel(partPath: string, id: string) {
    const doc = await this.relsDoc(partPath);
    descendants(doc, "Relationship").filter((r) => r.getAttribute("Id") === id).forEach((r) => r.parentNode?.removeChild(r));
    this.touch(relsPathOf(partPath));
  }

  // ---------------------------------------------------------------- content types

  async addOverride(path: string, contentType: string) {
    const doc = await this.xml("[Content_Types].xml");
    const part = `/${path}`;
    if (descendants(doc, "Override").some((o) => o.getAttribute("PartName") === part)) return;
    const el = doc.createElementNS(NS.ct, "Override");
    el.setAttribute("PartName", part);
    el.setAttribute("ContentType", contentType);
    doc.documentElement.appendChild(el);
    this.touch("[Content_Types].xml");
  }

  async contentTypeOf(path: string): Promise<string | null> {
    const doc = await this.xml("[Content_Types].xml");
    const o = descendants(doc, "Override").find((el) => el.getAttribute("PartName") === `/${path}`);
    return o?.getAttribute("ContentType") ?? null;
  }

  // ---------------------------------------------------------------- workbook / sheets

  async sheets(): Promise<SheetEntry[]> {
    const wb = await this.xml("xl/workbook.xml");
    const rels = await this.rels("xl/workbook.xml");
    return descendants(wb, "sheet").map((el) => {
      const rId = el.getAttributeNS(NS.rel, "id") ?? el.getAttribute("r:id") ?? "";
      const rel = rels.find((r) => r.id === rId);
      if (!rel?.path) throw new Error(`Aba sem relação: ${el.getAttribute("name")}`);
      return { name: el.getAttribute("name") ?? "", sheetId: el.getAttribute("sheetId") ?? "", rId, path: rel.path, element: el };
    });
  }

  async worksheet(name: string): Promise<Worksheet> {
    const entry = (await this.sheets()).find((s) => s.name === name);
    if (!entry) throw new Error(`Aba "${name}" não existe no modelo`);
    return new Worksheet(this, entry.path, await this.xml(entry.path));
  }

  /** Duplicates a worksheet (and its drawing/legacy parts). Images are shared, not copied. */
  async duplicateSheet(sourceName: string, newName: string): Promise<void> {
    const sheets = await this.sheets();
    const src = sheets.find((s) => s.name === sourceName);
    if (!src) throw new Error(`Aba "${sourceName}" não existe no modelo`);
    const newPath = this.uniquePath((n) => `xl/worksheets/sheet${n}.xml`);
    await this.copyPart(src.path, newPath);
    await this.addOverride(newPath, CONTENT_TYPE.worksheet);
    const srcRels = await this.rels(src.path);
    if (srcRels.length > 0) {
      await this.copyPart(relsPathOf(src.path), relsPathOf(newPath));
      const relsDoc = await this.xml(relsPathOf(newPath));
      for (const rel of srcRels) {
        if (rel.external || !rel.path) continue;
        const relEl = descendants(relsDoc, "Relationship").find((r) => r.getAttribute("Id") === rel.id);
        if (!relEl) continue;
        if (rel.type === REL_TYPE.drawing || rel.type.endsWith("/printerSettings") || rel.type === REL_TYPE.vmlDrawing) {
          const ext = rel.path.slice(rel.path.lastIndexOf("."));
          const stem = rel.path.slice(0, rel.path.lastIndexOf("/") + 1) + basename(rel.path).replace(/\d*\.[^.]+$/, "");
          const copy = this.uniquePath((n) => `${stem}${n}${ext}`);
          await this.copyPart(rel.path, copy);
          const partRels = await this.rels(rel.path);
          if (partRels.length > 0) await this.copyPart(relsPathOf(rel.path), relsPathOf(copy));
          const ct = await this.contentTypeOf(rel.path);
          if (ct) await this.addOverride(copy, ct);
          relEl.setAttribute("Target", relativeTarget(newPath, copy));
        }
      }
      this.touch(relsPathOf(newPath));
    }
    const wb = await this.xml("xl/workbook.xml");
    const sheetsEl = descendants(wb, "sheets")[0];
    const maxId = Math.max(...sheets.map((s) => Number(s.sheetId) || 0));
    const rId = await this.addRel("xl/workbook.xml", REL_TYPE.worksheet, newPath);
    const el = wb.createElementNS(NS.main, "sheet");
    el.setAttribute("name", newName);
    el.setAttribute("sheetId", String(maxId + 1));
    el.setAttributeNS(NS.rel, "r:id", rId);
    sheetsEl.appendChild(el);
    this.touch("xl/workbook.xml");
  }

  /**
   * Brings sheets from another package (the "Solicitações manuais" file) into this one.
   * That file carries this template's styles and shared strings with the same indices
   * (plus its own at the end), so its styles.xml and sharedStrings.xml replace ours and
   * the sheets are copied as they are, with their drawings and images.
   * Must run before anything else changes this package.
   */
  async importSheets(src: XlsxPackage, names: string[]) {
    if (names.length === 0) return;
    for (const part of ["xl/styles.xml", "xl/sharedStrings.xml"]) {
      this.setXml(part, this.parser.parseFromString(this.serializer.serializeToString(await src.xml(part)), "application/xml"));
    }
    this.sharedStringCount = null;
    this.siCache = null;
    this.fontCache.clear();
    this.fontList = null;
    this.derivedStyles.clear();
    this.xfList = null;
    this.themeFills.clear();

    const ct = await this.xml("[Content_Types].xml");
    const defaults = new Set(descendants(ct, "Default").map((d) => (d.getAttribute("Extension") ?? "").toLowerCase()));
    const srcCt = await src.xml("[Content_Types].xml");
    const ensureDefault = (ext: string) => {
      if (defaults.has(ext)) return;
      const type = descendants(srcCt, "Default").find((d) => (d.getAttribute("Extension") ?? "").toLowerCase() === ext)?.getAttribute("ContentType");
      const el = ct.createElementNS(NS.ct, "Default");
      el.setAttribute("Extension", ext);
      el.setAttribute("ContentType", type ?? "application/octet-stream");
      ct.documentElement.insertBefore(el, ct.documentElement.firstChild);
      defaults.add(ext);
      this.touch("[Content_Types].xml");
    };
    const copyXml = async (from: string, to: string) => {
      this.setXml(to, this.parser.parseFromString(this.serializer.serializeToString(await src.xml(from)), "application/xml"));
    };

    const srcSheets = await src.sheets();
    for (const name of names) {
      const entry = srcSheets.find((x) => x.name === name);
      if (!entry) throw new Error(`Aba "${name}" não existe no arquivo de solicitações`);
      const sheetPath = this.uniquePath((n) => `xl/worksheets/sheet${n}.xml`);
      await copyXml(entry.path, sheetPath);
      await this.addOverride(sheetPath, CONTENT_TYPE.worksheet);
      const sheetDoc = await this.xml(sheetPath);
      for (const rel of await src.rels(entry.path)) {
        const el = descendants(sheetDoc, "*").find((e) => (e.getAttributeNS(NS.rel, "id") ?? e.getAttribute("r:id")) === rel.id);
        if (rel.type !== REL_TYPE.drawing || !rel.path) {
          // Impressora, comentários etc. ficam de fora.
          if (el) el.removeAttributeNS(NS.rel, "id");
          continue;
        }
        const drawingPath = this.uniquePath((n) => `xl/drawings/drawing${n}.xml`);
        await copyXml(rel.path, drawingPath);
        await this.addOverride(drawingPath, CONTENT_TYPE.drawing);
        for (const media of await src.rels(rel.path)) {
          if (media.external || !media.path) continue;
          const ext = media.path.slice(media.path.lastIndexOf(".") + 1).toLowerCase();
          const mediaPath = this.uniquePath((n) => `xl/media/request${n}.${ext}`);
          const file = src.zip.file(media.path);
          if (!file) continue;
          this.writeBinary(mediaPath, await file.async("uint8array"));
          ensureDefault(ext);
          const relsDoc = await this.relsDoc(drawingPath);
          const r = relsDoc.createElementNS(NS.pkgRel, "Relationship");
          r.setAttribute("Id", media.id);
          r.setAttribute("Type", media.type);
          r.setAttribute("Target", relativeTarget(drawingPath, mediaPath));
          relsDoc.documentElement.appendChild(r);
          this.touch(relsPathOf(drawingPath));
        }
        const newId = await this.addRel(sheetPath, REL_TYPE.drawing, drawingPath);
        if (el) el.setAttributeNS(NS.rel, "r:id", newId);
      }
      this.touch(sheetPath);
      const wb = await this.xml("xl/workbook.xml");
      const sheets = await this.sheets();
      // O modelo já tem algumas dessas abas (versão antiga): a do arquivo de solicitações vale.
      sheets.filter((x) => x.name === name).forEach((x, i) => x.element.setAttribute("name", `__substituida_${i + 1}_${x.sheetId}`));
      const rId = await this.addRel("xl/workbook.xml", REL_TYPE.worksheet, sheetPath);
      const el = wb.createElementNS(NS.main, "sheet");
      el.setAttribute("name", name);
      el.setAttribute("sheetId", String(Math.max(...sheets.map((x) => Number(x.sheetId) || 0)) + 1));
      el.setAttributeNS(NS.rel, "r:id", rId);
      descendants(wb, "sheets")[0].appendChild(el);
      this.touch("xl/workbook.xml");
    }
  }

  /**
   * Keeps only the given sheets, in the given order, with their final names.
   * Also removes everything that would make Excel complain or leak data:
   * external links, calcChain, broken defined names and orphan parts.
   */
  async finalizeSheets(order: { current: string; final: string }[]) {
    const wb = await this.xml("xl/workbook.xml");
    const all = await this.sheets();
    const oldIndex = new Map(all.map((s, i) => [s.name, i]));
    const keep = order.map((o) => {
      const s = all.find((x) => x.name === o.current);
      if (!s) throw new Error(`Aba "${o.current}" não encontrada`);
      return { ...s, final: o.final };
    });
    const keepNames = new Set(keep.map((k) => k.name));
    const sheetsEl = descendants(wb, "sheets")[0];
    for (const s of all) if (!keepNames.has(s.name)) sheetsEl.removeChild(s.element);
    for (const k of keep) {
      k.element.setAttribute("name", k.final);
      sheetsEl.appendChild(k.element);
    }

    // Defined names: drop broken ones and remap sheet-local ones.
    const finalIndexByOld = new Map<number, number>();
    keep.forEach((k, i) => finalIndexByOld.set(oldIndex.get(k.name) ?? -1, i));
    for (const dn of descendants(wb, "definedName")) {
      const body = dn.textContent ?? "";
      const local = dn.getAttribute("localSheetId");
      const broken = body.includes("#REF!") || /\[\d+\]/.test(body);
      if (broken) {
        dn.parentNode?.removeChild(dn);
        continue;
      }
      if (local != null) {
        const mapped = finalIndexByOld.get(Number(local));
        if (mapped == null) dn.parentNode?.removeChild(dn);
        else dn.setAttribute("localSheetId", String(mapped));
      } else if (all.some((s) => !keepNames.has(s.name) && body.includes(s.name))) {
        dn.parentNode?.removeChild(dn);
      }
    }
    descendants(wb, "definedNames").forEach((el) => {
      if (el.children.length === 0) el.parentNode?.removeChild(el);
    });
    descendants(wb, "externalReferences").forEach((el) => el.parentNode?.removeChild(el));
    for (const view of descendants(wb, "workbookView")) {
      view.removeAttribute("activeTab");
      view.removeAttribute("firstSheet");
    }
    const calcPr = descendants(wb, "calcPr")[0];
    calcPr?.setAttribute("fullCalcOnLoad", "1");
    this.touch("xl/workbook.xml");

    // Workbook relationships: drop removed sheets, external links and calcChain.
    const wbRels = await this.relsDoc("xl/workbook.xml");
    const keepRids = new Set(keep.map((k) => k.rId));
    for (const rel of descendants(wbRels, "Relationship")) {
      const type = rel.getAttribute("Type") ?? "";
      const id = rel.getAttribute("Id") ?? "";
      if ((type === REL_TYPE.worksheet && !keepRids.has(id)) || type === REL_TYPE.externalLink || type === REL_TYPE.calcChain) {
        rel.parentNode?.removeChild(rel);
      }
    }
    this.touch(relsPathOf("xl/workbook.xml"));

    // Kept sheets: only the first is selected; formulas tied to other workbooks keep their cached value.
    for (const [i, k] of keep.entries()) {
      const doc = await this.xml(k.path);
      for (const view of descendants(doc, "sheetView")) {
        if (i === 0) view.setAttribute("tabSelected", "1");
        else view.removeAttribute("tabSelected");
      }
      for (const f of descendants(doc, "f")) {
        if (/\[\d+\]/.test(f.textContent ?? "") || (f.textContent ?? "").includes("#REF!")) f.parentNode?.removeChild(f);
      }
      // Legacy VML "camera" pictures are bound to external workbooks; the visible copies live in the DrawingML part.
      for (const legacy of descendants(doc, "legacyDrawing")) {
        const rid = legacy.getAttributeNS(NS.rel, "id") ?? legacy.getAttribute("r:id");
        legacy.parentNode?.removeChild(legacy);
        if (rid) await this.removeRel(k.path, rid);
      }
      this.touch(k.path);
    }

    await this.removeOrphans();

    // docProps/app.xml lists every sheet title; the list is optional, so drop it.
    if (this.has("docProps/app.xml")) {
      const app = await this.xml("docProps/app.xml");
      for (const name of ["HeadingPairs", "TitlesOfParts"]) descendants(app, name).forEach((el) => el.parentNode?.removeChild(el));
      this.touch("docProps/app.xml");
    }
  }

  /** Deletes every part not reachable from the package root relationships. */
  async removeOrphans() {
    const reachable = new Set<string>(["[Content_Types].xml", "_rels/.rels"]);
    const visit = async (part: string) => {
      if (reachable.has(part) || (!this.has(part) && !this.docs.has(part))) return;
      reachable.add(part);
      const rp = relsPathOf(part);
      if (this.has(rp) || this.docs.has(rp)) reachable.add(rp);
      for (const rel of await this.rels(part)) if (rel.path) await visit(rel.path);
    };
    for (const rel of await this.rels("")) if (rel.path) await visit(rel.path);
    for (const path of this.paths()) if (!reachable.has(path)) this.remove(path);
    for (const path of Array.from(this.docs.keys())) if (!reachable.has(path)) this.docs.delete(path);
    const ct = await this.xml("[Content_Types].xml");
    for (const o of descendants(ct, "Override")) {
      const part = (o.getAttribute("PartName") ?? "").replace(/^\//, "");
      if (!reachable.has(part)) o.parentNode?.removeChild(o);
    }
    this.touch("[Content_Types].xml");
  }

  // ---------------------------------------------------------------- shared strings & styles

  async addSharedString(si: (doc: Document) => Element): Promise<number> {
    const doc = await this.xml("xl/sharedStrings.xml");
    const root = doc.documentElement;
    if (this.sharedStringCount == null) this.sharedStringCount = childrenByName(root, "si").length;
    const el = si(doc);
    root.appendChild(el);
    this.siCache?.push(el);
    const index = this.sharedStringCount;
    this.sharedStringCount += 1;
    root.setAttribute("uniqueCount", String(this.sharedStringCount));
    const count = Number(root.getAttribute("count") ?? "0");
    root.setAttribute("count", String(count + 1));
    this.touch("xl/sharedStrings.xml");
    return index;
  }

  private siCache: Element[] | null = null;

  async sharedStringText(index: number): Promise<string> {
    const doc = await this.xml("xl/sharedStrings.xml");
    if (!this.siCache) this.siCache = childrenByName(doc.documentElement, "si");
    const si = this.siCache[index];
    if (!si) return "";
    return descendants(si, "t").filter((t) => t.parentElement?.localName !== "rPh").map((t) => t.textContent ?? "").join("");
  }

  private fontCache = new Map<number, Element | null>();
  private fontList: Element[] | null = null;

  /** Font element applied to a cell style (used to keep size/family on rich runs). */
  async fontForStyle(styleIndex: number): Promise<Element | null> {
    if (this.fontCache.has(styleIndex)) return this.fontCache.get(styleIndex) ?? null;
    const styles = await this.xml("xl/styles.xml");
    const { xfs } = await this.cellXfs();
    const fontId = Number(xfs[styleIndex]?.getAttribute("fontId") ?? "0");
    if (!this.fontList) this.fontList = childrenByName(descendants(styles, "fonts")[0], "font");
    const fonts = this.fontList;
    const font = fonts[fontId] ?? null;
    this.fontCache.set(styleIndex, font);
    return font;
  }

  private derivedStyles = new Map<string, number>();
  private xfList: { root: Element; xfs: Element[] } | null = null;

  private async cellXfs() {
    if (!this.xfList) {
      const styles = await this.xml("xl/styles.xml");
      const root = descendants(styles, "cellXfs")[0];
      this.xfList = { root, xfs: childrenByName(root, "xf") };
    }
    return this.xfList;
  }

  /** Style index equal to `base` but with another fill and/or border (new cellXfs entry, cached). */
  async deriveStyle(base: number, patch: { fillId?: number; borderId?: number }): Promise<number> {
    const key = `${base}|${patch.fillId ?? ""}|${patch.borderId ?? ""}`;
    const cached = this.derivedStyles.get(key);
    if (cached != null) return cached;
    const { root: cellXfs, xfs } = await this.cellXfs();
    const src = xfs[base];
    if (!src) return base;
    const same = (patch.fillId == null || Number(src.getAttribute("fillId") ?? 0) === patch.fillId)
      && (patch.borderId == null || Number(src.getAttribute("borderId") ?? 0) === patch.borderId);
    if (same) {
      this.derivedStyles.set(key, base);
      return base;
    }
    const xf = src.cloneNode(true) as Element;
    if (patch.fillId != null) {
      xf.setAttribute("fillId", String(patch.fillId));
      xf.setAttribute("applyFill", "1");
    }
    if (patch.borderId != null) {
      xf.setAttribute("borderId", String(patch.borderId));
      xf.setAttribute("applyBorder", "1");
    }
    cellXfs.appendChild(xf);
    xfs.push(xf);
    const index = xfs.length - 1;
    cellXfs.setAttribute("count", String(xfs.length));
    this.touch("xl/styles.xml");
    this.derivedStyles.set(key, index);
    return index;
  }

  async styleAttr(base: number, name: "fillId" | "borderId"): Promise<number> {
    const xf = (await this.cellXfs()).xfs[base];
    return Number(xf?.getAttribute(name) ?? 0);
  }

  private themeFills = new Map<string, number>();

  /** Id of a solid fill with a theme colour (an identical fill of the template is reused, otherwise one is appended). */
  async themeFill(theme: number, tint: number): Promise<number> {
    const key = `${theme}|${tint}`;
    const cached = this.themeFills.get(key);
    if (cached != null) return cached;
    const styles = await this.xml("xl/styles.xml");
    const root = descendants(styles, "fills")[0];
    const fills = childrenByName(root, "fill");
    let id = fills.findIndex((f) => {
      const pattern = firstChild(f, "patternFill");
      const fg = pattern ? firstChild(pattern, "fgColor") : null;
      return pattern?.getAttribute("patternType") === "solid" && fg?.getAttribute("theme") === String(theme)
        && Math.abs(Number(fg.getAttribute("tint") ?? 0) - tint) < 1e-6;
    });
    if (id < 0) {
      const ns = root.namespaceURI;
      const fill = styles.createElementNS(ns, "fill");
      const pattern = styles.createElementNS(ns, "patternFill");
      pattern.setAttribute("patternType", "solid");
      const fg = styles.createElementNS(ns, "fgColor");
      fg.setAttribute("theme", String(theme));
      fg.setAttribute("tint", String(tint));
      const bg = styles.createElementNS(ns, "bgColor");
      bg.setAttribute("indexed", "64");
      pattern.appendChild(fg);
      pattern.appendChild(bg);
      fill.appendChild(pattern);
      root.appendChild(fill);
      id = fills.length;
      root.setAttribute("count", String(fills.length + 1));
      this.touch("xl/styles.xml");
    }
    this.themeFills.set(key, id);
    return id;
  }

  // ---------------------------------------------------------------- save

  async save(): Promise<ArrayBuffer> {
    for (const path of this.dirty) {
      const doc = this.docs.get(path);
      if (!doc) continue;
      let xml = this.serializer.serializeToString(doc);
      if (!xml.startsWith("<?xml")) xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${xml}`;
      this.zip.file(path, xml);
    }
    this.dirty.clear();
    return this.zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
  }
}

// ------------------------------------------------------------------ worksheet

export interface RichRun {
  text: string;
  bold?: boolean;
  color?: "black" | "red" | "green";
}

export class Worksheet {
  private merges: Range[];
  private sd: Element;
  private rows = new Map<number, Element>();

  constructor(public pkg: XlsxPackage, public path: string, public doc: Document) {
    this.merges = descendants(doc, "mergeCell").map((m) => parseRange(m.getAttribute("ref") ?? "A1"));
    this.sd = descendants(doc, "sheetData")[0];
    for (const row of childrenByName(this.sd, "row")) this.rows.set(Number(row.getAttribute("r")), row);
  }

  private sheetData(): Element {
    return this.sd;
  }

  /** Fraction of the given merge ranges ("B9:N10") present in this sheet. */
  mergeScore(refs: string[]): number {
    if (refs.length === 0) return 0;
    const have = new Set(this.merges.map((m) => `${formatRef({ col: m.c1, row: m.r1 })}:${formatRef({ col: m.c2, row: m.r2 })}`));
    return refs.filter((r) => have.has(r)).length / refs.length;
  }

  /** Returns the merge range that contains the cell, if any. */
  mergeOf(ref: string): Range | null {
    const pos = parseRef(ref);
    return this.merges.find((m) => inRange(pos, m)) ?? null;
  }

  assertWritable(ref: string) {
    const m = this.mergeOf(ref);
    const pos = parseRef(ref);
    if (m && (m.c1 !== pos.col || m.r1 !== pos.row)) {
      throw new Error(`${ref} fica dentro de uma mesclagem que começa em ${formatRef({ col: m.c1, row: m.r1 })}`);
    }
  }

  private findRow(rowNumber: number, create: boolean): Element | null {
    const known = this.rows.get(rowNumber);
    if (known || !create) return known ?? null;
    const created = this.createRow(rowNumber);
    this.rows.set(rowNumber, created);
    return created;
  }

  private createRow(rowNumber: number): Element {
    const sd = this.sheetData();
    for (const row of childrenByName(sd, "row")) {
      const r = Number(row.getAttribute("r"));
      if (r === rowNumber) return row;
      if (r > rowNumber) {
        const el = this.doc.createElementNS(NS.main, "row");
        el.setAttribute("r", String(rowNumber));
        sd.insertBefore(el, row);
        return el;
      }
    }
    const el = this.doc.createElementNS(NS.main, "row");
    el.setAttribute("r", String(rowNumber));
    sd.appendChild(el);
    return el;
  }

  private findCell(ref: string, create: boolean): Element | null {
    const pos = parseRef(ref);
    const row = this.findRow(pos.row, create);
    if (!row) return null;
    for (const c of childrenByName(row, "c")) {
      const cpos = parseRef(c.getAttribute("r") ?? "A1");
      if (cpos.col === pos.col) return c;
      if (cpos.col > pos.col) {
        if (!create) return null;
        const el = this.doc.createElementNS(NS.main, "c");
        el.setAttribute("r", ref);
        this.inheritStyle(el, row, pos);
        row.insertBefore(el, c);
        return el;
      }
    }
    if (!create) return null;
    const el = this.doc.createElementNS(NS.main, "c");
    el.setAttribute("r", ref);
    this.inheritStyle(el, row, pos);
    row.appendChild(el);
    return el;
  }

  private inheritStyle(cell: Element, row: Element, pos: CellPos) {
    const rowStyle = row.getAttribute("s");
    if (rowStyle && row.getAttribute("customFormat") === "1") {
      cell.setAttribute("s", rowStyle);
      return;
    }
    const cols = descendants(this.doc, "col").find((c) => Number(c.getAttribute("min")) <= pos.col && Number(c.getAttribute("max")) >= pos.col);
    const colStyle = cols?.getAttribute("style");
    if (colStyle) cell.setAttribute("s", colStyle);
  }

  async getText(ref: string): Promise<string> {
    const c = this.findCell(ref, false);
    if (!c) return "";
    const t = c.getAttribute("t");
    if (t === "inlineStr") return descendants(c, "t").map((x) => x.textContent ?? "").join("");
    const v = firstChild(c, "v")?.textContent ?? "";
    if (t === "s") return this.pkg.sharedStringText(Number(v));
    return v;
  }

  isNumeric(ref: string): boolean {
    const c = this.findCell(ref, false);
    if (!c) return false;
    const t = c.getAttribute("t");
    return (t == null || t === "n") && firstChild(c, "v") != null;
  }

  clear(ref: string) {
    const c = this.findCell(ref, false);
    if (!c) return;
    for (const child of Array.from(c.children)) c.removeChild(child);
    c.removeAttribute("t");
    this.pkg.touch(this.path);
  }

  setNumber(ref: string, value: number) {
    this.assertWritable(ref);
    const cell = this.findCell(ref, true) as Element;
    for (const child of Array.from(cell.children)) cell.removeChild(child);
    cell.removeAttribute("t");
    const v = this.doc.createElementNS(NS.main, "v");
    v.textContent = String(value);
    cell.appendChild(v);
    this.pkg.touch(this.path);
  }

  async setRich(ref: string, runs: RichRun[]) {
    this.assertWritable(ref);
    const text = runs.map((r) => r.text).join("");
    if (text === "") {
      this.clear(ref);
      return;
    }
    const cell = this.findCell(ref, true) as Element;
    const plain = runs.every((r) => r.bold === undefined && !r.color);
    // Só dígitos (IDs): grava como número, como no modelo. Como texto, o Excel marca a célula
    // com o aviso "número armazenado como texto".
    if (plain && /^(0|[1-9]\d{0,14})$/.test(text)) {
      this.setNumber(ref, Number(text));
      return;
    }
    const font = await this.pkg.fontForStyle(Number(cell.getAttribute("s") ?? "0"));
    const index = await this.pkg.addSharedString((doc) => {
      const si = doc.createElementNS(NS.main, "si");
      const addT = (parent: Element, value: string) => {
        const t = doc.createElementNS(NS.main, "t");
        if (/^\s|\s$|\n/.test(value)) t.setAttributeNS("http://www.w3.org/XML/1998/namespace", "xml:space", "preserve");
        t.textContent = value;
        parent.appendChild(t);
      };
      if (plain) {
        addT(si, text);
        return si;
      }
      runs.forEach((run, i) => {
        if (!run.text) return;
        const r = doc.createElementNS(NS.main, "r");
        if (i > 0 || run.bold !== undefined || run.color) {
          const rPr = doc.createElementNS(NS.main, "rPr");
          if (run.bold) rPr.appendChild(doc.createElementNS(NS.main, "b"));
          const sz = font ? firstChild(font, "sz") : null;
          if (sz) {
            const el = doc.createElementNS(NS.main, "sz");
            el.setAttribute("val", sz.getAttribute("val") ?? "11");
            rPr.appendChild(el);
          }
          const color = doc.createElementNS(NS.main, "color");
          if (run.color === "red") color.setAttribute("rgb", "FFFF0000");
          else if (run.color === "green") color.setAttribute("rgb", "FF00B050");
          else color.setAttribute("theme", "1");
          rPr.appendChild(color);
          const name = font ? firstChild(font, "name") : null;
          if (name) {
            const el = doc.createElementNS(NS.main, "rFont");
            el.setAttribute("val", name.getAttribute("val") ?? "Calibri");
            rPr.appendChild(el);
          }
          const family = font ? firstChild(font, "family") : null;
          if (family) {
            const el = doc.createElementNS(NS.main, "family");
            el.setAttribute("val", family.getAttribute("val") ?? "2");
            rPr.appendChild(el);
          }
          r.appendChild(rPr);
        }
        addT(r, run.text);
        si.appendChild(r);
      });
      return si;
    });
    for (const child of Array.from(cell.children)) cell.removeChild(child);
    cell.setAttribute("t", "s");
    const v = this.doc.createElementNS(NS.main, "v");
    v.textContent = String(index);
    cell.appendChild(v);
    this.pkg.touch(this.path);
  }

  /** Clears values (keeps formatting) of every cell inside the range. */
  clearRange(range: string) {
    const r = parseRange(range);
    for (const row of childrenByName(this.sheetData(), "row")) {
      const n = Number(row.getAttribute("r"));
      if (n < r.r1 || n > r.r2) continue;
      for (const c of childrenByName(row, "c")) {
        const pos = parseRef(c.getAttribute("r") ?? "A1");
        if (pos.col < r.c1 || pos.col > r.c2) continue;
        for (const child of Array.from(c.children)) c.removeChild(child);
        c.removeAttribute("t");
      }
    }
    this.pkg.touch(this.path);
  }

  /** Gives the cells of `toRow` (columns c1..c2) the borders of `fromRow`, keeping their fill and font. */
  async copyRowBorders(fromRow: number, toRow: number, c1: number, c2: number) {
    if (fromRow === toRow) return;
    const src = this.findRow(fromRow, false);
    if (!src) return;
    for (const c of childrenByName(src, "c")) {
      const pos = parseRef(c.getAttribute("r") ?? "A1");
      if (pos.col < c1 || pos.col > c2) continue;
      const borderId = await this.pkg.styleAttr(Number(c.getAttribute("s") ?? 0), "borderId");
      const target = this.findCell(formatRef({ col: pos.col, row: toRow }), true) as Element;
      const style = await this.pkg.deriveStyle(Number(target.getAttribute("s") ?? 0), { borderId });
      target.setAttribute("s", String(style));
    }
    this.pkg.touch(this.path);
  }

  /** "Orange, Accent 2, Lighter 80%" (theme colour 5, tint 0.8): background of renewable items. */
  renewableFill(): Promise<number> {
    return this.pkg.themeFill(5, 0.79998168889431442);
  }

  async setFill(ref: string, fillId: number) {
    const cell = this.findCell(ref, true) as Element;
    const style = await this.pkg.deriveStyle(Number(cell.getAttribute("s") ?? 0), { fillId });
    cell.setAttribute("s", String(style));
    this.pkg.touch(this.path);
  }

  /** Column span of a set of cells, widened by the merges they start. */
  columnSpan(refs: string[]): [number, number] {
    let c1 = Infinity;
    let c2 = -Infinity;
    for (const ref of refs) {
      const r = parseRange(ref);
      const m = this.mergeOf(formatRef({ col: r.c1, row: r.r1 }));
      c1 = Math.min(c1, r.c1, m?.c1 ?? Infinity);
      c2 = Math.max(c2, r.c2, m?.c2 ?? -Infinity);
    }
    return [c1, c2];
  }

  hideRows(from: number, to: number) {
    for (let r = from; r <= to; r += 1) {
      const row = this.findRow(r, true) as Element;
      row.setAttribute("hidden", "1");
    }
    this.pkg.touch(this.path);
  }

  hideColumns(range: string) {
    const [a, b] = range.split(":");
    const c1 = colToIndex(a);
    const c2 = colToIndex(b ?? a);
    let cols = descendants(this.doc, "cols")[0];
    if (!cols) {
      cols = this.doc.createElementNS(NS.main, "cols");
      this.doc.documentElement.insertBefore(cols, this.sheetData());
    }
    // Expand existing <col> ranges to single columns, apply, and write them back.
    const perCol = new Map<number, Record<string, string>>();
    for (const col of childrenByName(cols, "col")) {
      const min = Number(col.getAttribute("min"));
      const max = Number(col.getAttribute("max"));
      const attrs: Record<string, string> = {};
      for (const at of Array.from(col.attributes)) if (at.name !== "min" && at.name !== "max") attrs[at.name] = at.value;
      for (let c = min; c <= max; c += 1) perCol.set(c, { ...attrs });
    }
    const defaultWidth = descendants(this.doc, "sheetFormatPr")[0]?.getAttribute("defaultColWidth") ?? "9.140625";
    for (let c = c1; c <= c2; c += 1) {
      const attrs = perCol.get(c) ?? { width: defaultWidth, customWidth: "1" };
      attrs.hidden = "1";
      perCol.set(c, attrs);
    }
    while (cols.firstChild) cols.removeChild(cols.firstChild);
    const sorted = Array.from(perCol.keys()).sort((x, y) => x - y);
    let i = 0;
    while (i < sorted.length) {
      const start = sorted[i];
      const attrs = perCol.get(start) as Record<string, string>;
      const key = JSON.stringify(attrs);
      let end = start;
      while (i + 1 < sorted.length && sorted[i + 1] === end + 1 && JSON.stringify(perCol.get(sorted[i + 1])) === key) {
        i += 1;
        end = sorted[i];
      }
      const el = this.doc.createElementNS(NS.main, "col");
      el.setAttribute("min", String(start));
      el.setAttribute("max", String(end));
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
      cols.appendChild(el);
      i += 1;
    }
    this.pkg.touch(this.path);
  }

  isRowHidden(row: number): boolean {
    return this.findRow(row, false)?.getAttribute("hidden") === "1";
  }

  isColHidden(col: number): boolean {
    const c = descendants(this.doc, "col").find((el) => Number(el.getAttribute("min")) <= col && Number(el.getAttribute("max")) >= col);
    return c?.getAttribute("hidden") === "1";
  }

  /** Geometry in EMU, used to place and find pictures. */
  geometry(): SheetGeometry {
    return new SheetGeometry(this.doc);
  }

  async drawingPath(): Promise<string | null> {
    const drawing = descendants(this.doc, "drawing")[0];
    if (!drawing) return null;
    const rid = drawing.getAttributeNS(NS.rel, "id") ?? drawing.getAttribute("r:id");
    const rel = (await this.pkg.rels(this.path)).find((r) => r.id === rid);
    return rel?.path ?? null;
  }
}

// ------------------------------------------------------------------ geometry

const EMU_PER_PX = 9525;
const EMU_PER_PT = 12700;

export class SheetGeometry {
  private colWidth = new Map<number, number>();
  private rowHeight = new Map<number, number>();
  private defaultColPx: number;
  private defaultRowEmu: number;
  private colPrefix: number[] = [0];
  private rowPrefix: number[] = [0];

  constructor(doc: Document) {
    const fmt = descendants(doc, "sheetFormatPr")[0];
    const dcw = fmt?.getAttribute("defaultColWidth");
    const bcw = fmt?.getAttribute("baseColWidth");
    const defaultChars = dcw ? Number(dcw) : (bcw ? Number(bcw) : 8) + 0.71;
    this.defaultColPx = Math.trunc(defaultChars * 7 + 5);
    this.defaultRowEmu = Math.round(Number(fmt?.getAttribute("defaultRowHeight") ?? "15") * EMU_PER_PT);
    for (const col of descendants(doc, "col")) {
      const min = Number(col.getAttribute("min"));
      const max = Number(col.getAttribute("max"));
      const hidden = col.getAttribute("hidden") === "1";
      const px = hidden ? 0 : Math.trunc(Number(col.getAttribute("width") ?? defaultChars) * 7 + 5);
      for (let c = min; c <= Math.min(max, 2000); c += 1) this.colWidth.set(c, px * EMU_PER_PX);
    }
    for (const row of descendants(doc, "row")) {
      const r = Number(row.getAttribute("r"));
      const hidden = row.getAttribute("hidden") === "1";
      const ht = row.getAttribute("ht");
      this.rowHeight.set(r, hidden ? 0 : ht ? Math.round(Number(ht) * EMU_PER_PT) : this.defaultRowEmu);
    }
  }

  colEmu(col: number): number {
    return this.colWidth.get(col) ?? this.defaultColPx * EMU_PER_PX;
  }

  rowEmu(row: number): number {
    return this.rowHeight.get(row) ?? this.defaultRowEmu;
  }

  /** X of the left edge of a 1-based column. */
  x(col: number): number {
    while (this.colPrefix.length < col) this.colPrefix.push(this.colPrefix[this.colPrefix.length - 1] + this.colEmu(this.colPrefix.length));
    return this.colPrefix[col - 1];
  }

  y(row: number): number {
    while (this.rowPrefix.length < row) this.rowPrefix.push(this.rowPrefix[this.rowPrefix.length - 1] + this.rowEmu(this.rowPrefix.length));
    return this.rowPrefix[row - 1];
  }

  rect(range: Range) {
    return { x1: this.x(range.c1), y1: this.y(range.r1), x2: this.x(range.c2 + 1), y2: this.y(range.r2 + 1) };
  }

  /** Converts an absolute position into (1-based cell, offset) for drawing anchors. */
  cellAt(x: number, y: number): { col: number; colOff: number; row: number; rowOff: number } {
    let col = 1;
    while (this.x(col + 1) <= x && col < 16384) col += 1;
    let row = 1;
    while (this.y(row + 1) <= y && row < 1048576) row += 1;
    return { col, colOff: Math.max(0, Math.round(x - this.x(col))), row, rowOff: Math.max(0, Math.round(y - this.y(row))) };
  }
}
