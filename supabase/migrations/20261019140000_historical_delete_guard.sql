-- Trava temporária. Impede que apagar uma conta leve embora
-- encontro, partida, escalação confirmada, resultado ou contribuição.
-- Não é o fluxo de encerramento: a anonimização ainda não existe.
-- Uma conta sem esses vínculos continua podendo ser excluída.

alter table public.meetups
  drop constraint meetups_organizer_id_fkey;

alter table public.meetups
  add constraint meetups_organizer_id_fkey
  foreign key (organizer_id) references public.profiles (id) on delete restrict;

alter table public.matches
  drop constraint matches_created_by_fkey;

alter table public.matches
  add constraint matches_created_by_fkey
  foreign key (created_by) references public.profiles (id) on delete restrict;

alter table public.match_results
  drop constraint match_results_created_by_fkey;

alter table public.match_results
  add constraint match_results_created_by_fkey
  foreign key (created_by) references public.profiles (id) on delete restrict;

alter table public.match_player_statistics
  drop constraint match_player_statistics_user_id_fkey;

alter table public.match_player_statistics
  add constraint match_player_statistics_user_id_fkey
  foreign key (user_id) references public.profiles (id) on delete restrict;

alter table public.match_audit_logs
  drop constraint match_audit_logs_actor_id_fkey;

alter table public.match_audit_logs
  add constraint match_audit_logs_actor_id_fkey
  foreign key (actor_id) references public.profiles (id) on delete restrict;

create or replace function private.protect_profile_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.communities
    where communities.created_by = old.id
  ) then
    raise exception 'Esta conta é proprietária de uma comunidade. A exclusão foi recusada para preservar a comunidade, os encontros e o histórico esportivo. A transferência de propriedade ainda não existe.'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.meetups
    where meetups.organizer_id = old.id
      and meetups.community_id is not null
  ) then
    raise exception 'Esta conta organiza encontros comunitários. A exclusão foi recusada para preservar esses encontros e o histórico esportivo. Cancele os encontros futuros ou aguarde a transferência de organização, que ainda não existe.'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.meetups
    where meetups.organizer_id = old.id
  ) then
    raise exception 'Esta conta organiza encontros. A exclusão foi recusada para não apagar esses encontros nem o histórico de quem jogou neles. A transferência de organização ainda não existe.'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.meetup_audit_logs
    where meetup_audit_logs.actor_id = old.id
  ) then
    raise exception 'Esta conta registrou moderação de encontros. A exclusão foi recusada para preservar o autor dessa ação. A transferência ainda não existe.'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.match_player_statistics
    where match_player_statistics.user_id = old.id
  ) or exists (
    select 1
    from public.match_players
    join public.matches on matches.id = match_players.match_id
    where match_players.user_id = old.id
      and matches.status in ('pending_confirmation', 'disputed', 'confirmed')
  ) then
    raise exception 'Esta conta está na escalação de uma partida que já saiu do rascunho. A exclusão foi recusada para não alterar essa escalação, o resultado nem as estatísticas de outras pessoas. O encerramento da conta, com anonimização, ainda não existe.'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.matches
    where matches.created_by = old.id
  ) or exists (
    select 1
    from public.match_results
    where match_results.created_by = old.id
  ) then
    raise exception 'Esta conta registrou partidas ou resultados. A exclusão foi recusada para não apagar esse histórico. O encerramento da conta ainda não existe.'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.match_audit_logs
    where match_audit_logs.actor_id = old.id
  ) then
    raise exception 'Esta conta consta na auditoria de partidas. A exclusão foi recusada para manter esse registro. O encerramento da conta ainda não existe.'
      using errcode = 'P0001';
  end if;

  return old;
end;
$$;

revoke all on function private.protect_profile_delete() from public, anon, authenticated;
