-- Run this in the Supabase SQL editor if parent bells stay empty after notifying.
-- New tables are created without GRANT for anon/authenticated, so inserts/selects fail silently.

grant select, insert, update, delete on table public.app_notifications to anon, authenticated, service_role;
grant usage, select on sequence public.app_notifications_id_seq to anon, authenticated, service_role;

alter table public.app_notifications replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.app_notifications;
exception
  when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
