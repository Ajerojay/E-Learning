-- Live table already exists with:
-- id, title, message, created_by, created_at, target_all, is_active
-- Classroom posts use target_all = true.
-- Health posts use target_all = false and created_by = that parent's id (pinned).

alter table if exists public.parent_announcements
  add column if not exists parent_id uuid,
  add column if not exists child_id uuid,
  add column if not exists kind text not null default 'classroom',
  add column if not exists is_pinned boolean not null default false;

update public.parent_announcements
set kind = 'health',
    is_pinned = true,
    parent_id = coalesce(parent_id, created_by)
where target_all = false;

notify pgrst, 'reload schema';
