CREATE TABLE public.package_contents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  realm text NOT NULL DEFAULT 'br',
  package_id integer NOT NULL,
  content_item_id integer NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  probability text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (realm, package_id, content_item_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.package_contents TO authenticated;
GRANT ALL ON public.package_contents TO service_role;

ALTER TABLE public.package_contents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view package contents" ON public.package_contents FOR SELECT USING (true);
CREATE POLICY "Admins can manage package contents" ON public.package_contents FOR ALL USING (private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'super_admin'::app_role));

CREATE INDEX idx_package_contents_lookup ON public.package_contents (realm, package_id);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_package_contents_updated_at
BEFORE UPDATE ON public.package_contents
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();