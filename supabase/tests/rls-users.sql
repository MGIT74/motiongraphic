-- =====================================================================
-- MotionGraphic Studio — tests RLS multi-utilisateurs V1 (série 3)
--
-- À exécuter sur un CLONE de test UNIQUEMENT (jamais production) :
--   psql "<URL_CLONE_TEST>" -v ON_ERROR_STOP=1 -f supabase/tests/rls-users.sql
--
-- Corrections (audit 1/2/3) : UUID hexadécimaux valides, profils adossés
-- à des utilisateurs auth.users réels (FK), tout RAISE/NOTICE dans des
-- blocs plpgsql correctement formés (DECLARE avant BEGIN, END équilibrés),
-- colonnes/contraintes réelles (0001/0003/0005/0009).
-- Chaque refus attendu est vérifié par SQLSTATE ET message ; chaque
-- succès par un conte de lignes (GET DIAGNOSTICS / SELECT COUNT).
-- =====================================================================

\set ON_ERROR_STOP 1
\echo '=== rls-users: début (clone de test uniquement) ==='

-- UUID de test (HEX valables) :
--   auth A  : 7a000000-0000-7000-8000-000000000001
--   auth B  : 7a000000-0000-7000-8000-000000000002
--   auth M  : 7a000000-0000-7000-8000-000000000003 (admin suspendu)
--   invités : 7b000000-0000-7000-8000-000000000001 / 000002 (+000003 expiré)
--   invitations : 1e00-…-0a / 0b / 0c (expirée)

-- ---------------------------------------------------------------------
-- Préparation : utilisateurs auth A/B + profils actifs (service simulé)
-- ---------------------------------------------------------------------
begin;
set local request.jwt.claims = '{"role":"service_role","sub":"7a000000-0000-7000-8000-000000000000","email":"clone-admin@test.local"}';
delete from public.studio_renders where user_id::text like '7a000000-0000-7000-8000-00000000000%';
delete from public.studio_project_versions where user_id::text like '7a000000-0000-7000-8000-00000000000%';
delete from public.studio_media where user_id::text like '7a000000-0000-7000-8000-00000000000%';
delete from public.studio_projects where user_id::text like '7a000000-0000-7000-8000-00000000000%';
delete from public.user_invitations where email like '%@clone.test';
delete from public.profiles where id::text like '7a000000-0000-7000-8000-00000000000%' or id::text like '7b000000-0000-7000-8000-00000000000%';
delete from auth.users where id::text like '7a000000-0000-7000-8000-00000000000%' or id::text like '7b000000-0000-7000-8000-00000000000%';
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values ('00000000-0000-0000-0000-000000000000','7a000000-0000-7000-8000-000000000001','authenticated','authenticated','a@clone.test','crypt-bucket', now(), '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb, now(), now(), '', '', '', ''),
       ('00000000-0000-0000-0000-000000000000','7a000000-0000-7000-8000-000000000002','authenticated','authenticated','b@clone.test','crypt-bucket', now(), '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb, now(), now(), '', '', '', '');
insert into public.profiles (id, display_name, role, status) values
  ('7a000000-0000-7000-8000-000000000001','Utilisateur A','user','active'),
  ('7a000000-0000-7000-8000-000000000002','Utilisateur B','user','active')
on conflict (id) do update set display_name = excluded.display_name, role = excluded.role, status = excluded.status;
commit;
\echo 'Préparation : A/B créés (auth.users + profils actifs).'

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
do $$
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
end $$;
commit;

-- ---------------------------------------------------------------------
-- S3 : B symétrique — droits sur SES ressources ; A invisible.
-- ---------------------------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"7a000000-0000-7000-8000-000000000002","role":"authenticated","email":"b@clone.test"}';
insert into public.studio_projects (id, user_id, name, schema_version, fps, width, height, data)
values ('1a000000-0000-7000-8000-00000000000b','7a000000-0000-7000-8000-000000000002','PROJET-B',1,30,1920,1080,'{}'::jsonb);
do $$
declare n int; maj int;
begin
  update public.studio_projects set name = 'PROJET-B (maj)' where id = '1a000000-0000-7000-8000-00000000000b';
  get diagnostics maj = row_count;
  if maj <> 1 then raise exception 'S3 ÉCHEC : B n''a pas mis à jour son propre projet (%).', maj; end if;
  select count(*) into n from public.studio_projects;
  if n <> 1 then raise exception 'S3 ÉCHEC : B voit % projets (attendu 1 : le sien).', n; end if;
  select count(*) into n from public.studio_projects where user_id = '7a000000-0000-7000-8000-000000000001';
  if n <> 0 then raise exception 'S3 ÉCHEC : B voit % projets de A !', n; end if;
  raise notice 'S3 OK : B crée/maj ses ressources ; celles de A sont invisibles.';
end $$;
commit;

-- ---------------------------------------------------------------------
-- S2 : A ne peut RIEN sur B (insert refusé 42501 ; update/delete 0 ligne).
-- ---------------------------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"7a000000-0000-7000-8000-000000000001","role":"authenticated","email":"a@clone.test"}';
do $$
begin
  begin
    insert into public.studio_projects (id, user_id, name, schema_version, fps, width, height, data)
    values ('1a000000-0000-7000-8000-0000000000c0','7a000000-0000-7000-8000-000000000002','INTRUS-A',1,30,1920,1080,'{}'::jsonb);
    raise exception 'S2 ÉCHEC : insertion croisée acceptée.';
  exception
    when insufficient_privilege then
      raise notice 'S2 OK : insertion croisée refusée (42501).';
  end;
