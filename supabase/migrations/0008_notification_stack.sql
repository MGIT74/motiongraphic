-- =====================================================================
-- MotionGraphic — template notification-stack-01 (UI Motion)
-- 1. Étend la contrainte component_key (comme 0004 pour minimal-saas-ui-01).
-- 2. Ajoute le template à la galerie publique (catégorie Interface).
-- ⚠️ À exécuter par le propriétaire (SQL Editor). Idempotent.
-- Le Studio et le MCP n'en ont pas besoin : le template y est déjà disponible.
-- =====================================================================

alter table public.animations
  drop constraint if exists animations_component_key_check;

alter table public.animations
  add constraint animations_component_key_check
  check (component_key in (
    'kinetic-type-01', 'text-reveal-01', 'elastic-text-01',
    'shape-morph-01', 'staggered-cards-01', 'logo-reveal-01',
    'minimal-saas-ui-01', 'notification-stack-01'
  ));

insert into public.animations
  (id, title, slug, description, category_id, component_key, default_config, duration, is_published, is_featured)
values
  ('00000000-0000-4000-8000-000000000018', 'Notification Stack', 'notification-stack-01',
   'Des notifications de téléphone arrivent une à une en cartes de verre dépoli : la carte se dévoile du flou, le message s''écrit mot par mot et la pile remonte. Parfait pour une démo d''app, un lancement ou des retours clients.',
   '00000000-0000-4000-8000-000000000003', 'notification-stack-01',
   jsonb_build_object(
     'text', E'Messages | Aline Flodern | Ton rendez-vous est confirmé pour demain 10h | maintenant\nWhatsApp | @Dario Arden | J''arrive dans cinq minutes | 1 min\nMail | Nouvelle commande | Commande #1042 reçue sur votre boutique | 2 min\nPaiement | Paiement reçu | 249,00 € de Studio Nova | 5 min',
     'primaryColor', '#1C1C1E',
     'accentColor', '#0A84FF',
     'backgroundColor', '#EDEDF0',
     'duration', 6,
     'speed', 1,
     'fontFamily', 'manrope'
   ),
   6.5, true, true)
on conflict (id) do nothing;
