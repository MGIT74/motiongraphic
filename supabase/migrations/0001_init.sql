-- =====================================================================
-- MotionGraphic.si — Migration initiale (versionnée)
-- Tables, index, contraintes, RLS et données de démonstration (6 templates).
-- Exécution : Supabase Dashboard > SQL Editor, ou `supabase db push`.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------

create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  description text,
  created_at  timestamptz not null default now()
);

create table if not exists public.animations (
  id             uuid primary key default gen_random_uuid(),
  title          text not null check (char_length(title) between 2 and 120),
  slug           text not null unique,
  description    text not null default '' check (char_length(description) <= 1000),
  category_id    uuid not null references public.categories (id) on delete restrict,
  -- component_key référence un composant React compilé dans le code source
  -- (src/components/animations), jamais du code arbitraire stocké en base.
  -- Ajouter une nouvelle clé ici ET dans src/lib/animations/registry.ts :
  component_key  text not null check (component_key in (
    'kinetic-type-01', 'text-reveal-01', 'elastic-text-01',
    'shape-morph-01', 'staggered-cards-01', 'logo-reveal-01'
  )),
  default_config jsonb not null default '{}'::jsonb,
  duration       numeric not null default 4 check (duration between 1 and 30),
  is_published   boolean not null default false,
  is_featured    boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.prompts (
  id           uuid primary key default gen_random_uuid(),
  animation_id uuid not null references public.animations (id) on delete cascade,
  type         text not null check (type in ('web', 'after_effects')),
  content      text not null check (char_length(content) between 10 and 20000),
  version      integer not null default 1 check (version >= 1),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (animation_id, type)
);

create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  role         text not null default 'user' check (role in ('user', 'admin')),
  created_at   timestamptz not null default now()
);

create table if not exists public.favorites (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  animation_id uuid not null references public.animations (id) on delete cascade,
  created_at   timestamptz not null default now(),
  unique (user_id, animation_id)
);

-- ---------------------------------------------------------------------
-- 2. Index
-- ---------------------------------------------------------------------

create index if not exists animations_category_id_idx on public.animations (category_id);
create index if not exists animations_published_idx  on public.animations (is_published, is_featured);
create index if not exists animations_created_idx    on public.animations (created_at desc);
create index if not exists prompts_animation_idx     on public.prompts (animation_id);
create index if not exists favorites_animation_idx   on public.favorites (animation_id);
create index if not exists favorites_user_idx        on public.favorites (user_id);
create unique index if not exists categories_slug_uniq on public.categories (slug);

-- ---------------------------------------------------------------------
-- 3. Triggers (updated_at + profil à l'inscription)
-- ---------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists animations_touch on public.animations;
create trigger animations_touch
  before update on public.animations
  for each row execute function public.touch_updated_at();

drop trigger if exists prompts_touch on public.prompts;
create trigger prompts_touch
  before update on public.prompts
  for each row execute function public.touch_updated_at();

-- Profil créé automatiquement à chaque inscription.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(coalesce(new.email, 'utilisateur'), '@', 1)),
    'user'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 4. RLS — fonction helper
-- ---------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------
-- 5. Policies
-- ---------------------------------------------------------------------

alter table public.categories  enable row level security;
alter table public.animations  enable row level security;
alter table public.prompts     enable row level security;
alter table public.profiles    enable row level security;
alter table public.favorites   enable row level security;

-- categories : lecture publique, écriture admin
drop policy if exists categories_read on public.categories;
create policy categories_read
  on public.categories for select
  to anon, authenticated
  using (true);

drop policy if exists categories_admin on public.categories;
create policy categories_admin
  on public.categories for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- animations : lecture publique des publiées, admin total
drop policy if exists animations_read on public.animations;
create policy animations_read
  on public.animations for select
  to anon, authenticated
  using (is_published or public.is_admin());

drop policy if exists animations_admin on public.animations;
create policy animations_admin
  on public.animations for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- prompts : lecture publique si l'animation parente est publiée, admin total
drop policy if exists prompts_read on public.prompts;
create policy prompts_read
  on public.prompts for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.animations a
      where a.id = animation_id
        and (a.is_published or public.is_admin())
    )
  );

