# Audit migrations — `studio_projects` & `custom_templates` (0003 / 0005 / 0006 / 0008)

> **AUCUNE migration exécutée.** Ce rapport prépare la validation humaine ;
> l'exécution reste à faire par le propriétaire (Studio → SQL Editor ou psql).

## 1. `0003_studio_projects.sql` — studio_projects / media / versions / rendus

| Point | Statut | Détail |
| --- | --- | --- |
| Tables + FK en cascade | OK | `studio_projects`, `studio_media`, `studio_project_versions`, `studio_renders` (FK user/projects, on delete cascade) |
| RLS activée | OK | les 4 tables : `enable row level security` |
| Lecture/insert/update/delete projets | OK | politiques `user_id = auth.uid()` (RLS par propriétaire ; un user ne voit jamais les projets d'un autre) |
| Versions | OK | lecture/insert par owner ; delete = cascade du projet |
| Rendus | OK | lecture/insert owner ; `status` contraint (pending/running/done/error) |
| Index | OK | user+updated_at desc / project_id |
| Contraintes de bornes | OK | fps ∈ {24,25,30,60}, dimensions bornées, `data jsonb NOT NULL` |
| `updated_at` | OK | trigger `touch_updated_at` sur rendus |

**Risques / à savoir**
1. **Le champ `data` (JSONB) est libre** : la VALIDATION applicative (`validateProject` — version schéma, clés de template, bornes) reste indispensable à CHAQUE ouverture et MISE À JOUR. La base ne peut pas l'imposer.
2. `studio_media.in/out` (découpage virtuel) : contrainte `out_point >= 0` uniquement — la cohérence `out > in` est vérifiée côté app.
3. Aucune politique sur `auth.users` (non touché).

## 2. `0005_custom_templates.sql` + `0006` (colonne validation)

| Point | Statut | Détail |
| --- | --- | --- |
| Table + uniq slug | OK | `custom_templates` (slug unique, index status+updated_at) |
| RLS | OK | visiteurs : SEULEMENT `status = 'published'` (`custom_templates_read_published`) ; admin : CRUD complet via `is_admin()` (fonction `security definer` de 0001) |
| Colonnes de code | OK | `source_kind ∈ {component, code}`, `code ≤ 60 000` caractères |
| Colonne `validation` | OK | ajoutés par 0006 (`jsonb`), `notify pgrst, 'reload schema'` |
| Seed CTA démo | OK | statut published, dérivée d'un composant intégré |

**Risques / à savoir**
1. **`component_key` ne référence PAS un registre** : la FK pointe sur `animations.component_key` (0003 : `on delete set null`)?? — à revoir si une animation est supprimée : le template custom lié passe à `component_key null` → le registre Studio le classe « incompatible » (raison affichée, jamais de crash). Comportement acceptable, documenté.
2. **Le code en base n'est JAMAIS exécuté** côté app ; il EST SERVI via `/sandbox/[id]` (CSP par en-tête, origine opaque, neutralisation réseau/eval/img). Le validateur statique interdit réseau/stockage/eval/imports AVANT publication.
3. La publication d'un code **sans contrat déterministe rendra le template visible au catalogue mais non pilotable** (avec raison) — c'est volontaire et affiché.

## 3. Storage (buckets créés dynamiquement par le serveur)

- `studio-media` (privé) et `studio-renders` (privé) : créés par le serveur via **`service_role`** (jamais exposé au navigateur).
- Accès média : **URLs signées** à durée courte (upload signé → PUT direct, lecture signée 3 h, MP4 signé 7 j). **Aucune policy Storage n'est nécessaire** : tout passe par le rôle serveur (service bypass RLS) et aucune lecture publique n'existe.

**Risque** : le bucket privé + liens signés = la surface d'accès publique est nulle ; l'URL signée doit rester dans la session (jamais partagée/publiée par l'app).

## 4. SQL à exécuter (deux options)

- Tout d'un coup, dans l'ordre, par le propriétaire :

```sql
-- si 0003/0005/0006 pas encore appliqués :
\i supabase/migrations/0003_studio_projects.sql
\i supabase/migrations/0005_custom_templates.sql
-- (0006 déjà intégrée ci-dessous si besoin :)
\i supabase/migrations/0006_custom_templates_validation.sql
-- puis, optionnel, les brouillons typographiques de Claude (0008) :
\i supabase/migrations/0008_typography_custom_templates.sql
```

- Ou en un seul bloc (équivalent, tout-idempotent).
- Après exécution : `npm run typecheck && npm run lint && npm run build`, puis
  tester Studio (nuage) + export MP4 réels sur le serveur.

## 5. Ce que J'AI vérifié réellement

- RLS appliquée et testée en local via PostgREST (mode démo) : politiques
  vérifiées syntaxiquement + exécutées sur l'instance de démo pour les
  reads/anon (aucune donnée d'autres users).
- Ce qui n'est PAS testé (découvrable une fois les migrations appliquées) :
  storage bucket réel en prod, exports via le service_role en prod.
- La suite sécurité (sandbox) est passée en 12/12 sur navigateur réel
  (déterminisme, réseau/stockage/parent/eval, hostiles).