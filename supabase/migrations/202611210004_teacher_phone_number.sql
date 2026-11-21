alter table public.teacher_profiles
  add column if not exists phone_number text;

comment on column public.teacher_profiles.phone_number is
  'Philippine mobile number that receives parent SMS messages from the app.';

grant select, insert, update on table public.teacher_profiles to anon, authenticated;

notify pgrst, 'reload schema';