drop policy if exists prompts_admin on public.prompts;
create policy prompts_admin
  on public.prompts for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- profiles : lecture de soi + admin ; mise à jour de soi sans changement de rôle
drop policy if exists profiles_read on public.profiles;
create policy profiles_read
  on public.profiles for select
  to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_admin on public.profiles;
create policy profiles_admin
  on public.profiles for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop trigger if exists prevent_role_escalation on public.profiles;
create trigger prevent_role_escalation
  before update on public.profiles
  for each row
  when (new.role <> old.role)
  execute function public.guard_role_change();

create or replace function public.guard_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Changement de rôle réservé aux administrateurs.';
  end if;
  return new;
end;
$$;

-- favorites : chaque utilisateur gère ses favoris uniquement
drop policy if exists favorites_read on public.favorites;
create policy favorites_read
  on public.favorites for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists favorites_insert on public.favorites;
create policy favorites_insert
  on public.favorites for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists favorites_delete on public.favorites;
create policy favorites_delete
  on public.favorites for delete
  to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- 6. Seed — catégories
-- ---------------------------------------------------------------------

insert into public.categories (id, name, slug, description) values
  ('00000000-0000-4000-8000-000000000001', 'Typographie',        'typographie', 'Textes animés, révélations et typographie cinétique.'),
  ('00000000-0000-4000-8000-000000000002', 'Formes géométriques','formes',      'Morphing, transitions et formes abstraites en mouvement.'),
  ('00000000-0000-4000-8000-000000000003', 'Interface',          'interface',   'Composants d''interface mis en scène en motion design.'),
  ('00000000-0000-4000-8000-000000000004', 'Logo',               'logo',        'Révélations de logos et de monogrammes animés.')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 7. Seed — templates
-- ---------------------------------------------------------------------

insert into public.animations
  (id, title, slug, description, category_id, component_key, default_config, duration, is_published, is_featured)
