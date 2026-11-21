alter table public.parents_accounts
  add column if not exists phone_number text;

alter table public.teacher_profiles
  add column if not exists phone_number text;

create table if not exists public.parent_absence_excuses (
  id uuid primary key default gen_random_uuid(),
  parent_id text,
  child_id text,
  child_name text,
  parent_phone text,
  absence_date date not null,
  reason text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

alter table public.parent_absence_excuses enable row level security;

drop policy if exists "parent absence excuses access" on public.parent_absence_excuses;
create policy "parent absence excuses access"
on public.parent_absence_excuses for all
using (true) with check (true);

grant select, insert, update on table public.parent_absence_excuses to anon, authenticated;

notify pgrst, 'reload schema';