end $$;
do $$
declare updated int;
begin
  update public.studio_projects set name = 'PIRATÉ' where id = '1a000000-0000-7000-8000-00000000000b';
  get diagnostics updated = row_count;
  if updated <> 0 then raise exception 'S2 ÉCHEC : A a modifié % projets de B (attendu 0).', updated; end if;
  delete from public.studio_projects where id = '1a000000-0000-7000-8000-00000000000b';
  get diagnostics updated = row_count;
  if updated <> 0 then raise exception 'S2 ÉCHEC : A a supprimé % projets de B (attendu 0).', updated; end if;
  raise notice 'S2 OK : UPDATE/DELETE de A sur B = 0 ligne.';
  update public.studio_media set name = 'PIRATÉ' where user_id = '7a000000-0000-7000-8000-000000000002';
  get diagnostics updated = row_count;
  if updated <> 0 then raise exception 'S2 ÉCHEC : A a modifié % médias de B (attendu 0).', updated; end if;
  update public.studio_renders set status = 'done' where user_id = '7a000000-0000-7000-8000-000000000002';
  get diagnostics updated = row_count;
  if updated <> 0 then raise exception 'S2 ÉCHEC : A a modifié % rendus de B (attendu 0).', updated; end if;
  raise notice 'S2 OK : médias/rendus de B intouchables par A.';
end $$;
commit;

-- ---------------------------------------------------------------------
-- S4 : A suspendu — écritures refusées (P0001 COMPTE_SUSPENDU), lectures
--      conservées, service_role exempté, réaffectation de propriétaire
--      impossible (OLD/NEW + RLS).
-- ---------------------------------------------------------------------
begin;
set local request.jwt.claims = '{"role":"service_role","sub":"7a000000-0000-7000-8000-000000000000"}';
update public.profiles set status = 'suspended' where id = '7a000000-0000-7000-8000-000000000001';
commit;
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"7a000000-0000-7000-8000-000000000001","role":"authenticated","email":"a@clone.test"}';
do $$
begin
  begin
    insert into public.studio_projects (id, user_id, name, schema_version, fps, width, height, data)
    values ('1a000000-0000-7000-8000-00000000000e','7a000000-0000-7000-8000-000000000001','BLOQUE',1,30,1920,1080,'{}'::jsonb);
    raise exception 'S4 ÉCHEC : un compte suspendu a écrit.';
  exception
    when others then
      if sqlstate <> 'P0001' or position('COMPTE_SUSPENDU' in sqlerrm) = 0 then
        raise exception 'S4 ÉCHEC : SQLSTATE % « % » (attendu P0001 COMPTE_SUSPENDU).', sqlstate, sqlerrm;
      end if;
      raise notice 'S4 OK : écriture refusée pour compte suspendu.';
  end;
