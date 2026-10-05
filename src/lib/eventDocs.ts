import * as XLSX from "@e965/xlsx";
import templateAsset from "@/assets/templates/ddtank-events-16-years.xlsx.asset.json";
import { applyWorkbookChanges, finalizeWorkbookTemplate, type WorksheetCellChanges, type WorksheetImageChange } from "@/lib/xlsxPreservation";

export type SectionType =
  | "daily"
  | "mission"
  | "doit"
  | "tribe"
  | "exchange"
  | "ammo"
  | "recharge"
  | "consume"
  | "recharge_extra"
  | "consume_extra"
  | "ranking_recharge"
  | "ranking_consume";

export interface EventItem {
  id: string; // ID do item ou "XXX"
  name: string;
  qty: number;
  validity: string;
  condition?: string;
  price?: string;
}

export interface EventGroup {
  label: string; // Fila 3 / Grupo A / Faixa 1.000 / 1º lugar
  value?: string; // custo da troca (ex.: 11568*5)
  items: EventItem[];
}

export interface EventSection {
  id: string;
  type: SectionType;
  titleEn: string;
  titlePt: string;
  descPt: string;
  servers: string;
  start: string; // datetime-local
  end: string;
  notes: string;
  exchangeItem?: string;
  templateSheet?: string;
  templateVersion?: string;
  groups: EventGroup[];
}

export interface EventDocument {
  id: string;
  title: string;
  theme: string | null;
  servers: string;
  start_date: string | null;
  end_date: string | null;
  status: "draft" | "final";
  template_version?: string;
  sections: EventSection[];
  updated_at?: string;
}

export const SECTION_META: Record<
  SectionType,
  { label: string; sheet: string; template: string[]; groupLabel: string; hasValue?: boolean; hasPrice?: boolean; hasTitles?: boolean }
> = {
  daily: { label: "Entrada Diária", sheet: "Daily Entry", template: ["BR-Daily Entry - 14D s1-s401"], groupLabel: "Fila" },
  mission: { label: "Missões", sheet: "Missions", template: ["BR-Missions s1-s401", "BR-Missions s1-s402 1", "BR-Missions s1-s402 2"], groupLabel: "Missão", hasTitles: true },
  doit: { label: "Faça se Puder", sheet: "Do it if you can", template: ["BR-Do it if you can s1-s401", "BR - Do it if you can s1-s401"], groupLabel: "Missão", hasTitles: true },
  tribe: { label: "Desafio da Tribo", sheet: "Tribe Challenge", template: ["BR-Tribe Challenge s1-s401"], groupLabel: "Missão", hasTitles: true },
  exchange: { label: "Troca", sheet: "Exchange activity", template: ["BR-Exchange activity s1-s401", "BR-Exchange activity s1-s402 1", "BR-Exchange activity s1-402 2", "BR-Exchange activity s1-s402 3", "BR-Exchange activity s1-s402 4", "BR-Exchange activity s1-s402 5"], groupLabel: "Grupo", hasValue: true },
  ammo: { label: "Venda de Munição", sheet: "Ammunitions sale", template: ["BR - Ammunitions sale s1-s401"], groupLabel: "Bloco", hasPrice: true },
  recharge: { label: "Recarga", sheet: "Recharge", template: ["BR - Recharge s1-s401"], groupLabel: "Faixa" },
  consume: { label: "Consumo", sheet: "Consume", template: ["BR - Consume s1-s401"], groupLabel: "Faixa" },
  recharge_extra: { label: "Recarga Extra", sheet: "Recharge Extra", template: ["BR - Recharge Extra s1-s401"], groupLabel: "Faixa" },
  consume_extra: { label: "Consumo Extra", sheet: "Consume Extra", template: ["BR - Consume Extra s1-s401"], groupLabel: "Faixa" },
  ranking_recharge: { label: "Ranking de Recarga", sheet: "Ranking Recharge", template: ["BR-Ranking Recharge s1-s401"], groupLabel: "Posição" },
  ranking_consume: { label: "Ranking de Consumo", sheet: "Ranking Consume", template: ["BR-Ranking Consume s1-s401"], groupLabel: "Posição" },
};

