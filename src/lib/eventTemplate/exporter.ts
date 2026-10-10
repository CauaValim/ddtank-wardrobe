import { Drawing, type ImageData } from "./drawing";
import { FormatContext, itemLabel, renderFormat, richRuns } from "./format";
import { Range, Worksheet, XlsxPackage, formatRef, parseRange } from "./ooxml";
import { isRenewable, normalizeSection, paginateSection, tierTotals } from "./rules";
import { hasPrizes, orderSections } from "./model";
import type { BlockSpec, DecorationSpec, EventBlock, EventDocument, EventItem, EventSection, FieldSpec, LayoutSpec, SetSpec, SlotSpec, TemplateManifest } from "./types";

export interface ExportDeps {
  /** Returns the PNG of an item (or null when there is no image). */
  loadImage: (item: EventItem) => Promise<ImageData | null>;
  /** Arquivo das solicitações manuais; só é pedido quando o documento tem alguma. */
  loadRequests?: () => Promise<ArrayBuffer>;
}

export interface ExportResult {
  data: ArrayBuffer;
  fileName: string;
  warnings: string[];
}

const INVALID_SHEET_CHARS = /[\\/?*[\]:]/g;

export function sheetNameFor(layout: LayoutSpec, servers: string, used: Set<string>): string {
  const base = layout.sheetNamePattern.replace("{servers}", servers).replace(INVALID_SHEET_CHARS, "-").replace(/\s+/g, " ").trim().slice(0, 31) || "Evento";
  let name = base;
  let n = 2;
  while (used.has(name.toLowerCase())) {
    const suffix = ` ${n}`;
    name = `${base.slice(0, 31 - suffix.length)}${suffix}`;
    n += 1;
  }
  used.add(name.toLowerCase());
  return name;
}

export function exportFileName(doc: EventDocument): string {
  const safe = doc.title.normalize("NFC").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim() || "Documento de eventos";
  return `${safe}.xlsx`;
}

export function layoutById(manifest: TemplateManifest, id: string): LayoutSpec {
  const layout = manifest.layouts.find((l) => l.id === id);
  if (!layout) throw new Error(`Layout "${id}" não existe na versão ${manifest.version} do modelo`);
  return layout;
}

interface FillContext {
  doc: EventDocument;
  section: EventSection | null;
  layout: LayoutSpec;
  ws: Worksheet;
  drawing: Drawing | null;
  deps: ExportDeps;
  warnings: string[];
  imageCache: Map<string, Promise<ImageData | null>>;
  where: string;
}

function baseContext(ctx: FillContext): FormatContext {
  return {
    servers: ctx.section?.servers || ctx.doc.servers,
    docTitle: (ctx.doc.theme || ctx.doc.title || "").trim(),
    docServers: ctx.doc.servers,
    sectionFields: ctx.section?.fields ?? {},
  };
}

async function writeField(ctx: FillContext, field: FieldSpec, values: Record<string, string>, groups?: Record<string, EventItem[]>) {
  const value = values[field.key];
  if (field.input !== "derived" && field.input !== "datetime" && !value && field.format === "{value}") {
    ctx.ws.clear(field.cell);
    return;
  }
  const text = renderFormat(field.format, { ...baseContext(ctx), value, fields: values, groups });
  await ctx.ws.setRich(field.cell, richRuns(field.rich, text));
}

async function clearField(ctx: FillContext, field: FieldSpec) {
  ctx.ws.clear(field.cell);
}

async function imageFor(ctx: FillContext, item: EventItem): Promise<ImageData | null> {
  const key = item.imageUrl || item.id;
  if (!ctx.imageCache.has(key)) ctx.imageCache.set(key, ctx.deps.loadImage(item).catch(() => null));
  const image = await (ctx.imageCache.get(key) as Promise<ImageData | null>);
  if (!image) ctx.warnings.push(`${ctx.where}: "${item.name || item.id}" foi exportado sem imagem`);
  return image;
}

function imageRanges(layout: LayoutSpec): string[] {
  const out: string[] = [];
  const visit = (blocks: BlockSpec[]) => blocks.forEach((b) => {
    b.groups.forEach((g) => g.slots.forEach((s) => s.image && out.push(s.image)));
    if (b.children) visit(b.children.blocks);
  });
  layout.sets.forEach((s) => visit(s.blocks));
  return out;
}

