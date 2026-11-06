# Utilisateurs privés V1 — déploiement et retour arrière

Branche `feat/users-private-v1` (PR brouillon #37). NE PAS fusionner ni
déployer sans validation ChatGPT.

## Déroulé de déploiement (après validation)

1. **Branches/PR**
   - PR #37 : `feat/users-private-v1` → `main` (code + migrations + tests).
   - PR #35/#36 restent intouchées.
2. **Supabase production** (exécution manuelle autorisée uniquement
   après validation) :
   - SQL Editor : `supabase/migrations/0009_users_private_v1.sql`
     (idempotent ; crée `profiles.status`, `user_invitations`,
     `mcp_user_tokens`, les gardes et les politiques RLS).
   - Vérifier ensuite avec `supabase/diagnostics-verify.sql`
     (lecture seule, aucune écriture).
3. **xCloud — variables d'environnement** (aucun changement de code) :
   - inchangées : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
     `SUPABASE_SERVICE_ROLE_KEY` (déjà serveur), `MCP_ACCESS_TOKEN`,
     `MCP_USER_ID`.
   - NE PAS AJOUTER : `MCP_ENABLE_USER_TOKENS`, `MCP_USER_TOKENS`
     (jetons MCP personnels volontairement désactivés pour cette V1).
4. **Vérifications post-déploiement** (clic par clic) :
   - /admin/users : la liste se charge ; tester un `PATCH` de rôle sur un
     compte de test ; suspension → l'UI de l'utilisateur montre la page
     « Compte suspendu » (403) et les API renvoient 423.
   - Une invitation expirée : révoquer puis essayer le lien email →
     Auth refuse (la session ne se crée pas).
   - Deux comptes de test (A/B) : A ne voit pas les projets de B
     (RLS `user_id = auth.uid()`), idem médias/versions/rendus.
   - MCP admin Claude : preview_frame + render_project → inchangés.

## Retour arrière

- **Code** : redeployer la version précédente sur xCloud (l'image).
- **Base** : la V1 est additive ; pour revenir :
  1. `drop table if exists public.mcp_user_tokens;`
  2. `drop table if exists public.user_invitations;`
  3. `alter table public.profiles drop column if exists status;`
  4. `drop trigger if exists guard_active on <chaque table studio>;`
  5. `drop function if exists public.account_is_active(uuid);
     drop function if exists public.assert_account_active_for_write();
     drop function if exists public.guard_status_change();
     drop function if exists public.request_is_service_role();`
  (les politiques ajoutées tombent avec leurs tables ; `profiles` garde
  ses politiques d'origine 0001.)
- Aucune donnée utilisateur n'est détruite par le retour arrière
  (colonnes `status` supprimées avec `drop column`, invitations perdues
  seulement si la table est supprimée — exporter avant si besoin).

## Limites connues (V1)

- Les tests RLS croisés (scripts psql) exigent un CLONE Supabase :
  `supabase/tests/rls-users.sql` ; non exécutables sans comptes réels.
- La suspension via ban Auth prend effet immédiatement côté API ; côté
  navigateur un jeton resté en cache est bloqué au prochain refresh de
  session (proxy : pages privées ; API : 423).
- Les invitations se basent sur l'email d'API admin Supabase ; le taux
  d'envoi dépend des limites de l'instance (auth.email pour SMTP).