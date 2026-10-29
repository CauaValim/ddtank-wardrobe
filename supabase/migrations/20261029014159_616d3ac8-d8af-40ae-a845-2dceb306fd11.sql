-- Registro de entrada dos itens nos eventos do jogo (a API só mostra os eventos configurados agora,
-- então a sincronização guarda cada prêmio que aparece para não perder o histórico).
-- Uma linha por item e evento: data de entrada e o evento de que fez parte. Só a sincronização
-- (service role) grava; todos os usuários do painel podem ler.
CREATE TABLE IF NOT EXISTS public.item_event_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id integer NOT NULL,
  entry_date date NOT NULL,
  event_name text NOT NULL,
  event_kind text,
  -- Identifica o evento no jogo (atividade + início, ou missão + início) para não duplicar.
  source_key text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (item_id, source_key)
);

CREATE INDEX IF NOT EXISTS idx_item_event_entries_item ON public.item_event_entries (item_id, entry_date DESC);

GRANT SELECT ON public.item_event_entries TO authenticated;
GRANT ALL ON public.item_event_entries TO service_role;

ALTER TABLE public.item_event_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Panel users can view item event entries" ON public.item_event_entries
  FOR SELECT TO authenticated USING (true);