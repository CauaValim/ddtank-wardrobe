import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export interface PanelNotification {
  id: string;
  kind: "weekly_schedule" | "code_request" | string;
  title: string;
  body: string;
  link: string | null;
  created_at: string;
  read_at: string | null;
}

// Tabela nova: até a Lovable gerar os tipos dela, o acesso é sem tipos do banco.
const db = supabase as unknown as SupabaseClient;
const POLL_MS = 60_000;

/** Notificações do usuário logado (as 30 mais recentes), atualizadas a cada minuto e ao voltar para a aba. */
export function useNotifications(userId: string | null) {
  const [items, setItems] = useState<PanelNotification[]>([]);
  /** false enquanto a tabela não existe no banco. */
  const [available, setAvailable] = useState(true);

  const reload = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await db.from("notifications").select("*").order("created_at", { ascending: false }).limit(30);
    setAvailable(!error);
    if (!error) setItems((data ?? []) as PanelNotification[]);
  }, [userId]);

  useEffect(() => {
    reload();
    const timer = window.setInterval(reload, POLL_MS);
    const onFocus = () => { if (document.visibilityState === "visible") reload(); };
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [reload]);

  const markRead = useCallback(async (ids: string[]) => {
    if (!ids.length) return;
    const now = new Date().toISOString();
    setItems((list) => list.map((n) => (ids.includes(n.id) ? { ...n, read_at: n.read_at ?? now } : n)));
    await db.from("notifications").update({ read_at: now }).in("id", ids).is("read_at", null);
  }, []);

  const remove = useCallback(async (id: string) => {
    setItems((list) => list.filter((n) => n.id !== id));
    await db.from("notifications").delete().eq("id", id);
  }, []);

  /** Gera agora o resumo da semana para a equipe (quem edita o cronograma). */
  const sendWeeklyNow = useCallback(async (): Promise<number> => {
    const { data, error } = await db.rpc("send_weekly_schedule_notification_now");
    if (error) throw error;
    await reload();
    return Number(data ?? 0);
  }, [reload]);

  const unread = items.filter((n) => !n.read_at).length;
  return { items, unread, available, reload, markRead, remove, sendWeeklyNow };
}
