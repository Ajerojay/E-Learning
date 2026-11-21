alter table public.parents_accounts
  add column if not exists phone_number text;

comment on column public.parents_accounts.phone_number is
  'Philippine mobile number (09XXXXXXXXX) used for attendance and allergy SMS alerts.';

create or replace function public.provision_confirmed_parent_username()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email_confirmed_at is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.email_confirmed_at is not null then
    return new;
  end if;
  if new.raw_user_meta_data ->> 'pending_registration' = 'true'
    and nullif(lower(btrim(new.raw_user_meta_data ->> 'username')), '') is not null
    and nullif(btrim(new.email), '') is not null then
    insert into public.parents_accounts (username, email, phone_number)
    values (
      lower(btrim(new.raw_user_meta_data ->> 'username')),
      lower(btrim(new.email)),
      nullif(btrim(new.raw_user_meta_data ->> 'phone_number'), '')
    )
    on conflict do nothing;
  end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';