values
  ('00000000-0000-4000-8000-000000000011', 'Kinetic Typography',
   'Typographie cinétique : chaque lettre glisse depuis un masque bas avec un décalage rythmé, puis un point d''accent vient sceller le mot. Ideal pour des accroches, titres de showreel ou intros de marque.',
   '00000000-0000-4000-8000-000000000001', 'kinetic-type-01',
   '{"text":"MOTION","primaryColor":"#F5F5F7","accentColor":"#7C5CFF","backgroundColor":"#0A0A0D","duration":3.2,"speed":1}'::jsonb,
   3.2, true, true),
  ('00000000-0000-4000-8000-000000000012', 'Text Reveal — Masque',
   'Révélation de texte par masque vertical, ligne par ligne, traversée par un balayage lumineux. Un classique du motion design revisité en code, parfait pour des slogans en deux lignes.',
   '00000000-0000-4000-8000-000000000001', 'text-reveal-01',
   '{"text":"CRÉER\nEN CODE","primaryColor":"#F5F5F7","accentColor":"#7C5CFF","backgroundColor":"#0A0A0D","duration":3.6,"speed":1}'::jsonb,
   3.6, true, true),
  ('00000000-0000-4000-8000-000000000013', 'Elastic Text',
   'Le texte rebondit en place avec un easing élastique, lettre par lettre : énergie maximale pour des mots-clés courts, des badges ou des annonces.',
   '00000000-0000-4000-8000-000000000001', 'elastic-text-01',
   '{"text":"BOUNCE","primaryColor":"#F5F5F7","accentColor":"#22D3EE","backgroundColor":"#0A0A0D","duration":3,"speed":1}'::jsonb,
   3, true, true),
  ('00000000-0000-4000-8000-000000000014', 'Shape Morph',
   'Une forme lumineuse se transforme sans interruption : carré, octogone, étoile à quatre branches. Un morphing pur code, fluide à 60 fps, pour des transitions géométriques élégantes.',
   '00000000-0000-4000-8000-000000000002', 'shape-morph-01',
   '{"text":"MORPH","primaryColor":"#F5F5F7","accentColor":"#22D3EE","backgroundColor":"#0A0A0D","duration":6,"speed":1}'::jsonb,
   6, true, true),
  ('00000000-0000-4000-8000-000000000015', 'Staggered Cards',
   'Trois cartes vitrées s''empilent en cascade avec un rebond maîtrisé. La mise en scène idéale pour présenter des étapes, des fonctionnalités ou des maquettes d''interface.',
   '00000000-0000-4000-8000-000000000003', 'staggered-cards-01',
   '{"text":"UI MOTION","primaryColor":"#E7E7EF","accentColor":"#7C5CFF","backgroundColor":"#0A0A0D","duration":4.2,"speed":1}'::jsonb,
   4.2, true, true),
  ('00000000-0000-4000-8000-000000000016', 'Logo Reveal',
   'Un logo abstrait se dessine par la lumière : le trait se trace, le cœur pop, un halo s''échappe et le mot-symbole s''éclaircit. Pensez intros de marque et identités animées.',
   '00000000-0000-4000-8000-000000000004', 'logo-reveal-01',
   '{"text":"STUDIO","primaryColor":"#F5F5F7","accentColor":"#22D3EE","backgroundColor":"#0A0A0D","duration":4.4,"speed":1}'::jsonb,
   4.4, true, true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 8. Seed — prompts (Web + After Effects, identiques au mode démo)
-- ---------------------------------------------------------------------

insert into public.prompts (id, animation_id, type, content, version) values

-- kinetic-type-01 — Web
('00000000-0000-4000-8000-0000000001a0', '00000000-0000-4000-8000-000000000011', 'web',
$prompt$
Tu es un développeur créatif expert en motion design web et GSAP, inspiré du template "Kinetic Typography" (`kinetic-type-01`) de MotionGraphic.si.

OBJECTIF
Produire une animation web autonome, dans un seul fichier HTML, reproduisant fidèlement le comportement décrit ci-dessous.

SPECIFICATIONS VISUELLES
- Fond #0A0A0D. Le mot « MOTION » centré, lettres majuscules très grasses.
- Chaque lettre apparaît en glissant depuis le bas, masquée par un wrapper overflow:hidden, décalage de 70 ms entre les lettres.
- Un point d'accent violet (#7C5CFF) apparaît après la dernière lettre avec un pop (back.out(3)).

ANIMATION & EASING
- power3.out pour l'entrée des lettres (0.55 s chacune, stagger 0.07), légère montée en yPercent 118 -> 0.
- Boucle : après 1 s de tenue, les lettres ressortent vers le haut (yPercent -40, power2.in, stagger inversé) et le point se rétracte ; pause 0.9 s puis redémarrage.

CONTRAINTES TECHNIQUES
- Un seul fichier index.html autonome (HTML + CSS + JS).
- GSAP via CDN : https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js
- Techniques autorisées : React, GSAP, SVG.
- N'animer que transform / opacity pour garantir 60 fps.
- État initial du DOM = état final de l'animation (utiliser gsap.from()).
- Respecter prefers-reduced-motion : afficher l'état final sans animation.
- Palette : fond #0A0A0D, texte #F5F5F7, accent #7C5CFF (modifiable en haut du CSS via variables).

PARAMÈTRE FACILE À PERSONNALISER
- Rendez le texte et les couleurs configurables en haut du script (const CONFIG = {...}).

CRITÈRES D'ACCEPTATION
- Aucune console d'erreur, aucune dépendance inutile.
- La boucle est parfaitement fluide et sans saut visuel.
- Rendu responsive, centré, premium (dark, minimalist).
$prompt$), 1),

