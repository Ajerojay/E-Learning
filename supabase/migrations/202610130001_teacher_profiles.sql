create table if not exists public.teacher_profiles (
  teacher_id text primary key,
  full_name text not null,
  email text,
  handled_section text,
  avatar text,
  updated_at timestamptz not null default now()
);

alter table public.teacher_profiles enable row level security;

drop policy if exists "Teacher profiles are readable" on public.teacher_profiles;
create policy "Teacher profiles are readable"
on public.teacher_profiles for select
using (true);

-- This project authenticates teachers through authenticate_teacher rather than
-- a Supabase Auth session, so profile writes currently use the anon client.
drop policy if exists "Teacher profiles can be created" on public.teacher_profiles;
create policy "Teacher profiles can be created"
on public.teacher_profiles for insert
with check (true);

drop policy if exists "Teacher profiles can be updated" on public.teacher_profiles;
create policy "Teacher profiles can be updated"
on public.teacher_profiles for update
using (true)
with check (true);

grant select, insert, update on table public.teacher_profiles to anon, authenticated;
