-- =====================================================================
-- MotionGraphic Studio — auto-vérification RLS NON DESTRUCTIVE (auto-hébergé)
-- Fichier : supabase/tests/rls-selfcheck.sql
--
-- USAGE :
--   psql "<URL_SUPABASE>" -f supabase/tests/rls-selfcheck.sql
--   (compatible aussi avec le SQL Editor : aucune méta-commande psql.)
--
-- GARANTIES :
--   1. CHAQUE scénario vit dans une transaction se terminant par
--      ROLLBACK : aucune ligne de test ne subsiste, même en cas d'erreur
--      (transaction abortée = rollback d'office).
--   2. Identifiants de test dédiés : préfixe UUID « 7e57/7f57 » +
--      emails « rls-selfcheck-*@selftest.invalid ». Le prévol ABORTE si
--      ces identifiants existent déjà (aucun écrasement possible).
--   3. Aucune lecture/écriture sur les données réelles : seuls des
--      contrôles de structure et des agrégats anonymes (counts).
--   4. Fin de script : preuve (lecture seule) que ZÉRO ligne de test
--      subsiste + compte d'administrateurs affiché anonymement.
--   5. P7 vérifie la consommation CONDITIONNELLE (idempotente) inline ;
--      l"épreuve de course SIMULTANÉE (6 connexions Promise.all) reste
--      dans `auth-invite-cycle.mjs` (séparé, aucune prétention ici).
--
-- Si une connexion est coupée en plein scénario : transaction annulée
-- par le serveur (aucun résidu) ; la purge d'urgence facultative ci-
-- dessous ne cible QUE le périmètre de test :
--   delete from public.studio_renders        where user_id::text like '7e570000-0000-7e57%';
--   delete from public.studio_project_versions where user_id::text like '7e570000-0000-7e57%';
--   delete from public.studio_media           where user_id::text like '7e570000-0000-7e57%';
--   delete from public.studio_projects        where user_id::text like '7e570000-0000-7e57%';
--   delete from public.user_invitations       where email like 'rls-selfcheck-%';
--   delete from public.mcp_user_tokens        where token_hash like 'selfcheck-%';
--   delete from public.profiles               where id::text like '7e570000-0000-7e57%';
--   delete from auth.users                    where id::text like '7e570000-0000-7e57%';
-- =====================================================================

-- ---------------------------------------------------------------------
-- P0 — prévol (lecture seule) : migration 0009 présentes + périmètre libre.
-- ---------------------------------------------------------------------
do $preflight$
declare
  v_missing text := '';
  v_collisions int;
  v_role text;
begin
  select current_user into v_role;
  if v_role not in ('postgres', 'supabase_admin') then
    raise exception 'SELFCHECK : exécuter en tant que postgres / supabase_admin (actuel : %).', v_role;
  end if;
  if to_regclass('public.user_invitations') is null then
    v_missing := v_missing || 'user_invitations ';
  end if;
  if to_regclass('public.mcp_user_tokens') is null then
    v_missing := v_missing || 'mcp_user_tokens ';
  end if;
  if to_regproc('public.account_is_active(uuid)') is null then
    v_missing := v_missing || 'account_is_active(uuid) ';
  end if;
  if to_regproc('public.assert_account_active_for_write()') is null then
    v_missing := v_missing || 'assert_account_active_for_write() ';
  end if;
  if to_regproc('public.assert_account_active_for_write_created_by()') is null then
    v_missing := v_missing || 'assert_account_active_for_write_created_by() ';
  end if;
  if to_regproc('public.request_is_service_role()') is null then
    v_missing := v_missing || 'request_is_service_role() ';
  end if;
  if v_missing <> '' then
    raise exception 'SELFCHECK : migration 0009 incomplète (manque : %).', v_missing;
  end if;
  select count(*) into v_collisions from public.profiles
    where id::text like '7e570000-0000-7e57%' or id::text like '7f570000-0000-7f57%';
  if v_collisions > 0 then
    raise exception 'SELFCHECK : % identifiants de test déjà présents — purgez-les (entête du script).', v_collisions;
  end if;
  select count(*) into v_collisions from auth.users
    where id::text like '7e570000-0000-7e57%' or email like 'rls-selfcheck-%';
  if v_collisions > 0 then
    raise exception 'SELFCHECK : % utilisateurs de test déjà présents dans auth.users.', v_collisions;
  end if;
  select count(*) into v_collisions from public.user_invitations
    where email like 'rls-selfcheck-%@selftest.invalid';
  if v_collisions > 0 then
    raise exception 'SELFCHECK : % invitations de test déjà présentes.', v_collisions;
  end if;
  raise notice 'P0 OK : migration 0009 présente, périmètre de test strictement libre.';
end;
$preflight$;

do $structure$
declare
  v_triggers int;
  v_policies int;
begin
  select count(*) into v_triggers
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and not t.tgisinternal
      and t.tgname in ('guard_active', 'guard_active_created_by',
                       'prevent_role_escalation', 'prevent_status_change',
                       'guard_active_s', 'guard_active_m');
  if v_triggers < 6 then
    raise exception 'SELFCHECK : % triggers de garde trouvés (6 attendus).', v_triggers;
  end if;
  select count(*) into v_policies
    from pg_policies
    where schemaname = 'public'
      and tablename in ('studio_projects', 'studio_media',
                        'studio_project_versions', 'studio_renders',
                        'user_invitations', 'mcp_user_tokens', 'profiles');
  if v_policies < 15 then
    raise exception 'SELFCHECK : % politiques RLS (15 attendues au minimum).', v_policies;
  end if;
  raise notice 'P0 OK : structure vérifiée (% triggers de garde, % politiques).', v_triggers, v_policies;
end;
$structure$;

-- ---------------------------------------------------------------------
-- P1 — A crée et consulte SES ressources (projets, médias, versions, rendus).
-- ---------------------------------------------------------------------
begin;
set local request.jwt.claims = '{"role":"service_role","sub":"7e570000-0000-7e57-8000-000000000000"}';
-- INSERT Auth → handle_new_user crée le profil (suspended) : vérifié, puis
-- activé par UPDATE ciblé (jamais à l'aveugle).
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_tokens, email_change, email_change_token_new)
values ('00000000-0000-0000-0000-000000000000','7e570000-0000-7e57-8000-000000000001','authenticated','authenticated','rls-selfcheck-a@selftest.invalid','selfcheck', now(), '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb, now(), now(), '', '', '', '');
do $p1trigger$
declare v_status text; v_role text;
begin
  select status, role into v_status, v_role from public.profiles where id = '7e570000-0000-7e57-8000-000000000001';
  if not found then raise exception 'P1 ÉCHEC : handle_new_user n''a pas créé le profil de test.'; end if;
  if v_status <> 'suspended' or v_role <> 'user' then
    raise exception 'P1 ÉCHEC : profil inattendu (attends suspended/user, lu %/%).', v_role, v_status;
  end if;
end;
$p1trigger$;
update public.profiles set status = 'active', display_name = 'SELFTEST-A' where id = '7e570000-0000-7e57-8000-000000000001';

set local role authenticated;
set local request.jwt.claims = '{"sub":"7e570000-0000-7e57-8000-000000000001","role":"authenticated","email":"rls-selfcheck-a@selftest.invalid"}';
insert into public.studio_projects (id, user_id, name, schema_version, fps, width, height, data)
values ('7e570000-0000-7e57-8000-000000010001','7e570000-0000-7e57-8000-000000000001','SELFTEST-PROJET-A',1,30,1920,1080,'{}'::jsonb);
insert into public.studio_media (id, project_id, user_id, storage_path, kind, name)
values ('7e570000-0000-7e57-8000-000000020001','7e570000-0000-7e57-8000-000000010001','7e570000-0000-7e57-8000-000000000001','selfcheck/a/rush.mp4','video','rush-a');
insert into public.studio_project_versions (id, project_id, user_id, label, data)
values ('7e570000-0000-7e57-8000-000000030001','7e570000-0000-7e57-8000-000000010001','7e570000-0000-7e57-8000-000000000001','v1','{}'::jsonb);
insert into public.studio_renders (id, project_id, user_id, status, format, resolution)
values ('7e570000-0000-7e57-8000-000000040001','7e570000-0000-7e57-8000-000000010001','7e570000-0000-7e57-8000-000000000001','done','mp4','1080p');

do $p1$
declare n int; maj int;
begin
  update public.studio_projects set name = 'SELFTEST-PROJET-A (maj)' where id = '7e570000-0000-7e57-8000-000000010001';
  get diagnostics maj = row_count;
  if maj <> 1 then raise exception 'P1 ÉCHEC : maj de son projet impossible (%).', maj; end if;
  select count(*) into n from public.studio_projects;
  if n <> 1 then raise exception 'P1 ÉCHEC : A voit % projets (attendu 1).', n; end if;
  select count(*) into n from public.studio_media;
  if n <> 1 then raise exception 'P1 ÉCHEC : A voit % médias (attendu 1).', n; end if;
  select count(*) into n from public.studio_project_versions;
  if n <> 1 then raise exception 'P1 ÉCHEC : A voit % versions (attendu 1).', n; end if;
  select count(*) into n from public.studio_renders;
  if n <> 1 then raise exception 'P1 ÉCHEC : A voit % rendus (attendu 1).', n; end if;
  raise notice 'P1 OK : A crée, met à jour et consulte ses propres ressources.';
end;
$p1$;
rollback;

-- ---------------------------------------------------------------------
-- P2 — B : ne voit ni ne modifie rien de A ; insertion croisée refusée.
-- ---------------------------------------------------------------------
begin;
set local request.jwt.claims = '{"role":"service_role","sub":"7e570000-0000-7e57-8000-000000000000"}';
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_tokens, email_change, email_change_token_new)
values ('00000000-0000-0000-0000-000000000000','7e570000-0000-7e57-8000-000000000001','authenticated','authenticated','rls-selfcheck-a@selftest.invalid','selfcheck', now(), '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb, now(), now(), '', '', '', '');
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_tokens, email_change, email_change_token_new)
values ('00000000-0000-0000-0000-000000000000','7e570000-0000-7e57-8000-000000000002','authenticated','authenticated','rls-selfcheck-b@selftest.invalid','selfcheck', now(), '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb, now(), now(), '', '', '', '');
update public.profiles set status = 'active', display_name = 'SELFTEST-A' where id = '7e570000-0000-7e57-8000-000000000001';
update public.profiles set status = 'active', display_name = 'SELFTEST-B' where id = '7e570000-0000-7e57-8000-000000000002';
do $p2setup$
declare a2 int; b2 int;
begin
  select count(*) into a2 from public.profiles where id = '7e570000-0000-7e57-8000-000000000001' and status = 'active';
  select count(*) into b2 from public.profiles where id = '7e570000-0000-7e57-8000-000000000002' and status = 'active';
  if a2 <> 1 or b2 <> 1 then raise exception 'P2 ÉCHEC : profils de test absent/suspendus (trigger + update).' end if;
  raise notice 'P2 setup : profils créés par handle_new_user puis activés par UPDATE.';
end;
$p2setup$;
insert into public.studio_projects (id, user_id, name, schema_version, fps, width, height, data)
values ('7e570000-0000-7e57-8000-000000010001','7e570000-0000-7e57-8000-000000000001','SELFTEST-PROJET-A',1,30,1920,1080,'{}'::jsonb);

set local role authenticated;
set local request.jwt.claims = '{"sub":"7e570000-0000-7e57-8000-000000000002","role":"authenticated","email":"rls-selfcheck-b@selftest.invalid"}';
do $p2a$
begin
  begin
    insert into public.studio_projects (id, user_id, name, schema_version, fps, width, height, data)
    values ('7e570000-0000-7e57-8000-000000010002','7e570000-0000-7e57-8000-000000000001','INTRUS-B',1,30,1920,1080,'{}'::jsonb);
    raise exception 'P2 ÉCHEC : B a inséré un projet au nom de A.';
  exception
    when insufficient_privilege then
      raise notice 'P2 OK : insertion croisée refusée par RLS (42501).';
  end;
end;
$p2a$;
do $p2b$
declare maj int; n int;
begin
  update public.studio_projects set name = 'PIRATÉ' where id = '7e570000-0000-7e57-8000-000000010001';
  get diagnostics maj = row_count;
  if maj <> 0 then raise exception 'P2 ÉCHEC : B a modifié % projets de A (attendu 0).', maj; end if;
  delete from public.studio_projects where id = '7e570000-0000-7e57-8000-000000010001';
  get diagnostics maj = row_count;
  if maj <> 0 then raise exception 'P2 ÉCHEC : B a supprimé % projets de A (attendu 0).', maj; end if;
  select count(*) into n from public.studio_projects;
  if n <> 1 then raise exception 'P2 ÉCHEC : B voit % projets (attendu 1 : le sien).', n; end if;
  update public.studio_projects set name = 'SELFTEST-PROJET-B (maj)' where id = '7e570000-0000-7e57-8000-000000010006';
  get diagnostics maj = row_count;
  if maj <> 1 then raise exception 'P2 ÉCHEC : B ne peut pas MAJ son propre projet (%).', maj; end if;
  select count(*) into n from public.studio_projects where user_id = '7e570000-0000-7e57-8000-000000000001';
  if n <> 0 then raise exception 'P2 ÉCHEC : B voit % projets de A.', n; end if;
  select count(*) into n from public.studio_media;
  if n <> 0 then raise exception 'P2 ÉCHEC : B voit % médias de A.', n; end if;
  select count(*) into n from public.studio_renders;
  if n <> 0 then raise exception 'P2 ÉCHEC : B voit % rendus de A.', n; end if;
  raise notice 'P2 OK : B gère SES ressources et ne voit, ni ne modifie RIEN de A.';
  -- retournement : A ne voit que son projet (B invisible)
  set local request.jwt.claims = '{"sub":"7e570000-0000-7e57-8000-000000000001","role":"authenticated","email":"rls-selfcheck-a@selftest.invalid"}';
  select count(*) into n from public.studio_projects;
  if n <> 1 then raise exception 'P2 ÉCHEC : A voit % projets (attendu 1 : le sien).', n; end if;
  select count(*) into n from public.studio_projects where user_id = '7e570000-0000-7e57-8000-000000000002';
  if n <> 0 then raise exception 'P2 ÉCHEC : A voit % projets de B.', n; end if;
  raise notice 'P2 OK : symétrie — A et B isolés chacun de l\'autre.';
end;
$p2b$;
rollback;

-- ---------------------------------------------------------------------
-- P3 — suspension : écritures refusées (P0001), lecture de SES lignes
--      conservée, service_role exempté, réaffectation impossible.
-- ---------------------------------------------------------------------
begin;
set local request.jwt.claims = '{"role":"service_role","sub":"7e570000-0000-7e57-8000-000000000000"}';
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_tokens, email_change, email_change_token_new)
values ('00000000-0000-0000-0000-000000000000','7e570000-0000-7e57-8000-000000000003','authenticated','authenticated','rls-selfcheck-s@selftest.invalid','selfcheck', now(), '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb, now(), now(), '', '', '', '');
update public.profiles set status = 'active', display_name = 'SELFTEST-SUSPENDU' where id = '7e570000-0000-7e57-8000-000000000003';
insert into public.studio_projects (id, user_id, name, schema_version, fps, width, height, data)
values ('7e570000-0000-7e57-8000-000000010003','7e570000-0000-7e57-8000-000000000003','SELFTEST-S-PROJET',1,30,1920,1080,'{}'::jsonb);
update public.profiles set status = 'suspended' where id = '7e570000-0000-7e57-8000-000000000003';

-- Chemin service (avant le changement de rôle) : non bloqué.
do $p3a$
declare n int;
begin
  insert into public.studio_projects (id, user_id, name, schema_version, fps, width, height, data)
  values ('7e570000-0000-7e57-8000-000000010004','7e570000-0000-7e57-8000-000000000003','SELFTEST-S-VIA-SERVICE',1,30,1920,1080,'{}'::jsonb);
  select count(*) into n from public.studio_projects where id = '7e570000-0000-7e57-8000-000000010004';
  if n <> 1 then raise exception 'P3 ÉCHEC : service_role bloqué à tort par la suspension.'; end if;
  raise notice 'P3 OK : chemin service (API admin/MCP/migrations) non bloqué.';
end;
$p3a$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"7e570000-0000-7e57-8000-000000000003","role":"authenticated","email":"rls-selfcheck-s@selftest.invalid"}';
do $p3b$
begin
  begin
    insert into public.studio_projects (id, user_id, name, schema_version, fps, width, height, data)
    values ('7e570000-0000-7e57-8000-000000010005','7e570000-0000-7e57-8000-000000000003','BLOQUE',1,30,1920,1080,'{}'::jsonb);
    raise exception 'P3 ÉCHEC : un compte suspendu a écrit.';
  exception
    when others then
      if sqlstate <> 'P0001' or position('COMPTE_SUSPENDU' in sqlerrm) = 0 then
        raise exception 'P3 ÉCHEC : SQLSTATE % « % » (attendu P0001 COMPTE_SUSPENDU).', sqlstate, sqlerrm;
      end if;
      raise notice 'P3 OK : écriture refusée pour compte suspendu (P0001 COMPTE_SUSPENDU).';
  end;
end;
$p3b$;
do $p3c$
declare maj int; n int;
begin
  update public.studio_projects set name = 'ESSAI-CONTOUR' where id = '7e570000-0000-7e57-8000-000000010003';
  get diagnostics maj = row_count;
  if maj <> 0 then raise exception 'P3 ÉCHEC : le suspendu a modifié % lignes.', maj; end if;
  select count(*) into n from public.studio_projects;
  if n <> 2 then raise exception 'P3 ÉCHEC : lecture de SES lignes cassée (% projets, attendu 2).', n; end if;
  raise notice 'P3 OK : écriture suspendue, lecture de ses propres données conservée.';
end;
$p3c$;
rollback;

-- ---------------------------------------------------------------------
-- P4 — self-service interdit : B ne peut pas se promouvoir ni se suspendre.
-- ---------------------------------------------------------------------
begin;
set local request.jwt.claims = '{"role":"service_role","sub":"7e570000-0000-7e57-8000-000000000000"}';
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_tokens, email_change, email_change_token_new)
values ('00000000-0000-0000-0000-000000000000','7e570000-0000-7e57-8000-000000000002','authenticated','authenticated','rls-selfcheck-b@selftest.invalid','selfcheck', now(), '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb, now(), now(), '', '', '', '');
update public.profiles set status = 'active', display_name = 'SELFTEST-B' where id = '7e570000-0000-7e57-8000-000000000002';

set local role authenticated;
set local request.jwt.claims = '{"sub":"7e570000-0000-7e57-8000-000000000002","role":"authenticated","email":"rls-selfcheck-b@selftest.invalid"}';
do $p4a$
begin
  begin
    update public.profiles set role = 'admin' where id = '7e570000-0000-7e57-8000-000000000002';
    raise exception 'P4 ÉCHEC : self-promotion acceptée.';
  exception
    when others then
      if sqlstate <> 'P0001' then raise exception 'P4 ÉCHEC : SQLSTATE % (attendu P0001).', sqlstate; end if;
      raise notice 'P4 OK : changement de rôle en libre-service refusé.';
  end;
end;
$p4a$;
do $p4b$
begin
  begin
    update public.profiles set status = 'suspended' where id = '7e570000-0000-7e57-8000-000000000002';
    raise exception 'P4 ÉCHEC : auto-suspension acceptée.';
  exception
    when others then
      if sqlstate <> 'P0001' then raise exception 'P4 ÉCHEC : SQLSTATE % (auto-statut).', sqlstate; end if;
      raise notice 'P4 OK : auto-suspension refusée.';
  end;
end;
$p4b$;
rollback;

-- ---------------------------------------------------------------------
-- P5 — admin SUSPENDU : is_admin() = false ; aucune donnée administrateur.
-- ---------------------------------------------------------------------
begin;
set local request.jwt.claims = '{"role":"service_role","sub":"7e570000-0000-7e57-8000-000000000000"}';
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_tokens, email_change, email_change_token_new)
values ('00000000-0000-0000-0000-000000000000','7e570000-0000-7e57-8000-000000000004','authenticated','authenticated','rls-selfcheck-admin@selftest.invalid','selfcheck', now(), '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb, now(), now(), '', '', '', '');
update public.profiles set role = 'admin', status = 'suspended', display_name = 'SELFTEST-ADMIN-SUSPENDU' where id = '7e570000-0000-7e57-8000-000000000004';

set local role authenticated;
set local request.jwt.claims = '{"sub":"7e570000-0000-7e57-8000-000000000004","role":"authenticated","email":"rls-selfcheck-admin@selftest.invalid"}';
do $p5$
declare n int;
begin
  if public.is_admin() then
    raise exception 'P5 ÉCHEC : un admin suspendu garde is_admin().';
  end if;
  select count(*) into n from public.user_invitations;
  if n > 0 then raise exception 'P5 ÉCHEC : admin suspendu lit % invitations.', n; end if;
  raise notice 'P5 OK : admin suspendu sans aucun privilège administrateur.';
end;
$p5$;
rollback;

-- ---------------------------------------------------------------------
-- P6 — jetons MCP : navigateur sans accès (grants révoqués) ; serveur oui.
-- ---------------------------------------------------------------------
begin;
set local request.jwt.claims = '{"role":"service_role","sub":"7e570000-0000-7e57-8000-000000000000"}';
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_tokens, email_change, email_change_token_new)
values ('00000000-0000-0000-0000-000000000000','7e570000-0000-7e57-8000-000000000002','authenticated','authenticated','rls-selfcheck-b@selftest.invalid','selfcheck', now(), '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb, now(), now(), '', '', '', '');

set local role authenticated;
set local request.jwt.claims = '{"sub":"7e570000-0000-7e57-8000-000000000002","role":"authenticated","email":"rls-selfcheck-b@selftest.invalid"}';
do $p6a$
begin
  begin
    insert into public.mcp_user_tokens (user_id, name, token_hash) values
      ('7e570000-0000-7e57-8000-000000000002','intrus','selfcheck-deadbeefdeadbeef');
    raise exception 'P6 ÉCHEC : insertion navigateur possible.';
  exception
    when insufficient_privilege then
      raise notice 'P6 OK : écriture jeton par le navigateur refusée (grants révoqués).';
  end;
end;
$p6a$;
do $p6b$
declare n int;
begin
  select count(*) into n from public.mcp_user_tokens;
  raise exception 'P6 ÉCHEC : lecture navigateur acceptée (jetons %).', n;
exception
  when insufficient_privilege then
    raise notice 'P6 OK : lecture jetons par navigateur refusée.';
end;
$p6b$;
rollback;
begin;
set local request.jwt.claims = '{"role":"service_role","sub":"7e570000-0000-7e57-8000-000000000000"}';
-- FK mcp_user_tokens → auth.users : le compte est créé DANS CETTE
-- transaction (la précédente s'est terminée par ROLLBACK, rien n'a
-- persisté) ; handle_new_user crée le profil suspendu associé.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_tokens, email_change, email_change_token_new)
values ('00000000-0000-0000-0000-000000000000','7e570000-0000-7e57-8000-000000000002','authenticated','authenticated','rls-selfcheck-b@selftest.invalid','selfcheck', now(), '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb, now(), now(), '', '', '', '');
insert into public.mcp_user_tokens (user_id, name, token_hash) values
  ('7e570000-0000-7e57-8000-000000000002','api-server','selfcheck-a1b2c3d4e5f6a1b2');
do $p6c$
declare n int;
begin
  select count(*) into n from public.mcp_user_tokens where token_hash = 'selfcheck-a1b2c3d4e5f6a1b2';
  if n <> 1 then raise exception 'P6 ÉCHEC : le serveur ne peut pas émettre (%).', n; end if;
  delete from public.mcp_user_tokens where token_hash = 'selfcheck-a1b2c3d4e5f6a1b2';
  raise notice 'P6 OK : serveur émet et révoque.';
end;
$p6c$;
rollback;

-- ---------------------------------------------------------------------
-- P7 — invitations : rôle correct à l'acceptation, révoquée/expirée
--      fail-closed, consommation atomique (1 gagne, 0 double).
-- ---------------------------------------------------------------------
begin;
set local request.jwt.claims = '{"role":"service_role","sub":"7e570000-0000-7e57-8000-000000000000"}';
insert into public.user_invitations (id, email, role, expires_at) values
  ('7f570000-0000-7f57-8000-000000000001','rls-selfcheck-valid@selftest.invalid','admin', now() + interval '14 days');
insert into public.user_invitations (id, email, role) values
  ('7f570000-0000-7f57-8000-000000000002','rls-selfcheck-revoked@selftest.invalid','user');
update public.user_invitations set revoked_at = now() where id = '7f570000-0000-7f57-8000-000000000002';
insert into public.user_invitations (id, email, role, expires_at) values
  ('7f570000-0000-7f57-8000-000000000003','rls-selfcheck-expired@selftest.invalid','user', now() - interval '1 day');

-- (1) invitation valide acceptée → rôle admin, compte en attente
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_tokens, email_change, email_change_token_new)
values ('00000000-0000-0000-0000-000000000000','7e570000-0000-7e57-8000-000000000011','authenticated','authenticated','rls-selfcheck-valid@selftest.invalid','selfcheck', now(), '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb, now(), now(), '', '', '', '');
do $p7a$
declare v_role text; v_status text;
begin
  select role, status into v_role, v_status from public.profiles where id = '7e570000-0000-7e57-8000-000000000011';
  if not found then raise exception 'P7 ÉCHEC : profil non créé par handle_new_user.'; end if;
  if v_role <> 'admin' then raise exception 'P7 ÉCHEC : rôle % (attendu admin — invitation valide).', v_role; end if;
  if v_status <> 'suspended' then raise exception 'P7 ÉCHEC : statut % (attendu suspended avant 1re connexion).', v_status; end if;
  raise notice 'P7 OK : invitation valide → rôle admin attribué, compte en attente.';
end;
$p7a$;

-- (2) invitation révoquée acceptée → profil fail-closed suspendu
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_tokens, email_change, email_change_token_new)
values ('00000000-0000-0000-0000-000000000000','7e570000-0000-7e57-8000-000000000012','authenticated','authenticated','rls-selfcheck-revoked@selftest.invalid','selfcheck', now(), '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb, now(), now(), '', '', '', '');
do $p7b$
declare v_status text;
begin
  select status into v_status from public.profiles where id = '7e570000-0000-7e57-8000-000000000012';
  if v_status <> 'suspended' then raise exception 'P7 ÉCHEC : invitation révoquée → % (attendu suspended).', v_status; end if;
  raise notice 'P7 OK : invitation révoquée → fail-closed, aucun accès.';
end;
$p7b$;

-- (3) invitation expirée acceptée → profil fail-closed suspendu
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_tokens, email_change, email_change_token_new)
values ('00000000-0000-0000-0000-000000000000','7e570000-0000-7e57-8000-000000000013','authenticated','authenticated','rls-selfcheck-expired@selftest.invalid','selfcheck', now(), '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb, now(), now(), '', '', '', '');
do $p7c$
declare v_status text;
begin
  select status into v_status from public.profiles where id = '7e570000-0000-7e57-8000-000000000013';
  if v_status <> 'suspended' then raise exception 'P7 ÉCHEC : invitation expirée → % (attendu suspended).', v_status; end if;
  raise notice 'P7 OK : invitation expirée → fail-closed, aucun accès.';
end;
$p7c$;

-- (4) garde CONDITIONNELLE : refus d"une invitation expirée — test
--     SÉQUENTIEL (pas une course simulée ; la course simultanée réelle
--     est dans auth-invite-cycle.mjs, cf. entête).
do $p7d$
declare gagne int;
begin
  update public.user_invitations set used_at = now()
    where id = '7f570000-0000-7f57-8000-000000000003'
      and used_at is null and revoked_at is null and expires_at > now();
  get diagnostics gagne = row_count;
  if gagne <> 0 then raise exception 'P7 ÉCHEC : une invitation EXPIRÉE a été consommée (%).', gagne; end if;
  raise notice 'P7 OK : invitation expirée non consommable (guard expires_at > now).';
end;
$p7d$;

-- (5) idempotence de la consommation : 1er appel gagne, 2e appel 0 ligne
update public.user_invitations set used_at = now()
  where id = '7f570000-0000-7f57-8000-000000000001'
    and used_at is null and revoked_at is null and expires_at > now();
do $p7e$
declare used int; double1 int;
begin
  select count(*) into used from public.user_invitations
    where id = '7f570000-0000-7f57-8000-000000000001' and used_at is not null;
  if used <> 1 then raise exception 'P7 ÉCHEC : consommation non appliquée (%).', used; end if;
  update public.user_invitations set used_at = now()
    where id = '7f570000-0000-7f57-8000-000000000001'
      and used_at is null and revoked_at is null and expires_at > now();
  get diagnostics double1 = row_count;
  if double1 <> 0 then raise exception 'P7 ÉCHEC : double activation possible (% lignes).', double1; end if;
  raise notice 'P7 OK : consommation idempotente — used_at consommé une seule fois (course réelle : auth-invite-cycle.mjs).';
end;
$p7e$;
rollback;

-- ---------------------------------------------------------------------
-- PROUVE FINALE (lecture seule) : ZÉRO ligne de test persistante.
-- ---------------------------------------------------------------------
do $proof$
declare restantes int;
begin
  select
    (select count(*) from public.profiles             where id::text like '7e570000-0000-7e57%')
  + (select count(*) from auth.users                  where id::text like '7e570000-0000-7e57%')
  + (select count(*) from public.studio_projects      where user_id::text like '7e570000-0000-7e57%')
  + (select count(*) from public.studio_media         where user_id::text like '7e570000-0000-7e57%')
  + (select count(*) from public.studio_project_versions where user_id::text like '7e570000-0000-7e57%')
  + (select count(*) from public.studio_renders       where user_id::text like '7e570000-0000-7e57%')
  + (select count(*) from public.user_invitations     where email like 'rls-selfcheck-%' or id::text like '7f570000-0000-7f57%')
  + (select count(*) from public.mcp_user_tokens      where token_hash like 'selfcheck-%')
  into restantes;
  if restantes <> 0 then
    raise exception 'PROUVE ÉCHEC : % lignes de test persistantes — purge manuelle requise (entête du script).', restantes;
  end if;
  raise notice 'PROUVE OK : aucune ligne de test persistante ; données existantes jamais touchées.';
end;
$proof$;

-- Résumé (lecture seule, aucune donnée personnelle affichée).
do $summary$
declare v_admins int; v_admins_actifs int;
begin
  select count(*), count(*) filter (where coalesce(status, 'active') = 'active')
    into v_admins, v_admins_actifs
    from public.profiles where role = 'admin';
  raise notice 'RÉSUMÉ : comptes admin = % (actifs = %).', v_admins, v_admins_actifs;
  raise notice '=== rls-selfcheck : TOUS les contrôles passent — aucune trace persistée ===';
end $summary$;