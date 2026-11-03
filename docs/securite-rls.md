# Audit de sécurité Supabase — MotionGraphic.si

**Périmètre :** migrations SQL versionnées `0001_init.sql`, `0003_studio_projects.sql`, `0004_allow_minimal_saas_ui.sql` et `0005_custom_templates.sql`. Audit statique du dépôt, sans accès aux rôles ni aux politiques effectivement installés sur la base de production. **Aucune migration n'a été exécutée en production.**

## Résumé

- **Important — relations Studio non vérifiées :** les politiques RLS de `studio_media`, `studio_project_versions` et `studio_renders` ne vérifient que `user_id = auth.uid()`. À l'insertion, un utilisateur peut associer une ligne à un `project_id` appartenant à un autre utilisateur, si l'UUID est connu. Cela ne donne pas automatiquement accès aux données du projet parent, mais rompt l'isolation relationnelle, pollue les objets liés et peut exposer des traitements serveur qui supposent la cohérence des propriétaires. La migration `0007_rls_owner_integrity.sql` ajoute la vérification du propriétaire du projet aux politiques de lecture/insertion.
- **Modéré — rendu client manipulable :** `studio_renders_insert` permet à un utilisateur d'insérer un rendu avec `status='done'`, un `storage_path` arbitraire ou une erreur fictive. La migration restreint l'insertion utilisateur à un état `pending` et interdit de fournir `storage_path`/`error`. Les workers utilisant un rôle privilégié doivent conserver la possibilité de mettre à jour le rendu.
- **Modéré — droits SQL non explicités :** les migrations activent RLS mais ne fixent pas systématiquement les privilèges `GRANT/REVOKE` de toutes les tables. RLS **ne remplace pas** les privilèges de table ; les grants existants dépendent de l'installation Supabase. La migration fixe explicitement les privilèges de `anon` et `authenticated` pour les tables auditées.
- **À surveiller — fonctions `SECURITY DEFINER` :** `handle_new_user()`, `is_admin()` et `guard_role_change()` sont définies avec `set search_path = public`. Préférer un `search_path` vide et des références qualifiées. Les fonctions sont utilisées par trigger ou par RLS ; leur remplacement exige de vérifier le comportement sur une base Supabase réelle et les privilèges `EXECUTE`. Aucun changement de signature ni de fonction n'est inclus dans cette PR pour limiter les régressions.

## Inventaire RLS

| Table | Lecture | Écriture | Observations |
| --- | --- | --- | --- |
| `categories` | anon/authenticated | admin | Lecture publique attendue |
| `animations` | publiées ou admin | admin | Publication contrôlée |
| `prompts` | animation publiée ou admin | admin | Dépend de la visibilité du parent |
| `profiles` | propriétaire ou admin | propriétaire (update), admin | Le trigger `guard_role_change` empêche l'escalade du rôle |
| `favorites` | propriétaire | propriétaire (insert/delete) | Politique de propriété correcte ; pas de vérification de publication de l'animation favorite |
| `studio_projects` | propriétaire | propriétaire (CRUD) | Isolation directe correcte |
| `studio_media` | `user_id` | insert/delete par `user_id` | Vérification du projet parent manquante |
| `studio_project_versions` | `user_id` | insert par `user_id` | Vérification du projet parent manquante |
| `studio_renders` | `user_id` | insert par `user_id` | Vérification du projet parent et de l'état initial manquante |
| `custom_templates` | publiés ou admin | admin | Le champ `code` d'un template publié est lisible publiquement par conception ; confirmer ce choix produit |

`0004` modifie une contrainte de liste blanche, sans changer les politiques.

## Fonctions privilégiées et grants

- `public.is_admin()` : `SECURITY DEFINER`, lit `public.profiles` pour le `auth.uid()` courant. Ne prend aucun argument et ne permet pas de choisir l'identité inspectée.
- `public.handle_new_user()` : `SECURITY DEFINER`, insère le profil du nouvel utilisateur avec le rôle `user`. Déclenchée sur `auth.users`.
- `public.guard_role_change()` : `SECURITY DEFINER`, refuse les changements de rôle sans droits admin. Attention à maintenir ce trigger lors de futures migrations.
- `public.touch_updated_at()` : fonction de trigger sans `SECURITY DEFINER` explicite.
- Les policies utilisent `auth.uid()` et les droits `authenticated`; la migration de correction explicite les permissions de table sans accorder de privilèges directs aux visiteurs sur les données privées.

## Validation nécessaire avant application

1. Sur une instance Supabase PostgreSQL vierge, exécuter les migrations dans l'ordre, puis `0007` **deux fois** (idempotence).
2. Rejouer `0007` sur une copie de schéma existant et vérifier les grants et les politiques via `pg_policies` et `information_schema.role_table_grants`.
3. Tester avec deux utilisateurs A et B : A ne peut pas lier un média, une version ou un rendu à un projet de B, même en connaissant son UUID ; A peut insérer dans son propre projet ; anon ne peut pas lire les données privées.
4. Vérifier que le flux de rendu serveur utilise bien les privilèges nécessaires (service role ou mécanisme privilégié) et que le flux normal crée des jobs `pending` sans chemin de stockage.
5. Revoir les données historiques potentiellement incohérentes avant application ; la migration bloque leur visibilité, elle ne les supprime pas.

**État des tests :** audit statique réalisé ; tests PostgreSQL sur instance neuve/existante **non exécutés** dans cet environnement. Ne pas appliquer en production avant ces validations et la revue de Claude.
