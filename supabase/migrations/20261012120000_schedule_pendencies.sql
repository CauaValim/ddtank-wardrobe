-- Pendências do cronograma: cada pendência tem título, contexto, a aba a que se refere,
-- o período do cronograma (opcional), anexos (arquivos no bucket "schedule-pendencies") e status.
-- Toda a equipe vê e cria; quem criou ou quem tem "Editar cronograma" (schedule.edit) altera,
-- resolve e exclui.

CREATE TABLE IF NOT EXISTS public.schedule_pendencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  context text NOT NULL DEFAULT '',
  -- Aba da pendência (ex.: "Missões", "Troca", "Recarga" ou outra escrita pela equipe).
  tab text NOT NULL DEFAULT '',
  period_id uuid REFERENCES public.schedule_periods(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  -- [{ "path": "<uid>/<arquivo>", "name": "print.png", "size": 1234, "type": "image/png" }]
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_by_email text,
  resolved_at timestamptz,
  resolved_by_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS schedule_pendencies_status_idx ON public.schedule_pendencies (status, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_pendencies TO authenticated;
GRANT ALL ON public.schedule_pendencies TO service_role;
ALTER TABLE public.schedule_pendencies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team reads pendencies" ON public.schedule_pendencies;
CREATE POLICY "Team reads pendencies" ON public.schedule_pendencies FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Team creates pendencies" ON public.schedule_pendencies;
CREATE POLICY "Team creates pendencies" ON public.schedule_pendencies FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "Authors and schedule editors update pendencies" ON public.schedule_pendencies;
CREATE POLICY "Authors and schedule editors update pendencies" ON public.schedule_pendencies FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR private.has_permission(auth.uid(), 'schedule.edit'));

DROP POLICY IF EXISTS "Authors and schedule editors delete pendencies" ON public.schedule_pendencies;
CREATE POLICY "Authors and schedule editors delete pendencies" ON public.schedule_pendencies FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR private.has_permission(auth.uid(), 'schedule.edit'));

DROP TRIGGER IF EXISTS update_schedule_pendencies_updated_at ON public.schedule_pendencies;
CREATE TRIGGER update_schedule_pendencies_updated_at BEFORE UPDATE ON public.schedule_pendencies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ------------------------------------------------------------------ anexos
-- Bucket privado (até 20 MB por arquivo). Cada arquivo fica na pasta do usuário que enviou.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('schedule-pendencies', 'schedule-pendencies', false, 20971520)
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 20971520;

DROP POLICY IF EXISTS "Team reads pendency attachments" ON storage.objects;
CREATE POLICY "Team reads pendency attachments" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'schedule-pendencies');

DROP POLICY IF EXISTS "Team uploads pendency attachments" ON storage.objects;
CREATE POLICY "Team uploads pendency attachments" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'schedule-pendencies' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Owners and schedule editors delete pendency attachments" ON storage.objects;
CREATE POLICY "Owners and schedule editors delete pendency attachments" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'schedule-pendencies'
    AND ((storage.foldername(name))[1] = auth.uid()::text OR private.has_permission(auth.uid(), 'schedule.edit'))
  );
