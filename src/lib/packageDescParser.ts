export interface ParsedContentEntry {
  name: string;
  quantity: number;
}

const INTRO_MARKERS = [
  "inclui:",
  "recompensa:",
  "recompensas:",
  "obter:",
  "obtem:",
  "obtém:",
  "receber:",
  "ganhar:",
  "ganhará:",
  "contem:",
  "contém:",
];

const SEPARATORS = /[,，、;；\n]+/;
const QTY_REGEX = /^(.*?)\s*(?:[x×*]\s*(\d{1,6})|\s(\d{1,6}))\s*$/i;
const LEADING_QTY_REGEX = /^(\d{1,6})\s*[x×*]\s*(.+)$/i;

function stripNoise(raw: string): string {
  return raw
    // remove parenteses explicativos
    .replace(/[（(][^）)]*[）)]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extrai pares nome/quantidade a partir da descrição de um pacote/baú.
 */
export function parsePackageDescription(desc?: string | null): ParsedContentEntry[] {
  if (!desc) return [];
  let text = desc.trim();
  if (!text) return [];

  const lower = text.toLowerCase();
  let start = -1;
  for (const marker of INTRO_MARKERS) {
    const idx = lower.indexOf(marker);
    if (idx !== -1 && (start === -1 || idx < start)) start = idx + marker.length;
  }
  if (start !== -1) text = text.slice(start);

  text = stripNoise(text);
  if (!text) return [];

  const entries: ParsedContentEntry[] = [];
  for (const chunk of text.split(SEPARATORS)) {
    const part = chunk.replace(/[.。]+$/, "").trim();
    if (!part || part.length < 2) continue;

    let name: string;
    let qty: number;

    const leading = part.match(LEADING_QTY_REGEX);
    const match = part.match(QTY_REGEX);
    if (leading) {
      qty = Number(leading[1]);
      name = leading[2];
    } else if (match) {
      name = match[1];
      qty = Number(match[2] ?? match[3]);
    } else if (start !== -1) {
      // após um marcador (ex.: "Inclui:") itens sem quantidade valem 1
      name = part;
      qty = 1;
      // ignora frases longas (provável texto explicativo)
      if (name.split(/\s+/).length > 8) continue;
    } else {
      continue;
    }

    name = name.replace(/^[-•·\s]+/, "").trim();
    if (!name || name.length < 2 || !Number.isFinite(qty) || qty <= 0) continue;
    // ignora trechos que são apenas números ou frases longas demais
    if (/^\d+$/.test(name) || name.length > 60) continue;

    entries.push({ name, quantity: qty });
  }

  return entries;
}

export function normalizeItemName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function hasParsableContents(desc?: string | null): boolean {
  return parsePackageDescription(desc).length > 0;
}