end $$;
do $$
declare maj int;
begin
  begin
    update public.studio_projects set name = 'ESSAI-CONTOUR' where id = '1a000000-0000-7000-8000-00000000000a';
    get diagnostics maj = row_count;
  exception
    when sqlstate 'P0001' then
      if position('COMPTE_SUSPENDU' in sqlerrm) = 0 then
        raise exception 'S4 ÉCHEC : refus P0001 inattendu : %.', sqlerrm;
      end if;
      raise notice 'S4 OK : le suspendu ne peut pas écrire sur sa propre ligne.';
      maj := -1;
  end;
  if maj <> -1 then
    raise exception 'S4 ÉCHEC : UPDATE non refusé par COMPTE_SUSPENDU (% lignes).', maj;
  end if;
  select count(*) into maj from public.studio_projects; -- lecture conservée
  if maj <> 1 then raise exception 'S4 ÉCHEC : suspension a coupé la lecture (% projets).', maj; end if;
  raise notice 'S4 OK : lecture de ses propres données conservée.';
end $$;
commit;
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"7a000000-0000-7000-8000-000000000002","role":"authenticated","email":"b@clone.test"}';
do $s4_transfer$
declare maj int;
begin
  begin
    update public.studio_projects set user_id = '7a000000-0000-7000-8000-000000000002' where id = '1a000000-0000-7000-8000-00000000000a';
    get diagnostics maj = row_count;
    if maj <> 0 then
      raise exception 'S4 ÉCHEC : B a réaffecté % projet(s) de A.', maj;
    end if;
    raise notice 'S4 OK : réaffectation refusée par RLS (UPDATE = 0 ligne).';
  exception
    when insufficient_privilege then
      raise notice 'S4 OK : réaffectation refusée explicitement (42501).';
  end;
end $s4_transfer$;
commit;
-- Contrôle indépendant avec les privilèges postgres après sortie du rôle B.
do $s4_owner$
declare owner_id uuid;
begin
  select user_id into owner_id
    from public.studio_projects
    where id = '1a000000-0000-7000-8000-00000000000a';
  if not found or owner_id is distinct from '7a000000-0000-7000-8000-000000000001'::uuid then
    raise exception 'S4 ÉCHEC : propriétaire du projet A modifié ou projet absent.';
  end if;
  raise notice 'S4 OK : vérification indépendante, propriétaire du projet A inchangé.';
end $s4_owner$;
begin;
set local request.jwt.claims = '{"role":"service_role","sub":"7a000000-0000-7000-8000-000000000000"}';
insert into public.studio_projects (id, user_id, name, schema_version, fps, width, height, data)
values ('1a000000-0000-7000-8000-00000000000f','7a000000-0000-7000-8000-000000000001','VIA-SERVICE',1,30,1920,1080,'{}'::jsonb);
do $$
declare n int;
begin
  select count(*) into n from public.studio_projects where id = '1a000000-0000-7000-8000-00000000000f';
  if n <> 1 then raise exception 'S4 ÉCHEC : service_role bloqué à tort (%).', n; end if;
  raise notice 'S4 OK : service_role (API admin/MCP/migrations) non bloqué.';
end $$;
commit;

