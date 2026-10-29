/**
 * Financeiro: vendas da Venda de Munição lidas da planilha "Histórico - Venda de munição" (aba Base),
 * a mesma que alimenta o relatório Financeiro do Data Studio. Aqui ficam a leitura do CSV e as
 * contas de cada aba da página.
 */

export interface Sale {
  /** AAAA-MM-DD (início da semana do DDTank). */
  date: string;
  /** Mês e semana do DDTank, como na planilha (o mês do DDTank não é o mês do calendário). */
  month: string;
  week: number;
  /** "Outubro - Semana 4": chave das semanas, em ordem de data. */
  period: string;
  server: string;
  item: string;
  validity: string;
  bound: boolean;
  pack: number;
  available: number;
  sold: number;
  price: number;
  /** Coluna "Venda por CPs e LCPs": Sim conta em Cupons, Não em L.Cupons (como no relatório). */
  cupons: boolean;
  totalCupons: number;
  totalBrl: number;
}

/** CSV com aspas, aspas dobradas e quebras de linha dentro das aspas. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** Número no formato da planilha: "25.000", "  475.000 ", " R$  237,50 ", " -" e "#VALUE!" (zero). */
export function sheetNumber(v: string | undefined): number {
  const s = (v ?? "").replace(/R\$|¥|₺/g, "").trim();
  if (!/\d/.test(s) || s.startsWith("#")) return 0;
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

const MONTHS: Record<string, string> = {
  january: "Janeiro", february: "Fevereiro", march: "Março", april: "Abril", may: "Maio", june: "Junho",
  july: "Julho", august: "Agosto", september: "Setembro", october: "Outubro", november: "Novembro", december: "Dezembro",
};

/** "[30 Days - renewable]" -> "30 dias (renovável)"; "[Permanent]" -> "Permanente". */
export function validityLabel(v: string): string {
  const s = v.replace(/[[\]]/g, "").trim().toLowerCase();
  if (s.startsWith("perman")) return "Permanente";
  const m = /^(\d+)\s*days?\s*-?\s*(non)?/.exec(s);
  if (!m) return v.replace(/[[\]]/g, "").trim();
  return `${m[1]} dias (${m[2] ? "não renovável" : "renovável"})`;
}

/** "12/27/2025" (mês/dia/ano) -> "2025-12-27". */
function isoDate(v: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v.trim());
  return m ? `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` : null;
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9$]/g, "");

/** Colunas pelo título (a ordem das colunas pode mudar na planilha). */
const COLUMNS = {
  date: "data",
  week: "semana",
  month: "mes",
  server: "servidor",
  item: "item",
  validity: "validade",
  bound: "limitacao",
  pack: "packporcompra",
  available: "quantidadedisponivel",
  sold: "quantidadevendida",
  price: "valorvenda",
  cupons: "vendaporcpselcps",
  totalCupons: "totalemcupons",
  totalBrl: "totalemr$",
} as const;

/** Linhas da aba Base. Linhas sem data ou sem item ficam de fora. */
export function parseSales(csv: string): Sale[] {
  const [header, ...rows] = parseCsv(csv);
  if (!header) return [];
  const keys = header.map(norm);
  const col = Object.fromEntries(Object.entries(COLUMNS).map(([k, title]) => [k, keys.indexOf(title)])) as Record<keyof typeof COLUMNS, number>;
  const missing = Object.entries(col).filter(([, i]) => i < 0).map(([k]) => k);
  if (missing.length) throw new Error(`A planilha não tem as colunas: ${missing.join(", ")}`);

  const out: Sale[] = [];
  for (const r of rows) {
    const date = isoDate(r[col.date] ?? "");
    const item = (r[col.item] ?? "").trim();
    if (!date || !item) continue;
    const monthKey = (r[col.month] ?? "").trim().toLowerCase();
    const month = MONTHS[monthKey] ?? (r[col.month] ?? "").trim();
    const week = Number(/\d+/.exec(r[col.week] ?? "")?.[0] ?? 0);
    out.push({
      date,
      month,
      week,
      period: `${month} - Semana ${week}`,
      server: (r[col.server] ?? "").trim(),
      item,
      validity: validityLabel(r[col.validity] ?? ""),
      bound: /bound/i.test(r[col.bound] ?? "") && !/unbound/i.test(r[col.bound] ?? ""),
      pack: sheetNumber(r[col.pack]),
      available: sheetNumber(r[col.available]),
      sold: sheetNumber(r[col.sold]),
      price: sheetNumber(r[col.price]),
      cupons: /^s/i.test((r[col.cupons] ?? "").trim()),
      totalCupons: sheetNumber(r[col.totalCupons]),
      totalBrl: sheetNumber(r[col.totalBrl]),
    });
  }
  return out;
}

export interface SaleFilter {
  item?: string;
  server?: string;
  month?: string;
  period?: string;
  /** "cupons" (Sim) ou "lcupons" (Não). */
  currency?: "cupons" | "lcupons" | "";
  validity?: string;
}

export function filterSales(sales: Sale[], f: SaleFilter): Sale[] {
  return sales.filter(
    (s) =>
      (!f.item || s.item === f.item) &&
      (!f.server || s.server === f.server) &&
      (!f.month || s.month === f.month) &&
      (!f.period || s.period === f.period) &&
      (!f.validity || s.validity === f.validity) &&
      (!f.currency || s.cupons === (f.currency === "cupons")),
  );
}

