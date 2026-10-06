ALTER TABLE public.event_documents
  ADD COLUMN IF NOT EXISTS server_group text NOT NULL DEFAULT 'old',
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'editor',
  ADD COLUMN IF NOT EXISTS source_file text,
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.event_documents DROP CONSTRAINT IF EXISTS event_documents_server_group_check;
ALTER TABLE public.event_documents ADD CONSTRAINT event_documents_server_group_check CHECK (server_group IN ('old', 'new'));
ALTER TABLE public.event_documents DROP CONSTRAINT IF EXISTS event_documents_source_check;
ALTER TABLE public.event_documents ADD CONSTRAINT event_documents_source_check CHECK (source IN ('editor', 'import'));

CREATE INDEX IF NOT EXISTS event_documents_group_updated_idx ON public.event_documents (server_group, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS event_documents_import_file_idx ON public.event_documents (server_group, source_file) WHERE source = 'import';

CREATE OR REPLACE FUNCTION public.set_event_document_authors()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(NEW.created_by, auth.uid());
  END IF;
  NEW.updated_by := COALESCE(auth.uid(), NEW.updated_by);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_event_document_authors ON public.event_documents;
CREATE TRIGGER set_event_document_authors
  BEFORE INSERT OR UPDATE ON public.event_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_event_document_authors();

CREATE TABLE IF NOT EXISTS public.event_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_group text NOT NULL DEFAULT 'old' CHECK (server_group IN ('old', 'new')),
  name text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_presets TO authenticated;
GRANT ALL ON public.event_presets TO service_role;
ALTER TABLE public.event_presets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team reads event presets" ON public.event_presets;
CREATE POLICY "Team reads event presets" ON public.event_presets
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins insert event presets" ON public.event_presets;
CREATE POLICY "Admins insert event presets" ON public.event_presets
  FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role) OR private.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS "Admins update event presets" ON public.event_presets;
CREATE POLICY "Admins update event presets" ON public.event_presets
  FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role) OR private.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS "Admins delete event presets" ON public.event_presets;
CREATE POLICY "Admins delete event presets" ON public.event_presets
  FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role) OR private.has_role(auth.uid(), 'super_admin'::public.app_role));

CREATE INDEX IF NOT EXISTS event_presets_group_name_idx ON public.event_presets (server_group, name);

DROP TRIGGER IF EXISTS update_event_presets_updated_at ON public.event_presets;
CREATE TRIGGER update_event_presets_updated_at
  BEFORE UPDATE ON public.event_presets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.event_document_history(_server_group text)
RETURNS TABLE (
  id uuid,
  title text,
  source text,
  created_at timestamptz,
  created_by_email text,
  updated_at timestamptz,
  updated_by_email text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (private.has_role(auth.uid(), 'admin'::public.app_role) OR private.has_role(auth.uid(), 'super_admin'::public.app_role)) THEN
    RAISE EXCEPTION 'Sem permissão para ver o histórico' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT d.id, d.title, d.source, d.created_at, cu.email::text, d.updated_at, uu.email::text
  FROM public.event_documents d
  LEFT JOIN auth.users cu ON cu.id = d.created_by
  LEFT JOIN auth.users uu ON uu.id = d.updated_by
  WHERE d.server_group = _server_group
  ORDER BY d.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.event_document_history(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.event_document_history(text) TO authenticated;