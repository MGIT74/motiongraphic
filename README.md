# MotionGraphic.si

Bibliothèque de templates de **motion design** animés en direct dans le navigateur, avec deux prompts IA par template :

- **Prompt Web** — reproduire l'animation en HTML/CSS/GSAP/React via ChatGPT ou Claude ;
- **Prompt After Effects** — générer un script JSX pour Adobe After Effects.

Aucune inscription n'est requise pour consulter la galerie ni copier les prompts.

## Stack

| Couche | Technologie |
| --- | --- |
| Frontend | Next.js 16 (App Router), React 19, TypeScript strict, Tailwind CSS 4 |
| Animations | GSAP (+ CSS animations, SVG) — 6 composants React en code |
| Icônes | Lucide React |
| Backend | Supabase (PostgreSQL, Auth, RLS) — optionnel au démarrage |
| Design | Dark mode premium, minimalist, responsive |

## Démarrage

```bash
npm install
npm run dev        # http://localhost:3000
```

Le site démarre immédiatement en **mode démonstration** (données locales), sans aucune configuration.

## Scripts npm

| Commande | Rôle |
| --- | --- |
| `npm run dev` | Serveur de développement |
| `npm run build` | Build de production |
| `npm start` | Serveur de production (après build) |
| `npm run lint` | ESLint |
| `npm run typecheck` | Vérification TypeScript (`tsc --noEmit`) |

## Pages

| Route | Rôle |
| --- | --- |
| `/` | Accueil : hero, featured gallery, comment ça marche |
| `/explore` | Galerie complète : recherche, filtres, chargement progressif |
| `/templates/[slug]` | Détail : animation en direct, prompts copiables, templates similaires |
| `/studio` | Motion Studio — Coming soon |
| `/admin` | Administration (protégée, Supabase requis) |
| `/login` | Connexion admin (Supabase Auth) |

## Architecture des animations (cœur du projet)

Chaque animation est un **composant React indépendant**, exécuté dans le navigateur (aucune vidéo/GIF) :

```
src/components/animations/
├── KineticTypography01.tsx   kinetic-type-01
├── TextReveal01.tsx          text-reveal-01
├── ElasticText01.tsx         elastic-text-01
├── ShapeMorph01.tsx          shape-morph-01
├── StaggeredCards01.tsx      staggered-cards-01
├── LogoReveal01.tsx          logo-reveal-01
├── engine.ts                 moteur partagé (GSAP, viewport, reduced-motion)
├── AnimationPlayer.tsx       mapping component_key -> composant (chargé en différé)
└── use-near-viewport.ts      rendu différé pour la galerie
```

### Registre

Le **registre** (`src/lib/animations/registry.ts`) associe un identifiant
`component_key` (stocké en base) à un composant compilé dans le code source.
Les métadonnées (nom, technologies, config par défaut) servent aussi aux
badges de compatibilité de la galerie et à la page de détail.

### Configuration

Chaque composant reçoit un objet `AnimationConfig` typé :

- `text`, `primaryColor`, `accentColor`, `backgroundColor`
- `duration` (durée du cycle), `speed` (multiplicateur)

Ces paramètres sont stockés dans Supabase (`animations.default_config`, JSONB),
validés par `sanitizeConfig` (couleurs sûres, bornes), et sont le socle du futur
**Motion Studio** (modification des paramètres sans réécrire le moteur).

### Séparation des responsabilités

| Couche | Dossier |
| --- | --- |
| Moteur d'animation | `src/components/animations/engine.ts` |
| Composants | `src/components/animations/*01.tsx` |
| Galerie | `src/components/gallery/*` (ne connaît pas les composants directement) |
| Données | `src/lib/data.ts` (Supabase ou démo) |
| Métadonnées | `src/lib/animations/registry.ts` |
| Futur éditeur | `src/app/studio` (placeholder) |

## Mode démonstration ↔ Supabase

- **Sans** `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` → mode démo :
  la couche `src/lib/data.ts` renvoie `src/data/demo.ts` (6 templates + 12 prompts),
  un bandeau le signale sur la galerie.
- **Avec** configuré → requêtes réelles via la clé "anon" + RLS.
- Si Supabase est configuré mais injoignable → erreur affichée (jamais de fausse donnée).

### Passer au mode Supabase

1. Créez un projet sur [supabase.com](https://supabase.com).
2. Ouvrez **SQL Editor** et exécutez `supabase/migrations/0001_init.sql`
   (tables, index, RLS, trigger de profil, seed de démonstration).
   Avec le CLI : `supabase link --project-ref <ref>` puis `supabase db push`.
3. Copiez `.env.example` vers `.env.local` et remplissez :
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<clé anon publique>
   ```
4. Redémarrez `npm run dev` — le bandeau démo disparaît, la galerie lit la base.
   Les données seedées sont identiques au mode démo (mêmes UUID).

### Créer un administrateur

Dans **Authentication > Users** de Supabase, invitez un utilisateur, puis en SQL :

```sql
update public.profiles set role = 'admin' where id = '<UUID utilisateur>';
```

Connectez-vous sur `/login` (compte admin), accédez à `/admin`.

> La clé `SUPABASE_SERVICE_ROLE_KEY` n'est **jamais** utilisée dans le bundle client.
> Les autorisations sont garanties par les **politiques RLS** (`supabase/migrations/0001_init.sql`).

## Sécurité & performance

- Animations montées uniquement quand elles approchent du viewport (`useNearViewport`).
- GSAP en pause hors du viewport (IntersectionObserver), instances nettoyées `ctx.revert()`.
- `prefers-reduced-motion` respecté (état final statique, CSS animations désactivées).
- Validation des données avant exécution : composants connus uniquement (`component_key` dans un
  CHECK SQL + registre), configs assainies, slug/couleurs validés côté admin.
- RLS : anon lit animations publiées + prompts ; utilisateurs authentifiés gèrent leurs favoris ;
  admin total (`is_admin()` = `security definer`).
- Aucun code arbitraire importé/executé depuis la base ou l'admin.

## Migrations

```bash
supabase/migrations/0001_init.sql   # schéma initial + RLS + seed
```

Les nouvelles migrations sont numérotées séquentiellement (`0002_*.sql`).

## Prochaines étapes

- Déploiement (XCloud/Coolify) — **non fait** dans cette phase.
- Motion Studio : éditeur de paramètres + export (prévu, non développé).
- Recherche filtrée côté serveur (SQL `ILIKE`) quand le catalogue grandit.
- Favoris (UI) : table + RLS prêtes, UI à connecter.