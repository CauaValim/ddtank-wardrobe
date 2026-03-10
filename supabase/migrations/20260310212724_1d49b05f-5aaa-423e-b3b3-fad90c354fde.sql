
-- Drop the overly permissive public write policies on items
DROP POLICY IF EXISTS "Anyone can insert items" ON public.items;
DROP POLICY IF EXISTS "Anyone can update items" ON public.items;
DROP POLICY IF EXISTS "Anyone can delete items" ON public.items;

-- Create admin-only write policies matching categories/item_categories pattern
CREATE POLICY "Admins can insert items"
ON public.items
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Admins can update items"
ON public.items
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Admins can delete items"
ON public.items
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));