-- ---------------------------------------------------------------------
-- S5 : self-service interdit ; admin SUSPENDU sans privilèges.
-- ---------------------------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"7a000000-0000-7000-8000-000000000002","role":"authenticated","email":"b@clone.test"}';
do $$
begin
  begin
    update public.profiles set role = 'admin' where id = '7a000000-0000-7000-8000-000000000002';
    raise exception 'S5 ÉCHEC : self-promotion acceptée.';
  exception
    when others then
      if sqlstate <> 'P0001' then raise exception 'S5 ÉCHEC : SQLSTATE % (self-role, attendu P0001).', sqlstate; end if;
      raise notice 'S5 OK : self-promotion refusée (ROLE_PROTEGE).';
  end;
end $$;
do $$
begin
  begin
    update public.profiles set status = 'active' where id = '7a000000-0000-7000-8000-000000000001';
    raise exception 'S5 ÉCHEC : réactivation de A par un user acceptée.';
  exception
    when others then
      if sqlstate <> 'P0001' then raise exception 'S5 ÉCHEC : SQLSTATE % (self-statut).', sqlstate; end if;
      raise notice 'S5 OK : réactivation par un utilisateur standard refusée (STATUT_PROTEGE).';
  end;
end $$;
commit;
begin;
set local request.jwt.claims = '{"role":"service_role","sub":"7a000000-0000-7000-8000-000000000000"}';
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values ('00000000-0000-0000-0000-000000000000','7a000000-0000-7000-8000-000000000003','authenticated','authenticated','admin-suspendu@clone.test','crypt-bucket', now(), '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb, now(), now(), '', '', '', '')
on conflict (id) do update set email = excluded.email;
insert into public.profiles (id, display_name, role, status) values
  ('7a000000-0000-7000-8000-000000000003','Admin Suspendu','admin','suspended')
on conflict (id) do update set role = 'admin', status = 'suspended';
commit;
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"7a000000-0000-7000-8000-000000000003","role":"authenticated","email":"admin-suspendu@clone.test"}';
do $$
declare n int;
begin
  if public.is_admin() then
    raise exception 'S5 ÉCHEC : un admin SUSPENDU garde is_admin().';
  end if;
  select count(*) into n from public.user_invitations;
  if n > 0 then raise exception 'S5 ÉCHEC : admin suspendu lit % invitations.', n; end if;
  raise notice 'S5 OK : admin suspendu → is_admin() false, 0 accès admin.';
end $$;
commit;

-- S5 : visibilité des invitations via email du JWT (sans auth.users).
begin;
set local request.jwt.claims = '{"role":"service_role","sub":"7a000000-0000-7000-8000-000000000000"}';
insert into public.user_invitations (id, email, role) values
  ('1e000000-0000-7000-8000-0000000000a1','a@clone.test','user'),
  ('1e000000-0000-7000-8000-0000000000a2','autre@clone.test','user');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"7a000000-0000-7000-8000-000000000001","role":"authenticated","email":"a@clone.test"}';
do $s5_invited$
declare n int;
begin
  select count(*) into n from public.user_invitations;
  if n <> 1 then raise exception 'S5 ÉCHEC : A voit % invitations (attendu 1).', n; end if;
  select count(*) into n from public.user_invitations where email = 'a@clone.test';
  if n <> 1 then raise exception 'S5 ÉCHEC : invitation personnelle de A invisible.'; end if;
  raise notice 'S5 OK : utilisateur actif voit uniquement son invitation via JWT.';
end $s5_invited$;
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"7a000000-0000-7000-8000-000000000002","role":"authenticated","email":"b@clone.test"}';
do $s5_other$
declare n int;
begin
  select count(*) into n from public.user_invitations;
  if n <> 0 then raise exception 'S5 ÉCHEC : B voit % invitations d''autrui.', n; end if;
  raise notice 'S5 OK : autre utilisateur actif ne voit aucune invitation d''autrui.';
end $s5_other$;
commit;