export const EVENT_TEMPLATE_VERSION = "16-anos-v1";

export const newId = () => Math.random().toString(36).slice(2, 10);

export function newSection(type: SectionType, servers: string): EventSection {
  const meta = SECTION_META[type];
  return {
    id: newId(),
    type,
    titleEn: "",
    titlePt: "",
    descPt: "",
    servers,
    start: "",
    end: "",
    notes: "",
    templateVersion: EVENT_TEMPLATE_VERSION,
    groups: [{ label: `${meta.groupLabel} 1`, items: [] }],
  };
}

/** Gera a linha "ID*Qtd,ID*Qtd" */
export const idLine = (items: EventItem[]) =>
  items.map((i) => `${i.id || "XXX"}*${i.qty || 1}`).join(",");

const fmtDate = (v: string) => {
  if (!v) return "(--/--/----) - --:--";
  const [d, t] = v.split("T");
  const [y, m, day] = d.split("-");
  return `(${m}/${day}/${y}) - ${t?.slice(0, 5) ?? "00:00"}`;
};

export interface ValidationIssue {
  section: string;
  message: string;
}

export function validateDocument(doc: EventDocument, knownIds: Set<string>): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  doc.sections.forEach((s, idx) => {
    const name = `${idx + 1}. ${SECTION_META[s.type].label}`;
    if (!s.start || !s.end) out.push({ section: name, message: "Datas de início/fim não preenchidas" });
    else if (s.end < s.start) out.push({ section: name, message: "Data final antes da inicial" });
    const items = s.groups.flatMap((g) => g.items);
    if (!getTemplateSheet(s, doc.sections)) out.push({ section: name, message: "Não há outra aba deste tipo disponível no modelo" });
    if (items.length === 0) out.push({ section: name, message: "Seção sem itens" });
    items.forEach((it) => {
      if (!it.id || it.id.toUpperCase().startsWith("XX"))
        out.push({ section: name, message: `Item pendente (XXX): ${it.name || "sem nome"}` });
      else if (!knownIds.has(it.id)) out.push({ section: name, message: `ID ${it.id} não existe no painel` });
    });
  });
  return out;
}

function getTemplateSheet(section: EventSection, sections: EventSection[]): string | undefined {
  if (section.templateSheet) return section.templateSheet;
  const sameTypeIndex = sections.filter((candidate) => candidate.type === section.type).findIndex((candidate) => candidate.id === section.id);
  return SECTION_META[section.type].template[sameTypeIndex];
}

const cell = (changes: WorksheetCellChanges, sheet: string, ref: string, value: string | number) => {
  const sheetChanges = changes.get(sheet) ?? new Map<string, string | number>();
  sheetChanges.set(ref, value);
  changes.set(sheet, sheetChanges);
};

const fileName = (title: string) => `${title.replace(/[^\w\- ]+/g, "_")}.xlsx`;
const itemLabel = (item: EventItem) => `${item.name}\n${item.validity}`.trim();

function addImage(images: WorksheetImageChange[], sheetName: string, row: number, column: number, data?: ArrayBuffer) {
  images.push({ sheetName, row, column, data });
}

async function fetchImage(url: string): Promise<ArrayBuffer | undefined> {
  if (!url) return undefined;
  try {
    const response = await fetch(url);
    if (!response.ok) return undefined;
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
    bitmap.close();
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    return png?.arrayBuffer();
  } catch {
    return undefined;
  }
}

function nameForSection(section: EventSection, used: Set<string>): string {
  let name = `BR-${SECTION_META[section.type].sheet} ${section.servers}`.slice(0, 31);
  let suffix = 2;
  const base = name;
  while (used.has(name)) name = `${base.slice(0, 28)} ${suffix++}`;
  used.add(name);
  return name;
}

