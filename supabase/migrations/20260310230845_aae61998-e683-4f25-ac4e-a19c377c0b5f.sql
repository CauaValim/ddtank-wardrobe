
DROP POLICY IF EXISTS "Admins can upload item images" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update item images" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete item images" ON storage.objects;

CREATE POLICY "Admins can upload item images" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'item-images' AND
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR
     public.has_role(auth.uid(), 'super_admin'::public.app_role)));

CREATE POLICY "Admins can update item images" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'item-images' AND
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR
     public.has_role(auth.uid(), 'super_admin'::public.app_role)));

CREATE POLICY "Admins can delete item images" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'item-images' AND
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR
     public.has_role(auth.uid(), 'super_admin'::public.app_role)));
