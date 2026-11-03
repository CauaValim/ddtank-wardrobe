-- Endurecimento de segurança (auditoria de 03/11/2026).
--
-- 1. "Usuário logado" deixa de bastar para ler os dados da equipe. O cadastro público do Supabase
--    Auth estava ligado: qualquer pessoa podia criar uma conta pela API e ler tudo o que estava
--    liberado para "authenticated" com USING (true). Agora só lê quem é da equipe
--    (private.is_panel_member): tem cargo no painel, tem cargo antigo (user_roles) ou foi criado por
--    um administrador (app_metadata.panel_member = true, marcado pela edge function manage-users).
-- 2. O catálogo de itens (inclusive os itens novos do servidor teste, antes de saírem no BR) deixa de
--    ser público para visitantes sem login.
-- 3. Visitantes sem login (anon) perdem os privilégios de tabela no schema public, inclusive para
--    tabelas criadas no futuro. Nenhuma tela do painel funciona sem login.
-- 4. Quem tem "Gerenciar usuários" não pode mais se dar cargos (escalada de privilégio) nem gravar
--    outra pessoa como responsável pela concessão.
--
-- Reverter: recriar as políticas antigas (listadas nos comentários de cada bloco) e
-- GRANT SELECT ON public.<tabela> TO anon para as tabelas de itens.

-- ---------------------------------------------------------------------------------------------
-- Membro da equipe
-- ---------------------------------------------------------------------------------------------
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

-- Contas que já existem e foram criadas ou convidadas por um administrador (sem e-mail de
-- confirmação de cadastro; quem se cadastra sozinho sempre recebe esse e-mail) continuam sendo da
-- equipe mesmo sem cargo.
UPDATE auth.users
SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"panel_member": true}'::jsonb
WHERE (confirmation_sent_at IS NULL OR invited_at IS NOT NULL)
  AND COALESCE(raw_app_meta_data ->> 'panel_member', '') <> 'true';

-- ---------------------------------------------------------------------------------------------
-- Leituras abertas (USING true) passam a exigir membro da equipe
-- ---------------------------------------------------------------------------------------------
-- Todas as políticas de SELECT do schema public com USING (true), para qualquer papel. Hoje:
-- items, items_turco, categories, item_categories, package_contents (abertas até para anon) e
-- panel_roles, user_panel_roles, schedule_*, schedule_pendencies, event_presets,
-- event_item_categories, item_event_entries (abertas para qualquer conta).
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

-- Pendências: criar exige ser da equipe (antes: created_by = auth.uid()).
DROP POLICY IF EXISTS "Team creates pendencies" ON public.schedule_pendencies;
CREATE POLICY "Team creates pendencies" ON public.schedule_pendencies FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND (SELECT private.is_panel_member(auth.uid())));

-- Anexos das pendências (bucket privado): ler e enviar exigem ser da equipe.
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

-- ---------------------------------------------------------------------------------------------
-- Cargos: sem autoconcessão
-- ---------------------------------------------------------------------------------------------
-- Antes: users.manage AND can_manage_role(role_id). Quem gerenciava usuários podia se dar um cargo
-- abaixo do seu com permissões que ele não tinha.
DROP POLICY IF EXISTS "User managers assign lower roles" ON public.user_panel_roles;
CREATE POLICY "User managers assign lower roles" ON public.user_panel_roles FOR INSERT TO authenticated
  WITH CHECK (
    private.has_permission(auth.uid(), 'users.manage')
    AND private.can_manage_role(auth.uid(), role_id)
    AND (user_id <> auth.uid() OR private.has_permission(auth.uid(), 'administrator'))
    AND (granted_by IS NULL OR granted_by = auth.uid())
  );

-- ---------------------------------------------------------------------------------------------
-- Visitantes sem login (anon): nenhum privilégio de tabela no schema public
-- ---------------------------------------------------------------------------------------------
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
