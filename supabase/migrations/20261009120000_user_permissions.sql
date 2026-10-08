-- Permissões por usuário: cada função do painel é liberada individualmente.
-- Substitui os cargos fixos (user_roles) em todas as regras de acesso. Os usuários atuais
-- recebem as permissões equivalentes ao cargo que tinham, para ninguém perder acesso.
-- A lista de permissões fica em src/lib/permissions.ts (e em manage-users).

CREATE TABLE IF NOT EXISTS public.user_permissions (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission text NOT NULL,
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, permission)
);

CREATE OR REPLACE FUNCTION private.has_permission(_user uuid, _permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = _user AND permission = _permission)
$$;
REVOKE ALL ON FUNCTION private.has_permission(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.has_permission(uuid, text) TO authenticated, service_role;

GRANT SELECT, INSERT, DELETE ON public.user_permissions TO authenticated;
GRANT ALL ON public.user_permissions TO service_role;
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own permissions" ON public.user_permissions;
CREATE POLICY "Users read own permissions" ON public.user_permissions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR private.has_permission(auth.uid(), 'users.manage'));

DROP POLICY IF EXISTS "User managers grant permissions" ON public.user_permissions;
CREATE POLICY "User managers grant permissions" ON public.user_permissions
  FOR INSERT TO authenticated
  WITH CHECK (private.has_permission(auth.uid(), 'users.manage'));

DROP POLICY IF EXISTS "User managers revoke permissions" ON public.user_permissions;
CREATE POLICY "User managers revoke permissions" ON public.user_permissions
  FOR DELETE TO authenticated
  USING (private.has_permission(auth.uid(), 'users.manage'));

-- Sempre sobra pelo menos uma pessoa que gerencia usuários (evita trancar o painel).
CREATE OR REPLACE FUNCTION private.keep_one_user_manager()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.permission = 'users.manage'
     AND NOT EXISTS (SELECT 1 FROM public.user_permissions WHERE permission = 'users.manage' AND user_id <> OLD.user_id)
     AND EXISTS (SELECT 1 FROM auth.users WHERE id = OLD.user_id) THEN
    RAISE EXCEPTION 'Pelo menos um usuário precisa continuar com a permissão de gerenciar usuários' USING ERRCODE = '42501';
  END IF;
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS keep_one_user_manager ON public.user_permissions;
CREATE TRIGGER keep_one_user_manager
  BEFORE DELETE ON public.user_permissions
  FOR EACH ROW EXECUTE FUNCTION private.keep_one_user_manager();

-- Permissões equivalentes aos cargos atuais.
INSERT INTO public.user_permissions (user_id, permission, granted_by)
SELECT r.user_id, p.permission, NULL
FROM public.user_roles r
JOIN (VALUES
  ('super_admin', 'items.view_ids'), ('super_admin', 'items.manage'), ('super_admin', 'items.game_sync'),
  ('super_admin', 'items.export_images'), ('super_admin', 'tools.id_filler'), ('super_admin', 'tools.validator'),
  ('super_admin', 'events.access'), ('super_admin', 'events.presets'), ('super_admin', 'events.item_rules'),
  ('super_admin', 'events.history'), ('super_admin', 'events.templates'), ('super_admin', 'schedule.edit'),
  ('super_admin', 'codes.request'), ('super_admin', 'codes.manage'), ('super_admin', 'users.manage'),
  ('admin', 'items.view_ids'), ('admin', 'items.manage'), ('admin', 'items.game_sync'),
  ('admin', 'items.export_images'), ('admin', 'tools.id_filler'), ('admin', 'tools.validator'),
  ('admin', 'events.access'), ('admin', 'events.presets'), ('admin', 'events.item_rules'),
  ('admin', 'events.history'), ('admin', 'schedule.edit'), ('admin', 'codes.request'), ('admin', 'codes.manage'),
  ('analista', 'items.view_ids'),
  ('midia', 'codes.request')
) AS p(role, permission) ON p.role = r.role::text
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------------ itens e imagens
DROP POLICY IF EXISTS "Admins can insert items" ON public.items;
DROP POLICY IF EXISTS "Admins can update items" ON public.items;
DROP POLICY IF EXISTS "Admins can delete items" ON public.items;
CREATE POLICY "Item managers insert items" ON public.items FOR INSERT WITH CHECK (private.has_permission(auth.uid(), 'items.manage'));
CREATE POLICY "Item managers update items" ON public.items FOR UPDATE USING (private.has_permission(auth.uid(), 'items.manage'));
CREATE POLICY "Item managers delete items" ON public.items FOR DELETE USING (private.has_permission(auth.uid(), 'items.manage'));

