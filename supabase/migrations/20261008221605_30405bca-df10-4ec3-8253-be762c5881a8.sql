-- Cargos personalizados (como no Discord): a equipe cria cargos com nome, cor e posição,
-- liga as permissões de cada cargo e dá um ou mais cargos a cada usuário.
-- O acesso do usuário é a soma das permissões dos cargos dele; "administrator" libera tudo.
-- Hierarquia: só se edita, atribui ou remove cargos abaixo do seu cargo mais alto, e um
-- cargo nunca recebe permissões que quem o edita não tem (o Administrador ignora as duas regras).
-- Substitui os cargos fixos (user_roles) em todas as regras de acesso. A lista de permissões
-- fica em src/lib/permissions.ts (e em supabase/functions/_shared/permissions.ts).

CREATE TABLE IF NOT EXISTS public.panel_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  color text NOT NULL DEFAULT '#99aab5',
  -- Maior = mais alto na hierarquia.
  position integer NOT NULL DEFAULT 0,
  permissions text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_panel_roles (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES public.panel_roles(id) ON DELETE CASCADE,
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role_id)
);
CREATE INDEX IF NOT EXISTS user_panel_roles_role_idx ON public.user_panel_roles (role_id);

-- ------------------------------------------------------------------ funções de apoio
CREATE OR REPLACE FUNCTION private.user_permission_list(_user uuid)
RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT p), '{}')
  FROM public.user_panel_roles ur
  JOIN public.panel_roles r ON r.id = ur.role_id
  CROSS JOIN LATERAL unnest(r.permissions) AS p
  WHERE ur.user_id = _user
$$;

CREATE OR REPLACE FUNCTION private.has_permission(_user uuid, _permission text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_panel_roles ur
    JOIN public.panel_roles r ON r.id = ur.role_id
    WHERE ur.user_id = _user AND (_permission = ANY (r.permissions) OR 'administrator' = ANY (r.permissions))
  )
$$;

