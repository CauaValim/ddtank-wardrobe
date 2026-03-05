
-- Drop permissive insert/delete policies
DROP POLICY IF EXISTS "Anyone can insert item_categories" ON public.item_categories;
DROP POLICY IF EXISTS "Anyone can delete item_categories" ON public.item_categories;

-- Restrict insert to admin/super_admin
CREATE POLICY "Admins can insert item_categories"
ON public.item_categories
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role) OR
  public.has_role(auth.uid(), 'super_admin'::app_role)
);

-- Restrict delete to admin/super_admin
CREATE POLICY "Admins can delete item_categories"
ON public.item_categories
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role) OR
  public.has_role(auth.uid(), 'super_admin'::app_role)
);
