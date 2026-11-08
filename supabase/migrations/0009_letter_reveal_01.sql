-- Letter Reveal native animation. Execute manually after deploying the matching code.
-- Keep existing templates untouched.
do $$
declare c text;
begin
  select pg_get_constraintdef(oid) into c
  from pg_constraint where conrelid = 'public.animations'::regclass
    and conname = 'animations_component_key_check';
  if c is not null and c not like '%letter-reveal-01%' then
    alter table public.animations drop constraint animations_component_key_check;
    alter table public.animations add constraint animations_component_key_check
    check (component_key in (
      'kinetic-type-01', 'text-reveal-01', 'letter-reveal-01',
      'elastic-text-01', 'shape-morph-01', 'staggered-cards-01',
      'logo-reveal-01', 'minimal-saas-ui-01', 'notification-stack-01'
    ));
  end if;
end $$;

insert into public.animations
  (id, title, slug, description, category_id, component_key, default_config, duration, is_published, is_featured)
values (
  '00000000-0000-4000-8000-000000000018',
  'Letter Reveal — Gradient', 'letter-reveal-01',
  'Apparition progressive des lettres avec flou et dégradé, pilotée par GSAP.',
  (select id from public.categories where slug = 'typographie'),
  'letter-reveal-01',
  '{"text":"CREATE\\nMOTION","primaryColor":"#FFFFFF","accentColor":"#E879F9","backgroundColor":"#1C1533","duration":3.8,"speed":1}'::jsonb,
  3.8, false, false
)
on conflict (id) do nothing;
