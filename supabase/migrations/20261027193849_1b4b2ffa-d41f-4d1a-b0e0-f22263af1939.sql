ALTER TABLE public.items ADD COLUMN IF NOT EXISTS game_added_at timestamp;
CREATE INDEX IF NOT EXISTS items_game_added_at_idx ON public.items (game_added_at DESC NULLS LAST);