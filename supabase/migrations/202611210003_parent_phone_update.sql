alter table public.parents_accounts
  add column if not exists phone_number text;

grant select, update on public.parents_accounts to anon, authenticated;

drop policy if exists "parents update phone number" on public.parents_accounts;
create policy "parents update phone number"
  on public.parents_accounts
  for update
  to anon, authenticated
  using (true)
  with check (true);

create or replace function public.save_parent_phone(p_parent_id text, p_phone text)
returns table(id uuid, phone_number text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_phone !~ '^09[0-9]{9}$' then
    raise exception 'Enter a valid Philippine mobile number';
  end if;

  update public.parents_accounts as parent
     set phone_number = p_phone
   where parent.id::text = p_parent_id
      or lower(parent.username) = lower(p_parent_id)
      or lower(parent.email) = lower(p_parent_id);

  return query
    select parent.id, parent.phone_number
      from public.parents_accounts as parent
     where parent.phone_number = p_phone
       and (
         parent.id::text = p_parent_id
         or lower(parent.username) = lower(p_parent_id)
         or lower(parent.email) = lower(p_parent_id)
       );
end;
$$;

grant execute on function public.save_parent_phone(text, text) to anon, authenticated;

notify pgrst, 'reload schema';
