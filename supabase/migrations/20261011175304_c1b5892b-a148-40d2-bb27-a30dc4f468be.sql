ALTER TABLE public.package_contents
  ADD COLUMN IF NOT EXISTS valid_days integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_bind boolean,
  ADD COLUMN IF NOT EXISTS content_name text,
  ADD COLUMN IF NOT EXISTS position integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';

DO $$
DECLARE c text;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.package_contents'::regclass AND contype = 'u'
  LOOP
    EXECUTE format('ALTER TABLE public.package_contents DROP CONSTRAINT %I', c);
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_package_contents_order ON public.package_contents (realm, package_id, position);