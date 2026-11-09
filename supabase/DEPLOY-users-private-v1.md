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

---

# Plan de déploiement final — audit ciblé (PR #38, branche `feat/users-private-v1`)

## 1. Migration complémentaire (faille fermée)

`supabase/migrations/0010_status_self_change_guard.sql` — **À EXÉCUTER
SUR LE SUPABASE AUTO-HÉBERGÉ AVANT LA FUSION** :
ferme la faille réelle identifiée par l'audit final — un utilisateur
suspendu pouvait SE RÉACTIVER lui-même via Supabase (PostgREST
navigateur : `profiles_update_self` 0001 + JWT + clé anon), car la
migration installée ne contient pas de déclencheur gardien du statut.
0010 ajoute `prevent_status_self_change` (nom distinct : le script
`rls-selfcheck.sql` P0 - 6 déclencheurs nommés - reste valide).
Vérification après exécution (SQL Editor, lecture seule) :
```
select tgname from pg_trigger join pg_class c on c.oid = tgrelid
 where nspname-ish c.relnamespace = 'public'::regnamespace
   and tgname in ('prevent_status_self_change');
-- attendu : 1 ligne
```

## 2. Variables d'environnement XCloud (NOMS SEULEMENT — aucun secret)

| Variable | Rôle | Où |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | API Auth/PostgREST (publique) | build+runtime |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | clé publique anon | build+runtime |
| `SUPABASE_SERVICE_ROLE_KEY` | opérations admin serveur (invitations, suspension, MCP) | runtime SEULEMENT |
| `MCP_ACCESS_TOKEN` | MCP administrateur Claude (existant) | runtime SEULEMENT |
| `MCP_USER_ID` | utilisateur cible MCP legacy | runtime SEULEMENT |
| — NE PAS DÉFINIR — `MCP_ENABLE_USER_TOKENS` / `MCP_USER_TOKENS` | jetons MCP personnels (dormants) | — |
| — NE PAS DÉFINIR — `STUDIO_CI_TEST_BYPASS`, `CI`, `TEMPLATE_CHECK`, `CONSTRUCTION_MODE` | flags de test/dev (contournement / pages /dev) | — |

## 3. Ordre de déploiement (le site XCloud s'auto-déploie depuis `main`)

1. Exécuter `0010_status_self_change_guard.sql` (SQL Editor).
2. Vérifier les 6+1 triggers + politiques (`rls-selfcheck.sql` P0 est
   lecture seule : peut être relancé — il attend 6 gardes nommées ✓).
3. **Valider la PR #38 → fusion → auto-déploiement XCloud.**
4. Après déploiement (smoke checks sans secrets) :
   - `curl -o /dev/null -w "%{http_code}" https://studio.motiongraphic.si/studio`
     → 307 (redirection);
   - /admin/users : invite + suspension d'un compte de TEST puis
     réactivation ;
   - MCP Claude (legacy) : `list_tools` toujours fonctionnel.
5. Ne fusionner qu'APRÈS la validation des points 1–3.

## 4. Retour arrière

