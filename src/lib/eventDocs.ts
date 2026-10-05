import * as XLSX from "@e965/xlsx";

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
  sections: EventSection[];
  updated_at?: string;
}

export const SECTION_META: Record<
  SectionType,
  { label: string; sheet: string; groupLabel: string; hasValue?: boolean; hasPrice?: boolean; hasTitles?: boolean }
> = {
  daily: { label: "Entrada Diária", sheet: "Daily Entry", groupLabel: "Fila" },
  mission: { label: "Missões", sheet: "Missions", groupLabel: "Missão", hasTitles: true },
  doit: { label: "Faça se Puder", sheet: "Do it if you can", groupLabel: "Missão", hasTitles: true },
  tribe: { label: "Desafio da Tribo", sheet: "Tribe Challenge", groupLabel: "Missão", hasTitles: true },
  exchange: { label: "Troca", sheet: "Exchange activity", groupLabel: "Grupo", hasValue: true },
  ammo: { label: "Venda de Munição", sheet: "Ammunitions sale", groupLabel: "Bloco", hasPrice: true },
  recharge: { label: "Recarga", sheet: "Recharge", groupLabel: "Faixa" },
  consume: { label: "Consumo", sheet: "Consume", groupLabel: "Faixa" },
  recharge_extra: { label: "Recarga Extra", sheet: "Recharge Extra", groupLabel: "Faixa" },
  consume_extra: { label: "Consumo Extra", sheet: "Consume Extra", groupLabel: "Faixa" },
  ranking_recharge: { label: "Ranking de Recarga", sheet: "Ranking Recharge", groupLabel: "Posição" },
  ranking_consume: { label: "Ranking de Consumo", sheet: "Ranking Consume", groupLabel: "Posição" },
};

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
    if (items.length === 0) out.push({ section: name, message: "Seção sem itens" });
    items.forEach((it) => {
      if (!it.id || it.id.toUpperCase().startsWith("XX"))
        out.push({ section: name, message: `Item pendente (XXX): ${it.name || "sem nome"}` });
      else if (!knownIds.has(it.id)) out.push({ section: name, message: `ID ${it.id} não existe no painel` });
    });
  });
  return out;
}

export function exportDocumentXlsx(doc: EventDocument) {
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();
  doc.sections.forEach((s) => {
    const meta = SECTION_META[s.type];
    const rows: (string | number)[][] = [];
    rows.push([`${meta.sheet.toUpperCase()} ${s.servers}`]);
    rows.push([`DATE ENTRY: ${fmtDate(s.start)}`]);
    rows.push([`DATE END: ${fmtDate(s.end)}`]);
    if (s.notes) rows.push([s.notes]);
    rows.push([]);
    if (meta.hasTitles) {
      if (s.titleEn) rows.push([`Title: ${s.titleEn}`]);
      rows.push(["PORTUGUESE TRANSLATION"]);
      rows.push(["Title:", s.titlePt]);
      rows.push(["Description:", s.descPt]);
      rows.push([]);
    }
    if (s.exchangeItem) rows.push(["EXCHANGE ITEM", s.exchangeItem], []);
    s.groups.forEach((g) => {
      rows.push([g.label]);
      if (meta.hasValue) {
        rows.push(["Value", "Item Name", "ID / Amount", "Condition"]);
        g.items.forEach((it) =>
          rows.push([g.value ?? "", `${it.name}\n${it.validity}`, `${it.id || "XXX"}*${it.qty}`, it.condition ?? ""]),
        );
      } else if (meta.hasPrice) {
        rows.push(["Item Name", "Value", "ID", "Amount", "Condition"]);
        g.items.forEach((it) =>
          rows.push([`${it.name}\n${it.validity}`, it.price ?? "", it.id || "XXX", `*${it.qty}`, it.condition ?? ""]),
        );
      } else {
        rows.push(["Item Name", "ID / Amount"]);
        g.items.forEach((it, i) =>
          rows.push([`${it.name}\n${it.validity}`, i === 0 ? idLine(g.items) : ""]),
        );
      }
      rows.push([]);
    });
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 45 }, { wch: 40 }, { wch: 22 }, { wch: 14 }, { wch: 30 }];
    let name = `BR-${meta.sheet} ${s.servers}`.slice(0, 31);
    let n = 2;
    while (used.has(name)) name = `${name.slice(0, 28)} ${n++}`;
    used.add(name);
    XLSX.utils.book_append_sheet(wb, ws, name);
  });
  if (doc.sections.length === 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Vazio"]]), "Doc");
  XLSX.writeFile(wb, `${doc.title.replace(/[^\w\- ]+/g, "_")}.xlsx`);
}
