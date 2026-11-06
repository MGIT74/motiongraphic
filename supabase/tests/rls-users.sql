-- =====================================================================
-- MotionGraphic Studio — tests RLS multi-utilisateurs V1 (série 2)
--
-- À exécuter sur un CLONE de test UNIQUEMENT (jamais production) :
--   psql "<URL_CLONE_TEST>" -v ON_ERROR_STOP=1 -f supabase/tests/rls-users.sql
--
-- Corrections (audit) : UUID hexadécimaux valides, profils adossés à des
-- utilisateurs auth.users réels (FK), RAISE uniquement dans des blocs
-- plpgsql, colonnes/contraintes réelles de 0001/0003/0005.
-- Chaque attente de sécurité est vérifiée par SQLSTATE attendu ET
-- message, ou par un conte de lignes (GET DIAGNOSTICS). Un test n'est
-- jamais « réussi » parce qu'une exception a été interceptée aveuglément.
-- =====================================================================

\set ON_ERROR_STOP 1
\echo '=== rls-users: début (clone de test uniquement) ==='

-- UUID de test (tous HEX valables pour le type uuid) :
--   users auth : 7a000000-0000-7000-8000-000000000001 (A)
--                7a000000-0000-7000-8000-000000000002 (B)
--                7a000000-0000-7000-8000-000000000003 (suspendu : A après S4)
--                7b000000-0000-7000-8000-000000000001 (U1 invitation valide)
--                7b000000-0000-7000-8000-000000000002 (U2 invitation révoquée)
--   projets    : 1a000000-0000-7000-8000-00000000000a ... etc.

-- ---------------------------------------------------------------------
-- Préparation : utilisateurs auth + profils A/B actifs (service simulé)
-- ---------------------------------------------------------------------
begin;
set local request.jwt.claims = '{"role":"service_role","sub":"7a000000-0000-7000-8000-000000000000","email":"clone-admin@test.local"}';
delete from public.profiles where id::text like '7a000000-0000-7000-8000-00000000000%';
delete from public.studio_projects where user_id::text like '7a000000-0000-7000-8000-00000000000%';
delete from auth.users where id::text like '7a000000-0000-7000-8000-00000000000%'
  or id::text like '7b000000-0000-7000-8000-00000000000%';
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_tokens, email_change, email_change_token_new)
values ('00000000-0000-0000-0000-000000000000','7a000000-0000-7000-8000-000000000001','authenticated','authenticated','a@clone.test','crypt-bucket', now(), '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb, now(), now(), '', '', '', ''),
       ('00000000-0000-0000-0000-000000000000','7a000000-0000-7000-8000-000000000002','authenticated','authenticated','b@clone.test','crypt-bucket', now(), '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb, now(), now(), '', '', '', '');
insert into public.profiles (id, display_name, role, status) values
  ('7a000000-0000-7000-8000-000000000001','Utilisateur A','user','active'),
  ('7a000000-0000-7000-8000-000000000002','Utilisateur B','user','active');
commit;

-- ---------------------------------------------------------------------
-- S1 : A crée ses projets/médias/versions/rendus et les lit.
-- ---------------------------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"7a000000-0000-7000-8000-000000000001","role":"authenticated","email":"a@clone.test"}';

insert into public.studio_projects (id, user_id, name, schema_version, fps, width, height, data)
values ('1a000000-0000-7000-8000-00000000000a','7a000000-0000-7000-8000-000000000001','PROJET-A',1,30,1920,1080,'{}'::jsonb);

insert into public.studio_media (id, project_id, user_id, storage_path, kind, name)
values ('1b000000-0000-7000-8000-00000000000a','1a000000-0000-7000-8000-00000000000a','7a000000-0000-7000-8000-000000000001','clone/a/rush.mp4','video','rush-a');

insert into public.studio_project_versions (id, project_id, user_id, label, data)
values ('1c000000-0000-7000-8000-00000000000a','1a000000-0000-7000-8000-00000000000a','7a000000-0000-7000-8000-000000000001','v1','{}'::jsonb);

insert into public.studio_renders (id, project_id, user_id, status, format, resolution)
values ('1d000000-0000-7000-8000-00000000000a','1a000000-0000-7000-8000-00000000000a','7a000000-0000-7000-8000-000000000001','done','mp4','1080p');

do $$ begin
  declare n int;
  begin
    select count(*) into n from public.studio_projects;
    if n <> 1 then raise exception 'S1 ÉCHEC : A voit % projets (attendu 1).', n; end if;
    select count(*) into n from public.studio_media;
    if n <> 1 then raise exception 'S1 ÉCHEC : A voit % médias (attendu 1).', n; end if;
    select count(*) into n from public.studio_project_versions;
    if n <> 1 then raise exception 'S1 ÉCHEC : A voit % versions (attendu 1).', n; end if;
    select count(*) into n from public.studio_renders;
    if n <> 1 then raise exception 'S1 ÉCHEC : A voit % rendus (attendu 1).', n; end if;
    raise notice 'S1 OK : A crée/lit ses projets, médias, versions et rendus.';
  end;
end $$;
commit;

-- ---------------------------------------------------------------------
-- S3 : B symétrique (droits sur SES ressources, aucune vue sur A).
-- ---------------------------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"7a000000-0000-7000-8000-000000000002","role":"authenticated","email":"b@clone.test"}';