/** Valores distintos em ordem de data (semanas e meses) ou alfabética. */
export function options(sales: Sale[], key: "item" | "server" | "month" | "period" | "validity"): string[] {
  const values = new Map<string, string>();
  for (const s of sales) if (!values.has(s[key])) values.set(s[key], s.date);
  const list = [...values.keys()];
  return key === "month" || key === "period" ? list.sort((a, b) => values.get(a)!.localeCompare(values.get(b)!)) : list.sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function sumBy<K extends string>(sales: Sale[], key: (s: Sale) => K, value: (s: Sale) => number): Map<K, number> {
  const m = new Map<K, number>();
  for (const s of sales) m.set(key(s), (m.get(key(s)) ?? 0) + value(s));
  return m;
}

const sortedDesc = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]);

export interface Totals {
  cupons: number;
  lcupons: number;
  all: number;
  brl: number;
  sold: number;
}

export function totals(sales: Sale[]): Totals {
  let cupons = 0, lcupons = 0, brl = 0, sold = 0;
  for (const s of sales) {
    if (s.cupons) cupons += s.totalCupons;
    else lcupons += s.totalCupons;
    brl += s.totalBrl;
    sold += s.sold;
  }
  return { cupons, lcupons, all: cupons + lcupons, brl, sold };
}

/** Guia de criação: preço mínimo e máximo já registrados do item, por servidor, moeda, pack e quantidade. */
export interface GuideRow {
  server: string;
  cupons: boolean;
  pack: number;
  available: number;
  minPrice: number;
  maxPrice: number;
  sold: number;
  lastDate: string;
}

export function guideRows(sales: Sale[]): GuideRow[] {
  const groups = new Map<string, GuideRow>();
  for (const s of sales) {
    const key = [s.server, s.cupons, s.pack, s.available].join("|");
    const g = groups.get(key);
    if (!g) {
      groups.set(key, { server: s.server, cupons: s.cupons, pack: s.pack, available: s.available, minPrice: s.price, maxPrice: s.price, sold: s.sold, lastDate: s.date });
    } else {
      g.minPrice = Math.min(g.minPrice, s.price);
      g.maxPrice = Math.max(g.maxPrice, s.price);
      g.sold += s.sold;
      if (s.date > g.lastDate) g.lastDate = s.date;
    }
  }
  return [...groups.values()].sort((a, b) => a.server.localeCompare(b.server) || Number(b.cupons) - Number(a.cupons) || a.pack - b.pack);
}

/** Vendas por semana e item (Top mais e menos vendidos). */
export interface WeekItemRow {
  period: string;
  date: string;
  item: string;
  cupons: boolean;
  sold: number;
}

export function weekItemRows(sales: Sale[]): WeekItemRow[] {
  const groups = new Map<string, WeekItemRow>();
  for (const s of sales) {
    const key = [s.period, s.item, s.cupons].join("|");
    const g = groups.get(key);
    if (g) g.sold += s.sold;
    else groups.set(key, { period: s.period, date: s.date, item: s.item, cupons: s.cupons, sold: s.sold });
  }
  return [...groups.values()];
}

export const topSold = (rows: WeekItemRow[], n = 20) => [...rows].sort((a, b) => b.sold - a.sold || b.date.localeCompare(a.date)).slice(0, n);
export const leastSold = (rows: WeekItemRow[], n = 20) => [...rows].sort((a, b) => a.sold - b.sold || a.date.localeCompare(b.date)).slice(0, n);

/** Total em cupons e quantidade vendida por item, do maior para o menor. */
export function byItem(sales: Sale[]): { item: string; sold: number; total: number }[] {
  const total = sumBy(sales, (s) => s.item, (s) => s.totalCupons);
  const sold = sumBy(sales, (s) => s.item, (s) => s.sold);
  return sortedDesc(total).map(([item, t]) => ({ item, total: t, sold: sold.get(item) ?? 0 }));
}

export const byServer = (sales: Sale[], value: (s: Sale) => number = (s) => s.totalCupons) =>
  sortedDesc(sumBy(sales, (s) => s.server, value)).map(([server, total]) => ({ server, total }));

/** Total em cupons por semana (em ordem de data), separado em Cupons e L.Cupons. */
export function byPeriod(sales: Sale[]): { period: string; cupons: number; lcupons: number; brl: number }[] {
  const out = new Map<string, { period: string; date: string; cupons: number; lcupons: number; brl: number }>();
  for (const s of sales) {
    const g = out.get(s.period) ?? { period: s.period, date: s.date, cupons: 0, lcupons: 0, brl: 0 };
    if (s.cupons) g.cupons += s.totalCupons;
    else g.lcupons += s.totalCupons;
    g.brl += s.totalBrl;
    if (s.date < g.date) g.date = s.date;
    out.set(s.period, g);
  }
  return [...out.values()].sort((a, b) => a.date.localeCompare(b.date)).map(({ date: _date, ...r }) => r);
}

/** Tabela semana x servidor (total em cupons). */
export function periodServerTable(sales: Sale[]): { periods: string[]; servers: string[]; value: (period: string, server: string) => number } {
  const periods = options(sales, "period");
  const servers = byServer(sales).map((s) => s.server);
  const m = sumBy(sales, (s) => `${s.period}|${s.server}`, (s) => s.totalCupons);
  return { periods, servers, value: (p, s) => m.get(`${p}|${s}`) ?? 0 };
}
