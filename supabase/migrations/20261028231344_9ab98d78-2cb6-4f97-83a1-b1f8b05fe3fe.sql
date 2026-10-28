-- "Excluir do painel": o item fica marcado como excluído em vez de ser apagado. Apagar de verdade
-- não funciona porque a sincronização com o jogo recoloca qualquer item que falte; marcado, ele
-- continua conhecido pela sincronização, some do painel e pode ser restaurado pela Lixeira.
-- Quem pode marcar é quem já edita itens (items.manage), pelas regras de UPDATE existentes.
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.items_turco ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.items_turco ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;