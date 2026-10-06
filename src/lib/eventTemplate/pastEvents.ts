import type { EventBlock, EventDocument, EventItem, EventSection } from "./types";

/**
 * Eventos anteriores importados de planilhas: guardam só textos, nomes, IDs e quantidades
 * (sem imagens), com as datas do evento tiradas das seções.
 */

const stripItem = ({ imageUrl: _image, ...item }: EventItem): EventItem => item;

function stripBlock(block: EventBlock): EventBlock {
  const groups = Object.fromEntries(Object.entries(block.groups).map(([k, items]) => [k, items.map(stripItem)]));
  return { ...block, groups, ...(block.children ? { children: block.children.map(stripBlock) } : {}) };
}

function collectDates(section: EventSection): { starts: string[]; ends: string[] } {
  const starts = [section.fields.start];
  const ends = [section.fields.end];
  for (const blocks of Object.values(section.sets)) for (const b of blocks) {
    starts.push(b.fields.start);
    ends.push(b.fields.end);
  }
  const day = (v: string | undefined) => /^\d{4}-\d{2}-\d{2}/.exec(v ?? "")?.[0];
  return { starts: starts.map(day).filter((d): d is string => !!d), ends: ends.map(day).filter((d): d is string => !!d) };
}

const MAX_EVENT_DAYS = 45;
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/**
 * Período do evento: o início mais comum entre as abas (abas esquecidas com datas de outras
 * semanas não puxam o período) e o fim mais tardio até 45 dias depois dele.
 */
function eventPeriod(sections: EventSection[]): { start: string | null; end: string | null } {
  const starts = sections.flatMap((s) => collectDates(s).starts);
  if (starts.length === 0) return { start: null, end: null };
  const count = new Map<string, number>();
  for (const d of starts) count.set(d, (count.get(d) ?? 0) + 1);
  const start = [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
  const limit = addDays(start, MAX_EVENT_DAYS);
  const ends = sections.flatMap((s) => collectDates(s).ends).filter((d) => d >= start && d <= limit).sort();
  return { start, end: ends[ends.length - 1] ?? start };
}

export function archiveDocument(doc: Omit<EventDocument, "id">, fileName: string): Omit<EventDocument, "id"> {
  const sections = doc.sections.map((s) => ({ ...s, sets: Object.fromEntries(Object.entries(s.sets).map(([k, blocks]) => [k, blocks.map(stripBlock)])) }));
  const { start, end } = eventPeriod(sections);
  return {
    ...doc,
    title: fileName.replace(/\.xlsx$/i, "").trim() || doc.title,
    status: "final",
    start_date: start,
    end_date: end,
    sections,
  };
}