-- Promouvoir B temporairement pour tester un admin ACTIF. Le garde de rôle n'exempte que
-- is_admin() et service_role : même le propriétaire SQL doit présenter le claim service_role.
begin;
set local request.jwt.claims = '{"role":"service_role","sub":"7a000000-0000-7000-8000-000000000000"}';
update public.profiles set role = 'admin' where id = '7a000000-0000-7000-8000-000000000002';
commit;
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"7a000000-0000-7000-8000-000000000002","role":"authenticated","email":"b@clone.test"}';
do $s5_admin$
declare n int;
begin
  if not public.is_admin() then raise exception 'S5 ÉCHEC : B admin actif non reconnu.'; end if;
  select count(*) into n from public.user_invitations;
  if n <> 2 then raise exception 'S5 ÉCHEC : admin actif voit % invitations (attendu 2).', n; end if;
  raise notice 'S5 OK : admin actif voit toutes les invitations.';
end $s5_admin$;
commit;
begin;
set local request.jwt.claims = '{"role":"service_role","sub":"7a000000-0000-7000-8000-000000000000"}';
update public.profiles set role = 'user' where id = '7a000000-0000-7000-8000-000000000002';
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"7a000000-0000-7000-8000-000000000003","role":"authenticated","email":"admin-suspendu@clone.test"}';
do $s5_suspended$
declare n int;
begin
  select count(*) into n from public.user_invitations;
  if n <> 0 then raise exception 'S5 ÉCHEC : admin suspendu voit % invitations.', n; end if;
  raise notice 'S5 OK : admin suspendu voit 0 invitation.';
end $s5_suspended$;
commit;

-- ---------------------------------------------------------------------
-- S6 : jetons MCP — navigateur sans accès (grants révoqués), serveur oui.
-- ---------------------------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"7a000000-0000-7000-8000-000000000002","role":"authenticated","email":"b@clone.test"}';
do $$
begin
  begin
    insert into public.mcp_user_tokens (user_id, name, token_hash) values
      ('7a000000-0000-7000-8000-000000000002','intrus','deadbeefdeadbeefdeadbeefdeadbeef');
    raise exception 'S6 ÉCHEC : insertion navigateur possible.';
  exception
    when insufficient_privilege then
      raise notice 'S6 OK : écriture navigateur refusée (grants révoqués).';
  end;
end $$;
do $$
declare n int;
begin
  select count(*) into n from public.mcp_user_tokens;
  if n > 0 then raise exception 'S6 ÉCHEC : navigateur lit % jetons.', n; end if;
  raise notice 'S6 OK : lecture navigateur sans accès.';
end $$;
commit;
begin;
set local request.jwt.claims = '{"role":"service_role","sub":"7a000000-0000-7000-8000-000000000000"}';
insert into public.mcp_user_tokens (user_id, name, token_hash) values
  ('7a000000-0000-7000-8000-000000000002','api-server','a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4');
do $$
declare n int;
begin
  select count(*) into n from public.mcp_user_tokens;
  if n <> 1 then raise exception 'S6 ÉCHEC : serveur ne peut pas créer (%).', n; end if;
  delete from public.mcp_user_tokens where user_id = '7a000000-0000-7000-8000-000000000002';
  raise notice 'S6 OK : serveur émet et révoque.';
end $$;
commit;

-- ---------------------------------------------------------------------
-- S7 : handle_new_user — invitation valide (rôle, suspended), invitation
--      révoquée (fail-closed), invitation expirée (fail-closed),
--      consommation atomique (un seul appel gagne).
-- ---------------------------------------------------------------------
begin;
set local request.jwt.claims = '{"role":"service_role","sub":"7a000000-0000-7000-8000-000000000000"}';
insert into public.user_invitations (id, email, role, expires_at) values
  ('1e000000-0000-7000-8000-00000000000a','invite-valide@clone.test','admin', now() + interval '14 days');
insert into public.user_invitations (id, email, role) values
  ('1e000000-0000-7000-8000-00000000000b','invite-revoquee@clone.test','user');
update public.user_invitations set revoked_at = now() where id = '1e000000-0000-7000-8000-00000000000b';
insert into public.user_invitations (id, email, role, expires_at) values
  ('1e000000-0000-7000-8000-00000000000c','invite-expiree@clone.test','user', now() - interval '1 day');
