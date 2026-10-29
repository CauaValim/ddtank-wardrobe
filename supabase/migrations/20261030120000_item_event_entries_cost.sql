-- Registro de eventos: quanto o item custou para o jogador (itens entregues na troca, andar da
-- recarga/consumo ou preço na Venda de Munição). Gravado pela sincronização, como o resto da tabela.
ALTER TABLE public.item_event_entries ADD COLUMN IF NOT EXISTS cost text;
