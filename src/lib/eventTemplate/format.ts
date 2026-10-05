import type { RichRun } from "./ooxml";
import type { EventItem, RichKind } from "./types";

// ------------------------------------------------------------------ datas

/** "2026-09-28T00:00" -> { date: "09/28/2026", time: "00:00" } (formato usado no modelo). */
export function splitDateTime(value: string | undefined): { date: string; time: string } {
  if (!value) return { date: "--/--/----", time: "--:--" };
  const [d, t] = value.split("T");
  const [y, m, day] = (d ?? "").split("-");
  if (!y || !m || !day) return { date: "--/--/----", time: "--:--" };
  return { date: `${m}/${day}/${y}`, time: (t ?? "00:00").slice(0, 5) };
}

export function joinDateTime(date: string, time = "00:00"): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(date.trim());
  if (!m) return "";
  return `${m[3]}-${m[1]}-${m[2]}T${(time || "00:00").trim().slice(0, 5)}`;
}

/** Excel serial date -> "MM/DD/YYYY". */
export function serialToDate(serial: number): string {
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCMonth() + 1)}/${p(d.getUTCDate())}/${d.getUTCFullYear()}`;
}

export const spacedServers = (servers: string) => servers.replace(/\s*-\s*/g, " - ");

// ------------------------------------------------------------------ itens

export function itemLabel(item: Pick<EventItem, "name" | "duration" | "bind">, style: "twoLines" | "inline"): string {
  const tags = [item.duration && `[${item.duration}]`, item.bind && `[${item.bind}]`].filter(Boolean).join(" ");
  if (!tags) return item.name;
  return `${item.name}${style === "twoLines" ? "\n" : " "}${tags}`;
}

const VALIDITY_TAG = /^\[?\s*(permanent|(?:un)?bound|\d+\s*days?\b.*|\d+\s*dias?\b.*)\s*\]?$/i;

/** True for "[Permanent]", "[Bound]", "[30 Days - renewable]"..., false for tags that belong to the name. */
export function isValidityTag(tag: string): boolean {
  return VALIDITY_TAG.test(tag.trim());
}

/** Index where the trailing validity tags start (or -1). */
function validityStart(text: string): number {
  const tags = Array.from(text.matchAll(/\[[^\][]*\]?/g));
  let start = -1;
  for (let i = tags.length - 1; i >= 0; i -= 1) {
    const m = tags[i];
    const end = (m.index ?? 0) + m[0].length;
    const after = text.slice(end, start < 0 ? text.length : start);
    if (after.trim() !== "" || !isValidityTag(m[0])) break;
    start = m.index ?? 0;
  }
  return start;
}

/** "Nome⏎[Permanent] [Bound]" -> partes. Tolera variações do modelo ("[Permanent ]", "[30 Days - renewable [Bound]"). */
export function parseItemLabel(text: string): { name: string; duration: string; bind: string } {
  const clean = text.replace(/\s+$/g, "");
  const first = validityStart(clean);
  if (first < 0) return { name: clean.trim(), duration: "", bind: "" };
  const name = clean.slice(0, first).trim();
  const tags = Array.from(clean.slice(first).matchAll(/\[\s*([^\][]+?)\s*(?=\]|\[|$)/g)).map((m) => m[1].trim());
  let duration = "";
  let bind = "";
  for (const t of tags) {
    if (/^(un)?bound$/i.test(t)) bind = t[0].toUpperCase() + t.slice(1).toLowerCase();
    else if (!duration) duration = t;
  }
  return { name, duration, bind };
}

export function splitBundle(text: string): string[] {
  return text.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
}

export function idAmount(item: Pick<EventItem, "id" | "qty">): string {
  return `${item.id?.trim() || "XXX"}*${item.qty || 1}`;
}

export function parseIdLine(text: string): { id: string; qty: number }[] {
  return text
    .split(/,|\bOR\b/i)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((tok) => {
      const m = /^([^*\s]+)\s*\*\s*([\d.]+)/.exec(tok);
      if (!m) return { id: tok.replace(/^ID:\s*/i, ""), qty: 1 };
      return { id: m[1], qty: Number(m[2].replace(/\./g, "")) || 1 };
    });
}

export function requirementsList(items: EventItem[]): string {
  const parts = items.map((i) => `${i.qty} "${i.name}"`);
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

// ------------------------------------------------------------------ marcadores

export interface FormatContext {
  value?: string;
  servers: string;
  docTitle: string;
  docServers: string;
  sectionFields: Record<string, string>;
  groups?: Record<string, EventItem[]>;
  item?: EventItem;
  labelStyle?: "twoLines" | "inline";
}

const PLACEHOLDER = /\{([a-zA-Z.]+)(?::([a-zA-Z]+))?\}/g;

export function renderFormat(format: string, ctx: FormatContext): string {
  const dt = splitDateTime(ctx.value);
  return format.replace(PLACEHOLDER, (_, name: string, arg?: string) => {
    const group = arg ? ctx.groups?.[arg] ?? [] : [];
    const item = ctx.item;
    switch (name) {
      case "value": return ctx.value ?? "";
      case "date": return dt.date;
      case "time": return dt.time;
      case "start.date": return splitDateTime(ctx.sectionFields.start).date;
      case "start.time": return splitDateTime(ctx.sectionFields.start).time;
      case "end.date": return splitDateTime(ctx.sectionFields.end).date;
      case "end.time": return splitDateTime(ctx.sectionFields.end).time;
      case "servers": return ctx.servers;
      case "serversSpaced": return spacedServers(ctx.servers);
      case "docTitle": return ctx.docTitle;
      case "docServers": return ctx.docServers;
      case "idLine": return group.map(idAmount).join(",");
      case "orLine": return group.map(idAmount).join(" OR ");
      case "idList": return group.map((i) => i.id || "XXX").join(", ");
      case "requirementsList": return requirementsList(ctx.groups?.requirements ?? []);
      case "label": return item ? itemLabel(item, ctx.labelStyle ?? "twoLines") : "";
      case "id": return item?.id || "XXX";
      case "qty": return String(item?.qty ?? 1);
      case "name": return item?.name ?? "";
      case "idAmount": return item ? idAmount(item) : "";
      default: return item?.extra?.[name] ?? "";
    }
  });
}

/** Reverse of renderFormat for one placeholder set. Whitespace in the literal parts is flexible. */
export function parseFormat(format: string, text: string): Record<string, string> | null {
  const names: string[] = [];
  let pattern = "";
  let last = 0;
  for (const m of format.matchAll(PLACEHOLDER)) {
    const literal = format.slice(last, m.index);
    pattern += literal.split(/\s+/).map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+");
    names.push(m[2] ? `${m[1]}:${m[2]}` : m[1]);
    pattern += "([\\s\\S]*?)";
    last = (m.index ?? 0) + m[0].length;
  }
  pattern += format.slice(last).split(/\s+/).map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+");
  const re = new RegExp(`^\\s*${pattern}\\s*$`);
  const m = re.exec(text);
  if (!m) return null;
  const out: Record<string, string> = {};
  names.forEach((n, i) => (out[n] = (m[i + 1] ?? "").trim()));
  return out;
}

// ------------------------------------------------------------------ texto rico

/** Converts the final text of a cell into runs following the conventions of the template. */
export function richRuns(kind: RichKind, text: string): RichRun[] {
  if (!text) return [];
  switch (kind) {
    case "itemLabel": {
      const runs: RichRun[] = [];
      const chunks = text.split(/(\n\s*\n)/);
      chunks.forEach((chunk) => {
        if (/^\n\s*\n$/.test(chunk)) {
          runs.push({ text: chunk });
          return;
        }
        const first = validityStart(chunk.replace(/\s+$/, ""));
        if (first < 0) {
          runs.push({ text: chunk, bold: false });
          return;
        }
        runs.push({ text: chunk.slice(0, first), bold: false });
        const tail = chunk.slice(first);
        for (const part of tail.split(/(\[[^\]]*\])/)) {
          if (!part) continue;
          if (/^\[\s*bound\s*\]$/i.test(part)) runs.push({ text: part, bold: true, color: "red" });
          else if (/^\[\s*unbound\s*\]$/i.test(part)) runs.push({ text: part, bold: true, color: "green" });
          else if (part.startsWith("[")) runs.push({ text: part, bold: true, color: "black" });
          else runs.push({ text: part, color: "black" });
        }
      });
      return runs;
    }
    case "idLine": {
      const runs: RichRun[] = [];
      let last = 0;
      for (const m of text.matchAll(/([^\s,*]+)\*([\d.]+)/g)) {
        const before = text.slice(last, m.index);
        if (before) runs.push({ text: before, color: "black" });
        runs.push({ text: `${m[1]}*`, bold: true, color: "black" });
        runs.push({ text: m[2], bold: true, color: "red" });
        last = (m.index ?? 0) + m[0].length;
      }
      if (last < text.length) runs.push({ text: text.slice(last), color: "black" });
      return runs;
    }
    case "value": {
      const m = /^(\*?)([\d.,]+)([\s\S]*)$/.exec(text);
      if (!m) return [{ text }];
      const runs: RichRun[] = [{ text: m[1] || "" }, { text: m[2], bold: true, color: "red" }, { text: m[3], color: "black" }];
      return runs.filter((r) => r.text);
    }
    case "tierLabel": {
      const m = /^(RECHARGE OF|CONSUME OF)([\s\S]*)$/i.exec(text);
      if (!m) return [{ text }];
      return [{ text: m[1], color: "black" }, { text: m[2], bold: true, color: "black" }];
    }
    case "date": {
      // "DATE ENTRY: " no estilo da célula, "(MM/DD/AAAA) - HH:MM" em vermelho e negrito.
      const i = text.indexOf("(");
      if (i < 0) return [{ text }];
      const runs: RichRun[] = [{ text: text.slice(0, i) }, { text: text.slice(i), bold: true, color: "red" }];
      return runs.filter((r) => r.text);
    }
    case "rankingTitle": {
      const i = text.indexOf('"');
      if (i < 0) return [{ text }];
      const runs: RichRun[] = [{ text: text.slice(0, i) }, { text: text.slice(i), bold: true, color: "green" }];
      return runs.filter((r) => r.text);
    }
    case "labelValue": {
      const i = text.indexOf(":");
      if (i < 0) return [{ text }];
      return [{ text: text.slice(0, i + 1), bold: true, color: "black" }, { text: text.slice(i + 1), bold: false, color: "black" }];
    }
    default:
      return [{ text }];
  }
}
