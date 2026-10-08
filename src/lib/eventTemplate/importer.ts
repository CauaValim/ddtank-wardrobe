import { joinDateTime, parseFormat, parseIdLine, parseItemLabel, serialToDate, splitBundle } from "./format";
import { Worksheet, XlsxPackage } from "./ooxml";
import { normalizeSection, pagination } from "./rules";
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

/** "s1-s401", "s1 - s401" or a single new server such as "s402". */
const SERVERS = /\bs\d+(?:\s*-\s*s?\d+)?\b/i;

function guessServers(text: string): string | null {
  const m = SERVERS.exec(text);
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

/** `skipEmpty`: continuation tabs may leave a position empty before a mission with choices. */
async function readSet(ws: Worksheet, set: SetSpec, skipEmpty = false): Promise<EventBlock[]> {
  const out: EventBlock[] = [];
  for (const [i, spec] of set.blocks.entries()) {
    const block = await readBlock(ws, spec);
    if (!block) {
      if (skipEmpty && (spec.hideRows ? ws.isRowHidden(spec.hideRows[0]) : true) && i < set.blocks.length - 1) continue;
      break;
    }
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
  for (const set of layout.sets) sets[set.key] = await readSet(ws, set, !!pagination(layout, set.key));
  // Some layouts keep dates per block (Faça se Puder em 2 dias): mirror the first one at section level.
  const firstBlock = Object.values(sets)[0]?.[0];
  if (!fields.start && firstBlock?.fields.start) fields.start = firstBlock.fields.start;
  if (!fields.end && firstBlock?.fields.end) fields.end = firstBlock.fields.end;
  return normalizeSection(layout, { id: newId(), layoutId: layout.id, servers: servers ?? guessServers(sheetName) ?? "s1-s401", fields, sets });
}

/**
 * Layout types a tab name points to. Sheet names vary a lot across past spreadsheets
 * ("BR-Recharge s401", "(BR) Recharge s1-s400", "BR - Ranking Consume s402 100k"), and some
 * layouts share the exact same structure (Recharge × Consume, the two Rankings), so the name
 * decides the type and the structure decides the layout inside it.
 */
/** "BR-Lottery {servers}" -> reconhece "BR-Lottery s1-s401", "BR-Lottery s402 2"... */
function namePattern(layout: LayoutSpec): RegExp {
  const [before, after = ""] = layout.sheetNamePattern.split("{servers}");
  const esc = (s: string) => s.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s*");
  return new RegExp(`^${esc(before)}\\s*s\\d[\\w\\s-]*${esc(after)}(\\s+\\d+)?$`, "i");
}

function typesFromName(name: string): string[] {
  const n = name.toLowerCase();
  if (/ranking/.test(n)) return /recharge|recarga/.test(n) ? ["ranking_recharge"] : /consum/.test(n) ? ["ranking_consume"] : [];
  if (/mission|missõ|missao/.test(n)) return ["mission"];
  if (/daily|entrada/.test(n)) return ["daily"];
  if (/do it if you can|faça se/.test(n)) return ["doit"];
  if (/tribe|tribo/.test(n)) return ["tribe"];
  if (/ammunition|munição|municao/.test(n)) return /vip/.test(n) ? [] : ["ammo"];
  if (/exchange|troca/.test(n)) return /extra|kick/.test(n) ? [] : ["exchange"];
  if (/newbie|novato/.test(n)) return [];
  if (/recharge|recarga/.test(n)) return /extra/.test(n) ? ["recharge_extra"] : ["recharge"];
  if (/consum/.test(n)) return /extra/.test(n) ? ["consume_extra"] : ["consume"];
  return [];
}

const hasLiteral = (format: string) => /[A-Za-z]{3}/.test(format.replace(/\{[^}]+\}/g, ""));

/** Fraction of the layout's fixed texts ("ACTIVE MISSIONS {servers}", "RECHARGE OF {value} COUPONS") found in place. */
async function anchorScore(ws: Worksheet, layout: LayoutSpec): Promise<number> {
  const fields = [...layout.fields, ...layout.sets.flatMap((s) => s.blocks[0]?.fields ?? [])].filter((f) => hasLiteral(f.format));
  if (fields.length === 0) return 0;
  let ok = 0;
  for (const f of fields) {
    const text = await ws.getText(f.cell);
    if (text.trim() && parseFormat(f.format, text)) ok += 1;
  }
  return ok / fields.length;
}

/** Minimum structure (merged cells + fixed texts) to read a tab with a layout. */
const MIN_MATCH = 0.75;

/**
 * Finds the layout of a tab: the name gives the type, the merged cells and the fixed texts
 * choose among the layouts of that type. Tabs that do not look like any layout are skipped.
 */
export async function detectLayout(pkg: XlsxPackage, manifest: TemplateManifest, sheetName: string): Promise<LayoutSpec | null> {
  const exact = manifest.layouts.find((l) => l.sheet === sheetName);
  const types = typesFromName(sheetName);
  const candidates = manifest.layouts.filter((l) => l === exact || types.includes(l.type) || (l.type === "request" && namePattern(l).test(sheetName)));
  if (candidates.length === 0) return null;
  const ws = await pkg.worksheet(sheetName);
  let best: LayoutSpec | null = null;
  let bestScore = -1;
  for (const l of candidates) {
    const score = ws.mergeScore(l.signature ?? []) + (await anchorScore(ws, l)) + (l === exact ? 0.001 : 0);
    if (score > bestScore) {
      best = l;
      bestScore = score;
    }
  }
  return bestScore >= MIN_MATCH ? best : null;
}

/** Headers or ID lines read as item names: the tab is shifted compared with the layout. */
const looksMisread = (name: string) => /^(item name|name:|id\s*[:/]|the above items)/i.test(name.trim()) || /\S\*\d/.test(name);

function allItems(blocks: EventBlock[]): EventItem[] {
  return blocks.flatMap((b) => [...Object.values(b.groups).flat(), ...allItems(b.children ?? [])]);
}

/** Drops a section read from a tab that does not really follow the layout (old variations of a tab). */
function plausible(section: EventSection): boolean {
  const items = allItems(Object.values(section.sets).flat());
  if (items.length === 0) return true;
  return items.filter((i) => looksMisread(i.name)).length / items.length <= 0.3;
}

/** "BR-Missions s1-s401 2" is the continuation of "BR-Missions s1-s401": join them back into one section. */
function isContinuation(prev: { layout: LayoutSpec; sheet: string } | null, layout: LayoutSpec, sheet: string): boolean {
  if (!prev || prev.layout.id !== layout.id || !layout.sets.some((s) => pagination(layout, s.key))) return false;
  const base = (name: string) => name.replace(/\s+\d+$/, "");
  return /\s+\d+$/.test(sheet) && base(sheet) === base(prev.sheet);
}

/** Builds a document from a workbook that follows the template (one section per recognised tab). */
export async function readDocument(data: ArrayBuffer, manifest: TemplateManifest): Promise<Omit<EventDocument, "id">> {
  const pkg = await XlsxPackage.load(data);
  const sheets = await pkg.sheets();
  const sections: EventSection[] = [];
  let title = "";
  let servers = "s1-s401";
  let prev: { layout: LayoutSpec; sheet: string } | null = null;
  for (const sheet of sheets) {
    const layout = await detectLayout(pkg, manifest, sheet.name);
    if (!layout) continue;
    const section = await readSection(pkg, layout, sheet.name);
    if (!plausible(section)) continue;
    if (isContinuation(prev, layout, sheet.name)) {
      const target = sections[sections.length - 1];
      for (const [key, blocks] of Object.entries(section.sets)) target.sets[key] = [...(target.sets[key] ?? []), ...blocks];
      prev = { layout, sheet: sheet.name };
      continue;
    }
    prev = { layout, sheet: sheet.name };
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
    // A capa sem Entrada Diária (e abas vazias) não vira seção.
    if (layout.sets.length > 0 && Object.values(section.sets).every((blocks) => blocks.length === 0)) continue;
    sections.push(section);
  }
  // Sem capa: os servidores mais comuns entre as abas ("s402" em planilhas de servidores novos).
  if (!title && sections.length) {
    const count = new Map<string, number>();
    for (const s of sections) count.set(s.servers, (count.get(s.servers) ?? 0) + 1);
    servers = [...count.entries()].sort((a, b) => b[1] - a[1])[0][0];
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
