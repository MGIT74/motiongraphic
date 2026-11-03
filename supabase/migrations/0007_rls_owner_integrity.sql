-- Security hardening: align child Studio ownership with parent project.
-- Idempotent; execute after 0001, 0003, 0004, 0005 and any 0006.
-- Requires owner review and PostgreSQL tests before production use.

-- Parent ownership is checked as well as child.user_id, so a user cannot
-- attach a child record to someone else's project.
drop policy if exists studio_media_read on public.studio_media;
create policy studio_media_read on public.studio_media for select to authenticated
  using (user_id = (select auth.uid()) and exists (
    select 1 from public.studio_projects p
    where p.id = project_id and p.user_id = (select auth.uid())
  ));

drop policy if exists studio_media_insert on public.studio_media;
create policy studio_media_insert on public.studio_media for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (
    select 1 from public.studio_projects p
    where p.id = project_id and p.user_id = (select auth.uid())
  ));

drop policy if exists studio_media_delete on public.studio_media;
create policy studio_media_delete on public.studio_media for delete to authenticated
  using (user_id = (select auth.uid()) and exists (
    select 1 from public.studio_projects p
    where p.id = project_id and p.user_id = (select auth.uid())
  ));

drop policy if exists studio_versions_read on public.studio_project_versions;
create policy studio_versions_read on public.studio_project_versions for select to authenticated
  using (user_id = (select auth.uid()) and exists (
    select 1 from public.studio_projects p
    where p.id = project_id and p.user_id = (select auth.uid())
  ));

drop policy if exists studio_versions_insert on public.studio_project_versions;
create policy studio_versions_insert on public.studio_project_versions for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (
    select 1 from public.studio_projects p
    where p.id = project_id and p.user_id = (select auth.uid())
  ));

drop policy if exists studio_renders_read on public.studio_renders;
create policy studio_renders_read on public.studio_renders for select to authenticated
  using (user_id = (select auth.uid()) and exists (
    select 1 from public.studio_projects p
    where p.id = project_id and p.user_id = (select auth.uid())
  ));

drop policy if exists studio_renders_insert on public.studio_renders;
create policy studio_renders_insert on public.studio_renders for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and status = 'pending'
    and storage_path is null
    and error is null
    and exists (
      select 1 from public.studio_projects p
      where p.id = project_id and p.user_id = (select auth.uid())
    )
  );

-- RLS and SQL privileges are separate. Grant only intended operations
-- to the browser-facing Supabase roles. Service role remains unaffected.
revoke all on table
  public.categories, public.animations, public.prompts, public.profiles,
  public.favorites, public.studio_projects, public.studio_media,
  public.studio_project_versions, public.studio_renders,
  public.custom_templates
from anon, authenticated;

grant select on table
  public.categories, public.animations, public.prompts, public.custom_templates
to anon;

grant select, insert, update, delete on table
  public.categories, public.animations, public.prompts, public.profiles,
  public.studio_projects, public.custom_templates
to authenticated;

grant select, insert, delete on table public.favorites, public.studio_media
to authenticated;

grant select, insert on table public.studio_project_versions, public.studio_renders
to authenticated;