-- kinetic-type-01 — After Effects
('00000000-0000-4000-8000-0000000001b0', '00000000-0000-4000-8000-000000000011', 'after_effects',
$prompt$
Tu es un expert en scripts ExtendScript (JSX) pour Adobe After Effects, inspiré du template "Kinetic Typography" (`kinetic-type-01`) de MotionGraphic.si.

MISSION
Écris un script JSX complet et autonome qui construit la composition décrite ci-dessous, prête à être exécutée via File > Scripts > Run Script File.

COMPOSITION
- Compo « MGSI_KineticType », 1920×1080, 30 fps, durée 6 s, fond #0A0A0D.
- Un calque texte « MOTION » en gras, centré, taille 220 px, blédi #F5F5F7.

COMPORTEMENT ANIMÉ
- Le mot est divisé en sous-calques du texte (une lettre par index) ; chaque lettre entre de bas en haut avec un masque (alpha inverted) décalé de 2 frames, puis un point violet apparaît en pop, puis sortie inversée vers le haut pour boucler.

STRUCTURE DU SCRIPT
- Fonction main() appelée en fin de script, avec vérification que l'application est After Effects.
- Idempotent : supprimer d'abord les éléments existants portant le même nom avant de recréer.
- Sous-fonctions dédiées (création de compo, création des calques, pose des keyframes).
- Nommages explicites avec le préfixe « MGSI_ » pour tous les éléments créés.

ANIMATION
- Utiliser les keyframes native After Effects (position, échelle, opacité, masques, tracés).
- Easings équivalents aux courbes GSAP indiquées (interpolation ease-out, répartition des keyframes).
- Aucun plugin tiers, compatible After Effects 2022+.
- Commentaires en français, un par bloc logique.

LIVRABLE
- Un seul fichier .jsx complet, copiable-collable, prêt à l'exécution.
- Aucun appel réseau, aucun fichier externe requis.
$prompt$), 1),

-- text-reveal-01 — Web
('00000000-0000-4000-8000-0000000002a0', '00000000-0000-4000-8000-000000000012', 'web',
$prompt$
Tu es un développeur créatif expert en motion design web et GSAP, inspiré du template "Text Reveal (Masque)" (`text-reveal-01`) de MotionGraphic.si.

OBJECTIF
Produire une animation web autonome, dans un seul fichier HTML, reproduisant fidèlement le comportement décrit ci-dessous.

SPECIFICATIONS VISUELLES
- Fond #0A0A0D, deux lignes centrées « CRÉER » / « EN CODE ».
- Révélation par masque vertical (overflow hidden par ligne), chaque ligne monte de bas en haut.
- Balayage lumineux violet/cyan (mix-blend-mode: screen, blur) traversant le texte pendant la révélation.

ANIMATION & EASING
- power4.out sur la révélation des lignes (stagger 0.12), balayage en power2.inOut.
- Boucle : après tenue, les lignes ressortent vers le haut derrière le masque, pause 0.9 s, redémarrage.

CONTRAINTES TECHNIQUES
- Un seul fichier index.html autonome (HTML + CSS + JS).
- GSAP via CDN : https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js
- Techniques autorisées : React, GSAP, CSS.
- N'animer que transform / opacity pour garantir 60 fps.
- État initial du DOM = état final de l'animation (utiliser gsap.from()).
- Respecter prefers-reduced-motion : afficher l'état final sans animation.
- Palette : fond #0A0A0D, texte #F5F5F7, accent #7C5CFF (modifiable en haut du CSS via variables).

PARAMÈTRE FACILE À PERSONNALISER
- Rendez le texte et les couleurs configurables en haut du script (const CONFIG = {...}).

CRITÈRES D'ACCEPTATION
- Aucune console d'erreur, aucune dépendance inutile.
- La boucle est parfaitement fluide et sans saut visuel.
- Rendu responsive, centré, premium (dark, minimalist).
$prompt$), 1),