- **Application** : `git revert` du commit de fusion sur `main` →
  auto-déploiement de la version précédente (le site repasse sur le
  Studio privé sans gestion d'utilisateurs).
- **Base** : Rien à faire obligatoirement (tables/profiles.status/
  mcp_user_tokens/additifs sans impact sur le code d'avant-fusion) ;
  facultatif : `drop trigger if exists prevent_status_self_change on
  public.profiles; drop function if exists
  public.guard_status_self_change();` pour retirer la 0010.
  Les invitations en cours et les statuts restent dans la base
  (retour complet en supprimant 0009 : cf. section rollback plus haut,
  avec export préalable).
- Un compte test créé pendant la vérification : suppression via
  /admin/users puis `delete from auth.users where email like
  'test-%'` (côté admin console).

## 5. Récapitulatif de l'audit final ciblé

| Point | Résultat |
|---|---|
| /admin/users + /api/admin/* (session, rôle admin, statut) | ✅ code + gates fail-closed ; sans session : 307 / 401 / 503 (vérifié réellement) |
| self-service rôle (API + SQL direct) | ✅ bloqué (0001/0009/0010) |
| self-service statut (SQL direct) | ⚠️ FAILLE IDENTIFIÉE → fermée par **0010** (à appliquer avant fusion) |
| invitations / activation / suspension | ✅ code complet (cycle réel Auth à exécuter sur un clone — séparé) |
| projets des autres | ✅ RLS `user_id = auth.uid()` + contrôle de propriété sur les rendus/médias (P2/P3 validés sur votre instance) |
| batteries locales (nouveau commit) | ✅ users 39/39, e2e 23/23, security 21/21, templates 11/11, parcours 15/15, export 28/28, lint/typecheck 0 |

---

# Plan de mise en production — état du 9 novembre 2026 (migrations 0011, 0014, 0015)

**Rien de ce qui suit n'est exécuté. Chaque étape de production exige l'accord explicite du propriétaire.**
0009 et 0010 sont DÉJÀ installées en production : ne jamais les rejouer.

## A. Ce que la CI « Supabase jetable » a démontré (base locale éphémère, aucune donnée réelle)
- Les migrations 0001 → 0015 s'appliquent depuis zéro ; 0011, 0014 et 0015 se rejouent deux fois sans erreur (idempotence).
- `rls-users.sql` (S1–S7), `rls-selfcheck.sql`, le cycle d'invitation (Auth réel local) et les tests PostgREST avec de vrais JWT
  (`status-guard.postgrest.mjs` a–h, `mcp-tokens-0011.postgrest.mjs` a–g) passent.
- **Non couvert :** vrai email reçu, dérive du schéma de production par rapport au dépôt, appel MCP complet avec un jeton personnel,
  charge, audit de sécurité exhaustif. La 0007 (PR #12) n'existe pas dans le dépôt.

## B. Défauts de la 0009 corrigés par des migrations ADDITIVES
| Migration | Défaut corrigé | Effet si absente |
|---|---|---|
| 0014 | La règle `invitations_read_invited` lisait `auth.users` (interdit à `authenticated`) | Toute lecture directe de `user_invitations` par un compte connecté échoue (le code actuel utilise `service_role`, donc rien ne casse aujourd'hui) |
| 0015 | `request_is_service_role()` plante si `request.jwt.claims` est une chaîne vide | UPDATE de `profiles` hors PostgREST (éditeur SQL, maintenance) en erreur sur une connexion déjà utilisée |
| 0011 | (nouveau) permissions, renouvellement, audit des jetons MCP | La création de jeton échoue : à exécuter AVANT d'activer le drapeau |

Règle d'exploitation : le garde de rôle n'exempte que les admins et `service_role`. Pour promouvoir un compte depuis l'éditeur SQL,
commencer la transaction par `select set_config('request.jwt.claims', '{"role":"service_role"}', true);`.

## C. Séquence recommandée (chaque ligne = un accord distinct)
1. **Instantané** de la base de production (sauvegarde XCloud/Postgres), et vérification que la sauvegarde est présente.
2. Lecture seule : `select status, role, count(*) from public.profiles group by 1,2;` (fait le 8/11 : 1 admin actif).
3. Exécuter **0014**, puis **0015** (éditeur SQL, une par une, relire le résultat).
4. Fusionner la PR #38 dans `main` (déclenche un déploiement si le webhook est branché ; sinon déploiement manuel).
5. Contrôles post-déploiement : connexion admin, création de projet, appel MCP legacy (27 outils), `/settings/mcp` répond
   « pas encore activée » (503 attendu).
6. Rotation des secrets (fenêtre séparée, plan à rédiger avec ChatGPT).
7. Exécuter **0011**, puis seulement alors activer `MCP_USER_TOKENS=true` dans XCloud et redéployer.

## D. Retour arrière
- Code : redéployer le commit précédent de `main` (`93bcab6` au 8/11). Aucune perte de données.
- 0014 : recréer l'ancienne règle (réintroduit son défaut). 0015 : recréer la fonction de la 0009 (réintroduit le défaut).
- 0011 : `drop table public.mcp_token_audit;` et suppression des colonnes `scopes`, `rotated_from` — **perd les permissions et l'audit**.
- Aucune migration n'est annulée automatiquement : on corrige en avançant.
