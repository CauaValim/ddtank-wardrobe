CREATE TABLE IF NOT EXISTS public.code_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT 'Nova solicitação de códigos',
  servers text NOT NULL DEFAULT 's1-s402',
  sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'enviada', 'concluida', 'recusada')),
  staff_note text NOT NULL DEFAULT '',
  template_version text,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS code_documents_created_by_idx ON public.code_documents (created_by, updated_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.code_documents TO authenticated;
GRANT ALL ON public.code_documents TO service_role;
ALTER TABLE public.code_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners and managers read code documents" ON public.code_documents;
CREATE POLICY "Owners and managers read code documents" ON public.code_documents FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR private.has_permission(auth.uid(), 'codes.manage'));

DROP POLICY IF EXISTS "Requesters create code documents" ON public.code_documents;
CREATE POLICY "Requesters create code documents" ON public.code_documents FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (private.has_permission(auth.uid(), 'codes.manage')
         OR (private.has_permission(auth.uid(), 'codes.request') AND status IN ('rascunho', 'enviada')))
  );

DROP POLICY IF EXISTS "Owners and managers update code documents" ON public.code_documents;
CREATE POLICY "Owners and managers update code documents" ON public.code_documents FOR UPDATE TO authenticated
  USING (
    private.has_permission(auth.uid(), 'codes.manage')
    OR (created_by = auth.uid() AND status IN ('rascunho', 'enviada') AND private.has_permission(auth.uid(), 'codes.request'))
  )
  WITH CHECK (
    private.has_permission(auth.uid(), 'codes.manage')
    OR (created_by = auth.uid() AND status IN ('rascunho', 'enviada'))
  );

DROP POLICY IF EXISTS "Owners delete drafts, managers delete code documents" ON public.code_documents;
CREATE POLICY "Owners delete drafts, managers delete code documents" ON public.code_documents FOR DELETE TO authenticated
  USING ((created_by = auth.uid() AND status = 'rascunho') OR private.has_permission(auth.uid(), 'codes.manage'));

CREATE OR REPLACE FUNCTION private.code_documents_guard()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  NEW.updated_by := auth.uid();
  IF auth.uid() IS NOT NULL AND NOT private.has_permission(auth.uid(), 'codes.manage') THEN
    NEW.staff_note := COALESCE(OLD.staff_note, '');
    NEW.created_by := COALESCE(OLD.created_by, NEW.created_by);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS code_documents_guard ON public.code_documents;
CREATE TRIGGER code_documents_guard
  BEFORE INSERT OR UPDATE ON public.code_documents
  FOR EACH ROW EXECUTE FUNCTION private.code_documents_guard();

DROP TRIGGER IF EXISTS update_code_documents_updated_at ON public.code_documents;
CREATE TRIGGER update_code_documents_updated_at
  BEFORE UPDATE ON public.code_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.code_document_authors(_ids uuid[])
RETURNS TABLE (id uuid, email text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT d.id, u.email::text
  FROM public.code_documents d JOIN auth.users u ON u.id = d.created_by
  WHERE d.id = ANY (_ids)
    AND (d.created_by = auth.uid() OR private.has_permission(auth.uid(), 'codes.manage'))
$$;
REVOKE ALL ON FUNCTION public.code_document_authors(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.code_document_authors(uuid[]) TO authenticated;

DROP POLICY IF EXISTS "Code managers read code templates" ON storage.objects;
CREATE POLICY "Code managers read code templates" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'event-templates' AND name LIKE 'codigos-%' AND private.has_permission(auth.uid(), 'codes.manage'));
DROP POLICY IF EXISTS "Code managers upload code templates" ON storage.objects;
CREATE POLICY "Code managers upload code templates" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'event-templates' AND name LIKE 'codigos-%' AND private.has_permission(auth.uid(), 'codes.manage'));
DROP POLICY IF EXISTS "Code managers update code templates" ON storage.objects;
CREATE POLICY "Code managers update code templates" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'event-templates' AND name LIKE 'codigos-%' AND private.has_permission(auth.uid(), 'codes.manage'));