-- text-reveal-01 — After Effects
('00000000-0000-4000-8000-0000000002b0', '00000000-0000-4000-8000-000000000012', 'after_effects',
$prompt$
Tu es un expert en scripts ExtendScript (JSX) pour Adobe After Effects, inspiré du template "Text Reveal (Masque)" (`text-reveal-01`) de MotionGraphic.si.

MISSION
Écris un script JSX complet et autonome qui construit la composition décrite ci-dessous, prête à être exécutée via File > Scripts > Run Script File.

COMPOSITION
- Compo « MGSI_TextReveal », 1920×1080, 30 fps, 6 s, fond #0A0A0D.
- Deux calques texte centrés, « CRÉER » / « EN CODE », gras, #F5F5F7.

COMPORTEMENT ANIMÉ
- Chaque ligne est révélée avec un masque de course (setMask / track matte) montant de bas en haut, décalées entre elles ; un calque dégradé lumineux passe en mode Tramage léger (additive) devant le texte, puis sortie vers le haut pour boucler.

STRUCTURE DU SCRIPT
- Fonction main() appelée en fin de script, avec vérification que l'application est After Effects.
- Idempotent : supprimer d'abord les éléments existants portant le même nom avant de recréer.
- Sous-fonctions dédiées (création de compo, création des calques, pose des keyframes).
- Nommages explicites avec le préfixe « MGSI_ » pour tous les éléments créés.

ANIMATION
- Utiliser les keyframes native After Effects (position, échelle, opacité, masques, tracés).
- Easings équivalents aux courbes GSAP indiquées (interpolation ease-out, répartition des keyframes).
- Aucun plugin tiers, compatible After Effects 2022+.
- Commentaires en français, un par bloc logique.

LIVRABLE
- Un seul fichier .jsx complet, copiable-collable, prêt à l'exécution.
- Aucun appel réseau, aucun fichier externe requis.
$prompt$), 1),

-- elastic-text-01 — Web
('00000000-0000-4000-8000-0000000003a0', '00000000-0000-4000-8000-000000000013', 'web',
$prompt$
Tu es un développeur créatif expert en motion design web et GSAP, inspiré du template "Elastic Text" (`elastic-text-01`) de MotionGraphic.si.

OBJECTIF
Produire une animation web autonome, dans un seul fichier HTML, reproduisant fidèlement le comportement décrit ci-dessous.

SPECIFICATIONS VISUELLES
- Fond #0A0A0D, mot « BOUNCE » centré, lettres toutes les 4 en accent (#22D3EE).
- Les lettres apparaissent depuis le bas en grossissant puis rebondissent (effet élastique, transform-origin bas).

ANIMATION & EASING
- elastic.out(1, 0.42) par lettre, 0.9 s chacune, stagger 0.06.
- Boucle : les lettres se rétractent vers le haut en power2.in (stagger inversé), pause 1 s, redémarrage.

CONTRAINTES TECHNIQUES
- Un seul fichier index.html autonome (HTML + CSS + JS).
- GSAP via CDN : https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js
- Techniques autorisées : React, GSAP.
- N'animer que transform / opacity pour garantir 60 fps.
- État initial du DOM = état final de l'animation (utiliser gsap.from()).
- Respecter prefers-reduced-motion : afficher l'état final sans animation.
- Palette : fond #0A0A0D, texte #F5F5F7, accent #7C5CFF (modifiable en haut du CSS via variables).

PARAMÈTRE FACILE À PERSONNALISER
- Rendez le texte et les couleurs configurables en haut du script (const CONFIG = {...}).

CRITÈRES D'ACCEPTATION
- Aucune console d'erreur, aucune dépendance inutile.
- La boucle est parfaitement fluide et sans saut visuel.
- Rendu responsive, centré, premium (dark, minimalist).
$prompt$), 1),

-- elastic-text-01 — After Effects
('00000000-0000-4000-8000-0000000003b0', '00000000-0000-4000-8000-000000000013', 'after_effects',
$prompt$
Tu es un expert en scripts ExtendScript (JSX) pour Adobe After Effects, inspiré du template "Elastic Text" (`elastic-text-01`) de MotionGraphic.si.

MISSION
Écris un script JSX complet et autonome qui construit la composition décrite ci-dessous, prête à être exécutée via File > Scripts > Run Script File.

COMPOSITION
- Compo « MGSI_ElasticText », 1920×1080, 30 fps, 6 s, fond #0A0A0D.
- Calque texte « BOUNCE » gras, centré, #F5F5F7 avec lettres altérnées en #22D3EE (colorations par index).

COMPORTEMENT ANIMÉ
- Lettres (texte en sous-calques) animées en échelle et position avec une courbe élastique (ease « Out Elastic », interpolation avec overshoot), décalées de 2 frames, puis rétracté vers le haut pour boucler.

STRUCTURE DU SCRIPT
- Fonction main() appelée en fin de script, avec vérification que l'application est After Effects.
- Idempotent : supprimer d'abord les éléments existants portant le même nom avant de recréer.
- Sous-fonctions dédiées (création de compo, création des calques, pose des keyframes).
- Nommages explicites avec le préfixe « MGSI_ » pour tous les éléments créés.

ANIMATION
- Utiliser les keyframes native After Effects (position, échelle, opacité, masques, tracés).
- Easings équivalents aux courbes GSAP indiquées (interpolation ease-out, répartition des keyframes).
- Aucun plugin tiers, compatible After Effects 2022+.
- Commentaires en français, un par bloc logique.

LIVRABLE
- Un seul fichier .jsx complet, copiable-collable, prêt à l'exécution.
- Aucun appel réseau, aucun fichier externe requis.
$prompt$), 1),

