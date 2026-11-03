-- Endurecimento de segurança (auditoria de 03/11/2026).
CREATE OR REPLACE FUNCTION private.is_panel_member(_user uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT _user IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.user_panel_roles WHERE user_id = _user)
    OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user)
    OR EXISTS (SELECT 1 FROM auth.users WHERE id = _user AND (raw_app_meta_data ->> 'panel_member') = 'true')
  )
$$;

REVOKE ALL ON FUNCTION private.is_panel_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_panel_member(uuid) TO authenticated, service_role;

UPDATE auth.users
SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"panel_member": true}'::jsonb
WHERE (confirmation_sent_at IS NULL OR invited_at IS NOT NULL)
  AND COALESCE(raw_app_meta_data ->> 'panel_member', '') <> 'true';

DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND cmd = 'SELECT' AND btrim(qual) IN ('true', '(true)')
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
    EXECUTE format(
      'CREATE POLICY %I ON %I.%I FOR SELECT TO authenticated USING ((SELECT private.is_panel_member(auth.uid())))',
      p.policyname, p.schemaname, p.tablename
    );
    RAISE NOTICE 'Leitura restrita à equipe: %.% (%)', p.schemaname, p.tablename, p.policyname;
  END LOOP;
END $$;

DROP POLICY IF EXISTS "Team creates pendencies" ON public.schedule_pendencies;
CREATE POLICY "Team creates pendencies" ON public.schedule_pendencies FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND (SELECT private.is_panel_member(auth.uid())));

DROP POLICY IF EXISTS "Team reads pendency attachments" ON storage.objects;
CREATE POLICY "Team reads pendency attachments" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'schedule-pendencies' AND (SELECT private.is_panel_member(auth.uid())));

DROP POLICY IF EXISTS "Team uploads pendency attachments" ON storage.objects;
CREATE POLICY "Team uploads pendency attachments" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'schedule-pendencies'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND (SELECT private.is_panel_member(auth.uid()))
  );

DROP POLICY IF EXISTS "User managers assign lower roles" ON public.user_panel_roles;
CREATE POLICY "User managers assign lower roles" ON public.user_panel_roles FOR INSERT TO authenticated
  WITH CHECK (
    private.has_permission(auth.uid(), 'users.manage')
    AND private.can_manage_role(auth.uid(), role_id)
    AND (user_id <> auth.uid() OR private.has_permission(auth.uid(), 'administrator'))
    AND (granted_by IS NULL OR granted_by = auth.uid())
  );

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;