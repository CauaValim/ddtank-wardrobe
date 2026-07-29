
-- Move has_role into a private schema to keep it out of the API-exposed surface,
-- while preserving RLS behavior. Authenticated users keep EXECUTE on the private
-- function (required for RLS evaluation), but it is no longer in `public`.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;

-- Recreate policies to reference private.has_role
-- public.user_roles
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
CREATE POLICY "Admins can view all roles" ON public.user_roles
  FOR SELECT USING (private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'super_admin'::app_role));

-- public.categories
DROP POLICY IF EXISTS "Admins can insert categories" ON public.categories;
CREATE POLICY "Admins can insert categories" ON public.categories
  FOR INSERT WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'super_admin'::app_role));
DROP POLICY IF EXISTS "Admins can update categories" ON public.categories;
CREATE POLICY "Admins can update categories" ON public.categories
  FOR UPDATE USING (private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'super_admin'::app_role));
DROP POLICY IF EXISTS "Admins can delete categories" ON public.categories;
CREATE POLICY "Admins can delete categories" ON public.categories
  FOR DELETE USING (private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'super_admin'::app_role));

-- public.item_categories
DROP POLICY IF EXISTS "Admins can insert item_categories" ON public.item_categories;
CREATE POLICY "Admins can insert item_categories" ON public.item_categories
  FOR INSERT WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'super_admin'::app_role));
DROP POLICY IF EXISTS "Admins can delete item_categories" ON public.item_categories;
CREATE POLICY "Admins can delete item_categories" ON public.item_categories
  FOR DELETE USING (private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'super_admin'::app_role));

-- public.items
DROP POLICY IF EXISTS "Admins can insert items" ON public.items;
CREATE POLICY "Admins can insert items" ON public.items
  FOR INSERT WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'super_admin'::app_role));
DROP POLICY IF EXISTS "Admins can update items" ON public.items;
CREATE POLICY "Admins can update items" ON public.items
  FOR UPDATE USING (private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'super_admin'::app_role));
DROP POLICY IF EXISTS "Admins can delete items" ON public.items;
CREATE POLICY "Admins can delete items" ON public.items
  FOR DELETE USING (private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'super_admin'::app_role));

-- public.items_turco
DROP POLICY IF EXISTS "Admins can insert items_turco" ON public.items_turco;
CREATE POLICY "Admins can insert items_turco" ON public.items_turco
  FOR INSERT WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'super_admin'::app_role));
DROP POLICY IF EXISTS "Admins can update items_turco" ON public.items_turco;
CREATE POLICY "Admins can update items_turco" ON public.items_turco
  FOR UPDATE USING (private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'super_admin'::app_role));
DROP POLICY IF EXISTS "Admins can delete items_turco" ON public.items_turco;
CREATE POLICY "Admins can delete items_turco" ON public.items_turco
  FOR DELETE USING (private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'super_admin'::app_role));

-- storage.objects (item-images)
DROP POLICY IF EXISTS "Admins can upload item images" ON storage.objects;
CREATE POLICY "Admins can upload item images" ON storage.objects
  FOR INSERT WITH CHECK ((bucket_id = 'item-images') AND (private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'super_admin'::app_role)));
DROP POLICY IF EXISTS "Admins can update item images" ON storage.objects;
CREATE POLICY "Admins can update item images" ON storage.objects
  FOR UPDATE USING ((bucket_id = 'item-images') AND (private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'super_admin'::app_role)));
DROP POLICY IF EXISTS "Admins can delete item images" ON storage.objects;
CREATE POLICY "Admins can delete item images" ON storage.objects
  FOR DELETE USING ((bucket_id = 'item-images') AND (private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'super_admin'::app_role)));

-- storage.objects (item-images-turco)
DROP POLICY IF EXISTS "Admins can upload item-images-turco" ON storage.objects;
CREATE POLICY "Admins can upload item-images-turco" ON storage.objects
  FOR INSERT WITH CHECK ((bucket_id = 'item-images-turco') AND (private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'super_admin'::app_role)));
DROP POLICY IF EXISTS "Admins can update item-images-turco" ON storage.objects;
CREATE POLICY "Admins can update item-images-turco" ON storage.objects
  FOR UPDATE USING ((bucket_id = 'item-images-turco') AND (private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'super_admin'::app_role)));
DROP POLICY IF EXISTS "Admins can delete item-images-turco" ON storage.objects;
CREATE POLICY "Admins can delete item-images-turco" ON storage.objects
  FOR DELETE USING ((bucket_id = 'item-images-turco') AND (private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'super_admin'::app_role)));

-- Drop the public-schema version now that no policies depend on it
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);