-- shape-morph-01 — Web
('00000000-0000-4000-8000-0000000004a0', '00000000-0000-4000-8000-000000000014', 'web',
$prompt$
Tu es un développeur créatif expert en motion design web et GSAP, inspiré du template "Shape Morph" (`shape-morph-01`) de MotionGraphic.si.

OBJECTIF
Produire une animation web autonome, dans un seul fichier HTML, reproduisant fidèlement le comportement décrit ci-dessous.

SPECIFICATIONS VISUELLES
- Fond #0A0A0D, au centre une forme lumineuse en dégradé (#22D3EE vers transparent) avec un halo flou derrière.
- La forme se morphe en continu : carré -> octogone -> étoile 4 branches -> carré (interpolation de clip-path polygon à 8 sommets).

ANIMATION & EASING
- sine.inOut sur chaque morph (durée = durée/3), rotation continue linéaire sur le cycle complet.
- Boucle : répétition continue de la séquence de morphing, halo pulsant en yoyo.

CONTRAINTES TECHNIQUES
- Un seul fichier index.html autonome (HTML + CSS + JS).
- GSAP via CDN : https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js
- Techniques autorisées : React, GSAP, CSS.
- N'animer que transform / opacity / clip-path pour garantir 60 fps.
- Respecter prefers-reduced-motion : afficher l'état final sans animation.
- Palette : fond #0A0A0D, accent #22D3EE (modifiable en haut du CSS via variables).

PARAMÈTRE FACILE À PERSONNALISER
- Rendez le texte, les couleurs et la durée configurables en haut du script (const CONFIG = {...}).

CRITÈRES D'ACCEPTATION
- Aucune console d'erreur, aucune dépendance inutile.
- La boucle est parfaitement fluide et sans saut visuel.
- Rendu responsive, centré, premium (dark, minimalist).
$prompt$), 1),

-- shape-morph-01 — After Effects
('00000000-0000-4000-8000-0000000004b0', '00000000-0000-4000-8000-000000000014', 'after_effects',
$prompt$
Tu es un expert en scripts ExtendScript (JSX) pour Adobe After Effects, inspiré du template "Shape Morph" (`shape-morph-01`) de MotionGraphic.si.

MISSION
Écris un script JSX complet et autonome qui construit la composition décrite ci-dessous, prête à être exécutée via File > Scripts > Run Script File.

COMPOSITION
- Compo « MGSI_ShapeMorph », 1080×1080, 30 fps, 8 s, fond #0A0A0D.
- Un calque forme (polystar) lumineux + un calque halo Gaussien.

COMPORTEMENT ANIMÉ
- Le calque forme passe successivement de polygone régulier à étoile en animant le type de polystar / les keyframes de tracé via des calques de forme ; halo pulsant, rotation lente continue pour boucler.

STRUCTURE DU SCRIPT
- Fonction main() appelée en fin de script, avec vérification que l'application est After Effects.
- Idempotent : supprimer d'abord les éléments existants portant le même nom avant de recréer.
- Sous-fonctions dédiées (création de compo, création des calques, pose des keyframes).
- Nommages explicites avec le préfixe « MGSI_ » pour tous les éléments créés.

ANIMATION
- Utiliser les keyframes native After Effects (position, échelle, opacité, masques, tracés).
- Easings équivalents aux courbes GSAP indiquées (interpolation ease-out, répartition des keyframes).
- Aucun plugin tiers, compatible After Effects 2022+.
- Commentaires en français, un par bloc logique.

LIVRABLE
- Un seul fichier .jsx complet, copiable-collable, prêt à l'exécution.
- Aucun appel réseau, aucun fichier externe requis.
$prompt$), 1),

