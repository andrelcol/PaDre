-- As funções de amizade deixam de ser security definer no schema exposto.
-- O corpo privilegiado continua em private, fora do PostgREST.
-- O papel authenticated precisa de EXECUTE nesses corpos para a função
-- pública, security invoker, conseguir chamá-los. anon continua sem EXECUTE.
-- private não entra em db-schemas.

drop function public.request_friendship(text);
drop function public.respond_to_friendship(uuid, text);
drop function public.list_my_friendships();

create function public.request_friendship(username text)
returns table (
  id uuid,
  status text,
  other_username text
)
language sql
security invoker
set search_path = ''
as $$
  select result.id, result.status, result.other_username
  from private.request_friendship(username) as result;
$$;

create function public.respond_to_friendship(
  friendship_id uuid,
  action text
)
returns table (
  id uuid,
  status text,
  other_username text
)
language sql
security invoker
set search_path = ''
as $$
  select result.id, result.status, result.other_username
  from private.respond_to_friendship(friendship_id, action) as result;
$$;

create function public.list_my_friendships()
returns table (
  id uuid,
  status text,
  side text,
  other_username text,
  created_at timestamptz,
  updated_at timestamptz,
  accepted_at timestamptz
)
language sql
security invoker
set search_path = ''
as $$
  select
    result.id,
    result.status,
    result.side,
    result.other_username,
    result.created_at,
    result.updated_at,
    result.accepted_at
  from private.list_my_friendships() as result;
$$;

revoke all on function public.request_friendship(text) from public, anon, authenticated;
revoke all on function public.respond_to_friendship(uuid, text) from public, anon, authenticated;
revoke all on function public.list_my_friendships() from public, anon, authenticated;

grant execute on function public.request_friendship(text) to authenticated;
grant execute on function public.respond_to_friendship(uuid, text) to authenticated;
grant execute on function public.list_my_friendships() to authenticated;

revoke all on function private.request_friendship(text) from public, anon, authenticated;
revoke all on function private.respond_to_friendship(uuid, text) from public, anon, authenticated;
revoke all on function private.list_my_friendships() from public, anon, authenticated;

grant execute on function private.request_friendship(text) to authenticated;
grant execute on function private.respond_to_friendship(uuid, text) to authenticated;
grant execute on function private.list_my_friendships() to authenticated;
