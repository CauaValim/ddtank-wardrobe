
-- Add new roles to enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'moderador';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'analista';
