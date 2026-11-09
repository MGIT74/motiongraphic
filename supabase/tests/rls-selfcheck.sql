-- =====================================================================
-- MotionGraphic Studio — auto-vérification RLS NON DESTRUCTIVE (auto-hébergé)
-- Fichier : supabase/tests/rls-selfcheck.sql
--
-- USAGE :
--   SQL Editor Supabase (toute l\"exécution dans le même onglet) ou :
--   psql "<URL_SUPABASE>" -f supabase/tests/rls-selfcheck.sql
--   (aucune méta-commande psql dans le fichier.)
--
-- GARANTIES :
--   1. Chaque scénario vit dans une transaction terminée par ROLLBACK :
--      aucune ligne de test ne subsiste (transaction abortée = rollback).
--   2. Identifiants de test dédiés (préfixe 7e57/7f57 + emails
--      rls-selfcheck-*@selftest.invalid) ; prévol ABORTE si collision.
--   3. Aucune lecture/écriture des données réelles (contrôles de
--      structure et agrégats anonymes uniquement).
--   4. Preuve finale (lecture seule) : ZÉRO ligne de test subsistante +
--      résumé anonyme des comptes administrateurs.
--   5. P0 vérifie PRÉCISÉMENT les 6 déclencheurs de la migration, chacun
--      sur SA table ; 0009 ne crée pas prevent_status_change (le statut
--      est appliqué côté application : proxy, routes admin, is_admin).
--   6. L\"insertion des comptes auth.users de test est TRANSACTIONNELLE
--      et INLINE (blocs DO, aucune fonction pg_temp — compatibilité
--      SQL Editor) : la liste des colonnes est construite DYNAMIQUEMENT
--      depuis information_schema (aucune structure supposée ; les
--      colonnes absentes de votre version reçoivent les défauts).
--   7. P7 : garde conditionnelle et idempotence (séquentielles) ; la
--      course simultanée réelle est dans auth-invite-cycle.mjs.
--
-- PURGE D\"URGENCE FACULTATIVE (identifiants de test uniquement) :
--   delete from public.studio_renders  where user_id::text like '7e570000-0000-7e57%';
--   delete from public.studio_project_versions where user_id::text like '7e570000-0000-7e57%';
--   delete from public.studio_media    where user_id::text like '7e570000-0000-7e57%';
--   delete from public.studio_projects where user_id::text like '7e570000-0000-7e57%';
--   delete from public.user_invitations where email like 'rls-selfcheck-%';
--   delete from public.mcp_user_tokens where token_hash like 'selfcheck-%';
--   delete from public.profiles        where id::text like '7e570000-0000-7e57%';
--   delete from auth.users             where id::text like '7e570000-0000-7e57%';
-- =====================================================================

-- ---------------------------------------------------------------------
-- P0 — prévol (lecture seule) : migration 0009 + périmètre libre.
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
  if to_regprocedure('public.account_is_active(uuid)') is null then
    v_missing := v_missing || 'account_is_active(uuid) ';
  end if;
  if to_regprocedure('public.assert_account_active_for_write()') is null then
    v_missing := v_missing || 'assert_account_active_for_write() ';
  end if;
  if to_regprocedure('public.assert_account_active_for_write_created_by()') is null then
    v_missing := v_missing || 'assert_account_active_for_write_created_by() ';
  end if;
  if to_regprocedure('public.request_is_service_role()') is null then
    v_missing := v_missing || 'request_is_service_role() ';
  end if;
  if v_missing <> '' then
    raise exception 'SELFCHECK : migration 0009 incomplète (manque : %).', v_missing;
  end if;
  select count(*) into v_collisions from public.profiles
    where id::text like '7e570000-0000-7e57%' or id::text like '7f570000-0000-7f57%';
  if v_collisions > 0 then
    raise exception 'SELFCHECK : % identifiants de test déjà présents — purgez-les (entête).', v_collisions;
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
  -- 6 déclencheurs de garde, vérifiés DÉCLENCHEUR PAR TABLE :
  --   guard_active sur studio_projects, studio_media,
  --     studio_project_versions, studio_renders (4) ;
  --   guard_active_created_by sur custom_templates (1) ;
  --   prevent_role_escalation sur profiles (1 — 0001 ; la fonction
  --     guard_role_change est remplacée par 0009).
  select count(*) into v_triggers
    from (values
      ('studio_projects',          'guard_active'),
      ('studio_media',             'guard_active'),
      ('studio_project_versions',  'guard_active'),
      ('studio_renders',           'guard_active'),
      ('custom_templates',         'guard_active_created_by'),
      ('profiles',                 'prevent_role_escalation')
    ) as attendu(nom_table, nom_trigger)
    join pg_class c
      on c.relnamespace = 'public'::regnamespace
      and c.relname = attendu.nom_table
    join pg_trigger t
      on t.tgrelid = c.oid
      and t.tgname = attendu.nom_trigger
      and not t.tgisinternal;
  if v_triggers <> 6 then
    raise exception 'SELFCHECK : triggers de garde attendus = %/6 (vérifier migrations 0009/0001).', v_triggers;
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
-- (inline, transactionnel) insertion auth.users compatible toutes
-- versions : colonnes présentes uniquement (information_schema) ;
-- rien de persistant — le scénario est annulé par ROLLBACK.
do $insu$
declare
  v_pair record;
  r      record;
  v_cols text;
  v_vals text;
begin
  for v_pair in
    select u.uid, u.mail
    from unnest(
      ARRAY['7e570000-0000-7e57-8000-000000000001'],
      ARRAY['rls-selfcheck-a@selftest.invalid']
    ) as u(uid, mail)
  loop
    v_cols := 'id, aud, role, email, encrypted_password';
    v_vals := format('%L, ''authenticated'', ''authenticated'', %L, ''selfcheck''', v_pair.uid, v_pair.mail);
    for r in
      select c.column_name,
             case c.column_name
               when 'instance_id'                  then $$'00000000-0000-0000-0000-000000000000'::uuid$$
               when 'email_confirmed_at'           then $$now()$$
               when 'last_sign_in_at'              then $$now()$$
               when 'created_at'                   then $$now()$$
               when 'updated_at'                   then $$now()$$
               when 'raw_app_meta_data'            then $$'{"provider":"email","providers":["email"]}'::jsonb$$
               when 'raw_user_meta_data'           then $$'{}'::jsonb$$
               when 'confirmation_token'           then $q$''$q$
               when 'recovery_tokens'              then $q$''$q$
               when 'recovery_token'               then $q$''$q$
               when 'reauthentication_token'       then $q$''$q$
               when 'email_change'                 then $q$''$q$
               when 'email_change_token_new'       then $q$''$q$
               when 'email_change_confirm_status'  then $$0$$
               when 'phone'                        then $$null$$
               when 'phone_change'                 then $$null$$
               when 'phone_confirmed_at'           then $$null$$
               when 'phone_change_token'           then $q$''$q$
               when 'phone_change_sent_at'         then $$null$$
               when 'new_email'                    then $$null$$
               when 'new_phone'                    then $$null$$
               when 'is_super_admin'               then $$false$$
               when 'is_sso_user'                  then $$false$$
               when 'deleted_at'                   then $$null$$
               when 'banned_until'                 then $$null$$
               when 'invite_sent_at'               then $$null$$
             end as val
      from information_schema.columns c
      where c.table_schema = 'auth'
        and c.table_name  = 'users'
        and c.column_name in (
          'instance_id','email_confirmed_at','last_sign_in_at','created_at',
          'updated_at','raw_app_meta_data','raw_user_meta_data',
          'confirmation_token','recovery_tokens','recovery_token',
          'reauthentication_token','email_change','email_change_token_new',
          'email_change_confirm_status','phone','phone_change',
          'phone_confirmed_at','phone_change_token','phone_change_sent_at',
          'new_email','new_phone','is_super_admin','is_sso_user',
          'deleted_at','banned_until','invite_sent_at'
        )
    loop
      if r.val is not null then
        v_cols := v_cols || ', ' || r.column_name;
        v_vals := v_vals || ', ' || r.val;
      end if;
    end loop;
    execute 'insert into auth.users (' || v_cols || ') values (' || v_vals || ')';
  end loop;
end;
$insu$;
do $p1trigger$
declare v_status text; v_role text;
begin
  select status, role into v_status, v_role from public.profiles where id = '7e570000-0000-7e57-8000-000000000001';
  if not found then raise exception 'P1 ÉCHEC : handle_new_user n''a pas créé le profil de test.'; end if;
  if v_status <> 'suspended' or v_role <> 'user' then
    raise exception 'P1 ÉCHEC : profil inattendu (attendu suspended/user, lu %/%).', v_role, v_status;
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
-- P2 — B : données propres, A invisible ; insertion croisée refusée.
-- ---------------------------------------------------------------------
begin;
set local request.jwt.claims = '{"role":"service_role","sub":"7e570000-0000-7e57-8000-000000000000"}';
do $insu$
declare
  v_pair record;
  r      record;
  v_cols text;
  v_vals text;
begin
  for v_pair in
    select u.uid, u.mail
    from unnest(
      ARRAY['7e570000-0000-7e57-8000-000000000001','7e570000-0000-7e57-8000-000000000002'],
      ARRAY['rls-selfcheck-a@selftest.invalid','rls-selfcheck-b@selftest.invalid']
    ) as u(uid, mail)
  loop
    v_cols := 'id, aud, role, email, encrypted_password';
    v_vals := format('%L, ''authenticated'', ''authenticated'', %L, ''selfcheck''', v_pair.uid, v_pair.mail);
    for r in
      select c.column_name,
             case c.column_name
               when 'instance_id'                  then $$'00000000-0000-0000-0000-000000000000'::uuid$$
               when 'email_confirmed_at'           then $$now()$$
               when 'last_sign_in_at'              then $$now()$$
               when 'created_at'                   then $$now()$$
               when 'updated_at'                   then $$now()$$
               when 'raw_app_meta_data'            then $$'{"provider":"email","providers":["email"]}'::jsonb$$
               when 'raw_user_meta_data'           then $$'{}'::jsonb$$
               when 'confirmation_token'           then $q$''$q$
               when 'recovery_tokens'              then $q$''$q$
               when 'recovery_token'               then $q$''$q$
               when 'reauthentication_token'       then $q$''$q$
               when 'email_change'                 then $q$''$q$
               when 'email_change_token_new'       then $q$''$q$
               when 'email_change_confirm_status'  then $$0$$
               when 'phone'                        then $$null$$
               when 'phone_change'                 then $$null$$
               when 'phone_confirmed_at'           then $$null$$
               when 'phone_change_token'           then $q$''$q$
               when 'phone_change_sent_at'         then $$null$$
               when 'new_email'                    then $$null$$
               when 'new_phone'                    then $$null$$
               when 'is_super_admin'               then $$false$$
               when 'is_sso_user'                  then $$false$$
               when 'deleted_at'                   then $$null$$
               when 'banned_until'                 then $$null$$
               when 'invite_sent_at'               then $$null$$
             end as val
      from information_schema.columns c
      where c.table_schema = 'auth'
        and c.table_name  = 'users'
        and c.column_name in (
          'instance_id','email_confirmed_at','last_sign_in_at','created_at',
          'updated_at','raw_app_meta_data','raw_user_meta_data',
          'confirmation_token','recovery_tokens','recovery_token',
          'reauthentication_token','email_change','email_change_token_new',
          'email_change_confirm_status','phone','phone_change',
          'phone_confirmed_at','phone_change_token','phone_change_sent_at',
          'new_email','new_phone','is_super_admin','is_sso_user',
          'deleted_at','banned_until','invite_sent_at'
        )
    loop
      if r.val is not null then
        v_cols := v_cols || ', ' || r.column_name;
        v_vals := v_vals || ', ' || r.val;
      end if;
    end loop;
    execute 'insert into auth.users (' || v_cols || ') values (' || v_vals || ')';
  end loop;
end;
$insu$;
update public.profiles set status = 'active', display_name = 'SELFTEST-A' where id = '7e570000-0000-7e57-8000-000000000001';
update public.profiles set status = 'active', display_name = 'SELFTEST-B' where id = '7e570000-0000-7e57-8000-000000000002';
do $p2setup$
declare a2 int; b2 int;
begin
  select count(*) into a2 from public.profiles where id = '7e570000-0000-7e57-8000-000000000001' and status = 'active';
  select count(*) into b2 from public.profiles where id = '7e570000-0000-7e57-8000-000000000002' and status = 'active';
  if a2 <> 1 or b2 <> 1 then raise exception 'P2 ÉCHEC : profils de test absents/suspendus (trigger + update).'; end if;
  raise notice 'P2 setup : profils créés par handle_new_user puis activés par UPDATE.';
end;
$p2setup$;
insert into public.studio_projects (id, user_id, name, schema_version, fps, width, height, data)
values ('7e570000-0000-7e57-8000-000000010001','7e570000-0000-7e57-8000-000000000001','SELFTEST-PROJET-A',1,30,1920,1080,'{}'::jsonb);

set local role authenticated;
set local request.jwt.claims = '{"sub":"7e570000-0000-7e57-8000-000000000002","role":"authenticated","email":"rls-selfcheck-b@selftest.invalid"}';
insert into public.studio_projects (id, user_id, name, schema_version, fps, width, height, data)
values ('7e570000-0000-7e57-8000-000000010006','7e570000-0000-7e57-8000-000000000002','SELFTEST-PROJET-B',1,30,1920,1080,'{}'::jsonb);
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
  raise notice 'P2 OK : symétrie — A et B isolés chacun de l''autre.';
end;
$p2b$;
rollback;

-- ---------------------------------------------------------------------
-- P3 — suspension : écritures refusées (P0001), lecture de SES lignes
--      conservée, service_role exempté, réaffectation impossible.
-- ---------------------------------------------------------------------
begin;
set local request.jwt.claims = '{"role":"service_role","sub":"7e570000-0000-7e57-8000-000000000000"}';
do $insu$
declare
  v_pair record;
  r      record;
  v_cols text;
  v_vals text;
begin
  for v_pair in
    select u.uid, u.mail
    from unnest(
      ARRAY['7e570000-0000-7e57-8000-000000000003'],
      ARRAY['rls-selfcheck-s@selftest.invalid']
    ) as u(uid, mail)
  loop
    v_cols := 'id, aud, role, email, encrypted_password';
    v_vals := format('%L, ''authenticated'', ''authenticated'', %L, ''selfcheck''', v_pair.uid, v_pair.mail);
    for r in
      select c.column_name,
             case c.column_name
               when 'instance_id'                  then $$'00000000-0000-0000-0000-000000000000'::uuid$$
               when 'email_confirmed_at'           then $$now()$$
               when 'last_sign_in_at'              then $$now()$$
               when 'created_at'                   then $$now()$$
               when 'updated_at'                   then $$now()$$
               when 'raw_app_meta_data'            then $$'{"provider":"email","providers":["email"]}'::jsonb$$
               when 'raw_user_meta_data'           then $$'{}'::jsonb$$
               when 'confirmation_token'           then $q$''$q$
               when 'recovery_tokens'              then $q$''$q$
               when 'recovery_token'               then $q$''$q$
               when 'reauthentication_token'       then $q$''$q$
               when 'email_change'                 then $q$''$q$
               when 'email_change_token_new'       then $q$''$q$
               when 'email_change_confirm_status'  then $$0$$
               when 'phone'                        then $$null$$
               when 'phone_change'                 then $$null$$
               when 'phone_confirmed_at'           then $$null$$
               when 'phone_change_token'           then $q$''$q$
               when 'phone_change_sent_at'         then $$null$$
               when 'new_email'                    then $$null$$
               when 'new_phone'                    then $$null$$
               when 'is_super_admin'               then $$false$$
               when 'is_sso_user'                  then $$false$$
               when 'deleted_at'                   then $$null$$
               when 'banned_until'                 then $$null$$
               when 'invite_sent_at'               then $$null$$
             end as val
      from information_schema.columns c
      where c.table_schema = 'auth'
        and c.table_name  = 'users'
        and c.column_name in (
          'instance_id','email_confirmed_at','last_sign_in_at','created_at',
          'updated_at','raw_app_meta_data','raw_user_meta_data',
          'confirmation_token','recovery_tokens','recovery_token',
          'reauthentication_token','email_change','email_change_token_new',
          'email_change_confirm_status','phone','phone_change',
          'phone_confirmed_at','phone_change_token','phone_change_sent_at',
          'new_email','new_phone','is_super_admin','is_sso_user',
          'deleted_at','banned_until','invite_sent_at'
        )
    loop
      if r.val is not null then
        v_cols := v_cols || ', ' || r.column_name;
        v_vals := v_vals || ', ' || r.val;
      end if;
    end loop;
    execute 'insert into auth.users (' || v_cols || ') values (' || v_vals || ')';
  end loop;
end;
$insu$;
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
  begin
    update public.studio_projects set name = 'ESSAI-CONTOUR' where id = '7e570000-0000-7e57-8000-000000010003';
    get diagnostics maj = row_count;
  exception
    when sqlstate 'P0001' then
      if position('COMPTE_SUSPENDU' in sqlerrm) = 0 then
        raise exception 'P3 ÉCHEC : refus P0001 inattendu : %.', sqlerrm;
      end if;
      raise notice 'P3 OK : UPDATE suspendu refusé (P0001 COMPTE_SUSPENDU).';
      maj := -1;
  end;
  if maj <> -1 then
    raise exception 'P3 ÉCHEC : UPDATE non refusé par COMPTE_SUSPENDU (% lignes).', maj;
  end if;
  select count(*) into n from public.studio_projects;
  if n <> 2 then raise exception 'P3 ÉCHEC : lecture de SES lignes cassée (% projets, attendu 2).', n; end if;
  raise notice 'P3 OK : écriture suspendue, lecture de ses propres données conservée.';
end;
$p3c$;
rollback;

-- ---------------------------------------------------------------------
-- P4 — self-service : le RÔLE est verrouillé (déclencheur) ; le statut
--      est appliqué au niveau application (cf. note de cohérence).
-- ---------------------------------------------------------------------
begin;
set local request.jwt.claims = '{"role":"service_role","sub":"7e570000-0000-7e57-8000-000000000000"}';
do $insu$
declare
  v_pair record;
  r      record;
  v_cols text;
  v_vals text;
begin
  for v_pair in
    select u.uid, u.mail
    from unnest(
      ARRAY['7e570000-0000-7e57-8000-000000000002'],
      ARRAY['rls-selfcheck-b@selftest.invalid']
    ) as u(uid, mail)
  loop
    v_cols := 'id, aud, role, email, encrypted_password';
    v_vals := format('%L, ''authenticated'', ''authenticated'', %L, ''selfcheck''', v_pair.uid, v_pair.mail);
    for r in
      select c.column_name,
             case c.column_name
               when 'instance_id'                  then $$'00000000-0000-0000-0000-000000000000'::uuid$$
               when 'email_confirmed_at'           then $$now()$$
               when 'last_sign_in_at'              then $$now()$$
               when 'created_at'                   then $$now()$$
               when 'updated_at'                   then $$now()$$
               when 'raw_app_meta_data'            then $$'{"provider":"email","providers":["email"]}'::jsonb$$
               when 'raw_user_meta_data'           then $$'{}'::jsonb$$
               when 'confirmation_token'           then $q$''$q$
               when 'recovery_tokens'              then $q$''$q$
               when 'recovery_token'               then $q$''$q$
               when 'reauthentication_token'       then $q$''$q$
               when 'email_change'                 then $q$''$q$
               when 'email_change_token_new'       then $q$''$q$
               when 'email_change_confirm_status'  then $$0$$
               when 'phone'                        then $$null$$
               when 'phone_change'                 then $$null$$
               when 'phone_confirmed_at'           then $$null$$
               when 'phone_change_token'           then $q$''$q$
               when 'phone_change_sent_at'         then $$null$$
               when 'new_email'                    then $$null$$
               when 'new_phone'                    then $$null$$
               when 'is_super_admin'               then $$false$$
               when 'is_sso_user'                  then $$false$$
               when 'deleted_at'                   then $$null$$
               when 'banned_until'                 then $$null$$
               when 'invite_sent_at'               then $$null$$
             end as val
      from information_schema.columns c
      where c.table_schema = 'auth'
        and c.table_name  = 'users'
        and c.column_name in (
          'instance_id','email_confirmed_at','last_sign_in_at','created_at',
          'updated_at','raw_app_meta_data','raw_user_meta_data',
          'confirmation_token','recovery_tokens','recovery_token',
          'reauthentication_token','email_change','email_change_token_new',
          'email_change_confirm_status','phone','phone_change',
          'phone_confirmed_at','phone_change_token','phone_change_sent_at',
          'new_email','new_phone','is_super_admin','is_sso_user',
          'deleted_at','banned_until','invite_sent_at'
        )
    loop
      if r.val is not null then
        v_cols := v_cols || ', ' || r.column_name;
        v_vals := v_vals || ', ' || r.val;
      end if;
    end loop;
    execute 'insert into auth.users (' || v_cols || ') values (' || v_vals || ')';
  end loop;
end;
$insu$;
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
-- NOTE COHÉRENCE MIGRATION : 0009 ne crée PAS prevent_status_change ;
-- la suspension/réactivation est appliquée au niveau APPLICATION
-- (proxy, routes /api/admin/*, is_admin) et non par un déclencheur SQL.
-- Aucune prétention de refus au niveau base pour le statut en libre-
-- service direct ; seul le rôle est verrouillé (déclencheur ci-avant).
do $p4note$
begin
  raise notice 'P4 note : statut appliqué au niveau application (aucun déclencheur SQL prévu par la migration) ; le verrou de rôle reste vérifié.';
end;
$p4note$;
rollback;

-- ---------------------------------------------------------------------
-- P5 — admin SUSPENDU : is_admin() = false ; aucune donnée administrateur.
-- ---------------------------------------------------------------------
begin;
set local request.jwt.claims = '{"role":"service_role","sub":"7e570000-0000-7e57-8000-000000000000"}';
do $insu$
declare
  v_pair record;
  r      record;
  v_cols text;
  v_vals text;
begin
  for v_pair in
    select u.uid, u.mail
    from unnest(
      ARRAY['7e570000-0000-7e57-8000-000000000004'],
      ARRAY['rls-selfcheck-admin@selftest.invalid']
    ) as u(uid, mail)
  loop
    v_cols := 'id, aud, role, email, encrypted_password';
    v_vals := format('%L, ''authenticated'', ''authenticated'', %L, ''selfcheck''', v_pair.uid, v_pair.mail);
    for r in
      select c.column_name,
             case c.column_name
               when 'instance_id'                  then $$'00000000-0000-0000-0000-000000000000'::uuid$$
               when 'email_confirmed_at'           then $$now()$$
               when 'last_sign_in_at'              then $$now()$$
               when 'created_at'                   then $$now()$$
               when 'updated_at'                   then $$now()$$
               when 'raw_app_meta_data'            then $$'{"provider":"email","providers":["email"]}'::jsonb$$
               when 'raw_user_meta_data'           then $$'{}'::jsonb$$
               when 'confirmation_token'           then $q$''$q$
               when 'recovery_tokens'              then $q$''$q$
               when 'recovery_token'               then $q$''$q$
               when 'reauthentication_token'       then $q$''$q$
               when 'email_change'                 then $q$''$q$
               when 'email_change_token_new'       then $q$''$q$
               when 'email_change_confirm_status'  then $$0$$
               when 'phone'                        then $$null$$
               when 'phone_change'                 then $$null$$
               when 'phone_confirmed_at'           then $$null$$
               when 'phone_change_token'           then $q$''$q$
               when 'phone_change_sent_at'         then $$null$$
               when 'new_email'                    then $$null$$
               when 'new_phone'                    then $$null$$
               when 'is_super_admin'               then $$false$$
               when 'is_sso_user'                  then $$false$$
               when 'deleted_at'                   then $$null$$
               when 'banned_until'                 then $$null$$
               when 'invite_sent_at'               then $$null$$
             end as val
      from information_schema.columns c
      where c.table_schema = 'auth'
        and c.table_name  = 'users'
        and c.column_name in (
          'instance_id','email_confirmed_at','last_sign_in_at','created_at',
          'updated_at','raw_app_meta_data','raw_user_meta_data',
          'confirmation_token','recovery_tokens','recovery_token',
          'reauthentication_token','email_change','email_change_token_new',
          'email_change_confirm_status','phone','phone_change',
          'phone_confirmed_at','phone_change_token','phone_change_sent_at',
          'new_email','new_phone','is_super_admin','is_sso_user',
          'deleted_at','banned_until','invite_sent_at'
        )
    loop
      if r.val is not null then
        v_cols := v_cols || ', ' || r.column_name;
        v_vals := v_vals || ', ' || r.val;
      end if;
    end loop;
    execute 'insert into auth.users (' || v_cols || ') values (' || v_vals || ')';
  end loop;
end;
$insu$;
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
-- (deux transactions : le compte Auth est recréé DANS CHACUNE)
-- ---------------------------------------------------------------------
begin;
set local request.jwt.claims = '{"role":"service_role","sub":"7e570000-0000-7e57-8000-000000000000"}';
do $insu$
declare
  v_pair record;
  r      record;
  v_cols text;
  v_vals text;
begin
  for v_pair in
    select u.uid, u.mail
    from unnest(
      ARRAY['7e570000-0000-7e57-8000-000000000002'],
      ARRAY['rls-selfcheck-b@selftest.invalid']
    ) as u(uid, mail)
  loop
    v_cols := 'id, aud, role, email, encrypted_password';
    v_vals := format('%L, ''authenticated'', ''authenticated'', %L, ''selfcheck''', v_pair.uid, v_pair.mail);
    for r in
      select c.column_name,
             case c.column_name
               when 'instance_id'                  then $$'00000000-0000-0000-0000-000000000000'::uuid$$
               when 'email_confirmed_at'           then $$now()$$
               when 'last_sign_in_at'              then $$now()$$
               when 'created_at'                   then $$now()$$
               when 'updated_at'                   then $$now()$$
               when 'raw_app_meta_data'            then $$'{"provider":"email","providers":["email"]}'::jsonb$$
               when 'raw_user_meta_data'           then $$'{}'::jsonb$$
               when 'confirmation_token'           then $q$''$q$
               when 'recovery_tokens'              then $q$''$q$
               when 'recovery_token'               then $q$''$q$
               when 'reauthentication_token'       then $q$''$q$
               when 'email_change'                 then $q$''$q$
               when 'email_change_token_new'       then $q$''$q$
               when 'email_change_confirm_status'  then $$0$$
               when 'phone'                        then $$null$$
               when 'phone_change'                 then $$null$$
               when 'phone_confirmed_at'           then $$null$$
               when 'phone_change_token'           then $q$''$q$
               when 'phone_change_sent_at'         then $$null$$
               when 'new_email'                    then $$null$$
               when 'new_phone'                    then $$null$$
               when 'is_super_admin'               then $$false$$
               when 'is_sso_user'                  then $$false$$
               when 'deleted_at'                   then $$null$$
               when 'banned_until'                 then $$null$$
               when 'invite_sent_at'               then $$null$$
             end as val
      from information_schema.columns c
      where c.table_schema = 'auth'
        and c.table_name  = 'users'
        and c.column_name in (
          'instance_id','email_confirmed_at','last_sign_in_at','created_at',
          'updated_at','raw_app_meta_data','raw_user_meta_data',
          'confirmation_token','recovery_tokens','recovery_token',
          'reauthentication_token','email_change','email_change_token_new',
          'email_change_confirm_status','phone','phone_change',
          'phone_confirmed_at','phone_change_token','phone_change_sent_at',
          'new_email','new_phone','is_super_admin','is_sso_user',
          'deleted_at','banned_until','invite_sent_at'
        )
    loop
      if r.val is not null then
        v_cols := v_cols || ', ' || r.column_name;
        v_vals := v_vals || ', ' || r.val;
      end if;
    end loop;
    execute 'insert into auth.users (' || v_cols || ') values (' || v_vals || ')';
  end loop;
end;
$insu$;

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
do $insu$
declare
  v_pair record;
  r      record;
  v_cols text;
  v_vals text;
begin
  for v_pair in
    select u.uid, u.mail
    from unnest(
      ARRAY['7e570000-0000-7e57-8000-000000000002'],
      ARRAY['rls-selfcheck-b@selftest.invalid']
    ) as u(uid, mail)
  loop
    v_cols := 'id, aud, role, email, encrypted_password';
    v_vals := format('%L, ''authenticated'', ''authenticated'', %L, ''selfcheck''', v_pair.uid, v_pair.mail);
    for r in
      select c.column_name,
             case c.column_name
               when 'instance_id'                  then $$'00000000-0000-0000-0000-000000000000'::uuid$$
               when 'email_confirmed_at'           then $$now()$$
               when 'last_sign_in_at'              then $$now()$$
               when 'created_at'                   then $$now()$$
               when 'updated_at'                   then $$now()$$
               when 'raw_app_meta_data'            then $$'{"provider":"email","providers":["email"]}'::jsonb$$
               when 'raw_user_meta_data'           then $$'{}'::jsonb$$
               when 'confirmation_token'           then $q$''$q$
               when 'recovery_tokens'              then $q$''$q$
               when 'recovery_token'               then $q$''$q$
               when 'reauthentication_token'       then $q$''$q$
               when 'email_change'                 then $q$''$q$
               when 'email_change_token_new'       then $q$''$q$
               when 'email_change_confirm_status'  then $$0$$
               when 'phone'                        then $$null$$
               when 'phone_change'                 then $$null$$
               when 'phone_confirmed_at'           then $$null$$
               when 'phone_change_token'           then $q$''$q$
               when 'phone_change_sent_at'         then $$null$$
               when 'new_email'                    then $$null$$
               when 'new_phone'                    then $$null$$
               when 'is_super_admin'               then $$false$$
               when 'is_sso_user'                  then $$false$$
               when 'deleted_at'                   then $$null$$
               when 'banned_until'                 then $$null$$
               when 'invite_sent_at'               then $$null$$
             end as val
      from information_schema.columns c
      where c.table_schema = 'auth'
        and c.table_name  = 'users'
        and c.column_name in (
          'instance_id','email_confirmed_at','last_sign_in_at','created_at',
          'updated_at','raw_app_meta_data','raw_user_meta_data',
          'confirmation_token','recovery_tokens','recovery_token',
          'reauthentication_token','email_change','email_change_token_new',
          'email_change_confirm_status','phone','phone_change',
          'phone_confirmed_at','phone_change_token','phone_change_sent_at',
          'new_email','new_phone','is_super_admin','is_sso_user',
          'deleted_at','banned_until','invite_sent_at'
        )
    loop
      if r.val is not null then
        v_cols := v_cols || ', ' || r.column_name;
        v_vals := v_vals || ', ' || r.val;
      end if;
    end loop;
    execute 'insert into auth.users (' || v_cols || ') values (' || v_vals || ')';
  end loop;
end;
$insu$;
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
--      fail-closed, consommation conditionnelle + idempotence.
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
do $insu$
declare
  v_pair record;
  r      record;
  v_cols text;
  v_vals text;
begin
  for v_pair in
    select u.uid, u.mail
    from unnest(
      ARRAY['7e570000-0000-7e57-8000-000000000011'],
      ARRAY['rls-selfcheck-valid@selftest.invalid']
    ) as u(uid, mail)
  loop
    v_cols := 'id, aud, role, email, encrypted_password';
    v_vals := format('%L, ''authenticated'', ''authenticated'', %L, ''selfcheck''', v_pair.uid, v_pair.mail);
    for r in
      select c.column_name,
             case c.column_name
               when 'instance_id'                  then $$'00000000-0000-0000-0000-000000000000'::uuid$$
               when 'email_confirmed_at'           then $$now()$$
               when 'last_sign_in_at'              then $$now()$$
               when 'created_at'                   then $$now()$$
               when 'updated_at'                   then $$now()$$
               when 'raw_app_meta_data'            then $$'{"provider":"email","providers":["email"]}'::jsonb$$
               when 'raw_user_meta_data'           then $$'{}'::jsonb$$
               when 'confirmation_token'           then $q$''$q$
               when 'recovery_tokens'              then $q$''$q$
               when 'recovery_token'               then $q$''$q$
               when 'reauthentication_token'       then $q$''$q$
               when 'email_change'                 then $q$''$q$
               when 'email_change_token_new'       then $q$''$q$
               when 'email_change_confirm_status'  then $$0$$
               when 'phone'                        then $$null$$
               when 'phone_change'                 then $$null$$
               when 'phone_confirmed_at'           then $$null$$
               when 'phone_change_token'           then $q$''$q$
               when 'phone_change_sent_at'         then $$null$$
               when 'new_email'                    then $$null$$
               when 'new_phone'                    then $$null$$
               when 'is_super_admin'               then $$false$$
               when 'is_sso_user'                  then $$false$$
               when 'deleted_at'                   then $$null$$
               when 'banned_until'                 then $$null$$
               when 'invite_sent_at'               then $$null$$
             end as val
      from information_schema.columns c
      where c.table_schema = 'auth'
        and c.table_name  = 'users'
        and c.column_name in (
          'instance_id','email_confirmed_at','last_sign_in_at','created_at',
          'updated_at','raw_app_meta_data','raw_user_meta_data',
          'confirmation_token','recovery_tokens','recovery_token',
          'reauthentication_token','email_change','email_change_token_new',
          'email_change_confirm_status','phone','phone_change',
          'phone_confirmed_at','phone_change_token','phone_change_sent_at',
          'new_email','new_phone','is_super_admin','is_sso_user',
          'deleted_at','banned_until','invite_sent_at'
        )
    loop
      if r.val is not null then
        v_cols := v_cols || ', ' || r.column_name;
        v_vals := v_vals || ', ' || r.val;
      end if;
    end loop;
    execute 'insert into auth.users (' || v_cols || ') values (' || v_vals || ')';
  end loop;
end;
$insu$;
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
do $insu$
declare
  v_pair record;
  r      record;
  v_cols text;
  v_vals text;
begin
  for v_pair in
    select u.uid, u.mail
    from unnest(
      ARRAY['7e570000-0000-7e57-8000-000000000012'],
      ARRAY['rls-selfcheck-revoked@selftest.invalid']
    ) as u(uid, mail)
  loop
    v_cols := 'id, aud, role, email, encrypted_password';
    v_vals := format('%L, ''authenticated'', ''authenticated'', %L, ''selfcheck''', v_pair.uid, v_pair.mail);
    for r in
      select c.column_name,
             case c.column_name
               when 'instance_id'                  then $$'00000000-0000-0000-0000-000000000000'::uuid$$
               when 'email_confirmed_at'           then $$now()$$
               when 'last_sign_in_at'              then $$now()$$
               when 'created_at'                   then $$now()$$
               when 'updated_at'                   then $$now()$$
               when 'raw_app_meta_data'            then $$'{"provider":"email","providers":["email"]}'::jsonb$$
               when 'raw_user_meta_data'           then $$'{}'::jsonb$$
               when 'confirmation_token'           then $q$''$q$
               when 'recovery_tokens'              then $q$''$q$
               when 'recovery_token'               then $q$''$q$
               when 'reauthentication_token'       then $q$''$q$
               when 'email_change'                 then $q$''$q$
               when 'email_change_token_new'       then $q$''$q$
               when 'email_change_confirm_status'  then $$0$$
               when 'phone'                        then $$null$$
               when 'phone_change'                 then $$null$$
               when 'phone_confirmed_at'           then $$null$$
               when 'phone_change_token'           then $q$''$q$
               when 'phone_change_sent_at'         then $$null$$
               when 'new_email'                    then $$null$$
               when 'new_phone'                    then $$null$$
               when 'is_super_admin'               then $$false$$
               when 'is_sso_user'                  then $$false$$
               when 'deleted_at'                   then $$null$$
               when 'banned_until'                 then $$null$$
               when 'invite_sent_at'               then $$null$$
             end as val
      from information_schema.columns c
      where c.table_schema = 'auth'
        and c.table_name  = 'users'
        and c.column_name in (
          'instance_id','email_confirmed_at','last_sign_in_at','created_at',
          'updated_at','raw_app_meta_data','raw_user_meta_data',
          'confirmation_token','recovery_tokens','recovery_token',
          'reauthentication_token','email_change','email_change_token_new',
          'email_change_confirm_status','phone','phone_change',
          'phone_confirmed_at','phone_change_token','phone_change_sent_at',
          'new_email','new_phone','is_super_admin','is_sso_user',
          'deleted_at','banned_until','invite_sent_at'
        )
    loop
      if r.val is not null then
        v_cols := v_cols || ', ' || r.column_name;
        v_vals := v_vals || ', ' || r.val;
      end if;
    end loop;
    execute 'insert into auth.users (' || v_cols || ') values (' || v_vals || ')';
  end loop;
end;
$insu$;
do $p7b$
declare v_status text;
begin
  select status into v_status from public.profiles where id = '7e570000-0000-7e57-8000-000000000012';
  if v_status <> 'suspended' then raise exception 'P7 ÉCHEC : invitation révoquée → % (attendu suspended).', v_status; end if;
  raise notice 'P7 OK : invitation révoquée → fail-closed, aucun accès.';
end;
$p7b$;

-- (3) invitation expirée acceptée → profil fail-closed suspendu
do $insu$
declare
  v_pair record;
  r      record;
  v_cols text;
  v_vals text;
begin
  for v_pair in
    select u.uid, u.mail
    from unnest(
      ARRAY['7e570000-0000-7e57-8000-000000000013'],
      ARRAY['rls-selfcheck-expired@selftest.invalid']
    ) as u(uid, mail)
  loop
    v_cols := 'id, aud, role, email, encrypted_password';
    v_vals := format('%L, ''authenticated'', ''authenticated'', %L, ''selfcheck''', v_pair.uid, v_pair.mail);
    for r in
      select c.column_name,
             case c.column_name
               when 'instance_id'                  then $$'00000000-0000-0000-0000-000000000000'::uuid$$
               when 'email_confirmed_at'           then $$now()$$
               when 'last_sign_in_at'              then $$now()$$
               when 'created_at'                   then $$now()$$
               when 'updated_at'                   then $$now()$$
               when 'raw_app_meta_data'            then $$'{"provider":"email","providers":["email"]}'::jsonb$$
               when 'raw_user_meta_data'           then $$'{}'::jsonb$$
               when 'confirmation_token'           then $q$''$q$
               when 'recovery_tokens'              then $q$''$q$
               when 'recovery_token'               then $q$''$q$
               when 'reauthentication_token'       then $q$''$q$
               when 'email_change'                 then $q$''$q$
               when 'email_change_token_new'       then $q$''$q$
               when 'email_change_confirm_status'  then $$0$$
               when 'phone'                        then $$null$$
               when 'phone_change'                 then $$null$$
               when 'phone_confirmed_at'           then $$null$$
               when 'phone_change_token'           then $q$''$q$
               when 'phone_change_sent_at'         then $$null$$
               when 'new_email'                    then $$null$$
               when 'new_phone'                    then $$null$$
               when 'is_super_admin'               then $$false$$
               when 'is_sso_user'                  then $$false$$
               when 'deleted_at'                   then $$null$$
               when 'banned_until'                 then $$null$$
               when 'invite_sent_at'               then $$null$$
             end as val
      from information_schema.columns c
      where c.table_schema = 'auth'
        and c.table_name  = 'users'
        and c.column_name in (
          'instance_id','email_confirmed_at','last_sign_in_at','created_at',
          'updated_at','raw_app_meta_data','raw_user_meta_data',
          'confirmation_token','recovery_tokens','recovery_token',
          'reauthentication_token','email_change','email_change_token_new',
          'email_change_confirm_status','phone','phone_change',
          'phone_confirmed_at','phone_change_token','phone_change_sent_at',
          'new_email','new_phone','is_super_admin','is_sso_user',
          'deleted_at','banned_until','invite_sent_at'
        )
    loop
      if r.val is not null then
        v_cols := v_cols || ', ' || r.column_name;
        v_vals := v_vals || ', ' || r.val;
      end if;
    end loop;
    execute 'insert into auth.users (' || v_cols || ') values (' || v_vals || ')';
  end loop;
end;
$insu$;
do $p7c$
declare v_status text;
begin
  select status into v_status from public.profiles where id = '7e570000-0000-7e57-8000-000000000013';
  if v_status <> 'suspended' then raise exception 'P7 ÉCHEC : invitation expirée → % (attendu suspended).', v_status; end if;
  raise notice 'P7 OK : invitation expirée → fail-closed, aucun accès.';
end;
$p7c$;

-- (4) garde conditionnelle : refus d\"une invitation expirée — test
--     SÉQUENTIEL (la course simultanée reste dans auth-invite-cycle.mjs)
do $p7d$
declare gagne int;
begin
  update public.user_invitations set used_at = now()
    where id = '7f570000-0000-7f57-8000-000000000003'
      and used_at is null and revoked_at is null and expires_at > now();
  get diagnostics gagne = row_count;
  if gagne <> 0 then raise exception 'P7 ÉCHEC : une invitation EXPIRÉE a été consommée (%).', gagne; end if;
  raise notice 'P7 OK : invitation expirée non consommable (garde expires_at > now).';
end;
$p7d$;

-- (5) idempotence : 1er appel gagne, 2e appel 0 ligne
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
    raise exception 'PROUVE ÉCHEC : % lignes de test persistantes — purge manuelle requise (entête).', restantes;
  end if;
  raise notice 'PROUVE OK : aucune ligne de test persistante ; les données existantes n\"ont jamais été touchées.';
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
end;
$summary$;