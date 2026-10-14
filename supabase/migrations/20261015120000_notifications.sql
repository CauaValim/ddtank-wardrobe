-- Notificações do painel (sino na barra do topo).
-- 1. Toda segunda-feira às 08:00 (Brasília), cada membro da equipe recebe o tema e o cronograma
--    da semana e as pendências abertas ligadas a ela.
-- 2. Quando uma solicitação de códigos é enviada, quem tem "Responder solicitações de códigos"
--    (codes.manage) é avisado.

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- 'weekly_schedule' | 'code_request'
  kind text NOT NULL,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  -- Caminho no painel para abrir ao clicar (ex.: /codigos/<id>).
  link text,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON public.notifications (user_id, created_at DESC);

GRANT SELECT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Cada um só vê, marca como lida e apaga as próprias. Quem cria são as funções abaixo.
DROP POLICY IF EXISTS "Users read own notifications" ON public.notifications;
CREATE POLICY "Users read own notifications" ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Users update own notifications" ON public.notifications;
CREATE POLICY "Users update own notifications" ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Users delete own notifications" ON public.notifications;
CREATE POLICY "Users delete own notifications" ON public.notifications FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ------------------------------------------------------------------ códigos enviados
CREATE OR REPLACE FUNCTION private.notify_code_request_sent()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  requester text;
BEGIN
  IF NEW.status <> 'enviada' OR (TG_OP = 'UPDATE' AND OLD.status = 'enviada') THEN
    RETURN NULL;
  END IF;
  SELECT email INTO requester FROM auth.users WHERE id = NEW.created_by;
  INSERT INTO public.notifications (user_id, kind, title, body, link)
  SELECT DISTINCT ur.user_id, 'code_request', 'Nova solicitação de códigos',
         format('%s enviou "%s" (%s).', COALESCE(requester, 'Alguém'), NEW.title, NEW.servers),
         '/codigos/' || NEW.id
  FROM public.user_panel_roles ur
  WHERE ur.user_id <> NEW.created_by
    AND private.has_permission(ur.user_id, 'codes.manage');
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION private.notify_code_request_sent() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS notify_code_request_sent ON public.code_documents;
CREATE TRIGGER notify_code_request_sent
  AFTER INSERT OR UPDATE OF status ON public.code_documents
  FOR EACH ROW EXECUTE FUNCTION private.notify_code_request_sent();

-- ------------------------------------------------------------------ resumo semanal do cronograma
-- Períodos do cronograma que tocam a semana (de hoje a hoje + 6), os eventos de cada categoria
-- e as pendências abertas desses períodos. Uma notificação por membro da equipe.
CREATE OR REPLACE FUNCTION private.send_weekly_schedule_notification()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  week_end date := today + 6;
  p record;
  c record;
  pend record;
  msg text := '';
  notif_title text;
  themes text[] := '{}';
  period_ids uuid[] := '{}';
  pend_count integer := 0;
  other_open integer;
  sent integer;
BEGIN
  FOR p IN
    SELECT * FROM public.schedule_periods
    WHERE start_date <= week_end AND end_date >= today
    ORDER BY start_date
  LOOP
    period_ids := period_ids || p.id;
    IF COALESCE(p.theme, '') <> '' THEN themes := themes || p.theme; END IF;
    msg := msg || format(E'📅 %s (%s a %s)%s\n',
      CASE WHEN COALESCE(p.label, '') <> '' THEN p.label ELSE 'Período' END,
      to_char(p.start_date, 'DD/MM'), to_char(p.end_date, 'DD/MM'),
      CASE WHEN COALESCE(p.theme, '') <> '' THEN ' — ' || p.theme ELSE '' END);
    FOR c IN
      SELECT cat.name, string_agg(e.text, '; ' ORDER BY e.position) AS events
      FROM public.schedule_entries e
      JOIN public.schedule_categories cat ON cat.id = e.category_id
      WHERE e.period_id = p.id
      GROUP BY cat.name, cat.position
      ORDER BY cat.position, cat.name
    LOOP
      msg := msg || format(E'• %s: %s\n', c.name, c.events);
    END LOOP;
    IF COALESCE(p.notes, '') <> '' THEN msg := msg || format(E'Obs.: %s\n', p.notes); END IF;
    msg := msg || E'\n';
  END LOOP;

  IF array_length(period_ids, 1) IS NULL THEN
    msg := E'Nenhum período do cronograma cobre esta semana.\n\n';
  END IF;

  IF to_regclass('public.schedule_pendencies') IS NOT NULL THEN
    FOR pend IN
      SELECT sp.title, sp.tab FROM public.schedule_pendencies sp
      WHERE sp.status = 'open' AND sp.period_id = ANY (period_ids)
      ORDER BY sp.created_at
    LOOP
      IF pend_count = 0 THEN msg := msg || E'⚠️ Pendências da semana:\n'; END IF;
      pend_count := pend_count + 1;
      msg := msg || format(E'• %s%s\n', pend.title, CASE WHEN COALESCE(pend.tab, '') <> '' THEN ' (' || pend.tab || ')' ELSE '' END);
    END LOOP;
    SELECT count(*) INTO other_open FROM public.schedule_pendencies
      WHERE status = 'open' AND (period_id IS NULL OR NOT (period_id = ANY (period_ids)));
    IF pend_count = 0 THEN msg := msg || E'Nenhuma pendência aberta para esta semana.\n'; END IF;
    IF other_open > 0 THEN msg := msg || format(E'Outras pendências abertas: %s.\n', other_open); END IF;
  END IF;

  notif_title := 'Cronograma da semana ' || to_char(today, 'DD/MM') || ' a ' || to_char(week_end, 'DD/MM')
    || CASE WHEN array_length(themes, 1) IS NOT NULL THEN ' — ' || array_to_string(themes, ' / ') ELSE '' END;

  INSERT INTO public.notifications (user_id, kind, title, body, link)
  SELECT DISTINCT ur.user_id, 'weekly_schedule', notif_title, trim(trailing E'\n' FROM msg), NULL
  FROM public.user_panel_roles ur;
  GET DIAGNOSTICS sent = ROW_COUNT;
  RETURN sent;
END;
$$;
REVOKE ALL ON FUNCTION private.send_weekly_schedule_notification() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.send_weekly_schedule_notification() TO service_role, postgres;

-- Envio manual (botão no sino), só para quem edita o cronograma.
CREATE OR REPLACE FUNCTION public.send_weekly_schedule_notification_now()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT private.has_permission(auth.uid(), 'schedule.edit') THEN
    RAISE EXCEPTION 'Sem permissão para enviar o resumo do cronograma';
  END IF;
  RETURN private.send_weekly_schedule_notification();
END;
$$;
REVOKE ALL ON FUNCTION public.send_weekly_schedule_notification_now() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_weekly_schedule_notification_now() TO authenticated;

-- Toda segunda-feira às 11:00 UTC (08:00 em Brasília).
CREATE EXTENSION IF NOT EXISTS pg_cron;
DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'weekly-schedule-notification';
  PERFORM cron.schedule('weekly-schedule-notification', '0 11 * * 1', 'SELECT private.send_weekly_schedule_notification();');
END $$;
