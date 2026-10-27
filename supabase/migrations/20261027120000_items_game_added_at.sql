-- Data em que o item foi adicionado no jogo (campo AddTime do TemplateAllList.xml), para as
-- Novidades seguirem a ordem do jogo, do mais novo para o mais antigo. A sincronização preenche
-- os itens novos e completa os antigos aos poucos.
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS game_added_at timestamp;
CREATE INDEX IF NOT EXISTS items_game_added_at_idx ON public.items (game_added_at DESC NULLS LAST);
