-- Correction additive de 0009 : authenticated ne peut pas lire auth.users.
-- Idempotente : réexécuter remplace uniquement cette politique.
-- Retour arrière MANUEL (après validation du propriétaire, hors production ici) :
--   DROP POLICY IF EXISTS invitations_read_invited ON public.user_invitations;
--   CREATE POLICY invitations_read_invited ON public.user_invitations
--     FOR SELECT TO authenticated
--     USING (lower(email) = lower(coalesce(
--       (SELECT email FROM auth.users WHERE id = auth.uid()), ''
--     )));
-- ATTENTION : ce retour arrière réintroduit le défaut de permission de 0009 ;
-- préférer une politique corrigée si une restauration est nécessaire.
drop policy if exists invitations_read_invited on public.user_invitations;
create policy invitations_read_invited on public.user_invitations
  for select to authenticated
  using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));
