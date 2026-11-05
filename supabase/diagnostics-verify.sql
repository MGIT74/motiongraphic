-- =====================================================================
-- MotionGraphic — DIAGNOSTIC migrations Studio (LECTURE SEULE, aucun write)
-- À coller dans le SQL Editor Supabase. Rien n'est modifié.
-- Dépend de : 0001 (profiles/is_admin), 0002 (template_events),
--             0003 (studio_*), 0005+0006 (custom_templates).
-- =====================================================================

-- 1. Tables installées (résultat attendu : les lignes ci-dessous)
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in
    ('categories','animations','prompts','profiles','favorites',
     'template_events','studio_projects','studio_media',
     'studio_project_versions','studio_renders','custom_templates')
order by table_name;

-- 2. RLS active par table (attendu : toutes à true)
select relname as table_name, relrowsecurity as rls_active
from pg_class
where relname in ('categories','animations','prompts','profiles','favorites',
                  'template_events','studio_projects','studio_media',
                  'studio_project_versions','studio_renders','custom_templates');

-- 3. Politiques présentes (liste + commande)
select schemaname, tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- 4. Colonnes de custom_templates attendues (0005 + 0006)
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'custom_templates'
order by ordinal_position;

-- 5. Colonnes de studio_projects attendues (0003)
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'studio_projects'
order by ordinal_position;

-- 6. Fonctions helper (is_admin / touch_updated_at)
select p.proname, p.prosecdef, p.provolatile
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('is_admin', 'touch_updated_at');

-- 7. Dépendance : profils administrateurs existants (aucune donnée sensible)
select id, role, created_at from public.profiles where role = 'admin' limit 10;

-- 8. Catalogue : intégrés vs custom publiés/candidates
select
  (select count(*) from public.animations where is_published) as animations_publiees,
  (select count(*) from public.custom_templates where status = 'published') as custom_publiees,
  (select count(*) from public.custom_templates where status in ('draft','candidate')) as custom_prives,
  (select count(*) from public.custom_templates where status = 'published' and source_kind = 'code') as codes_publies;

-- 9. Quotas Storage (buckets créés à l'usage par le serveur) — via REST, pas SQL :
--   curl -s "$SUPABASE_URL/storage/v1/bucket" -H "Authorization: Bearer $SERVICE_ROLE"

-- 10. Grands volumes (garder les tables légères) :
select 'studio_renders' as t, count(*) from public.studio_renders
union all select 'studio_media', count(*) from public.studio_media
union all select 'custom_templates', count(*) from public.custom_templates
union all select 'template_events', count(*) from public.template_events;