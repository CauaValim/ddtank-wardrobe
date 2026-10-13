import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { documentContent } from "./localBackup";
import type { EventDocument } from "./types";

/**
 * Cópias de segurança dos documentos no site (tabela event_document_backups): uma versão por minuto
 * enquanto alguém edita, para restaurar de qualquer computador. O banco guarda as 30 mais recentes.
 */

export interface SiteBackup {
  id: string;
  document_id: string;
  content: Pick<EventDocument, "title" | "theme" | "servers" | "start_date" | "end_date" | "status" | "sections">;
  created_by_email: string | null;
  created_at: string;
}

// Tabela nova: até a Lovable gerar os tipos dela, o acesso é sem tipos do banco.
const table = () => (supabase as unknown as SupabaseClient).from("event_document_backups");

export async function saveSiteBackup(doc: EventDocument): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await table().insert({
    document_id: doc.id,
    content: JSON.parse(documentContent(doc)),
    created_by: auth.user?.id,
    created_by_email: auth.user?.email ?? null,
  });
  if (error) throw error;
}

export async function listSiteBackups(documentId: string): Promise<SiteBackup[]> {
  const { data, error } = await table().select("*").eq("document_id", documentId).order("created_at", { ascending: false }).limit(30);
  if (error) throw error;
  return (data ?? []) as SiteBackup[];
}
