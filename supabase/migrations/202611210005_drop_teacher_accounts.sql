-- Login uses authenticate_teacher() or the built-in teacher/teacher123 account.
-- App phone/SMS and profile data live on teacher_profiles only.
drop table if exists public.teacher_accounts cascade;