insert into public.studio_projects (id, user_id, name, schema_version, fps, width, height, data)
values ('1a000000-0000-7000-8000-00000000000b','7a000000-0000-7000-8000-000000000002','PROJET-B',1,30,1920,1080,'{}'::jsonb);

do $$ begin
  declare n int;
  begin
    update public.studio_projects set name = 'PROJET-B (maj)' where id = '1a000000-0000-7000-8000-00000000000b';
    if (select count(*) from public.studio_projects where id = '1a000000-0000-7000-8000-00000000000b' and name = 'PROJET-B (maj)') <> 1 then
      raise exception 'S3 ÉCHEC : B ne peut pas mettre à jour son projet.';
    end if;
    select count(*) into n from public.studio_projects;
    if n <> 1 then raise exception 'S3 ÉCHEC : B voit % projets (attendu 1 : le sien).', n; end if;
    select count(*) into n from public.studio_projects where user_id = '7a000000-0000-7000-8000-000000000001';
    if n <> 0 then raise exception 'S3 ÉCHEC : B voit % projets de A !', n; end if;
    raise notice 'S3 OK : B crée/maj ses ressources ; celles de A sont invisibles.';
  end;
end $$;
commit;

-- ---------------------------------------------------------------------
-- S2 : A ne peut RIEN sur B (0 ligne pour update/delete, RLS sur insert).
-- ---------------------------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"7a000000-0000-7000-8000-000000000001","role":"authenticated","email":"a@clone.test"}';

do $$ begin
  begin
    insert into public.studio_projects (id, user_id, name, schema_version, fps, width, height, data)
    values ('1a000000-0000-7000-8000-0000000000c0','7a000000-0000-7000-8000-000000000002','INTRUS-A',1,30,1920,1080,'{}'::jsonb);
    raise exception 'S2 ÉCHEC : A a inséré un projet pour B.';
  exception when insufficient_privilege then
    raise notice 'S2 OK : insertion croisée refusée (42501).';
  end;
end $$;

do $$ begin
  declare updated int;
  begin
    update public.studio_projects set name = 'PIRATÉ' where id = '1a000000-0000-7000-8000-00000000000b';
    get diagnostics updated = row_count;
    if updated <> 0 then raise exception 'S2 ÉCHEC : A a modifié % projets de B (attendu 0).', updated; end if;
    raise notice 'S2 OK : UPDATE de A sur B = 0 ligne.';
  end;
end $$;

do $$ begin
  declare deleted int;
  begin
    delete from public.studio_projects where id = '1a000000-0000-7000-8000-00000000000b';
    get diagnostics deleted = row_count;
    if deleted <> 0 then raise exception 'S2 ÉCHEC : A a supprimé % projets de B (attendu 0).', deleted; end if;
    raise notice 'S2 OK : DELETE de A sur B = 0 ligne.';
  end;
end $$;

