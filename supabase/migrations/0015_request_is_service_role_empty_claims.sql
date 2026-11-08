-- 0015 — request_is_service_role() : tolérer des claims JWT vides.
-- Défaut de 0009 mis en évidence par le Supabase jetable : une connexion qui a déjà servi une requête
-- PostgREST garde request.jwt.claims = '' (chaîne vide, pas NULL) ; le cast ''::json plante alors
-- (« invalid input syntax for type json ») pour tout UPDATE de profiles fait hors PostgREST
-- (SQL Editor, maintenance, migrations). Refus fermé (pas de contournement), mais bloquant.
-- Correction : nullif(...,'') avant le cast. Même logique, même résultat pour tout JWT valide.
-- Idempotente. À exécuter par le propriétaire, APRÈS tests sur clone ; ne modifie aucune donnée.
-- Retour arrière : recréer la fonction avec la définition de 0009 (rétablit le défaut ci-dessus).

create or replace function public.request_is_service_role()
returns boolean
language sql
stable
as $$
  select coalesce(auth.role(), '') = 'service_role'
      or coalesce((nullif(current_setting('request.jwt.claims', true), ''))::json ->> 'role', '') = 'service_role';
$$;
