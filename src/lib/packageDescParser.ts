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

/** Frase que anuncia o conteúdo antes dos dois-pontos ("Ao abrir, você receberá", "Abra para obter"). */
const CONTENT_INTRO = /(?:receb|obt[eé]|obter|ganh|cont[eé]m|inclu|recompensa|abr[ai])[^:：]*$/i;

const STAT_OR_PERIOD =
  /^(?:[+＋]?\s*\d+\s*(?:de\s+)?)?(?:ataque|defesa|agilidade|[áa]gil|sorte|vida|hp|dano|armadura|guarda|precis[ãa]o|cr[íi]tico)\b|^\d+\s*(?:dias?|horas?|minutos?)$|^permanente?$|per[íi]odo de validade/i;

const SEPARATORS = /[,，、;；\n]+/;
const LEADING_MARKER_REGEX =
  /^\s*(?:inclui|incluso|inclusos|contem|contém|cont[ée]m|obter|obtem|obtém|obtenha|receber|recebe|ganhar|ganha|ganhará|recompensa|recompensas|pacote com|itens?)\s*[:：\-–]?\s+/i;

/** Remove marcadores como "Contém", "Inclui" do início de um nome. */
export function stripLeadingMarker(name: string): string {
  let out = name.trim();
  for (let i = 0; i < 3; i++) {
    const next = out.replace(LEADING_MARKER_REGEX, "").trim();
    if (next === out) break;
    out = next;
  }
  return out || name.trim();
}
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
  // Itens sem quantidade só valem depois de uma introdução de conteúdo ("Inclui:", "você receberá:");
  // em "fonte: evento" e parecidos, só entram trechos com quantidade explícita.
  let allowBare = false;
  // Introdução terminada em dois-pontos ("Ao abrir, você receberá:", "Abra para obter:"):
  // a lista começa depois dela, desde que antes não haja quantidade ("*1", "x10").
  const colon = text.search(/[:：]/);
  if (colon !== -1 && !/[*×]\s*\d|\bx\s*\d/i.test(text.slice(0, colon))) {
    start = colon + 1;
    allowBare = CONTENT_INTRO.test(text.slice(0, colon));
  }
  if (start === -1) {
    for (const marker of INTRO_MARKERS) {
      const idx = lower.indexOf(marker);
      if (idx !== -1 && (start === -1 || idx < start)) start = idx + marker.length;
    }
    allowBare = start !== -1;
  }
  if (start !== -1) text = text.slice(start);

  text = stripNoise(text)
    // "… *600 e também obterá aleatoriamente: Item *1" -> "… *600, Item *1"
    .replace(/\s+e\s+tamb[ée]m\b[^:：]*[:：]/gi, ",")
    // outras frases no meio da lista que terminam em dois-pontos
    .replace(/([,，;；])\s*[^,，;；:：*×]*[:：]/g, "$1");
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
    } else if (allowBare) {
      // após um marcador (ex.: "Inclui:") itens sem quantidade valem 1
      name = part;
      qty = 1;
      // ignora frases longas (provável texto explicativo)
      if (name.split(/\s+/).length > 8) continue;
    } else {
      continue;
    }

    name = name.replace(/^[-•·\s]+/, "").trim();
    name = stripLeadingMarker(name);
    if (!name || name.length < 2 || !Number.isFinite(qty) || qty <= 0) continue;
    // ignora trechos que são apenas números ou frases longas demais
    if (/^\d+$/.test(name) || name.length > 60) continue;
    // bônus de atributo de títulos ("Ataque +5", "20 defesa") e prazos ("15 Dias") não são itens
    if (STAT_OR_PERIOD.test(name)) continue;

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

/** Similaridade 0..1 baseada em distância de Levenshtein. */
export function nameSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const m = a.length;
  const n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return 1 - prev[n] / Math.max(m, n);
}

// Em pulseiras (8), anéis (9) e medalhas (40) o Property1 é o nível do item (+6), não a marca de baú.
const LEVELED_TYPES = new Set(["8", "9", "40"]);

/** O jogo marca baús e pacotes que se abrem com Property1 = 6 (attribute1 no painel). */
export const isOpenablePackage = (attributes: Record<string, string | undefined>) =>
  attributes.attribute1 === "6" && !LEVELED_TYPES.has(String(attributes.type ?? ""));