DROP POLICY IF EXISTS "Admins can insert items_turco" ON public.items_turco;
DROP POLICY IF EXISTS "Admins can update items_turco" ON public.items_turco;
DROP POLICY IF EXISTS "Admins can delete items_turco" ON public.items_turco;
CREATE POLICY "Item managers insert items_turco" ON public.items_turco FOR INSERT WITH CHECK (private.has_permission(auth.uid(), 'items.manage'));
CREATE POLICY "Item managers update items_turco" ON public.items_turco FOR UPDATE USING (private.has_permission(auth.uid(), 'items.manage'));
CREATE POLICY "Item managers delete items_turco" ON public.items_turco FOR DELETE USING (private.has_permission(auth.uid(), 'items.manage'));

DROP POLICY IF EXISTS "Admins can insert categories" ON public.categories;
DROP POLICY IF EXISTS "Admins can update categories" ON public.categories;
DROP POLICY IF EXISTS "Admins can delete categories" ON public.categories;
CREATE POLICY "Item managers insert categories" ON public.categories FOR INSERT WITH CHECK (private.has_permission(auth.uid(), 'items.manage'));
CREATE POLICY "Item managers update categories" ON public.categories FOR UPDATE USING (private.has_permission(auth.uid(), 'items.manage'));
CREATE POLICY "Item managers delete categories" ON public.categories FOR DELETE USING (private.has_permission(auth.uid(), 'items.manage'));

DROP POLICY IF EXISTS "Admins can insert item_categories" ON public.item_categories;
DROP POLICY IF EXISTS "Admins can delete item_categories" ON public.item_categories;
CREATE POLICY "Item managers insert item_categories" ON public.item_categories FOR INSERT WITH CHECK (private.has_permission(auth.uid(), 'items.manage'));
CREATE POLICY "Item managers delete item_categories" ON public.item_categories FOR DELETE USING (private.has_permission(auth.uid(), 'items.manage'));

DROP POLICY IF EXISTS "Admins can manage package contents" ON public.package_contents;
CREATE POLICY "Item managers manage package contents" ON public.package_contents FOR ALL
  USING (private.has_permission(auth.uid(), 'items.manage')) WITH CHECK (private.has_permission(auth.uid(), 'items.manage'));

DROP POLICY IF EXISTS "Admins can upload item images" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update item images" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete item images" ON storage.objects;
DROP POLICY IF EXISTS "Admins can upload item-images-turco" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update item-images-turco" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete item-images-turco" ON storage.objects;
CREATE POLICY "Item managers upload item images" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id IN ('item-images', 'item-images-turco') AND private.has_permission(auth.uid(), 'items.manage'));
CREATE POLICY "Item managers update item images" ON storage.objects FOR UPDATE
  USING (bucket_id IN ('item-images', 'item-images-turco') AND private.has_permission(auth.uid(), 'items.manage'));
CREATE POLICY "Item managers delete item images" ON storage.objects FOR DELETE
  USING (bucket_id IN ('item-images', 'item-images-turco') AND private.has_permission(auth.uid(), 'items.manage'));

-- ------------------------------------------------------------------ criação de eventos
DROP POLICY IF EXISTS "Admins manage event documents" ON public.event_documents;
CREATE POLICY "Event editors manage event documents" ON public.event_documents FOR ALL TO authenticated
  USING (private.has_permission(auth.uid(), 'events.access')) WITH CHECK (private.has_permission(auth.uid(), 'events.access'));

DROP POLICY IF EXISTS "Admins insert event presets" ON public.event_presets;
DROP POLICY IF EXISTS "Admins update event presets" ON public.event_presets;
DROP POLICY IF EXISTS "Admins delete event presets" ON public.event_presets;
CREATE POLICY "Preset editors insert event presets" ON public.event_presets FOR INSERT TO authenticated WITH CHECK (private.has_permission(auth.uid(), 'events.presets'));
CREATE POLICY "Preset editors update event presets" ON public.event_presets FOR UPDATE TO authenticated USING (private.has_permission(auth.uid(), 'events.presets'));
CREATE POLICY "Preset editors delete event presets" ON public.event_presets FOR DELETE TO authenticated USING (private.has_permission(auth.uid(), 'events.presets'));