const overlaps = (a: Range, b: Range) => a.c1 <= b.c2 && b.c1 <= a.c2 && a.r1 <= b.r2 && b.r1 <= a.r2;

/**
 * Onde a imagem do item fica centralizada: a célula mesclada inteira, quando ela é só desse
 * espaço de imagem; quando a mesclagem guarda vários itens (ex.: dois itens empilhados numa
 * célula), cada um fica no meio da sua parte.
 */
function imageArea(ws: Worksheet, layout: LayoutSpec, range: string): Range {
  const r = parseRange(range);
  const merge = ws.mergeOf(formatRef({ col: r.c1, row: r.r1 }));
  if (!merge) return r;
  const shared = imageRanges(layout).some((other) => other !== range && overlaps(parseRange(other), merge));
  if (shared) return r;
  return { c1: Math.min(r.c1, merge.c1), r1: Math.min(r.r1, merge.r1), c2: Math.max(r.c2, merge.c2), r2: Math.max(r.r2, merge.r2) };
}

function slotBottom(slot: SlotSpec): number {
  let row = slot.hideRows?.[1] ?? 0;
  if (slot.image) row = Math.max(row, parseRange(slot.image).r2);
  for (const c of slot.cells) row = Math.max(row, parseRange(c.cell).r2);
  return row;
}

function blockRefs(spec: BlockSpec): string[] {
  const refs = spec.fields.map((f) => f.cell);
  for (const g of spec.groups) for (const slot of g.slots) {
    refs.push(...slot.cells.map((c) => c.cell));
    if (slot.image) refs.push(slot.image);
  }
  return refs;
}

async function fillBlock(ctx: FillContext, spec: BlockSpec, data: EventBlock | undefined, label: string) {
  const used = data != null;
  for (const field of spec.fields) {
    if (used) await writeField(ctx, field, data.fields, data.groups);
    else await clearField(ctx, field);
  }
  for (const group of spec.groups) {
    const items = used ? data.groups[group.key] ?? [] : [];
    if (items.length > group.slots.length) {
      throw new Error(`${ctx.where} · ${label}: "${group.label}" tem ${items.length} itens, mas o modelo comporta ${group.slots.length}`);
    }
    // Text cells (a cell may be shared by several slots: bundles are written together).
    const cellTexts = new Map<string, { rich: (typeof group.slots)[number]["cells"][number]["rich"]; parts: string[] }>();
    group.slots.forEach((slot, i) => {
      const item = items[i];
      for (const cell of slot.cells) {
        const entry = cellTexts.get(cell.cell) ?? { rich: cell.rich, parts: [] };
        if (item) {
          entry.parts.push(cell.format === "{label}" ? itemLabel(item, group.labelStyle) : renderFormat(cell.format, { ...baseContext(ctx), item, labelStyle: group.labelStyle, groups: data?.groups }));
        }
        cellTexts.set(cell.cell, entry);
      }
    });
    for (const [cell, entry] of cellTexts) {
      const text = entry.parts.filter(Boolean).join(entry.rich === "itemLabel" ? "\n\n" : "\n");
      if (!text) ctx.ws.clear(cell);
      else await ctx.ws.setRich(cell, richRuns(entry.rich, text));
    }
    // Background of the name cell follows the item's validity, like in the template:
    // timed items (and every renewable / non-renewable one) get "Orange, Accent 2, Lighter 80%".
    if (group.kind === "items") {
      const fills = ctx.layout.durationFill;
      const byCell = new Map<string, EventItem[]>();
      for (const [i, slot] of group.slots.entries()) {
        const cell = slot.cells.find((c) => c.format === "{label}")?.cell;
        if (items[i] && cell) byCell.set(cell, [...(byCell.get(cell) ?? []), items[i]]);
      }
      for (const [cell, cellItems] of byCell) {
        const renewable = cellItems.some((it) => isRenewable(it.duration));
        if (fills) {
          const timed = renewable || /\d+\s*(days?|dias?)/i.test(cellItems[0].duration);
          await ctx.ws.setFill(cell, timed ? fills.timed : fills.permanent);
        } else if (renewable) {
          await ctx.ws.setFill(cell, await ctx.ws.renewableFill());
        }
      }
    }
    // Images: slots sharing the same box are filled together.
    const boxes = new Map<string, (ImageData | null)[]>();
    for (const [i, slot] of group.slots.entries()) {
      if (!slot.image) continue;
      const item = items[i];
      const list = boxes.get(slot.image) ?? [];
      list.push(item ? await imageFor(ctx, item) : null);
      boxes.set(slot.image, list);
    }
    if (ctx.drawing) {
      for (const [range, images] of boxes) {
        await ctx.drawing.fillBox(imageArea(ctx.ws, ctx.layout, range), images, `${label} ${group.label}`);
      }
      const defaults = Object.fromEntries((ctx.layout.itemFields ?? []).map((f) => [f.key, f.default ?? ""]));
      for (const [i, slot] of group.slots.entries()) {
        // The same picture may be listed once per variant (e.g. the coupon icon centred or beside the Lcps one).
        const byMedia = new Map<string, DecorationSpec[]>();
        for (const deco of slot.decorations ?? []) byMedia.set(`${deco.media} ${deco.box}`, [...(byMedia.get(`${deco.media} ${deco.box}`) ?? []), deco]);
        for (const variants of byMedia.values()) {
          const item = items[i];
          const match = item && variants.find((d) => Object.entries(d.when).every(([k, v]) => (item.extra?.[k] || defaults[k] || "") === v));
          await ctx.drawing.ensureDecoration(variants[0].media, parseRange(variants[0].box), !!match, match ? match.offset : undefined);
        }
      }
    }
    group.slots.forEach((slot, i) => {
      if (!items[i] && slot.hideRows && used) ctx.ws.hideRows(slot.hideRows[0], slot.hideRows[1]);
    });
    // The table's bottom border lives on the last slot: carry it to the last visible one.
    const last = group.slots[group.slots.length - 1];
    if (used && items.length > 0 && items.length < group.slots.length && last.hideRows) {
      const [c1, c2] = ctx.ws.columnSpan(blockRefs(spec));
      await ctx.ws.copyRowBorders(slotBottom(last), slotBottom(group.slots[items.length - 1]), c1, c2);
    }
  }
  if (spec.children) await fillSet(ctx, spec.children, used ? data.children ?? [] : [], label);
  if (!used) {
    if (spec.hideRows) ctx.ws.hideRows(spec.hideRows[0], spec.hideRows[1]);
    if (spec.hideCols) ctx.ws.hideColumns(spec.hideCols);
  }
}

