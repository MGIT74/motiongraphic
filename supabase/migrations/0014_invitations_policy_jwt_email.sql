-- 0014: invitation reads use the authenticated JWT email, never auth.users.
-- Idempotent: safe to reapply on a disposable test clone.
-- Production: DO NOT apply before user and repository-owner approval.
--
-- Manual rollback (only after explicit approval, on the intended database):
--   DROP POLICY IF EXISTS invitations_read_invited ON public.user_invitations;
--   Restore the previously approved policy definition from migration 0009
--   through a separately reviewed migration. Do not rerun or edit 0009.
--   WARNING: restoring the original auth.users lookup restores its 42501 bug.

drop policy if exists invitations_read_invited on public.user_invitations;

create policy invitations_read_invited
on public.user_invitations
for select
to authenticated
using (
  public.is_admin()
  or (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.status = 'active'
    )
    and lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
);
