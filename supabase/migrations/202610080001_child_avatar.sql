-- Stores the avatar a child picks on their first student login.
alter table public.children_accounts
  add column if not exists avatar text;