/** `blocks` may have holes (undefined): those positions are cleared and hidden, like unused blocks. */
async function fillSet(ctx: FillContext, set: SetSpec, blocks: (EventBlock | undefined)[], parent = "") {
  if (blocks.length > set.blocks.length) {
    throw new Error(`${ctx.where}: "${set.label}" tem ${blocks.length} ${set.blockLabel.toLowerCase()}(s), mas o modelo comporta ${set.blocks.length}`);
  }
  for (const [i, spec] of set.blocks.entries()) {
    await fillBlock(ctx, spec, blocks[i], `${parent ? `${parent} › ` : ""}${set.blockLabel} ${i + 1}`);
  }
  const lastSpec = set.blocks[set.blocks.length - 1];
  const lastUsed = set.blocks[blocks.length - 1];
  const height = (b: BlockSpec) => (b.hideRows ? b.hideRows[1] - b.hideRows[0] : -1);
  if (blocks.length > 0 && blocks.length < set.blocks.length && lastSpec.hideRows && lastUsed?.hideRows && height(lastSpec) === height(lastUsed)) {
    const [c1, c2] = ctx.ws.columnSpan(set.blocks.flatMap(blockRefs));
    await ctx.ws.copyRowBorders(lastSpec.hideRows[1], lastUsed.hideRows[1], c1, c2);
  }
}