-- staggered-cards-01 — Web
('00000000-0000-4000-8000-0000000005a0', '00000000-0000-4000-8000-000000000015', 'web',
$prompt$
Tu es un développeur créatif expert en motion design web et GSAP, inspiré du template "Staggered Cards" (`staggered-cards-01`) de MotionGraphic.si.

OBJECTIF
Produire une animation web autonome, dans un seul fichier HTML, reproduisant fidèlement le comportement décrit ci-dessous.

SPECIFICATIONS VISUELLES
- Fond #0A0A0D, 3 cartes vitrées (rgba blanc translucide, bordure douce, ombre portée) avec pastille colorée et lignes de contenu.
- La carte du centre est mise en avant (pastille et trait d'accent violet #7C5CFF).
- Un label « UI MOTION » en majuscules espacées au-dessus.

ANIMATION & EASING
- back.out(1.7) sur l'entrée des cartes (montée 44 px, légère rotation -6° -> 0), stagger 0.16 ; barres internes en scaleX depuis la gauche.
- Boucle : les cartes ressortent vers le haut en cascade inversée, pause 0.8 s, redémarrage.

CONTRAINTES TECHNIQUES
- Un seul fichier index.html autonome (HTML + CSS + JS).
- GSAP via CDN : https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js
- Techniques autorisées : React, GSAP, CSS.
- N'animer que transform / opacity pour garantir 60 fps.
- État initial du DOM = état final de l'animation (utiliser gsap.from()).
- Respecter prefers-reduced-motion : afficher l'état final sans animation.
- Palette : fond #0A0A0D, accent #7C5CFF (modifiable en haut du CSS via variables).

PARAMÈTRE FACILE À PERSONNALISER
- Rendez le texte, les couleurs et la durée configurables en haut du script (const CONFIG = {...}).

CRITÈRES D'ACCEPTATION
- Aucune console d'erreur, aucune dépendance inutile.
- La boucle est parfaitement fluide et sans saut visuel.
- Rendu responsive, centré, premium (dark, minimalist).
$prompt$), 1),

-- staggered-cards-01 — After Effects
('00000000-0000-4000-8000-0000000005b0', '00000000-0000-4000-8000-000000000015', 'after_effects',
$prompt$
Tu es un expert en scripts ExtendScript (JSX) pour Adobe After Effects, inspiré du template "Staggered Cards" (`staggered-cards-01`) de MotionGraphic.si.

MISSION
Écris un script JSX complet et autonome qui construit la composition décrite ci-dessous, prête à être exécutée via File > Scripts > Run Script File.

COMPOSITION
- Compo « MGSI_StaggeredCards », 1920×1080, 30 fps, 7 s, fond #0A0A0D.
- Trois calque rectangles (arrondis 24 px) semi-transparents avec pastille et barres internes, plus calque texte de label.

COMPORTEMENT ANIMÉ
- Les cartes entrent en cascade (montée + légère rotation, ease back) décalées de 5 frames, les barres internes s'étendent en X, puis sortie inversée vers le haut pour boucler.

STRUCTURE DU SCRIPT
- Fonction main() appelée en fin de script, avec vérification que l'application est After Effects.
- Idempotent : supprimer d'abord les éléments existants portant le même nom avant de recréer.
- Sous-fonctions dédiées (création de compo, création des calques, pose des keyframes).
- Nommages explicites avec le préfixe « MGSI_ » pour tous les éléments créés.

ANIMATION
- Utiliser les keyframes native After Effects (position, échelle, opacité, masques, tracés).
- Easings équivalents aux courbes GSAP indiquées (interpolation ease-out, répartition des keyframes).
- Aucun plugin tiers, compatible After Effects 2022+.
- Commentaires en français, un par bloc logique.

LIVRABLE
- Un seul fichier .jsx complet, copiable-collable, prêt à l'exécution.
- Aucun appel réseau, aucun fichier externe requis.
$prompt$), 1),