function commonFields(changes: WorksheetCellChanges, sheet: string, section: EventSection, data: unknown[][]) {
  for (let r = 0; r < Math.min(data.length, 12); r += 1) {
    for (let c = 0; c < (data[r]?.length ?? 0); c += 1) {
      const value = String(data[r]?.[c] ?? "");
      const ref = XLSX.utils.encode_cell({ r, c });
      if (/^DATE ENTRY:/i.test(value)) cell(changes, sheet, ref, `DATE ENTRY: ${fmtDate(section.start)}`);
      if (/^DATE END:/i.test(value)) cell(changes, sheet, ref, `DATE END: ${fmtDate(section.end)}`);
    }
  }
}

function fillTable(
  changes: WorksheetCellChanges,
  images: WorksheetImageChange[],
  sheet: string,
  section: EventSection,
  data: unknown[][],
  imageData: Map<string, ArrayBuffer | undefined>,
) {
  const headers: number[] = [];
  data.forEach((row, r) => {
    if (row.some((v) => /^(ITEM NAME|ITEMS \/ VALIDITY)$/i.test(String(v ?? "").trim()))) headers.push(r);
  });
  const allItems = section.groups.flatMap((group) => group.items);
  const isRanking = section.type.startsWith("ranking_");
  if (isRanking) {
    const placements = [[9, 8, 8], [13, 8, 8], [17, 8, 8], [21, 8, 8], [25, 8, 8], [9, 13, 13], [13, 13, 13], [17, 13, 13], [21, 13, 13], [25, 13, 13]];
    section.groups.forEach((group, groupIndex) => {
      const slot = placements[groupIndex];
      if (!slot) return;
      group.items.slice(0, 3).forEach((item, itemIndex) => cell(changes, sheet, XLSX.utils.encode_cell({ r: slot[0], c: slot[1] + itemIndex }), itemLabel(item)));
      cell(changes, sheet, XLSX.utils.encode_cell({ r: slot[0] + 1, c: slot[2] }), idLine(group.items));
    });
    return;
  }
  if (section.type === "daily") {
    const rows = data.map((row, index) => ({ row, index })).filter(({ row }) => /^Queue\s+/i.test(String(row[13] ?? "")));
    section.groups.forEach((group, groupIndex) => {
      const target = rows[groupIndex]?.index;
      if (target == null) return;
      cell(changes, sheet, XLSX.utils.encode_cell({ r: target, c: 13 }), group.label);
      group.items.slice(0, 3).forEach((item, itemIndex) => {
        const column = 15 + itemIndex * 3;
        cell(changes, sheet, XLSX.utils.encode_cell({ r: target, c: column }), itemLabel(item));
        addImage(images, sheet, target + 1, column + 1, imageData.get(item.id));
      });
      const idRow = Math.max(0, target - 1);
      cell(changes, sheet, XLSX.utils.encode_cell({ r: idRow, c: 14 }), idLine(group.items));
    });
    return;
  }
  if (["recharge", "consume", "recharge_extra", "consume_extra"].includes(section.type)) {
    const header = headers[0];
    if (header == null) return;
    const starts: number[] = [];
    for (let r = header + 1; r < data.length; r += 1) if (/^(RECHARGE|CONSUME) OF/i.test(String(data[r]?.[1] ?? ""))) starts.push(r);
    section.groups.forEach((group, groupIndex) => {
      const start = starts[groupIndex];
      if (start == null) return;
      cell(changes, sheet, XLSX.utils.encode_cell({ r: start, c: 1 }), group.label);
      cell(changes, sheet, XLSX.utils.encode_cell({ r: start, c: 3 }), idLine(group.items));
      group.items.slice(0, 3).forEach((item, itemIndex) => {
        const row = start + itemIndex;
        cell(changes, sheet, XLSX.utils.encode_cell({ r: row, c: 2 }), itemLabel(item));
        addImage(images, sheet, row + 1, 8 + itemIndex, imageData.get(item.id));
      });
    });
    return;
  }
  const itemRows: number[] = [];
  headers.forEach((header, headerIndex) => {
    const end = headers[headerIndex + 1] ?? data.length;
    for (let r = header + 1; r < end; r += 1) {
      const row = data[r] ?? [];
      if (row.some((v) => /DATE ENTRY|PORTUGUESE TRANSLATION/i.test(String(v ?? "")))) break;
      if (row.some((v) => String(v ?? "").includes("["))) itemRows.push(r);
    }
  });
  const slotCapacity = itemRows.length;
  if (allItems.length > slotCapacity) throw new Error(`${SECTION_META[section.type].label}: o modelo possui espaço para ${slotCapacity} item(ns)`);
  const nameCol = section.type === "ammo" ? 2 : section.type === "exchange" ? (headers[0] != null && String(data[headers[0]]?.[2] ?? "").toLowerCase() === "value" ? 5 : 4) : headers[0] != null ? Math.max(0, data[headers[0]].findIndex((v) => /^ITEM NAME$/i.test(String(v ?? "").trim()))) : 1;
  const imageColumn = section.type === "ammo" ? 4 : section.type === "exchange" ? nameCol + 5 : section.type === "mission" ? nameCol + 5 : nameCol + 4;
  const idCol = section.type === "ammo" ? 5 : section.type === "exchange" ? nameCol + 5 : section.type === "mission" ? nameCol + 6 : nameCol + 5;
  allItems.forEach((item, index) => {
    const row = itemRows[index];
    if (row == null) return;
    cell(changes, sheet, XLSX.utils.encode_cell({ r: row, c: nameCol }), itemLabel(item));
    if (section.type === "ammo") {
      cell(changes, sheet, XLSX.utils.encode_cell({ r: row, c: idCol }), item.id || "XXX");
      cell(changes, sheet, XLSX.utils.encode_cell({ r: row, c: idCol + 1 }), `*${item.qty}`);
      if (item.price) cell(changes, sheet, XLSX.utils.encode_cell({ r: row, c: 4 }), item.price);
      if (item.condition) cell(changes, sheet, XLSX.utils.encode_cell({ r: row, c: 7 }), item.condition);
    } else {
      cell(changes, sheet, XLSX.utils.encode_cell({ r: row, c: idCol }), `${item.id || "XXX"}*${item.qty}`);
    }
    addImage(images, sheet, row + 1, imageColumn, imageData.get(item.id));
  });
}