async function fillSheet(ctx: FillContext, coverOnly: boolean) {
  const { layout, section, ws } = ctx;
  for (const field of layout.fields) {
    await writeField(ctx, field, section?.fields ?? {}, undefined);
  }
  for (const set of layout.sets) await fillSet(ctx, set, section?.sets[set.key] ?? []);
  for (const rule of layout.hideWhenEmpty ?? []) {
    const block = section?.sets[rule.set]?.[rule.block];
    if (!block || (block.groups[rule.group] ?? []).length === 0) ws.hideRows(rule.rows[0], rule.rows[1]);
  }
  for (const range of layout.clearRanges ?? []) ws.clearRange(range);
  // Quadro "TOTAL" (Recarga / Consumo): calculado das faixas que podem ser repetidas.
  if (section) for (const t of tierTotals(layout, section)) ws.setNumber(t.cell, t.value);
  if (coverOnly && layout.cover) ws.hideColumns(layout.cover.hideColsWithoutSection);
  if (ctx.drawing) {
    await ctx.drawing.removeHidden((r) => ws.isRowHidden(r), (c) => ws.isColHidden(c));
    await ctx.drawing.pruneUnusedRels();
  }
}

/**
 * Generates the workbook for a document using the official template.
 * The cover (first tab of the template) always comes first.
 */
export async function exportDocument(template: ArrayBuffer, manifest: TemplateManifest, doc: EventDocument, deps: ExportDeps): Promise<ExportResult> {
  const pkg = await XlsxPackage.load(template);
  const warnings: string[] = [];
  // Solicitações manuais: as abas vêm de um arquivo separado e entram no final do documento.
  const requestSheets = [...new Set(doc.sections.map((s) => layoutById(manifest, s.layoutId)).filter((l) => l.type === "request").map((l) => l.sheet))];
  if (requestSheets.length > 0) {
    if (!deps.loadRequests) throw new Error("O documento tem solicitações manuais, mas o arquivo das solicitações não foi carregado");
    await pkg.importSheets(await XlsxPackage.load(await deps.loadRequests()), requestSheets);
  }
  // Modelos sem capa (ex.: códigos) não têm a primeira aba fixa.
  const cover = manifest.coverLayout ? layoutById(manifest, manifest.coverLayout) : null;
  const sections = orderSections(doc.sections); // solicitações manuais saem no final
  const coverIndex = cover ? sections.findIndex((s) => s.layoutId === cover.id) : -1;
  const coverSection = coverIndex >= 0 ? sections.splice(coverIndex, 1)[0] : null;
  // A aba da Entrada Diária (com "EVENT FOR THE SERVERS") só entra quando ela tem premiação.
  const withCover = !!cover && hasPrizes(coverSection);
  if (!withCover && sections.length === 0) throw new Error("O documento não tem nenhuma aba para exportar: adicione prêmios à Entrada Diária ou outra seção");
  // Sections larger than one tab (missions without limit) become continuation tabs.
  const entries: { section: EventSection | null; layout: LayoutSpec }[] = [
    ...(withCover && cover ? [{ section: coverSection, layout: cover }] : []),
    ...sections.flatMap((s) => {
      const layout = layoutById(manifest, s.layoutId);
      // Textos padronizados (preço com ponto, limite da munição) mesmo em seções editadas depois de abertas.
      return paginateSection(layout, normalizeSection(layout, s)).map((page) => ({ section: page, layout }));
    }),
  ];

  const usedSources = new Set<string>();
  const finalNames = new Set<string>();
  const plan: { current: string; final: string }[] = [];
  let copy = 0;
  for (const entry of entries) {
    let current = entry.layout.sheet;
    if (usedSources.has(current)) {
      copy += 1;
      const tmp = `__copia_${copy}`;
      await pkg.duplicateSheet(current, tmp);
      current = tmp;
    }
    usedSources.add(entry.layout.sheet);
    plan.push({ current, final: sheetNameFor(entry.layout, entry.section?.servers || doc.servers, finalNames) });
  }

  const imageCache = new Map<string, Promise<ImageData | null>>();
  for (const [i, entry] of entries.entries()) {
    const ws = await pkg.worksheet(plan[i].current);
    const drawing = await Drawing.open(ws);
    await fillSheet({
      doc,
      section: entry.section,
      layout: entry.layout,
      ws,
      drawing,
      deps,
      warnings,
      imageCache,
      where: entry.section ? `${i}. ${entry.layout.label}` : "Capa",
    }, entry.section == null);
  }

  await pkg.finalizeSheets(plan);
  return { data: await pkg.save(), fileName: exportFileName(doc), warnings };
}
