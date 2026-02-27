
-- Drop admin-only policies on items
DROP POLICY IF EXISTS "Admins can delete items" ON public.items;
DROP POLICY IF EXISTS "Admins can insert items" ON public.items;
DROP POLICY IF EXISTS "Admins can select items" ON public.items;
DROP POLICY IF EXISTS "Admins can update items" ON public.items;

-- Create public access policies
CREATE POLICY "Anyone can view items" ON public.items FOR SELECT USING (true);
CREATE POLICY "Anyone can insert items" ON public.items FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update items" ON public.items FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete items" ON public.items FOR DELETE USING (true);