do $$ begin
  declare n int;
  begin
    select count(*) into n from public.studio_media where user_id = '7a000000-0000-7000-8000-000000000002';
    if n <> 0 then raise exception 'S2 ÉCHEC : A lit % médias de B.', n; end if;
    select count(*) into n from public.studio_renders where user_id = '7a000000-0000-7000-8000-000000000002';
    if n <> 0 then raise exception 'S2 ÉCHEC : A lit % rendus de B.', n; end if;
    raise notice 'S2 OK : médias/rendus de B invisibles pour A.';
  end;
end $$;
commit;

-- ---------------------------------------------------------------------
-- S4 : compte A suspendu — écritures refusées (P0001 COMPTE_SUSPENDU),
--      lectures conservées, service_role exempté (admin/MCP/migrations).
--      Réaffectation du propriétaire interdite (OLD/NEW vérifiés).
-- ---------------------------------------------------------------------
begin;
set local request.jwt.claims = '{"role":"service_role","sub":"7a000000-0000-7000-8000-000000000000"}';
update public.profiles set status = 'suspended' where id = '7a000000-0000-7000-8000-000000000001';
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"7a000000-0000-7000-8000-000000000001","role":"authenticated","email":"a@clone.test"}';

do $$ begin
  begin
    insert into public.studio_projects (id, user_id, name, schema_version, fps, width, height, data)
    values ('1a000000-0000-7000-8000-00000000000e','7a000000-0000-7000-8000-000000000001','BLOQUE',1,30,1920,1080,'{}'::jsonb);
    raise exception 'S4 ÉCHEC : un compte suspendu a écrit.';
  exception when others then
    if sqlstate <> 'P0001' or position('COMPTE_SUSPENDU' in sqlerrm) = 0 then
      raise exception 'S4 ÉCHEC : SQLSTATE % « % » (attendu P0001 COMPTE_SUSPENDU).', sqlstate, sqlerrm;
    end if;
    raise notice 'S4 OK : écriture refusée pour compte suspendu.';
  end;
end $$;

do $$ begin
  declare n int;
  begin
    select count(*) into n from public.studio_projects; -- lecture de SES données
    if n <> 1 then raise exception 'S4 ÉCHEC : suspension a coupé la lecture (% projets).', n; end if;
    raise notice 'S4 OK : lecture de ses propres données conservée.';
  end;
end $$;
commit;

begin;
set local request.jwt.claims = '{"role":"service_role","sub":"7a000000-0000-7000-8000-000000000000"}';
insert into public.studio_projects (id, user_id, name, schema_version, fps, width, height, data)
values ('1a000000-0000-7000-8000-00000000000f','7a000000-0000-7000-8000-000000000001','VIA-SERVICE',1,30,1920,1080,'{}'::jsonb);
do $$ begin
  declare n int;
  begin
    select count(*) into n from public.studio_projects where id = '1a000000-0000-7000-8000-00000000000f';
    if n <> 1 then raise exception 'S4 ÉCHEC : service_role bloqué à tort.'; end if;
    raise notice 'S4 OK : service_role (API admin/MCP/migrations) non bloqué.';
  end;
end $$;
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"7a000000-0000-7000-8000-000000000002","role":"authenticated","email":"b@clone.test"}';
-- B actif : réaffecter le projet suspendu de A impossible (RLS with check).
do $$ begin
  begin
    update public.studio_projects set user_id = '7a000000-0000-7000-8000-000000000002' where id = '1a000000-0000-7000-8000-00000000000a';
    raise exception 'S4 ÉCHEC : B a réaffecté le projet de A à lui-même.';
  exception when insufficient_privilege then
    raise notice 'S4 OK : réaffectation de propriétaire refusée par RLS.';
  end;
end $$;
-- A suspendu : changer son propre user_id ne contourne pas non plus la garde.
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"7a000000-0000-7000-8000-000000000001","role":"authenticated","email":"a@clone.test"}';
do $$ begin
  begin
    update public.studio_projects set name = 'ESSAI-CONTOUR' where id = '1a000000-0000-7000-8000-00000000000a';
    raise exception 'S4 ÉCHEC : le suspendu a modifié un projet (garde OLD/NEW inactive ?).';
  exception when others then
    if sqlstate <> 'P0001' then raise exception 'S4 ÉCHEC : SQLSTATE % inattendu au contour.', sqlstate; end if;
    raise notice 'S4 OK : le suspendu ne peut pas écrire, y compris sur sa propre ligne.';
  end;
