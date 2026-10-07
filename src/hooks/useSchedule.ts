import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { cronograma } from "@/data/cronograma";
import { cronogramaEconomica } from "@/data/cronogramaEconomica";

export interface ScheduleWeek {
  id?: string;
  /** ISO date of the week start (Monday). */
  startDate: string;
  periodo: string;
  tema: string;
  eventos: Record<string, string[]>;
  economica: string[];
}

/** Categorias do cronograma, na ordem em que aparecem. */
export const SCHEDULE_CATEGORIES = [
  "Faça se Puder",
  "Atividades",
  "Rotação de Figuras Normais",
  "Rotação de Figuras de Elite",
  "Rotação das Moedas",
  "Missão de Novatos",
  "Torneio",
  "Abas de Coleta",
  "Código DDBooster",
];

// Dados que ficavam no código: usados enquanto a tabela não existe ou está vazia.
const STATIC_WEEKS: ScheduleWeek[] = cronograma.map((w) => ({ ...w, economica: cronogramaEconomica[w.startDate] ?? [] }));

const asStringList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

function fromRow(row: { id: string; start_date: string; periodo: string; tema: string; eventos: Json; economica: Json }): ScheduleWeek {
  const raw = row.eventos && typeof row.eventos === "object" && !Array.isArray(row.eventos) ? row.eventos : {};
  return {
    id: row.id,
    startDate: row.start_date,
    periodo: row.periodo,
    tema: row.tema,
    eventos: Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, asStringList(v)])),
    economica: asStringList(row.economica),
  };
}

/** "2026-10-05" -> "05/10 - 11/10" */
export function periodFor(startDate: string): string {
  const d = new Date(`${startDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  const end = new Date(d);
  end.setDate(d.getDate() + 6);
  const fmt = (x: Date) => `${String(x.getDate()).padStart(2, "0")}/${String(x.getMonth() + 1).padStart(2, "0")}`;
  return `${fmt(d)} - ${fmt(end)}`;
}

export function useSchedule() {
  const [weeks, setWeeks] = useState<ScheduleWeek[]>(STATIC_WEEKS);
  const [fromDb, setFromDb] = useState(false);

  const reload = useCallback(async () => {
    const { data, error } = await supabase.from("schedule_weeks").select("id,start_date,periodo,tema,eventos,economica").order("start_date", { ascending: true });
    if (error || !data) return; // tabela ainda não criada: fica com os dados do código
    setWeeks(data.map(fromRow));
    setFromDb(true);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const save = useCallback(async (week: ScheduleWeek) => {
    const row = {
      start_date: week.startDate,
      periodo: week.periodo,
      tema: week.tema,
      eventos: week.eventos as Json,
      economica: week.economica as Json,
    };
    const { error } = week.id
      ? await supabase.from("schedule_weeks").update(row).eq("id", week.id)
      : await supabase.from("schedule_weeks").insert(row);
    if (error) throw error;
    await reload();
  }, [reload]);

  const remove = useCallback(async (id: string) => {
    const { error } = await supabase.from("schedule_weeks").delete().eq("id", id);
    if (error) throw error;
    await reload();
  }, [reload]);

  return { weeks, fromDb, reload, save, remove };
}
