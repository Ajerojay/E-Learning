alter table public.child_attendance
  add column if not exists teacher_id text,
  add column if not exists teacher_name text;

create index if not exists child_attendance_teacher_id_idx
  on public.child_attendance (teacher_id);

comment on column public.child_attendance.teacher_id is
  'Teacher profile key responsible for the manual attendance record.';

comment on column public.child_attendance.teacher_name is
  'Teacher display name captured when the attendance record was saved.';
