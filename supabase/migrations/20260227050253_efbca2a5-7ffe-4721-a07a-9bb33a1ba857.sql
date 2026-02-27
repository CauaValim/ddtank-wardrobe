
-- Allow public insert/update/delete on categories (no auth for now)
DROP POLICY "Admins can insert categories" ON public.categories;
DROP POLICY "Admins can update categories" ON public.categories;
DROP POLICY "Admins can delete categories" ON public.categories;

CREATE POLICY "Anyone can insert categories" ON public.categories FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update categories" ON public.categories FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete categories" ON public.categories FOR DELETE USING (true);

-- Allow public insert/delete on item_categories
DROP POLICY "Admins can insert item_categories" ON public.item_categories;
DROP POLICY "Admins can delete item_categories" ON public.item_categories;

CREATE POLICY "Anyone can insert item_categories" ON public.item_categories FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can delete item_categories" ON public.item_categories FOR DELETE USING (true);
