-- Cronograma refeito: seções, categorias e períodos definidos pela equipe no painel.
-- O cronograma anterior (schedule_weeks, com as semanas fixas) é apagado.
DROP TABLE IF EXISTS public.schedule_weeks;

CREATE TABLE IF NOT EXISTS public.schedule_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.schedule_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES public.schedule_sections(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#64748b',
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.schedule_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  start_date date NOT NULL,
  end_date date NOT NULL,
  label text NOT NULL DEFAULT '',
  theme text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT schedule_periods_dates CHECK (end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS public.schedule_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id uuid NOT NULL REFERENCES public.schedule_periods(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.schedule_categories(id) ON DELETE CASCADE,
  text text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS schedule_categories_section_idx ON public.schedule_categories (section_id, position);
CREATE INDEX IF NOT EXISTS schedule_periods_start_idx ON public.schedule_periods (start_date);
CREATE INDEX IF NOT EXISTS schedule_entries_period_idx ON public.schedule_entries (period_id, category_id, position);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['schedule_sections', 'schedule_categories', 'schedule_periods', 'schedule_entries'] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "Team reads %s" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "Team reads %s" ON public.%I FOR SELECT TO authenticated USING (true)', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "Admins insert %s" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "Admins insert %s" ON public.%I FOR INSERT TO authenticated WITH CHECK (private.has_role(auth.uid(), ''admin''::public.app_role) OR private.has_role(auth.uid(), ''super_admin''::public.app_role))', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "Admins update %s" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "Admins update %s" ON public.%I FOR UPDATE TO authenticated USING (private.has_role(auth.uid(), ''admin''::public.app_role) OR private.has_role(auth.uid(), ''super_admin''::public.app_role))', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "Admins delete %s" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "Admins delete %s" ON public.%I FOR DELETE TO authenticated USING (private.has_role(auth.uid(), ''admin''::public.app_role) OR private.has_role(auth.uid(), ''super_admin''::public.app_role))', t, t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['schedule_sections', 'schedule_categories', 'schedule_periods'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS update_%s_updated_at ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER update_%s_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', t, t);
  END LOOP;
END $$;
