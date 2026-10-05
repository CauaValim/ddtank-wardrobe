import { joinDateTime, parseFormat, parseIdLine, parseItemLabel, serialToDate, splitBundle } from "./format";
import { Worksheet, XlsxPackage } from "./ooxml";
import type { BlockSpec, EventBlock, EventDocument, EventItem, EventSection, FieldSpec, GroupSpec, LayoutSpec, SetSpec, TemplateManifest } from "./types";

/**
 * Reads tabs that follow the official template back into document sections.
 * Used to start a document from an existing spreadsheet and by the round-trip test.
 */

const newId = () => Math.random().toString(36).slice(2, 10);

async function readField(ws: Worksheet, field: FieldSpec): Promise<string> {
  let text = await ws.getText(field.cell);
  if (field.input === "datetime" && ws.isNumeric(field.cell) && /^\d+(\.\d+)?$/.test(text)) {
    const serial = Number(text);
    const time = serial % 1;
    const minutes = Math.round(time * 24 * 60);
    text = `${serialToDate(serial)} ${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  }
  if (!text) return "";
  if (field.input === "datetime") {
    const parsed = parseFormat(field.format, text);
    const date = /(\d{2}\/\d{2}\/\d{4})/.exec(parsed?.date ?? text)?.[1] ?? "";
    const time = /(\d{2}:\d{2})/.exec(parsed?.time ?? text)?.[1] ?? "00:00";
    return joinDateTime(date, time);
  }
  const parsed = parseFormat(field.format, text);
  return (parsed?.value ?? text).trim();
}

function guessServers(text: string): string | null {
  const m = /s1\s*-\s*s?\d{3}/.exec(text);
  return m ? m[0].replace(/\s+/g, "") : null;
}

async function readGroup(ws: Worksheet, group: GroupSpec, block: BlockSpec): Promise<EventItem[]> {
  // Item names (a cell shared by several slots holds a bundle separated by blank lines).
  const nameCells = new Map<string, string[]>();
  const items: (EventItem | null)[] = [];
  for (const slot of group.slots) {
    const labelCell = slot.cells.find((c) => c.format === "{label}");
    const nameCell = slot.cells.find((c) => c.format.includes("{name}"));
    let label = "";
    if (labelCell) {
      if (!nameCells.has(labelCell.cell)) nameCells.set(labelCell.cell, splitBundle(await ws.getText(labelCell.cell)));
      label = nameCells.get(labelCell.cell)?.shift() ?? "";
    }
    const item: EventItem = { id: "", name: "", qty: 1, duration: "", bind: "", extra: {} };
    if (label) Object.assign(item, parseItemLabel(label));
    for (const cell of slot.cells) {
      if (cell === labelCell) continue;
      const text = (await ws.getText(cell.cell)).trim();
      if (!text) continue;
      const parsed = parseFormat(cell.format, text);
      if (!parsed) continue;
      for (const [k, v] of Object.entries(parsed)) {
        if (k === "idAmount") {
          const [tok] = parseIdLine(v);
          if (tok) {
            item.id = tok.id;
            item.qty = tok.qty;
          }
        } else if (k === "id") item.id = v.replace(/^ID:\s*/i, "");
        else if (k === "qty") item.qty = Number(v.replace(/\./g, "")) || 1;
        else if (k === "name") item.name = item.name || v;
        else if (k !== "label") (item.extra as Record<string, string>)[k] = v;
      }
      if (nameCell === cell && parsed.name) item.name = parsed.name;
    }
    const present = !!(item.name || item.id);
    items.push(present ? item : null);
  }
  // IDs coming from a line shared by the block ({idLine:g}, {orLine:g}, {idList:g}).
  const lineField = block.fields.find((f) => new RegExp(`\\{(idLine|orLine|idList):${group.key}\\}`).test(f.format));
  if (lineField) {
    const text = await ws.getText(lineField.cell);
    const parsed = parseFormat(lineField.format, text);
    const raw = parsed ? Object.values(parsed)[0] ?? "" : text;
    const tokens = parseIdLine(raw);
    let k = 0;
    for (const item of items) {
      if (!item) continue;
      const tok = tokens[k];
      k += 1;
      if (!tok) continue;
      if (!item.id) item.id = tok.id;
      if (/idLine|orLine/.test(lineField.format)) item.qty = tok.qty;
    }
  }
  // Requirement quantities written only in a combined sentence.
  if (group.kind === "requirements") {
    const sentence = block.fields.find((f) => f.format.includes("{requirementsList}"));
    if (sentence) {
      const text = await ws.getText(sentence.cell);
      const pairs = Array.from(text.matchAll(/(\d+)\s*"\s*([^"]+?)\s*"/g));
      items.forEach((item, i) => {
        if (item && pairs[i]) item.qty = Number(pairs[i][1]) || item.qty;
      });
    }
  }
  const result = items.filter((x): x is EventItem => x != null);
  for (const item of result) if (item.extra && Object.keys(item.extra).length === 0) delete item.extra;
  return result;
}

async function readBlock(ws: Worksheet, spec: BlockSpec): Promise<EventBlock | null> {
  const fields: Record<string, string> = {};
  for (const f of spec.fields) if (f.input !== "derived") fields[f.key] = await readField(ws, f);
  const groups: Record<string, EventItem[]> = {};
  for (const g of spec.groups) groups[g.key] = await readGroup(ws, g, spec);
  const children = spec.children ? await readSet(ws, spec.children) : undefined;
  const hasContent = Object.values(groups).some((g) => g.length > 0)
    || (children?.length ?? 0) > 0
    || spec.fields.some((f) => f.input !== "derived" && f.input !== "datetime" && fields[f.key]);
  if (!hasContent) return null;
  const block: EventBlock = { fields, groups };
  if (children) block.children = children;
  return block;
}

async function readSet(ws: Worksheet, set: SetSpec): Promise<EventBlock[]> {
  const out: EventBlock[] = [];
  for (const spec of set.blocks) {
    const block = await readBlock(ws, spec);
    if (!block) break;
    out.push(block);
  }
  return out;
}

export async function readSection(pkg: XlsxPackage, layout: LayoutSpec, sheetName = layout.sheet): Promise<EventSection> {
  const ws = await pkg.worksheet(sheetName);
  const fields: Record<string, string> = {};
  let servers: string | null = null;
  for (const f of layout.fields) {
    if (f.input === "derived") {
      if (!servers && /\{servers/.test(f.format)) servers = guessServers(await ws.getText(f.cell));
      continue;
    }
    fields[f.key] = await readField(ws, f);
  }
  const sets: Record<string, EventBlock[]> = {};
  for (const set of layout.sets) sets[set.key] = await readSet(ws, set);
  // Some layouts keep dates per block (Faça se Puder em 2 dias): mirror the first one at section level.
  const firstBlock = Object.values(sets)[0]?.[0];
  if (!fields.start && firstBlock?.fields.start) fields.start = firstBlock.fields.start;
  if (!fields.end && firstBlock?.fields.end) fields.end = firstBlock.fields.end;
  return { id: newId(), layoutId: layout.id, servers: servers ?? guessServers(sheetName) ?? "s1-s401", fields, sets };
}

/** Builds a document from a workbook that follows the template (one section per recognised tab). */
export async function readDocument(data: ArrayBuffer, manifest: TemplateManifest): Promise<Omit<EventDocument, "id">> {
  const pkg = await XlsxPackage.load(data);
  const sheets = await pkg.sheets();
  const sections: EventSection[] = [];
  let title = "";
  let servers = "s1-s401";
  for (const sheet of sheets) {
    const layout = manifest.layouts.find((l) => l.sheet === sheet.name)
      ?? manifest.layouts.find((l) => new RegExp(`^${l.sheetNamePattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace("\\{servers\\}", "s1\\s*-\\s*s?\\d{3}")}(\\s+\\d+)?$`).test(sheet.name));
    if (!layout) continue;
    const section = await readSection(pkg, layout, sheet.name);
    if (layout.id === manifest.coverLayout) {
      const cover = layout.fields.find((f) => f.key === "coverTitle");
      if (cover) {
        const parsed = parseFormat(cover.format, await (await pkg.worksheet(sheet.name)).getText(cover.cell));
        if (parsed) {
          title = parsed.docTitle ?? "";
          servers = parsed.docServers || servers;
        }
      }
    }
    sections.push(section);
  }
  return {
    title: title || "Documento importado",
    theme: title || null,
    servers,
    start_date: null,
    end_date: null,
    status: "draft",
    template_version: manifest.version,
    sections,
  };
}
