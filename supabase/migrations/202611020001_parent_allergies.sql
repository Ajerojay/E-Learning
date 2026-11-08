-- Allergies a parent lists on Your Child. Teachers read the same list on the health check.
alter table public.children_accounts
  add column if not exists parent_allergies jsonb not null default '[]'::jsonb;

notify pgrst, 'reload schema';
