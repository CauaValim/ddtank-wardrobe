-- Create items_turco table (same schema as items)
CREATE TABLE public.items_turco (
  id integer NOT NULL PRIMARY KEY,
  name text,
  remark text,
  type integer,
  "desc" text,
  attack integer DEFAULT 0,
  defence integer DEFAULT 0,
  agility integer DEFAULT 0,
  luck integer DEFAULT 0,
  item_grade integer DEFAULT 0,
  profile text,
  pic_path text,
  pile_count integer DEFAULT 0,
  need_sex integer DEFAULT 0,
  need_grade integer DEFAULT 0,
  is_strengthen boolean DEFAULT false,
  is_compose boolean DEFAULT false,
  is_throw boolean DEFAULT false,
  is_equip boolean DEFAULT false,
  is_use boolean DEFAULT false,
  is_delete boolean DEFAULT false,
  script text,
  data text,
  color integer DEFAULT 0,
  attribute1 text,
  attribute2 text,
  attribute3 text,
  attribute4 text,
  attribute5 text,
  attribute6 text,
  attribute7 text,
  attribute8 text,
  bind_type integer DEFAULT 0,
  success_rate numeric DEFAULT 0,
  success_modulus numeric DEFAULT 0,
  beset text,
  melt_grade integer DEFAULT 0,
  melt_type integer DEFAULT 0,
  price integer DEFAULT 0,
  price_type integer DEFAULT 0,
  can_send boolean DEFAULT false,
  is_callback boolean DEFAULT false,
  floor_price integer DEFAULT 0,
  suit_id integer DEFAULT 0,
  can_transfer boolean DEFAULT false,
  image_url text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.items_turco ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view items_turco"
  ON public.items_turco FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert items_turco"
  ON public.items_turco FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Admins can update items_turco"
  ON public.items_turco FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Admins can delete items_turco"
  ON public.items_turco FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER update_items_turco_updated_at
  BEFORE UPDATE ON public.items_turco
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket for turco images
INSERT INTO storage.buckets (id, name, public)
VALUES ('item-images-turco', 'item-images-turco', true);

-- Storage policies for item-images-turco
CREATE POLICY "Anyone can view item-images-turco"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'item-images-turco');

CREATE POLICY "Admins can upload item-images-turco"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'item-images-turco'
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
  );

CREATE POLICY "Admins can update item-images-turco"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'item-images-turco'
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
  );

CREATE POLICY "Admins can delete item-images-turco"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'item-images-turco'
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
  );