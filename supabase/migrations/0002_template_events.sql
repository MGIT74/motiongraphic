-- MotionGraphic.si: anonymous aggregate copy-event tracking
-- Run once in the Supabase SQL Editor for this project.
CREATE TABLE IF NOT EXISTS public.template_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  animation_id uuid NOT NULL REFERENCES public.animations(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type = 'prompt_copy'),
  prompt_type text NOT NULL CHECK (prompt_type IN ('web', 'after_effects')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS template_events_animation_idx
  ON public.template_events(animation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS template_events_type_idx
  ON public.template_events(event_type, created_at DESC);
ALTER TABLE public.template_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.template_events FROM anon, authenticated;
GRANT INSERT ON public.template_events TO anon, authenticated;
GRANT SELECT ON public.template_events TO authenticated;
DROP POLICY IF EXISTS template_events_insert ON public.template_events;
CREATE POLICY template_events_insert ON public.template_events
FOR INSERT TO anon, authenticated WITH CHECK (
  event_type = 'prompt_copy'
  AND EXISTS (
    SELECT 1 FROM public.animations a
    WHERE a.id = animation_id AND a.is_published = true
  )
);
DROP POLICY IF EXISTS template_events_admin_read ON public.template_events;
CREATE POLICY template_events_admin_read ON public.template_events
FOR SELECT TO authenticated USING (public.is_admin());
