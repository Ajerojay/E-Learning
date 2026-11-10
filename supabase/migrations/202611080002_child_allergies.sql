create table if not exists public.child_allergies (
  child_id text primary key,
  items jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.child_allergies enable row level security;

drop policy if exists "app child allergies access" on public.child_allergies;
create policy "app child allergies access"
  on public.child_allergies for all using (true) with check (true);

alter table public.children_accounts
  add column if not exists parent_allergies jsonb not null default '[]'::jsonb;

do $$
begin
  alter publication supabase_realtime add table public.child_allergies;
exception
  when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
