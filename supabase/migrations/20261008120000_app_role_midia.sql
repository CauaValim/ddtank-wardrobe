-- Papel para as mídias (solicitação de códigos). Fica em uma migração separada porque
-- um valor novo de enum só pode ser usado depois de confirmado.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'midia';