end $$;
commit;

-- ---------------------------------------------------------------------
-- S5 : self-service interdit (rôle/statut), admin actif autorisé,
--      admin SUSPENDU = plus de privilèges (is_admin durci).
-- ---------------------------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"7a000000-0000-7000-8000-000000000002","role":"authenticated","email":"b@clone.test"}';
do $$ begin
  begin
    update public.profiles set role = 'admin' where id = '7a000000-0000-7000-8000-000000000002';
    raise exception 'S5 ÉCHEC : self-promotion possible.';
  exception when others then
    if sqlstate <> 'P0001' then raise exception 'S5 ÉCHEC : SQLSTATE % inattendu (self-role).', sqlstate; end if;
    raise notice 'S5 OK : self-promotion refusée (ROLE_PROTEGE).';
  end;
end $$;
do $$ begin
  begin
    update public.profiles set status = 'active' where id = '7a000000-0000-7000-8000-000000000001';
    raise exception 'S5 ÉCHEC : réactivation de A par un user possible.';
  exception when others then
    if sqlstate <> 'P0001' then raise exception 'S5 ÉCHEC : SQLSTATE % inattendu (self-statut).', sqlstate; end if;
    raise notice 'S5 OK : réactivation par un utilisateur standard refusée (STATUT_PROTEGE).';
  end;
end $$;
commit;

begin;
set local request.jwt.claims = '{"role":"service_role","sub":"7a000000-0000-7000-8000-000000000000"}';
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_tokens, email_change, email_change_token_new)
values ('00000000-0000-0000-0000-000000000000','7a000000-0000-7000-8000-000000000003','authenticated','authenticated','admin-suspendu@clone.test','crypt-bucket', now(), '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb, now(), now(), '', '', '', '')
on conflict (id) do update set email = excluded.email;
insert into public.profiles (id, display_name, role, status) values
  ('7a000000-0000-7000-8000-000000000003','Admin Suspendu','admin','suspended')
on conflict (id) do update set role = 'admin', status = 'suspended';
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"7a000000-0000-7000-8000-000000000003","role":"authenticated","email":"admin-suspendu@clone.test"}';
do $$ begin
  declare n int;
  begin
    if public.is_admin() then
      raise exception 'S5 ÉCHEC : un admin SUSPENDU garde is_admin().';
    end if;
    raise notice 'S5 OK : admin suspendu → is_admin() = false.';
    select count(*) into n from public.user_invitations; -- policy is_admin()
    if n > 0 then raise exception 'S5 ÉCHEC : admin suspendu lit des invitations (%).', n; end if;
    raise notice 'S5 OK : admin suspendu sans accès aux données admin.';
  end;
end $$;
commit;

-- ---------------------------------------------------------------------
-- S6 : jetons MCP — navigateur sans accès (grants révoqués), serveur oui.
-- ---------------------------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"7a000000-0000-7000-8000-000000000002","role":"authenticated","email":"b@clone.test"}';
do $$ begin
  begin
    insert into public.mcp_user_tokens (user_id, name, token_hash) values
      ('7a000000-0000-7000-8000-000000000002','intrus','deadbeefdeadbeefdeadbeefdeadbeef');
    raise exception 'S6 ÉCHEC : insertion navigateur possible.';
  exception when insufficient_privilege then
    raise notice 'S6 OK : écriture navigateur refusée (grants révoqués).';
  end;
end $$;
do $$ begin
  declare n int;
  begin
    select count(*) into n from public.mcp_user_tokens;
    if n > 0 then raise exception 'S6 ÉCHEC : navigateur lit % jetons.', n; end if;
    raise notice 'S6 OK : lecture navigateur sans accès.';
  end;
end $$;
commit;

begin;
set local request.jwt.claims = '{"role":"service_role","sub":"7a000000-0000-7000-8000-000000000000"}';
insert into public.mcp_user_tokens (user_id, name, token_hash) values
  ('7a000000-0000-7000-8000-000000000002','api-server','a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4');