export async function exportDocumentFromTemplate(doc: EventDocument, getImage: (id: string) => string) {
  if (doc.sections.length === 0) throw new Error("Adicione ao menos uma seção antes de exportar");
  const response = await fetch(templateAsset.url);
  if (!response.ok) throw new Error("Não foi possível carregar o modelo oficial");
  const original = await response.arrayBuffer();
  const workbook = XLSX.read(original, { type: "array", cellDates: false });
  const selectedSheets = doc.sections.map((section) => getTemplateSheet(section, doc.sections));
  if (selectedSheets.some((name) => !name)) throw new Error("O modelo não possui abas suficientes para os eventos repetidos");
  const ids = [...new Set(doc.sections.flatMap((section) => section.groups.flatMap((group) => group.items.map((item) => item.id))))];
  const imageData = new Map<string, ArrayBuffer | undefined>();
  await Promise.all(ids.map(async (id) => imageData.set(id, await fetchImage(getImage(id)))));
  const changes: WorksheetCellChanges = new Map();
  const images: WorksheetImageChange[] = [];
  const renames = new Map<string, string>();
  const usedNames = new Set<string>();
  doc.sections.forEach((section, index) => {
    const sheet = selectedSheets[index];
    if (!sheet) return;
    const ws = workbook.Sheets[sheet];
    if (!ws) return;
    const data = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
    commonFields(changes, sheet, section, data);
    fillTable(changes, images, sheet, section, data, imageData);
    renames.set(sheet, nameForSection(section, usedNames));
  });
  const updated = await applyWorkbookChanges(original, changes);
  const finished = await finalizeWorkbookTemplate(updated, selectedSheets as string[], renames, images);
  const url = URL.createObjectURL(new Blob([finished], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName(doc.title);
  link.click();
  URL.revokeObjectURL(url);
}

