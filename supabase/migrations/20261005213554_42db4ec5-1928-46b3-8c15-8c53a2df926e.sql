DROP POLICY IF EXISTS "Admins read event templates" ON storage.objects;
CREATE POLICY "Admins read event templates" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'event-templates'
    AND (private.has_role(auth.uid(), 'admin'::public.app_role) OR private.has_role(auth.uid(), 'super_admin'::public.app_role)));

DROP POLICY IF EXISTS "Super admins upload event templates" ON storage.objects;
CREATE POLICY "Super admins upload event templates" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'event-templates' AND private.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS "Super admins update event templates" ON storage.objects;
CREATE POLICY "Super admins update event templates" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'event-templates' AND private.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS "Super admins delete event templates" ON storage.objects;
CREATE POLICY "Super admins delete event templates" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'event-templates' AND private.has_role(auth.uid(), 'super_admin'::public.app_role));

ALTER TABLE public.event_documents ADD COLUMN IF NOT EXISTS template_version text;

DROP TRIGGER IF EXISTS update_event_documents_updated_at ON public.event_documents;
CREATE TRIGGER update_event_documents_updated_at
  BEFORE UPDATE ON public.event_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();