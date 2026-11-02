-- =====================================================================
-- MotionGraphic — colonne custom_templates.validation
-- Pour les bases où 0005 a été appliquée avant l'ajout de cette colonne
-- (le code du Template Lab et du MCP la lit et l'écrit). Ré-exécutable.
-- Exécution : Studio → SQL Editor, ou psql.
-- =====================================================================

alter table public.custom_templates
  add column if not exists validation jsonb;

notify pgrst, 'reload schema';