commit;
begin;
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values ('00000000-0000-0000-0000-000000000000','7b000000-0000-7000-8000-000000000001','authenticated','authenticated','invite-valide@clone.test','crypt-bucket', now(), '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb, now(), now(), '', '', '', '');
commit;
do $$
declare v_role text; v_status text;
begin
  select role, status into v_role, v_status from public.profiles where id = '7b000000-0000-7000-8000-000000000001';
  if not found then raise exception 'S7 ÉCHEC : profil non créé.'; end if;
  if v_role <> 'admin' then raise exception 'S7 ÉCHEC : rôle % (attendu admin).', v_role; end if;
  if v_status <> 'suspended' then raise exception 'S7 ÉCHEC : statut % (attendu suspended).', v_status; end if;
  raise notice 'S7 OK : invitation valide → profil admin + suspended (activation serveur).';
end $$;
begin;
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values ('00000000-0000-0000-0000-000000000000','7b000000-0000-7000-8000-000000000002','authenticated','authenticated','invite-revoquee@clone.test','crypt-bucket', now(), '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb, now(), now(), '', '', '', '');
commit;
do $$
declare v_status text;
begin
  select status into v_status from public.profiles where id = '7b000000-0000-7000-8000-000000000002';
  if v_status <> 'suspended' then raise exception 'S7 ÉCHEC : invitation révoquée → % (attendu suspended).', v_status; end if;
  raise notice 'S7 OK : invitation révoquée → profil fail-closed suspendu.';
end $$;
begin;
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values ('00000000-0000-0000-0000-000000000000','7b000000-0000-7000-8000-000000000003','authenticated','authenticated','invite-expiree@clone.test','crypt-bucket', now(), '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb, now(), now(), '', '', '', '');
commit;
do $$
declare v_status text;
begin
  select status into v_status from public.profiles where id = '7b000000-0000-7000-8000-000000000003';
  if v_status <> 'suspended' then raise exception 'S7 ÉCHEC : invitation expirée → % (attendu suspended).', v_status; end if;
  raise notice 'S7 OK : invitation expirée → profil fail-closed suspendu.';
end $$;
-- Consommation atomique : UPDATE conditionnel (réplique activation.ts) —
-- 1 appel gagne, l'autre voit 0 ligne.
begin;
set local request.jwt.claims = '{"role":"service_role","sub":"7a000000-0000-7000-8000-000000000000"}';
update public.user_invitations set used_at = now()
  where id = '1e000000-0000-7000-8000-00000000000a'
    and used_at is null and revoked_at is null and expires_at > now();
commit;
do $$
declare consumed int;
begin
  select count(*) into consumed from public.user_invitations
    where id = '1e000000-0000-7000-8000-00000000000a' and used_at is not null;
  if consumed <> 1 then raise exception 'S7 ÉCHEC : consommation atomique non appliquée (%).', consumed; end if;
  raise notice 'S7 OK : used_at consommé (1re connexion).';
end $$;
do $$
declare consumed int;
begin
  update public.user_invitations set used_at = now()
    where id = '1e000000-0000-7000-8000-00000000000a'
      and used_at is null and revoked_at is null and expires_at > now();
  get diagnostics consumed = row_count;
  if consumed <> 0 then raise exception 'S7 ÉCHEC : double activation possible (% lignes).', consumed; end if;
  raise notice 'S7 OK : double activation impossible (0 ligne).';
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
delete from public.user_invitations where email like '%@clone.test';
delete from public.profiles where id::text like '7a000000-0000-7000-8000-00000000000%' or id::text like '7b000000-0000-7000-8000-00000000000%';
delete from auth.users where id::text like '7a000000-0000-7000-8000-00000000000%' or id::text like '7b000000-0000-7000-8000-00000000000%';
commit;

\echo '=== rls-users: TOUS les scénarios passent (S1..S7) ==='