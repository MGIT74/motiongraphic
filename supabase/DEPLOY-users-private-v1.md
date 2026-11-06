# Utilisateurs privés V1 — déploiement, rollback et limites

Branche `feat/users-private-v1` — **PR #38** (brouillon)
https://github.com/MGIT74/motiongraphic/pull/38
Référence corrigée (la PR est bien la **#38**, pas la #37).
NE PAS fusionner ni déployer sans validation ChatGPT finale.

## 1. Ordre de déploiement (après validation, en environnement de test d'abord)

1. **Clone de test Supabase** (obligatoire avant production) :
   - exécuter `supabase/migrations/0009_users_private_v1.sql` sur le clone
     (idempotent, re-exécutable ; série 2 : fonctions définies AVANT les
     triggers, RETURN OLD/NEW explicites, is_admin durci admin+actif,
     service_role exempté via double détection, consommation atomique) ;
   - exécuter `supabase/tests/rls-users.sql` (S1..S7) — les scénarios
     doivent tous afficher « OK » ;
   - exécuter `node supabase/tests/auth-invite-cycle.mjs` avec les
     variables `SUPABASE_TEST_URL`, `SUPABASE_TEST_ANON`,
     `SUPABASE_TEST_SERVICE_ROLE` — le cycle complet invitation →
     acceptation → activation → connexion doit passer.
2. **Application** : déployer la branche sur un environnement de staging
   (jamais XCloud production d'abord), vérifier `/admin/users`,
   une suspension réelle, une invitation complète.
3. **Supabase production** : exécution manuelle autorunisée de
   `0009_users_private_v1.sql` via SQL Editor (aucune donnée supprimée :
   `create if not exists`/`create or replace` seulement).
4. **XCloud production** : déployer l'application. Variables inchangées :
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `MCP_ACCESS_TOKEN`, `MCP_USER_ID`.
   **À ne PAS ajouter** : `MCP_ENABLE_USER_TOKENS`,
   `MCP_USER_TOKENS` (jetons MCP personnels dormants par défaut).

## 2. Vérification post-déploiement

- `/admin/users` : liste, invitation, rôle, suspension (compte de test).
- Invitation complète : email → acceptation → première connexion activée
  (`used_at` renseigné) ; révoquer avant acceptation → connexion refusée.
- Deux comptes A/B : isolation projets/médias/versions/rendus.
- MCP admin Claude : `preview_frame`/`render_project` inchangés.

## 3. Retour arrière — honnête (avec pertes, cf audit)

| Étape | Action | Effet |
|---|---|---|
| Application | redeployer l'image xCloud précédente | sessions invitées non gérées : les comptes restent « suspended » → réactivation manuelle par SQL `update profiles set status='active'` |
| SQL | `alter table public.profiles drop column if exists status;` | **Perte du statut de suspension** (il faut le rétablir manuellement si re-déploiement) |
| SQL | `drop table if exists public.user_invitations;` | **Perte de l'historique d'invitations** (exporter avant : `select * from user_invitations`) |
| SQL | `drop table if exists public.mcp_user_tokens;` | **Perte des jetons personnels** (aucun actif par défaut) |
| Triggers | `drop trigger if exists guard_active on <chaque table>; drop trigger if exists guard_active_created_by on custom_templates; drop trigger if exists prevent_role_escalation on profiles;` puis `create trigger prevent_role_escalation … guard_role_change()` de 0001 (la fonction `guard_role_change` doit être rétablie depuis 0001 si remplacement fait) | les gardes V1 partent |
| Fonctions | `drop function if exists …` (account_is_active, assert_account_active_for_write(-created_by), request_is_service_role, protect_status_change…) | — |

**Attention** : le rollback rétablit un état où les invitations créées ne
peuvent pas être consommées et où un compte invité peut être promu
manuellement sans garde. Exporter les données ci-dessus AVANT rollback.

## 4. Limites connues et tests non exécutés (transparence)

- **Aucun environnement SQL local viable** dans cet environnement :
  pas de Docker, pas de CLI Supabase, pas de psql ; la tentative
  d"installation d"un Postgres local (brew) échoue (compilation depuis
  les sources, erreurs de build, macOS 13 hors support). Les scripts
  `rls-users.sql` (S1..S7, série 3 corrigée) et `auth-invite-cycle.mjs`
  (9 étapes + courses de connexions simultanées) sont prêts mais
  **NON exécutés** — la sécurité RLS/Auth réelle N'EST DONC PAS VALIDÉE
  par exécution (les scénarios SQL sont syntaxés et relus ; psql
  ON_ERROR_STOP révélera tout écart résiduel sur le clone).
- `listUsersWithProfiles` paginé (>200 comptes) : non testé réel
  (idem, clone requis).
- Le dossier « profil utilisateur » (modifier prénom/email/mot de passe,
  déconnexion) n'est PAS dans cette PR (hors périmètre V1).

## 5. Script d"auto-vérification SUR VOTRE Supabase (non destructif)

`supabase/tests/rls-selfcheck.sql` — conçu pour un Supabase
AUTO-HÉBERGÉ SANS clone : chaque scénario est une transaction terminée
par **ROLLBACK**, identifiants dédiés (7e57/7f57 + rls-selfcheck-*@
selftest.invalid), prévol anti-collision (abort si les identifiants
existent), preuve finale **zéro ligne résiduelle** + résumé anonyme des
administrateurs. Couvertures : création/lecture/créations personnelles,
isolation A↔B, suspension (écritures refusées, lecture conservée,
service exempté), self-service interdit, admin suspendu sans
privilèges, jetons MCP (grants révoqués), invitations (rôle, révocable,
expirée, consommation atomique). Syntaxe vérifiée par le parseur
PostgreSQL réel (libpg_query).

## 6. Sécurité — récapitulatif des gardes

- Invitation : 409 sur compte actif, ré-invitation sur compte invité non
  activé (lien régénéré), expiration **appliquée côté serveur**
  (`/api/auth/consume` refuse toute invitation passée/révoquée),
  révocation → ban Auth du compte non activé (le lien email ne peut plus
  créer de session) : *garde réelle prouvée par scripts (clone à exécuter).*
- Suspension : proxy (pages 403 + validation d"invitation centrale pour toute session), API (423), RLS+trigger (P0001), ban Auth ; réactivation impossible en changeant le propriétaire d"une ressource (OLD/NEW vérifiés).
- Rôles : self-service impossible (trigger), API admin avec garde
  « dernier admin actif » (pré + post-écriture), compensation Auth↔profiles attendue ET vérifiée.
- is_admin() (0009) = role admin ET statut actif : un admin suspendu
  n" bénéficie d"aucun privilège (toutes les politiques RLS).
- MCP perso : dormant par défaut (`MCP_USER_TOKENS` absent), aucune
  permission navigateur (revoke), fail-closed sur profil, expiration 90 j.