-- Cronograma: cada atividade pode ter o dia em que deve ser inserida (vazio = sem data).
ALTER TABLE public.schedule_entries ADD COLUMN IF NOT EXISTS entry_date date;
CREATE INDEX IF NOT EXISTS schedule_entries_date_idx ON public.schedule_entries (entry_date);

-- Resumo semanal agora dia a dia: as atividades com data da semana (de hoje a hoje + 6) em
-- ordem, depois as sem data por categoria, e as pendências abertas dos períodos da semana.
CREATE OR REPLACE FUNCTION private.send_weekly_schedule_notification()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  week_end date := today + 6;
  weekdays text[] := ARRAY['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  p record;
  d record;
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

    -- Dia a dia (só os dias desta semana).
    FOR d IN
      SELECT e.entry_date AS day,
             string_agg(cat.name || ': ' || e.text, '; ' ORDER BY cat.position, e.position) AS acts
      FROM public.schedule_entries e
      JOIN public.schedule_categories cat ON cat.id = e.category_id
      WHERE e.period_id = p.id AND e.entry_date BETWEEN today AND week_end
      GROUP BY e.entry_date
      ORDER BY e.entry_date
    LOOP
      msg := msg || format(E'• %s %s — %s\n', weekdays[extract(dow FROM d.day)::int + 1], to_char(d.day, 'DD/MM'), d.acts);
    END LOOP;

    -- Sem data, por categoria.
    FOR c IN
      SELECT cat.name, string_agg(e.text, '; ' ORDER BY e.position) AS events
      FROM public.schedule_entries e
      JOIN public.schedule_categories cat ON cat.id = e.category_id
      WHERE e.period_id = p.id AND e.entry_date IS NULL
      GROUP BY cat.name, cat.position
      ORDER BY cat.position, cat.name
    LOOP
      msg := msg || format(E'• %s (sem data): %s\n', c.name, c.events);
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
    SELECT count(*) INTO other_open FROM public.schedule_pendencies sp
      WHERE sp.status = 'open' AND (sp.period_id IS NULL OR NOT (sp.period_id = ANY (period_ids)));
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