DROP POLICY IF EXISTS "Admins insert event item categories" ON public.event_item_categories;
DROP POLICY IF EXISTS "Admins update event item categories" ON public.event_item_categories;
DROP POLICY IF EXISTS "Admins delete event item categories" ON public.event_item_categories;
CREATE POLICY "Rule editors insert event item categories" ON public.event_item_categories FOR INSERT TO authenticated WITH CHECK (private.has_permission(auth.uid(), 'events.item_rules'));
CREATE POLICY "Rule editors update event item categories" ON public.event_item_categories FOR UPDATE TO authenticated USING (private.has_permission(auth.uid(), 'events.item_rules'));
CREATE POLICY "Rule editors delete event item categories" ON public.event_item_categories FOR DELETE TO authenticated USING (private.has_permission(auth.uid(), 'events.item_rules'));

DROP POLICY IF EXISTS "Admins read event templates" ON storage.objects;
DROP POLICY IF EXISTS "Super admins upload event templates" ON storage.objects;
DROP POLICY IF EXISTS "Super admins update event templates" ON storage.objects;
DROP POLICY IF EXISTS "Super admins delete event templates" ON storage.objects;
CREATE POLICY "Event editors read event templates" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'event-templates' AND private.has_permission(auth.uid(), 'events.access'));
CREATE POLICY "Template managers upload event templates" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'event-templates' AND private.has_permission(auth.uid(), 'events.templates'));
CREATE POLICY "Template managers update event templates" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'event-templates' AND private.has_permission(auth.uid(), 'events.templates'));
CREATE POLICY "Template managers delete event templates" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'event-templates' AND private.has_permission(auth.uid(), 'events.templates'));

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
  IF NOT private.has_permission(auth.uid(), 'events.history') THEN
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

-- ------------------------------------------------------------------ solicitações de códigos
DROP POLICY IF EXISTS "Requesters and admins read code requests" ON public.code_requests;
DROP POLICY IF EXISTS "Media and admins create code requests" ON public.code_requests;
DROP POLICY IF EXISTS "Admins update code requests" ON public.code_requests;
DROP POLICY IF EXISTS "Requesters cancel pending, admins delete code requests" ON public.code_requests;
CREATE POLICY "Requesters and managers read code requests" ON public.code_requests FOR SELECT TO authenticated
  USING (requested_by = auth.uid() OR private.has_permission(auth.uid(), 'codes.manage'));
CREATE POLICY "Requesters create code requests" ON public.code_requests FOR INSERT TO authenticated
  WITH CHECK (requested_by = auth.uid() AND status = 'pendente' AND private.has_permission(auth.uid(), 'codes.request'));
CREATE POLICY "Managers update code requests" ON public.code_requests FOR UPDATE TO authenticated
  USING (private.has_permission(auth.uid(), 'codes.manage'));
CREATE POLICY "Requesters cancel pending, managers delete code requests" ON public.code_requests FOR DELETE TO authenticated
  USING ((requested_by = auth.uid() AND status = 'pendente') OR private.has_permission(auth.uid(), 'codes.manage'));

-- ------------------------------------------------------------------ cronograma
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['schedule_sections', 'schedule_categories', 'schedule_periods', 'schedule_entries'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE; -- cronograma novo ainda não criado: a migração dele usa os cargos e é ajustada ao rodar esta de novo
    END IF;
    EXECUTE format('DROP POLICY IF EXISTS "Admins insert %s" ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "Admins update %s" ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "Admins delete %s" ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "Schedule editors insert %s" ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "Schedule editors update %s" ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "Schedule editors delete %s" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "Schedule editors insert %s" ON public.%I FOR INSERT TO authenticated WITH CHECK (private.has_permission(auth.uid(), ''schedule.edit''))', t, t);
    EXECUTE format('CREATE POLICY "Schedule editors update %s" ON public.%I FOR UPDATE TO authenticated USING (private.has_permission(auth.uid(), ''schedule.edit''))', t, t);
    EXECUTE format('CREATE POLICY "Schedule editors delete %s" ON public.%I FOR DELETE TO authenticated USING (private.has_permission(auth.uid(), ''schedule.edit''))', t, t);
  END LOOP;
END $$;
