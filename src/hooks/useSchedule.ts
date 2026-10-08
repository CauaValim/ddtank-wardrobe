import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type ScheduleSection = Tables<"schedule_sections">;
export type ScheduleCategory = Tables<"schedule_categories">;
export type SchedulePeriod = Tables<"schedule_periods">;
export type ScheduleEntry = Tables<"schedule_entries">;

/** Eventos de um período, por categoria (um texto por evento, na ordem). */
export type PeriodEntries = Record<string, string[]>;

export const CATEGORY_COLORS = ["#ef4444", "#3b82f6", "#22c55e", "#a855f7", "#eab308", "#06b6d4", "#f97316", "#ec4899", "#6366f1", "#64748b"];

const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-10-05" -> Date local (sem fuso). */
export const parseDay = (iso: string) => new Date(`${iso}T00:00:00`);
export const toIsoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const addDays = (iso: string, days: number) => {
  const d = parseDay(iso);
  d.setDate(d.getDate() + days);
  return toIsoDay(d);
};
const shortDate = (iso: string) => {
  const d = parseDay(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
};

/** Nome do período: o escrito pela equipe ou "05/10 - 11/10". */
export const periodTitle = (p: Pick<SchedulePeriod, "label" | "start_date" | "end_date">) =>
  p.label.trim() || (p.start_date === p.end_date ? shortDate(p.start_date) : `${shortDate(p.start_date)} - ${shortDate(p.end_date)}`);

export const isCurrentPeriod = (p: Pick<SchedulePeriod, "start_date" | "end_date">, today = toIsoDay(new Date())) =>
  p.start_date <= today && today <= p.end_date;

const byPosition = <T extends { position: number; name?: string }>(a: T, b: T) => a.position - b.position || (a.name ?? "").localeCompare(b.name ?? "");

/**
 * Cronograma totalmente configurável pela equipe: seções (ex.: Eventos, Econômica), categorias
 * com cor, períodos com datas livres e os eventos de cada categoria em cada período.
 */
export function useSchedule() {
  const [sections, setSections] = useState<ScheduleSection[]>([]);
  const [categories, setCategories] = useState<ScheduleCategory[]>([]);
  const [periods, setPeriods] = useState<SchedulePeriod[]>([]);
  const [entries, setEntries] = useState<ScheduleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  /** false enquanto as tabelas novas não existem no banco. */
  const [available, setAvailable] = useState(true);

  const reload = useCallback(async () => {
    const [s, c, p, e] = await Promise.all([
      supabase.from("schedule_sections").select("*"),
      supabase.from("schedule_categories").select("*"),
      supabase.from("schedule_periods").select("*").order("start_date", { ascending: true }),
      supabase.from("schedule_entries").select("*").order("position", { ascending: true }),
    ]);
    const error = s.error ?? c.error ?? p.error ?? e.error;
    setAvailable(!error);
    if (!error) {
      setSections([...(s.data ?? [])].sort(byPosition));
      setCategories([...(c.data ?? [])].sort(byPosition));
      setPeriods(p.data ?? []);
      setEntries(e.data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  /** Eventos de cada período, agrupados por categoria. */
  const entriesByPeriod = useMemo(() => {
    const map = new Map<string, PeriodEntries>();
    for (const e of entries) {
      const per = map.get(e.period_id) ?? {};
      (per[e.category_id] ??= []).push(e.text);
      map.set(e.period_id, per);
    }
    return map;
  }, [entries]);

  const run = useCallback(async (op: PromiseLike<{ error: { message: string } | null }>) => {
    const { error } = await op;
    if (error) throw new Error(error.message);
  }, []);

  // ---------------------------------------------------------------- seções e categorias

  const saveSection = useCallback(async (section: { id?: string; name: string }) => {
    if (section.id) await run(supabase.from("schedule_sections").update({ name: section.name }).eq("id", section.id));
    else await run(supabase.from("schedule_sections").insert({ name: section.name, position: sections.length ? Math.max(...sections.map((x) => x.position)) + 1 : 0 }));
    await reload();
  }, [run, reload, sections]);

  const saveCategory = useCallback(async (category: { id?: string; section_id: string; name: string; color: string }) => {
    if (category.id) {
      await run(supabase.from("schedule_categories").update({ name: category.name, color: category.color, section_id: category.section_id }).eq("id", category.id));
    } else {
      const same = categories.filter((c) => c.section_id === category.section_id);
      await run(supabase.from("schedule_categories").insert({ ...category, position: same.length ? Math.max(...same.map((x) => x.position)) + 1 : 0 }));
    }
    await reload();
  }, [run, reload, categories]);

  const remove = useCallback(async (table: "schedule_sections" | "schedule_categories" | "schedule_periods", id: string) => {
    await run(supabase.from(table).delete().eq("id", id));
    await reload();
  }, [run, reload]);

  /** Troca a posição com o vizinho (dir -1 = sobe, 1 = desce). */
  const move = useCallback(async (table: "schedule_sections" | "schedule_categories", list: { id: string; position: number }[], id: string, dir: -1 | 1) => {
    const i = list.findIndex((x) => x.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    // Regrava as posições em sequência (0, 1, 2...), já com os dois trocados.
    const ordered = [...list];
    [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
    for (const [k, x] of ordered.entries()) {
      if (x.position !== k) await run(supabase.from(table).update({ position: k }).eq("id", x.id));
    }
    await reload();
  }, [run, reload]);

  // ---------------------------------------------------------------- períodos

  const savePeriod = useCallback(async (period: Omit<SchedulePeriod, "id" | "created_at" | "updated_at"> & { id?: string }, byCategory: PeriodEntries) => {
    const row = { start_date: period.start_date, end_date: period.end_date, label: period.label, theme: period.theme, notes: period.notes };
    let id = period.id;
    if (id) {
      await run(supabase.from("schedule_periods").update(row).eq("id", id));
    } else {
      const { data, error } = await supabase.from("schedule_periods").insert(row).select("id").single();
      if (error) throw new Error(error.message);
      id = data.id;
    }
    await run(supabase.from("schedule_entries").delete().eq("period_id", id));
    const rows = Object.entries(byCategory).flatMap(([category_id, texts]) =>
      texts.map((text, position) => ({ period_id: id as string, category_id, text, position })));
    if (rows.length) await run(supabase.from("schedule_entries").insert(rows));
    await reload();
    return id;
  }, [run, reload]);

  /** Novo período logo depois deste, com a mesma duração e os mesmos eventos. */
  const duplicatePeriod = useCallback(async (period: SchedulePeriod) => {
    const length = Math.round((parseDay(period.end_date).getTime() - parseDay(period.start_date).getTime()) / 86_400_000);
    const start = addDays(period.end_date, 1);
    return savePeriod({ start_date: start, end_date: addDays(start, length), label: "", theme: period.theme, notes: period.notes }, entriesByPeriod.get(period.id) ?? {});
  }, [savePeriod, entriesByPeriod]);

  return {
    sections, categories, periods, entriesByPeriod, loading, available, reload,
    saveSection, saveCategory, savePeriod, duplicatePeriod,
    deleteSection: (id: string) => remove("schedule_sections", id),
    deleteCategory: (id: string) => remove("schedule_categories", id),
    deletePeriod: (id: string) => remove("schedule_periods", id),
    moveSection: (id: string, dir: -1 | 1) => move("schedule_sections", sections, id, dir),
    moveCategory: (id: string, dir: -1 | 1) => {
      const cat = categories.find((c) => c.id === id);
      return move("schedule_categories", categories.filter((c) => c.section_id === cat?.section_id), id, dir);
    },
  };
}

export type ScheduleApi = ReturnType<typeof useSchedule>;
