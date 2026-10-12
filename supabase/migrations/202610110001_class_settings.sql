create table if not exists public.class_settings (
  id text primary key,
  activity_config jsonb not null default '{}'::jsonb,
  student_access jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.class_settings enable row level security;

drop policy if exists "app class settings access" on public.class_settings;
create policy "app class settings access" on public.class_settings
  for all using (true) with check (true);

notify pgrst, 'reload schema';
