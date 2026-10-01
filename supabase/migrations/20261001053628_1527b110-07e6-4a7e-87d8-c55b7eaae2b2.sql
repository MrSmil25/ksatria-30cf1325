create or replace function public.cleanup_inactive_member(p_member uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.assignment_targets where member_id = p_member;
  delete from public.collection_payments where member_id = p_member and status in ('Belum_Bayar','Ditolak');
  delete from public.picket_signups where member_id = p_member;
  delete from public.meeting_attendance where member_id = p_member;
  update public.tasks set assignee_id = null where assignee_id = p_member and status not in ('Done','Cancelled');
end; $$;
revoke all on function public.cleanup_inactive_member(uuid) from public, anon, authenticated;

create or replace function public.trg_profile_inactive()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'Inactive' and old.status is distinct from 'Inactive' then
    perform public.cleanup_inactive_member(new.id);
  end if;
  return new;
end; $$;
revoke all on function public.trg_profile_inactive() from public, anon, authenticated;

drop trigger if exists profile_inactive_cleanup on public.profiles;
create trigger profile_inactive_cleanup after update of status on public.profiles
for each row execute function public.trg_profile_inactive();

do $$ declare r record; begin
  for r in select id from public.profiles where status = 'Inactive' loop
    perform public.cleanup_inactive_member(r.id);
  end loop;
end $$;