-- Paste this in the Supabase SQL editor.
-- This is the notifications table used by the parent and teacher bells.
-- The app writes:
--   teacher -> parent  (attendance, allergy, emergency)
--   parent  -> teacher (allergy cards, parent messages)
-- Recipients never get a copy of their own send.

grant select, insert, update, delete on table public.app_notifications to anon, authenticated, service_role;
grant usage, select on sequence public.app_notifications_id_seq to anon, authenticated, service_role;

alter table public.app_notifications replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.app_notifications;
exception
  when duplicate_object then null;
end $$;

alter table public.app_notifications enable row level security;

drop policy if exists "app notifications access" on public.app_notifications;
drop policy if exists "parents read teacher notices" on public.app_notifications;
drop policy if exists "teachers read parent notices" on public.app_notifications;
drop policy if exists "insert app notifications" on public.app_notifications;
drop policy if exists "update app notifications" on public.app_notifications;

create policy "app notifications access"
  on public.app_notifications for all
  using (true)
  with check (
    (recipient_role = 'parent' and coalesce(sender_role, 'teacher') <> 'parent')
    or (recipient_role = 'teacher' and coalesce(sender_role, 'parent') <> 'teacher')
  );

notify pgrst, 'reload schema';
