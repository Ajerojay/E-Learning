-- Run once in Supabase SQL Editor.
-- This timestamp is separate from is_active: is_active means enrolled,
-- while last_active_at records when the child last used the student app.
alter table public.children_accounts
  add column if not exists last_active_at timestamptz;

create index if not exists children_accounts_last_active_at_idx
  on public.children_accounts (last_active_at desc);

