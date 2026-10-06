CREATE TABLE IF NOT EXISTS public.event_item_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_group text NOT NULL DEFAULT 'old' CHECK (server_group IN ('old', 'new')),
  item_id text NOT NULL,
  item_name text NOT NULL DEFAULT '',
  allowed text[] NOT NULL DEFAULT '{}',
  forbidden text[] NOT NULL DEFAULT '{}',
  note text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_item_categories_group_item_key UNIQUE (server_group, item_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_item_categories TO authenticated;
GRANT ALL ON public.event_item_categories TO service_role;
ALTER TABLE public.event_item_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team reads event item categories" ON public.event_item_categories;
CREATE POLICY "Team reads event item categories" ON public.event_item_categories
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins insert event item categories" ON public.event_item_categories;
CREATE POLICY "Admins insert event item categories" ON public.event_item_categories
  FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role) OR private.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS "Admins update event item categories" ON public.event_item_categories;
CREATE POLICY "Admins update event item categories" ON public.event_item_categories
  FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role) OR private.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS "Admins delete event item categories" ON public.event_item_categories;
CREATE POLICY "Admins delete event item categories" ON public.event_item_categories
  FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role) OR private.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP TRIGGER IF EXISTS update_event_item_categories_updated_at ON public.event_item_categories;
CREATE TRIGGER update_event_item_categories_updated_at
  BEFORE UPDATE ON public.event_item_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();