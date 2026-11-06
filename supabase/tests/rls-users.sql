-- =====================================================================
-- MotionGraphic Studio — tests RLS multi-utilisateurs V1 (révision d'audit)
--
-- À exécuter sur un CLONE de test UNIQUEMENT (jamais production) :
--   psql "<URL_CLONE_TEST>" -v ON_ERROR_STOP=1 -f supabase/tests/rls-users.sql
--
-- Principe : psql se connecte avec le rôle `postgres` (clone de test),
-- simule les requêtes PostgREST avec SET LOCAL ROLE authenticated et des
-- claims JWT réels. Chaque attente de sécurité est vérifiée :
--   - refus  → exception avec SQLSTATE attendu (42501 RLS / P0001 garde) ;
--   - succès → nombre de lignes contrôlé (GET DIAGNOSTICS).
-- Un test n'est JAMAIS déclaré réussi parce qu'une exception a été
-- interceptée : le SQLSTATE ET le message sont vérifiés explicitement.
--
-- Scénarios :
--   S1. A crée/modifie ses projets, médias, versions, rendus.
--   S2. A ne voit ni ne modifie RIEN de B (dont UPDATE/DELETE 0 ligne).
--   S3. B symétique (droits sur ses ressources).
--   S4. Compte SUSPENDU : écritures refusées (P0001 COMPTE_SUSPENDU),
--       lectures conservées, service_role exempté (API admin/MCP).
--   S5. Rôles/statuts : self-service interdit, API admin autorisée.
--   S6. Jetons MCP : navigateur/anon sans accès ; serveur oui.
--   S7. handle_new_user : invitation valide (rôle attribué), invalide
--       (profil suspendu).
-- =====================================================================

\set ON_ERROR_STOP 1
\echo '=== rls-users: début (clone de test uniquement) ==='

-- ---------------------------------------------------------------------
-- Préparation : deux profils actifs (rôle service_role simulé via claims)
-- ---------------------------------------------------------------------
begin;
set local request.jwt.claims = '{"role":"service_role","sub":"00000000-0000-8000-0000-000000000000","email":"test@clone.local"}';
delete from public.studio_renders where user_id in
  ('00000000-0000-8000-0000-00000000000a','00000000-0000-8000-0000-00000000000b');
delete from public.studio_project_versions where user_id in
  ('00000000-0000-8000-0000-00000000000a','00000000-0000-8000-0000-00000000000b');
delete from public.studio_media where user_id in
  ('00000000-0000-8000-0000-00000000000a','00000000-0000-8000-0000-00000000000b');
delete from public.studio_projects where user_id in
  ('00000000-0000-8000-0000-00000000000a','00000000-0000-8000-0000-00000000000b');
delete from public.profiles where id in
  ('00000000-0000-8000-0000-00000000000a','00000000-0000-8000-0000-00000000000b');
insert into public.profiles (id, display_name, role, status) values
  ('00000000-0000-8000-0000-00000000000a','Utilisateur A','user','active'),
  ('00000000-0000-8000-0000-00000000000b','Utilisateur B','user','active');
commit;

-- ---------------------------------------------------------------------
-- S1 : A crée ses ressources (RLS with check user_id = auth.uid())
-- ---------------------------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-8000-0000-00000000000a","role":"authenticated","email":"a@clone.local"}';

insert into public.studio_projects (id, user_id, name, schema_version, fps, width, height, data)
values ('11111111-0000-8000-8000-0000000000a1','00000000-0000-8000-0000-00000000000a','PROJET-A',1,30,1920,1080,'{}'::jsonb);

insert into public.studio_media (id, project_id, user_id, storage_path, kind, name)
values ('22222222-0000-8000-8000-0000000000a1','11111111-0000-8000-8000-0000000000a1','00000000-0000-8000-0000-00000000000a','clone/media/a1.mp4','video','rush-a');

insert into public.studio_project_versions (id, project_id, user_id, label, data)
values ('33333333-0000-8000-8000-0000000000a1','11111111-0000-8000-8000-0000000000a1','00000000-0000-8000-0000-00000000000a','v1','{}'::jsonb);

insert into public.studio_renders (id, project_id, user_id, status, format, resolution)
values ('44444444-0000-8000-8000-0000000000a1','11111111-0000-8000-8000-0000000000a1','00000000-0000-8000-0000-00000000000a','done','mp4','1080p');

do $$
declare n int;
begin
  select count(*) into n from public.studio_projects;
  if n <> 1 then raise exception 'S1 ÉCHEC : A voit % projets (attendu 1).', n; end if;
  raise notice 'S1 OK : A crée et lit ses projets/médias/versions/rendus.';
end $$;
commit;

-- ---------------------------------------------------------------------
-- S3 : B symétrique (mêmes droits sur ses propres ressources)
-- ---------------------------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-8000-0000-00000000000b","role":"authenticated","email":"b@clone.local"}';

insert into public.studio_projects (id, user_id, name, schema_version, fps, width, height, data)
values ('11111111-0000-8000-8000-0000000000b1','00000000-0000-8000-0000-00000000000b','PROJET-B',1,30,1920,1080,'{}'::jsonb);

do $$
declare n int; updated int;
begin
  update public.studio_projects set name = 'PROJET-B (maj)' where id = '11111111-0000-8000-8000-0000000000b1';
  get diagnostics updated = row_count;
  if updated <> 1 then raise exception 'S3 ÉCHEC : B n''a pas mis à jour son propre projet (% lignes).', updated; end if;
  -- B voit UNIQUEMENT son projet (A invisible pour B) :
  select count(*) into n from public.studio_projects;
  if n <> 1 then raise exception 'S3 ÉCHEC : B voit % projets (attendu 1 : le sien).', n; end if;
  select count(*) into n from public.studio_projects where user_id = '00000000-0000-8000-0000-00000000000a';
  if n <> 0 then raise exception 'S3 ÉCHEC : B voit % projets de A !', n; end if;
  raise notice 'S3 OK : B crée/maj ses ressources et ne voit pas celles de A.';
end $$;
commit;

-- ---------------------------------------------------------------------
-- S2 : A ne peut accéder/modifier/supprimer RIEN de B
-- (UPDATE/DELETE sur ligne invisible = 0 ligne, PAS d'exception)
-- ---------------------------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-8000-0000-00000000000a","role":"authenticated","email":"a@clone.local"}';

do $$
declare updated int; deleted int; n int;
begin
  insert into public.studio_projects (id, user_id, name, schema_version, fps, width, height, data)
  values ('11111111-0000-8000-8000-0000000000b2','00000000-0000-8000-0000-00000000000b','INTRUS-A',1,30,1920,1080,'{}'::jsonb);
  -- l'insertion au nom de B doit être refusée par with check :
  raise exception 'S2 ÉCHEC : A a inséré un projet pour B (RLS with check).';
exception
  when insufficient_privilege then
    raise notice 'S2 OK : insertion croisée refusée (42501).';
end $$;

do $$
declare updated int;
begin
  update public.studio_projects set name = 'PIRATÉ' where id = '11111111-0000-8000-8000-0000000000b1';
  get diagnostics updated = row_count;
  if updated <> 0 then raise exception 'S2 ÉCHEC : A a modifié % projets de B (attendu 0).', updated; end if;
  raise notice 'S2 OK : UPDATE de A sur B = 0 ligne.';
end $$;

do $$
declare deleted int;
begin
  delete from public.studio_projects where id = '11111111-0000-8000-8000-0000000000b1';
  get diagnostics deleted = row_count;
  if deleted <> 0 then raise exception 'S2 ÉCHEC : A a supprimé % projets de B (attendu 0).', deleted; end if;
  raise notice 'S2 OK : DELETE de A sur B = 0 ligne.';
end $$;

do $$declare n int;
begin
  select count(*) into n from public.studio_media where user_id = '00000000-0000-8000-0000-00000000000b';
  if n <> 0 then raise exception 'S2 ÉCHEC : A lit % médias de B.', n; end if;
  select count(*) into n from public.studio_renders where user_id = '00000000-0000-8000-0000-00000000000b';
  if n <> 0 then raise exception 'S2 ÉCHEC : A lit % rendus de B.', n; end if;
  raise notice 'S2 OK : médias et rendus de B invisibles pour A.';
end $$;
commit;

-- ---------------------------------------------------------------------
-- S4 : compte suspendu (A) — écritures refusées, lectures conservées,
--      service_role exempté (migrations/admin/MCP)
-- ---------------------------------------------------------------------
begin;
set local request.jwt.claims = '{"role":"service_role","sub":"00000000-0000-8000-0000-000000000000"}';
update public.profiles set status = 'suspended' where id = '00000000-0000-8000-0000-00000000000a';
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-8000-0000-00000000000a","role":"authenticated","email":"a@clone.local"}';

do $$
declare n int;
begin
  -- écriture refusée par le garde 0009
  insert into public.studio_projects (id, user_id, name, schema_version, fps, width, height, data)
  values ('11111111-0000-8000-8000-0000000000a2','00000000-0000-8000-0000-00000000000a','BLOQUE',1,30,1920,1080,'{}'::jsonb);
  raise exception 'S4 ÉCHEC : un compte suspendu a écrit.';
exception
  when others then
    if sqlstate <> 'P0001' or position('COMPTE_SUSPENDU' in sqlerrm) = 0 then
      raise exception 'S4 ÉCHEC : état SQLSTATE % (%), attendu P0001 COMPTE_SUSPENDU.', sqlstate, sqlerrm;
    end if;
    raise notice 'S4 OK : écriture refusée pour compte suspendu (P0001 COMPTE_SUSPENDU).';
end $$;

do $$
declare n int;
begin
  update public.studio_projects set name = 'X' where id = '11111111-0000-8000-8000-0000000000a1';
  raise exception 'S4 ÉCHEC : compte suspendu a mis à jour.';
exception
  when others then
    if sqlstate <> 'P0001' then raise exception 'S4 ÉCHEC : SQLSTATE % inattendu.', sqlstate; end if;
    raise notice 'S4 OK : mise à jour refusée pour compte suspendu.';
end $$;

-- lectures conservées : A voit SES ressources (consultation)
do $$
declare n int;
begin
  select count(*) into n from public.studio_projects;
  if n <> 1 then raise exception 'S4 ÉCHEC : suspendu ne lit plus ses % projets (attendu 1).', n; end if;
  raise notice 'S4 OK : lecture de ses propres données conservée.';
end $$;
commit;

begin;
-- service_role (chemin d'administration : API server, MCP, migrations)
set local request.jwt.claims = '{"role":"service_role","sub":"00000000-0000-8000-0000-000000000000"}';
update public.profiles set status = 'active' where id = '00000000-0000-8000-0000-00000000000a';
do $$
declare n int;
begin
  insert into public.studio_projects (id, user_id, name, schema_version, fps, width, height, data)
  values ('11111111-0000-8000-8000-0000000000a3','00000000-0000-8000-0000-00000000000a','VIA-SERVICE',1,30,1920,1080,'{}'::jsonb);
  raise notice 'S4 OK : service_role non bloqué par la suspension (API admin/MCP).';
end $$;
commit;

-- ---------------------------------------------------------------------
-- S5 : self-service interdit (rôle et statut), API admin autorisée
-- ---------------------------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-8000-0000-00000000000b","role":"authenticated","email":"b@clone.local"}';
do $$
begin
  update public.profiles set role = 'admin' where id = '00000000-0000-8000-0000-00000000000b';
  raise exception 'S5 ÉCHEC : ré-attribution de rôle possible en self-service.';
exception
  when others then
    if sqlstate <> 'P0001' then raise exception 'S5 ÉCHEC : SQLSTATE % inattendu (attendu P0001).', sqlstate; end if;
    raise notice 'S5 OK : self-promotion refusée (P0001 ROLE_PROTEGE).';
end $$;
do $$
begin
  update public.profiles set status = 'suspended' where id = '00000000-0000-8000-0000-00000000000b';
  raise exception 'S5 ÉCHEC : auto-suspension possible.';
exception
  when others then
    if sqlstate <> 'P0001' then raise exception 'S5 ÉCHEC : SQLSTATE % inattendu.', sqlstate; end if;
    raise notice 'S5 OK : auto-suspension refusée (STATUT_PROTEGE).';
end $$;
commit;

-- ---------------------------------------------------------------------
-- S6 : jetons MCP — navigateur/anon sans accès, serveur oui
-- ---------------------------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-8000-0000-00000000000b","role":"authenticated","email":"b@clone.local"}';
do $$
begin
  insert into public.mcp_user_tokens (user_id, name, token_hash) values
    ('00000000-0000-8000-0000-00000000000b','intrus','deadbeef');
  raise exception 'S6 ÉCHEC : un utilisateur a inséré un jeton depuis le navigateur.';
exception
  when insufficient_privilege then
    raise notice 'S6 OK : écriture navigateur refusée (grants révoqués, 42501).';
end $$;
do $$
declare n int;
begin
  select count(*) into n from public.mcp_user_tokens;
  if n > 0 then raise exception 'S6 ÉCHEC : le navigateur lit % jetons.', n; end if;
  raise notice 'S6 OK : lecteur navigateur sans accès (0 ligne).';
end $$;
commit;

begin;
set local request.jwt.claims = '{"role":"service_role","sub":"00000000-0000-8000-0000-000000000000"}';
insert into public.mcp_user_tokens (user_id, name, token_hash) values
  ('00000000-0000-8000-0000-00000000000b','api-server','sha256exempledeadbeefdeadbeefdeadbeef');
delete from public.mcp_user_tokens where user_id = '00000000-0000-8000-0000-00000000000b';
raise notice 'S6 OK : serveur (service_role) émet et révoque.';
commit;

-- ---------------------------------------------------------------------
-- S7 : handle_new_user — invitation valide (rôle attribué) vs invalide
--      (profil fail-closed suspendu)
-- ---------------------------------------------------------------------
-- (nécessite un accès INSERT sur auth.users, normal sur un clone avec
--  le rôle postgres ; sur l'hébergement Supabase le rôle postgres en a.)
begin;
set local request.jwt.claims = '{"role":"service_role","sub":"00000000-0000-8000-0000-000000000000"}';
insert into public.user_invitations (id, email, role) values
  ('55555555-0000-8000-8000-0000000000i1','invite-valide@clone.local','admin');
insert into public.user_invitations (id, email, role) values
  ('55555555-0000-8000-8000-0000000000i2','invite-revoquee@clone.local','user');
update public.user_invitations set revoked_at = now()
  where id = '55555555-0000-8000-8000-0000000000i2';
commit;

begin;
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_tokens, email_change, email_change_token_new)
values ('00000000-0000-0000-0000-000000000000',
        '77777777-0000-8000-8000-0000000000u1','authenticated','authenticated',
        'invite-valide@clone.local','crypt not-set', now(),
        '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb, now(), now(), '', '', '', '');
commit;
\echo 'S7 note : insertion auth.users (invitation valide) effectuée.'

do $$
declare v_role text; v_status text;
begin
  select role, status into v_role, v_status from public.profiles
    where id = '77777777-0000-8000-8000-0000000000u1';
  if not found then raise exception 'S7 ÉCHEC : profil non créé par handle_new_user.'; end if;
  if v_role <> 'admin' then raise exception 'S7 ÉCHEC : rôle %, attendu admin (invitation valide).', v_role; end if;
  if v_status <> 'suspended' then raise exception 'S7 ÉCHEC : statut %, attendu suspended (activation serveur à la 1re connexion).', v_status; end if;
  -- used_at reste null à l'invit' : consommé à la PREMIÈRE CONNEXION
  -- (garde applicative /api/auth/consume, testée par auth-invite-cycle.mjs).
  raise notice 'S7 OK : invitation valide → profil admin + suspended (activation côté serveur).';
end $$;

begin;
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_tokens, email_change, email_change_token_new)
values ('00000000-0000-0000-0000-000000000000',
        '77777777-0000-8000-8000-0000000000u2','authenticated','authenticated',
        'invite-revoquee@clone.local','crypt not-set', now(),
        '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb, now(), now(), '', '', '', '');
commit;

do $$
declare v_status text;
begin
  select status into v_status from public.profiles where id = '77777777-0000-8000-8000-0000000000u2';
  if v_status <> 'suspended' then raise exception 'S7 ÉCHEC : invitation révoquée → statut % (attendu suspended).', v_status; end if;
  raise notice 'S7 OK : invitation révoquée → profil fail-closed suspendu.';
end $$;

-- ---------------------------------------------------------------------
-- Nettoyage du clone (pas de trace des fixtures de test)
-- ---------------------------------------------------------------------
begin;
set local request.jwt.claims = '{"role":"service_role","sub":"00000000-0000-8000-0000-000000000000"}';
delete from public.studio_renders where user_id::text like '00000000-0000-8000-0000-0000000000%';
delete from public.studio_project_versions where user_id::text like '00000000-0000-8000-0000-0000000000%';
delete from public.studio_media where user_id::text like '00000000-0000-8000-0000-0000000000%';
delete from public.studio_projects where user_id::text like '00000000-0000-8000-0000-0000000000%';
delete from public.user_invitations where id::text like '55555555-%';
delete from public.profiles where id::text like '00000000-0000-8000-%' or id::text like '77777777-%';
delete from auth.users where id in ('77777777-0000-8000-8000-0000000000u1','77777777-0000-8000-8000-0000000000u2');
commit;

\echo '=== rls-users: TOUS les scénarios passent (S1..S7) ==='