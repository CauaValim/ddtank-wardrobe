-- Cópias de segurança dos documentos de evento no site: enquanto alguém edita, o editor guarda
-- uma versão por minuto (só quando o conteúdo mudou). Dá para restaurar de qualquer computador.
-- Ficam as 30 versões mais recentes de cada documento.

CREATE TABLE IF NOT EXISTS public.event_document_backups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.event_documents(id) ON DELETE CASCADE,
  -- title, theme, servers, start_date, end_date, status, sections
  content jsonb NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_by_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS event_document_backups_doc_idx ON public.event_document_backups (document_id, created_at DESC);

GRANT SELECT, INSERT, DELETE ON public.event_document_backups TO authenticated;
GRANT ALL ON public.event_document_backups TO service_role;
ALTER TABLE public.event_document_backups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Event editors read backups" ON public.event_document_backups;
CREATE POLICY "Event editors read backups" ON public.event_document_backups FOR SELECT TO authenticated
  USING (private.has_permission(auth.uid(), 'events.access'));

DROP POLICY IF EXISTS "Event editors create backups" ON public.event_document_backups;
CREATE POLICY "Event editors create backups" ON public.event_document_backups FOR INSERT TO authenticated
  WITH CHECK (private.has_permission(auth.uid(), 'events.access') AND created_by = auth.uid());

DROP POLICY IF EXISTS "Event editors delete backups" ON public.event_document_backups;
CREATE POLICY "Event editors delete backups" ON public.event_document_backups FOR DELETE TO authenticated
  USING (private.has_permission(auth.uid(), 'events.access'));

-- Mantém só as 30 versões mais recentes de cada documento.
CREATE OR REPLACE FUNCTION public.trim_event_document_backups()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.event_document_backups b
  WHERE b.document_id = NEW.document_id
    AND b.id NOT IN (
      SELECT id FROM public.event_document_backups
      WHERE document_id = NEW.document_id
      ORDER BY created_at DESC
      LIMIT 30
    );
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.trim_event_document_backups() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trim_event_document_backups ON public.event_document_backups;
CREATE TRIGGER trim_event_document_backups AFTER INSERT ON public.event_document_backups
  FOR EACH ROW EXECUTE FUNCTION public.trim_event_document_backups();