-- Posição do cargo mais alto do usuário (-1 se não tem cargo).
CREATE OR REPLACE FUNCTION private.top_role_position(_user uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(max(r.position), -1)
  FROM public.user_panel_roles ur JOIN public.panel_roles r ON r.id = ur.role_id
  WHERE ur.user_id = _user
$$;

-- O usuário pode mexer neste cargo? (abaixo do cargo mais alto dele, ou é Administrador)
CREATE OR REPLACE FUNCTION private.can_manage_role(_user uuid, _role uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT private.has_permission(_user, 'administrator')
      OR (SELECT r.position < private.top_role_position(_user) FROM public.panel_roles r WHERE r.id = _role)
$$;

REVOKE ALL ON FUNCTION private.user_permission_list(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.has_permission(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.top_role_position(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.can_manage_role(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.user_permission_list(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.has_permission(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.top_role_position(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.can_manage_role(uuid, uuid) TO authenticated, service_role;

-- ------------------------------------------------------------------ acesso às tabelas de cargos
GRANT SELECT, INSERT, UPDATE, DELETE ON public.panel_roles TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.user_panel_roles TO authenticated;
GRANT ALL ON public.panel_roles, public.user_panel_roles TO service_role;
ALTER TABLE public.panel_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_panel_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team reads roles" ON public.panel_roles;
CREATE POLICY "Team reads roles" ON public.panel_roles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Role managers create roles" ON public.panel_roles;
CREATE POLICY "Role managers create roles" ON public.panel_roles FOR INSERT TO authenticated
  WITH CHECK (
    private.has_permission(auth.uid(), 'roles.manage')
    AND (private.has_permission(auth.uid(), 'administrator')
         OR (position < private.top_role_position(auth.uid()) AND permissions <@ private.user_permission_list(auth.uid())))
  );

DROP POLICY IF EXISTS "Role managers edit lower roles" ON public.panel_roles;
CREATE POLICY "Role managers edit lower roles" ON public.panel_roles FOR UPDATE TO authenticated
  USING (private.has_permission(auth.uid(), 'roles.manage') AND private.can_manage_role(auth.uid(), id))
  WITH CHECK (
    private.has_permission(auth.uid(), 'administrator')
    OR (position < private.top_role_position(auth.uid()) AND permissions <@ private.user_permission_list(auth.uid()))
  );

DROP POLICY IF EXISTS "Role managers delete lower roles" ON public.panel_roles;
CREATE POLICY "Role managers delete lower roles" ON public.panel_roles FOR DELETE TO authenticated
  USING (private.has_permission(auth.uid(), 'roles.manage') AND private.can_manage_role(auth.uid(), id));

DROP POLICY IF EXISTS "Team reads role members" ON public.user_panel_roles;
CREATE POLICY "Team reads role members" ON public.user_panel_roles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "User managers assign lower roles" ON public.user_panel_roles;
CREATE POLICY "User managers assign lower roles" ON public.user_panel_roles FOR INSERT TO authenticated
  WITH CHECK (private.has_permission(auth.uid(), 'users.manage') AND private.can_manage_role(auth.uid(), role_id));

DROP POLICY IF EXISTS "User managers remove lower roles" ON public.user_panel_roles;
CREATE POLICY "User managers remove lower roles" ON public.user_panel_roles FOR DELETE TO authenticated
  USING (private.has_permission(auth.uid(), 'users.manage') AND private.can_manage_role(auth.uid(), role_id));

-- Sempre sobra pelo menos um usuário com Administrador (evita trancar o painel).
CREATE OR REPLACE FUNCTION private.keep_one_administrator()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.user_panel_roles ur JOIN public.panel_roles r ON r.id = ur.role_id
             WHERE 'administrator' = ANY (r.permissions)) THEN
    RETURN NULL;
  END IF;
  -- Ninguém com Administrador: só aceita se ainda não existe nenhum cargo atribuído (instalação nova).
  IF EXISTS (SELECT 1 FROM public.user_panel_roles) THEN
    RAISE EXCEPTION 'Pelo menos um usuário precisa continuar com um cargo de Administrador' USING ERRCODE = '42501';
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS keep_one_administrator_roles ON public.panel_roles;
CREATE CONSTRAINT TRIGGER keep_one_administrator_roles
  AFTER UPDATE OR DELETE ON public.panel_roles
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION private.keep_one_administrator();
DROP TRIGGER IF EXISTS keep_one_administrator_members ON public.user_panel_roles;
CREATE CONSTRAINT TRIGGER keep_one_administrator_members
  AFTER DELETE ON public.user_panel_roles
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION private.keep_one_administrator();

DROP TRIGGER IF EXISTS update_panel_roles_updated_at ON public.panel_roles;
CREATE TRIGGER update_panel_roles_updated_at
  BEFORE UPDATE ON public.panel_roles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ------------------------------------------------------------------ cargos iniciais (os antigos)
DO $$
DECLARE
  r_super uuid; r_admin uuid; r_analista uuid; r_midia uuid; r_moderador uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.panel_roles) THEN
    RETURN;
  END IF;
  INSERT INTO public.panel_roles (name, color, position, permissions) VALUES
    ('Super Admin', '#e74c3c', 50, ARRAY['administrator']) RETURNING id INTO r_super;
  INSERT INTO public.panel_roles (name, color, position, permissions) VALUES
    ('ADM', '#3498db', 40, ARRAY['items.view_ids', 'items.manage', 'items.game_sync', 'items.export_images', 'tools.id_filler',
      'tools.validator', 'events.access', 'events.presets', 'events.item_rules', 'events.history', 'schedule.edit',
      'codes.request', 'codes.manage']) RETURNING id INTO r_admin;
  INSERT INTO public.panel_roles (name, color, position, permissions) VALUES
    ('Analista', '#9b59b6', 30, ARRAY['items.view_ids']) RETURNING id INTO r_analista;
  INSERT INTO public.panel_roles (name, color, position, permissions) VALUES
    ('Moderador', '#2ecc71', 20, '{}') RETURNING id INTO r_moderador;
  INSERT INTO public.panel_roles (name, color, position, permissions) VALUES
    ('Mídia', '#e91e63', 10, ARRAY['codes.request']) RETURNING id INTO r_midia;

  INSERT INTO public.user_panel_roles (user_id, role_id, granted_by)
  SELECT ur.user_id,
         CASE ur.role::text WHEN 'super_admin' THEN r_super WHEN 'admin' THEN r_admin WHEN 'analista' THEN r_analista
                            WHEN 'moderador' THEN r_moderador WHEN 'midia' THEN r_midia END,
         NULL
  FROM public.user_roles ur
  WHERE ur.role::text IN ('super_admin', 'admin', 'analista', 'moderador', 'midia')
  ON CONFLICT DO NOTHING;
END $$;

-- ------------------------------------------------------------------ itens e imagens
DROP POLICY IF EXISTS "Admins can insert items" ON public.items;
DROP POLICY IF EXISTS "Admins can update items" ON public.items;
DROP POLICY IF EXISTS "Admins can delete items" ON public.items;
DROP POLICY IF EXISTS "Item managers insert items" ON public.items;
DROP POLICY IF EXISTS "Item managers update items" ON public.items;
DROP POLICY IF EXISTS "Item managers delete items" ON public.items;
CREATE POLICY "Item managers insert items" ON public.items FOR INSERT WITH CHECK (private.has_permission(auth.uid(), 'items.manage'));
CREATE POLICY "Item managers update items" ON public.items FOR UPDATE USING (private.has_permission(auth.uid(), 'items.manage'));
CREATE POLICY "Item managers delete items" ON public.items FOR DELETE USING (private.has_permission(auth.uid(), 'items.manage'));

DROP POLICY IF EXISTS "Admins can insert items_turco" ON public.items_turco;
DROP POLICY IF EXISTS "Admins can update items_turco" ON public.items_turco;
DROP POLICY IF EXISTS "Admins can delete items_turco" ON public.items_turco;
DROP POLICY IF EXISTS "Item managers insert items_turco" ON public.items_turco;
DROP POLICY IF EXISTS "Item managers update items_turco" ON public.items_turco;
DROP POLICY IF EXISTS "Item managers delete items_turco" ON public.items_turco;
CREATE POLICY "Item managers insert items_turco" ON public.items_turco FOR INSERT WITH CHECK (private.has_permission(auth.uid(), 'items.manage'));
CREATE POLICY "Item managers update items_turco" ON public.items_turco FOR UPDATE USING (private.has_permission(auth.uid(), 'items.manage'));
CREATE POLICY "Item managers delete items_turco" ON public.items_turco FOR DELETE USING (private.has_permission(auth.uid(), 'items.manage'));

DROP POLICY IF EXISTS "Admins can insert categories" ON public.categories;
DROP POLICY IF EXISTS "Admins can update categories" ON public.categories;
DROP POLICY IF EXISTS "Admins can delete categories" ON public.categories;
DROP POLICY IF EXISTS "Item managers insert categories" ON public.categories;
DROP POLICY IF EXISTS "Item managers update categories" ON public.categories;
DROP POLICY IF EXISTS "Item managers delete categories" ON public.categories;
CREATE POLICY "Item managers insert categories" ON public.categories FOR INSERT WITH CHECK (private.has_permission(auth.uid(), 'items.manage'));
CREATE POLICY "Item managers update categories" ON public.categories FOR UPDATE USING (private.has_permission(auth.uid(), 'items.manage'));
CREATE POLICY "Item managers delete categories" ON public.categories FOR DELETE USING (private.has_permission(auth.uid(), 'items.manage'));

DROP POLICY IF EXISTS "Admins can insert item_categories" ON public.item_categories;
DROP POLICY IF EXISTS "Admins can delete item_categories" ON public.item_categories;
DROP POLICY IF EXISTS "Item managers insert item_categories" ON public.item_categories;
DROP POLICY IF EXISTS "Item managers delete item_categories" ON public.item_categories;
CREATE POLICY "Item managers insert item_categories" ON public.item_categories FOR INSERT WITH CHECK (private.has_permission(auth.uid(), 'items.manage'));
CREATE POLICY "Item managers delete item_categories" ON public.item_categories FOR DELETE USING (private.has_permission(auth.uid(), 'items.manage'));

DROP POLICY IF EXISTS "Admins can manage package contents" ON public.package_contents;
DROP POLICY IF EXISTS "Item managers manage package contents" ON public.package_contents;
CREATE POLICY "Item managers manage package contents" ON public.package_contents FOR ALL
  USING (private.has_permission(auth.uid(), 'items.manage')) WITH CHECK (private.has_permission(auth.uid(), 'items.manage'));

DROP POLICY IF EXISTS "Admins can upload item images" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update item images" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete item images" ON storage.objects;
DROP POLICY IF EXISTS "Admins can upload item-images-turco" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update item-images-turco" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete item-images-turco" ON storage.objects;
DROP POLICY IF EXISTS "Item managers upload item images" ON storage.objects;
DROP POLICY IF EXISTS "Item managers update item images" ON storage.objects;
DROP POLICY IF EXISTS "Item managers delete item images" ON storage.objects;
CREATE POLICY "Item managers upload item images" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id IN ('item-images', 'item-images-turco') AND private.has_permission(auth.uid(), 'items.manage'));
CREATE POLICY "Item managers update item images" ON storage.objects FOR UPDATE
  USING (bucket_id IN ('item-images', 'item-images-turco') AND private.has_permission(auth.uid(), 'items.manage'));
CREATE POLICY "Item managers delete item images" ON storage.objects FOR DELETE
  USING (bucket_id IN ('item-images', 'item-images-turco') AND private.has_permission(auth.uid(), 'items.manage'));

-- ------------------------------------------------------------------ criação de eventos
DROP POLICY IF EXISTS "Admins manage event documents" ON public.event_documents;
DROP POLICY IF EXISTS "Event editors manage event documents" ON public.event_documents;
CREATE POLICY "Event editors manage event documents" ON public.event_documents FOR ALL TO authenticated
  USING (private.has_permission(auth.uid(), 'events.access')) WITH CHECK (private.has_permission(auth.uid(), 'events.access'));

DROP POLICY IF EXISTS "Admins insert event presets" ON public.event_presets;
DROP POLICY IF EXISTS "Admins update event presets" ON public.event_presets;
DROP POLICY IF EXISTS "Admins delete event presets" ON public.event_presets;
DROP POLICY IF EXISTS "Preset editors insert event presets" ON public.event_presets;
DROP POLICY IF EXISTS "Preset editors update event presets" ON public.event_presets;
DROP POLICY IF EXISTS "Preset editors delete event presets" ON public.event_presets;
CREATE POLICY "Preset editors insert event presets" ON public.event_presets FOR INSERT TO authenticated WITH CHECK (private.has_permission(auth.uid(), 'events.presets'));
CREATE POLICY "Preset editors update event presets" ON public.event_presets FOR UPDATE TO authenticated USING (private.has_permission(auth.uid(), 'events.presets'));
CREATE POLICY "Preset editors delete event presets" ON public.event_presets FOR DELETE TO authenticated USING (private.has_permission(auth.uid(), 'events.presets'));

DROP POLICY IF EXISTS "Admins insert event item categories" ON public.event_item_categories;
DROP POLICY IF EXISTS "Admins update event item categories" ON public.event_item_categories;
DROP POLICY IF EXISTS "Admins delete event item categories" ON public.event_item_categories;
DROP POLICY IF EXISTS "Rule editors insert event item categories" ON public.event_item_categories;
DROP POLICY IF EXISTS "Rule editors update event item categories" ON public.event_item_categories;
DROP POLICY IF EXISTS "Rule editors delete event item categories" ON public.event_item_categories;
CREATE POLICY "Rule editors insert event item categories" ON public.event_item_categories FOR INSERT TO authenticated WITH CHECK (private.has_permission(auth.uid(), 'events.item_rules'));
CREATE POLICY "Rule editors update event item categories" ON public.event_item_categories FOR UPDATE TO authenticated USING (private.has_permission(auth.uid(), 'events.item_rules'));
CREATE POLICY "Rule editors delete event item categories" ON public.event_item_categories FOR DELETE TO authenticated USING (private.has_permission(auth.uid(), 'events.item_rules'));

DROP POLICY IF EXISTS "Admins read event templates" ON storage.objects;
DROP POLICY IF EXISTS "Super admins upload event templates" ON storage.objects;
DROP POLICY IF EXISTS "Super admins update event templates" ON storage.objects;
DROP POLICY IF EXISTS "Super admins delete event templates" ON storage.objects;
DROP POLICY IF EXISTS "Event editors read event templates" ON storage.objects;
DROP POLICY IF EXISTS "Template managers upload event templates" ON storage.objects;
DROP POLICY IF EXISTS "Template managers update event templates" ON storage.objects;
DROP POLICY IF EXISTS "Template managers delete event templates" ON storage.objects;
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
DROP POLICY IF EXISTS "Requesters and managers read code requests" ON public.code_requests;
DROP POLICY IF EXISTS "Requesters create code requests" ON public.code_requests;
DROP POLICY IF EXISTS "Managers update code requests" ON public.code_requests;
DROP POLICY IF EXISTS "Requesters cancel pending, managers delete code requests" ON public.code_requests;
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
      CONTINUE; -- aplique antes a migração do cronograma (20261008180000) e rode esta de novo
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