-- Typewriter 01. Apply after deploying native React/GSAP code.
-- Extend the existing CHECK without dropping previously accepted keys.
do $$
declare definition text;
begin
  select pg_get_constraintdef(oid) into definition
  from pg_constraint where conrelid = 'public.animations'::regclass
    and conname = 'animations_component_key_check';
  if definition is not null and position('typewriter-01' in definition) = 0 then
    alter table public.animations drop constraint animations_component_key_check;
    alter table public.animations add constraint animations_component_key_check
      check (component_key in (
        'kinetic-type-01', 'text-reveal-01', 'elastic-text-01',
        'shape-morph-01', 'staggered-cards-01', 'logo-reveal-01',
        'minimal-saas-ui-01', 'notification-stack-01',
        'letter-reveal-01', 'typewriter-01'
      ));
  end if;
end $$;

insert into public.animations
  (id, title, slug, description, category_id, component_key, default_config, duration, is_published, is_featured)
values (
  '00000000-0000-4000-8000-000000000019',
  'Typewriter — Minimal', 'typewriter-01',
  'Animation de saisie progressive, caractère par caractère, avec curseur.',
  (select id from public.categories where slug = 'typographie'),
  'typewriter-01',
  '{"text":"YOUR NEXT IDEA","primaryColor":"#F5F5F7","accentColor":"#72F1B8","backgroundColor":"#0E1016","duration":4,"speed":1}'::jsonb,
  4, false, false
)
on conflict (id) do nothing;
