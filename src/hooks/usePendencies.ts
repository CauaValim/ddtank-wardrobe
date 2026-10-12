import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/** Bucket privado dos anexos; cada arquivo fica em "<id do usuário>/<data>-<nome>". */
export const PENDENCY_BUCKET = "schedule-pendencies";
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

export interface PendencyAttachment {
  path: string;
  name: string;
  size: number;
  type: string;
}

export interface Pendency {
  id: string;
  title: string;
  context: string;
  tab: string;
  period_id: string | null;
  status: "open" | "resolved";
  attachments: PendencyAttachment[];
  created_by: string | null;
  created_by_email: string | null;
  resolved_at: string | null;
  resolved_by_email: string | null;
  created_at: string;
  updated_at: string;
}

/** Abas sugeridas para a pendência (a equipe pode escrever outra). */
export const PENDENCY_TABS = [
  "Entrada Diária", "Missões", "Faça se Puder", "Desafio da Tribo", "Venda de Munição", "Troca",
  "Recarga", "Consumo", "Recarga Extra", "Consumo Extra", "Ranking de Recarga", "Ranking de Consumo",
  "Solicitação manual", "Códigos", "Itens", "Cronograma",
];

export type PendencyDraft = Pick<Pendency, "title" | "context" | "tab" | "period_id" | "attachments">;

// A tabela é nova: até a Lovable gerar os tipos dela, o acesso é sem tipos do banco.
const db = supabase as unknown as SupabaseClient;
const table = () => db.from("schedule_pendencies");

/** Nome do arquivo seguro para o Storage (sem acentos, espaços ou barras). */
export const storageName = (name: string) =>
  name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.-]+/g, "_").replace(/_+/g, "_").slice(-80) || "arquivo";

export function usePendencies() {
  const [pendencies, setPendencies] = useState<Pendency[]>([]);
  const [loading, setLoading] = useState(true);
  /** false enquanto a tabela não existe no banco (migração ainda não aplicada). */
  const [available, setAvailable] = useState(true);

  const reload = useCallback(async () => {
    const { data, error } = await table().select("*").order("created_at", { ascending: false });
    setAvailable(!error);
    if (!error) setPendencies((data ?? []) as Pendency[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const uploadAttachment = useCallback(async (file: File): Promise<PendencyAttachment> => {
    if (file.size > MAX_ATTACHMENT_BYTES) throw new Error(`"${file.name}" passa de 20 MB.`);
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) throw new Error("Faça login para anexar arquivos.");
    const path = `${auth.user.id}/${Date.now()}-${storageName(file.name)}`;
    const { error } = await supabase.storage.from(PENDENCY_BUCKET).upload(path, file, { contentType: file.type || undefined });
    if (error) throw error;
    return { path, name: file.name, size: file.size, type: file.type };
  }, []);

  const removeFiles = useCallback(async (paths: string[]) => {
    if (paths.length) await supabase.storage.from(PENDENCY_BUCKET).remove(paths);
  }, []);

  const create = useCallback(async (draft: PendencyDraft) => {
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await table().insert({ ...draft, created_by: auth.user?.id, created_by_email: auth.user?.email ?? null });
    if (error) throw error;
    await reload();
  }, [reload]);

  const update = useCallback(async (id: string, patch: Partial<Pendency>) => {
    const { error } = await table().update(patch).eq("id", id);
    if (error) throw error;
    await reload();
  }, [reload]);

  const setStatus = useCallback(async (p: Pendency, status: Pendency["status"]) => {
    const { data: auth } = await supabase.auth.getUser();
    await update(p.id, status === "resolved"
      ? { status, resolved_at: new Date().toISOString(), resolved_by_email: auth.user?.email ?? null }
      : { status, resolved_at: null, resolved_by_email: null });
  }, [update]);

  const remove = useCallback(async (p: Pendency) => {
    const { error } = await table().delete().eq("id", p.id);
    if (error) throw error;
    await removeFiles(p.attachments.map((a) => a.path));
    await reload();
  }, [reload, removeFiles]);

  /** Link temporário (1 hora) para abrir ou baixar um anexo. */
  const signedUrl = useCallback(async (path: string, download?: string) => {
    const { data, error } = await supabase.storage.from(PENDENCY_BUCKET).createSignedUrl(path, 3600, download ? { download } : undefined);
    if (error) throw error;
    return data.signedUrl;
  }, []);

  return { pendencies, loading, available, reload, create, update, setStatus, remove, uploadAttachment, removeFiles, signedUrl };
}

export type PendenciesApi = ReturnType<typeof usePendencies>;