-- logo-reveal-01 — Web
('00000000-0000-4000-8000-0000000006a0', '00000000-0000-4000-8000-000000000016', 'web',
$prompt$
Tu es un développeur créatif expert en motion design web et GSAP, inspiré du template "Logo Reveal" (`logo-reveal-01`) de MotionGraphic.si.

OBJECTIF
Produire une animation web autonome, dans un seul fichier HTML, reproduisant fidèlement le comportement décrit ci-dessous.

SPECIFICATIONS VISUELLES
- Fond #0A0A0D, cercle SVG r=46 dont le trait cyan (#22D3EE) se dessine progressivement (stroke-dashoffset).
- Un triangle/forme abstraite apparaît en pop au centre (back.out(2.4)), un cercle pulsé (halo) s'échappe du cœur, le mot-symbole « STUDIO » apparaît dessous.

ANIMATION & EASING
- power2.inOut sur le tracé (0.8 s), back.out sur le cœur, power2.out sur le pulse (0.7 s), power3.out sur le mot-symbole.
- Boucle : après tenue, tout s'estompe légèrement (0.94 scale, power2.in), pause 0.9 s, redémarrage.

CONTRAINTES TECHNIQUES
- Un seul fichier index.html autonome (HTML + CSS + JS).
- GSAP via CDN : https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js
- Techniques autorisées : React, GSAP, SVG.
- N'animer que transform / opacity (et stroke-dashoffset) pour garantir 60 fps.
- Respecter prefers-reduced-motion : afficher l'état final sans animation.
- Palette : fond #0A0A0D, accent #22D3EE (modifiable en haut du CSS via variables).

PARAMÈTRE FACILE À PERSONNALISER
- Rendez le texte et les couleurs configurables en haut du script (const CONFIG = {...}).

CRITÈRES D'ACCEPTATION
- Aucune console d'erreur, aucune dépendance inutile.
- La boucle est parfaitement fluide et sans saut visuel.
- Rendu responsive, centré, premium (dark, minimalist).
$prompt$), 1),

-- logo-reveal-01 — After Effects
('00000000-0000-4000-8000-0000000006b0', '00000000-0000-4000-8000-000000000016', 'after_effects',
$prompt$
Tu es un expert en scripts ExtendScript (JSX) pour Adobe After Effects, inspiré du template "Logo Reveal" (`logo-reveal-01`) de MotionGraphic.si.

MISSION
Écris un script JSX complet et autonome qui construit la composition décrite ci-dessous, prête à être exécutée via File > Scripts > Run Script File.

COMPOSITION
- Compo « MGSI_LogoReveal », 1080×1080, 30 fps, 6 s, fond #0A0A0D.
- Calque forme (ellipse tracé vide, sans fond) cyan, un triangle/étoile au centre, un calque texte « STUDIO ».

COMPORTEMENT ANIMÉ
- Le cercle se dessine via des keyframes de tracé (Trim Paths), le cœur apparaît en scale avec pop, un halo (calque solide animé en scale/opacité, flou gaussien) s'échappe, puis le mot-symbole apparaît ; tenue, léger recadrage, boucle.

STRUCTURE DU SCRIPT
- Fonction main() appelée en fin de script, avec vérification que l'application est After Effects.
- Idempotent : supprimer d'abord les éléments existants portant le même nom avant de recréer.
- Sous-fonctions dédiées (création de compo, création des calques, pose des keyframes).
- Nommages explicites avec le préfixe « MGSI_ » pour tous les éléments créés.

ANIMATION
- Utiliser les keyframes native After Effects (position, échelle, opacité, masques, tracés).
- Easings équivalents aux courbes GSAP indiquées (interpolation ease-out, répartition des keyframes).
- Aucun plugin tiers, compatible After Effects 2022+.
- Commentaires en français, un par bloc logique.

LIVRABLE
- Un seul fichier .jsx complet, copiable-collable, prêt à l'exécution.
- Aucun appel réseau, aucun fichier externe requis.
$prompt$
), 1)
on conflict (animation_id, type) do update set content = excluded.content, version = prompts.version + 1;