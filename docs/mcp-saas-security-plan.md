# MCP SaaS multi-utilisateur — plan de migration sécurisée

## État actuel vérifié
- `POST /api/mcp` accepte `MCP_ACCESS_TOKEN` global via Bearer, x-auth-token ou x-api-key.
- Les outils dans `mcp-server.ts` utilisent `MCP_USER_ID` global et `SUPABASE_SERVICE_ROLE_KEY`.
- `authorizeRender` autorise le jeton global avec `MCP_USER_ID`.
- Les tables Studio ont des politiques RLS par `user_id`, mais la service role contourne RLS.
- La connexion Claude actuelle doit rester fonctionnelle jusqu'à la bascule explicite.

## Architecture cible
1. Authentification de chaque client via Supabase Auth dans l'interface Studio.
2. Connexion MCP distante via OAuth 2.1 (Authorization Code + PKCE) avec découverte du serveur d'autorisation, audience/ressource vérifiées, scopes minimaux et révocation. Pour une première bêta privée, des clés personnelles à entropie forte, stockées uniquement sous forme de hash et affichées une seule fois, peuvent servir de transition lorsque le client MCP les accepte.
3. Identité résolue **à chaque requête** : `McpPrincipal { userId, tokenId, scopes }`. Ne jamais utiliser `MCP_USER_ID` comme identité des nouveaux clients.
4. Propager `userId` dans tous les outils MCP, le stockage de projets, médias, rendus et endpoints d'export. Supprimer tout accès implicite au propriétaire global.
5. Accès Supabase avec JWT utilisateur + RLS quand possible; si service role nécessaire, appliquer des contrôles d'autorisation explicites et une restriction `user_id` sur chaque lecture/écriture, y compris tables secondaires et Storage.
6. Page « Connexions MCP » dans le compte : connecter Claude, afficher la connexion et les permissions, révoquer, journaliser les usages. Ne jamais exposer les secrets dans l'interface ou les logs.
7. Protections : limites de débit par utilisateur/jeton, quotas de rendus et d'import, vérification de l'origine des URL d'import/capture (SSRF), validation des paramètres et tailles, journal d'audit sans données sensibles.
8. OAuth et clients : tester Claude.ai/Claude Desktop puis ChatGPT avec la configuration réelle; ne pas supposer qu'une connexion fonctionnelle avec un jeton global prouve le parcours OAuth.
9. Migration : conserver l'ancien jeton uniquement pour l'administrateur, derrière un mode de compatibilité explicitement activé; le retirer après validation des comptes individuels.

## Tests bloquants avant ouverture
- Utilisateur A ne peut pas lister, lire, modifier, exporter ou récupérer les médias/rendus de B, y compris en fournissant des identifiants de B.
- Jeton révoqué ou expiré => 401; scope insuffisant => 403.
- Les endpoints `/api/studio/render` et leurs sous-routes respectent la même identité que MCP.
- Une erreur réseau et des requêtes simultanées n'écrasent pas une version de projet plus récente.
- Claude admin existant fonctionne durant la migration; le nouvel utilisateur se connecte sans connaître `MCP_ACCESS_TOKEN`.
- Aucun secret n'est retourné dans les messages d'erreur, traces, liens ou logs.
- Migrations SQL et déploiement nécessitent une validation explicite; ne pas merger la branche de travail OpenCode PR #31.

## Configuration
`STUDIO_PUBLIC_URL=https://studio.motiongraphic.si` (optionnelle; valeur par défaut intégrée).

Ce document est un plan, pas une implémentation SaaS achevée. Ne pas exposer le MCP aux clients avant les tests d'isolation et la revue de sécurité.
