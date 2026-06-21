
-- 1) Remove public write policies on item-images bucket
DROP POLICY IF EXISTS "Anyone can upload item images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can update item images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete item images" ON storage.objects;

-- 2) Remove broad SELECT policies that allow listing/enumeration of the public buckets.
-- Files remain accessible via their public URLs (public buckets don't require a SELECT policy for getPublicUrl access).
DROP POLICY IF EXISTS "Anyone can read item images" ON storage.objects;
DROP POLICY IF EXISTS "Public can view item images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view item-images-turco" ON storage.objects;

-- 3) Tighten EXECUTE on SECURITY DEFINER functions
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO service_role;

REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
