-- Categorias de itens: andar (piso) da Recarga/Consumo e dos Extras a partir do qual o item pode
-- entrar, por categoria. Ex.: {"recharge": "8.000", "consume": "10.000"}. Vazio = qualquer andar.
ALTER TABLE public.event_item_categories
  ADD COLUMN IF NOT EXISTS min_tiers jsonb NOT NULL DEFAULT '{}'::jsonb;