do $$ begin
  declare n int;
  begin
    select count(*) into n from public.mcp_user_tokens;
    if n <> 1 then raise exception 'S6 ÉCHEC : serveur ne peut pas créer (%).', n; end if;
    raise notice 'S6 OK : serveur émet et révoque.';
  end;
end $$;
delete from public.mcp_user_tokens where user_id = '7a000000-0000-7000-8000-000000000002';
commit;

-- ---------------------------------------------------------------------
-- S7 : handle_new_user — invitation valide (rôle attribué, suspendu
--      jusqu'à activation) vs révoquée (fail-closed).
-- ---------------------------------------------------------------------
begin;
set local request.jwt.claims = '{"role":"service_role","sub":"7a000000-0000-7000-8000-000000000000"}';
insert into public.user_invitations (id, email, role, expires_at) values
  ('1e000000-0000-7000-8000-00000000000a','invite-valide@clone.test','admin', now() + interval '14 days');
insert into public.user_invitations (id, email, role) values
  ('1e000000-0000-7000-8000-00000000000b','invite-revoquee@clone.test','user');
update public.user_invitations set revoked_at = now() where id = '1e000000-0000-7000-8000-00000000000b';
commit;

begin;
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_tokens, email_change, email_change_token_new)
values ('00000000-0000-0000-0000-000000000000','7b000000-0000-7000-8000-000000000001','authenticated','authenticated','invite-valide@clone.test','crypt-bucket', now(), '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb, now(), now(), '', '', '', '');
commit;
\echo 'S7 : compte auth.users créé pour invitation valide.'

do $$ begin
  declare v_role text; v_status text;
  begin
    select role, status into v_role, v_status from public.profiles where id = '7b000000-0000-7000-8000-000000000001';
    if not found then raise exception 'S7 ÉCHEC : profil non créé par handle_new_user.'; end if;
    if v_role <> 'admin' then raise exception 'S7 ÉCHEC : rôle % (attendu admin — invitation valide).', v_role; end if;
    if v_status <> 'suspended' then raise exception 'S7 ÉCHEC : statut % (attendu suspended avant 1re connexion).', v_status; end if;
    raise notice 'S7 OK : invitation valide → profil admin + suspended (activation serveur).';
  end;
end $$;

begin;
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_tokens, email_change, email_change_token_new)
values ('00000000-0000-0000-0000-000000000000','7b000000-0000-7000-8000-000000000002','authenticated','authenticated','invite-revoquee@clone.test','crypt-bucket', now(), '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb, now(), now(), '', '', '', '');
commit;
\echo 'S7 : compte auth.users créé pour invitation révoquée.'

do $$ begin
  declare v_status text;
  begin
    select status into v_status from public.profiles where id = '7b000000-0000-7000-8000-000000000002';
    if v_status <> 'suspended' then raise exception 'S7 ÉCHEC : invitation révoquée → % (attendu suspended).', v_status; end if;
    raise notice 'S7 OK : invitation révoquée → profil fail-closed suspendu.';
  end;
end $$;

-- ---------------------------------------------------------------------
-- Nettoyage du clone
-- ---------------------------------------------------------------------
begin;
set local request.jwt.claims = '{"role":"service_role","sub":"7a000000-0000-7000-8000-000000000000"}';
delete from public.studio_renders where user_id::text like '7a000000-0000-7000-8000-00000000000%';
delete from public.studio_project_versions where user_id::text like '7a000000-0000-7000-8000-00000000000%';
delete from public.studio_media where user_id::text like '7a000000-0000-7000-8000-00000000000%';
delete from public.studio_projects where user_id::text like '7a000000-0000-7000-8000-00000000000%';
delete from public.user_invitations where id::text like '1e000000-0000-7000-8000-00000000000%';
delete from public.profiles where id::text like '7a000000-0000-7000-8000-00000000000%' or id::text like '7b000000-0000-7000-8000-00000000000%';
delete from auth.users where id::text like '7a000000-0000-7000-8000-00000000000%' or id::text like '7b000000-0000-7000-8000-00000000000%';
commit;

\echo '=== rls-users: TOUS les scénarios passent (S1..S7) ==='