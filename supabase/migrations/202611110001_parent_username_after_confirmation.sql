alter table public.parents_accounts
  add column if not exists email text,
  alter column password drop not null;

-- Supabase Auth stores the password. Publish the username-to-email mapping
-- when the email is confirmed, even if the link opens on another device.
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
    insert into public.parents_accounts (username, email)
    values (lower(btrim(new.raw_user_meta_data ->> 'username')), lower(btrim(new.email)))
    on conflict do nothing;
  end if;
  return new;
end;
$$;

revoke execute on function public.provision_confirmed_parent_username() from public;

drop trigger if exists provision_confirmed_parent_username on auth.users;
create trigger provision_confirmed_parent_username
after insert or update of email_confirmed_at on auth.users
for each row execute function public.provision_confirmed_parent_username();

insert into public.parents_accounts (username, email)
select lower(btrim(account.raw_user_meta_data ->> 'username')), lower(btrim(account.email))
from auth.users account
where account.email_confirmed_at is not null
  and account.raw_user_meta_data ->> 'pending_registration' = 'true'
  and nullif(lower(btrim(account.raw_user_meta_data ->> 'username')), '') is not null
  and nullif(btrim(account.email), '') is not null
  and not exists (
    select 1
    from public.parents_accounts parent
    where lower(btrim(parent.email)) = lower(btrim(account.email))
  )
order by account.email_confirmed_at, account.id
on conflict do nothing;

notify pgrst, 'reload schema';
