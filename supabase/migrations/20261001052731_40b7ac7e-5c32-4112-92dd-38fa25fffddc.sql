create or replace function public.remove_member(p_member uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
declare v_alias text;
begin
  if public.get_my_role() <> 'Ketua' then raise exception 'Hanya Ketua yang dapat mengeluarkan anggota'; end if;
  if p_member = auth.uid() then raise exception 'Tidak dapat mengeluarkan akun sendiri'; end if;
  if not exists (select 1 from public.profiles where id = p_member) then raise exception 'Anggota tidak ditemukan'; end if;
  v_alias := 'dikeluarkan-' || replace(p_member::text,'-','') || '@removed.myroom';
  update public.profiles set status = 'Inactive', division = null, role = 'Anggota', email = v_alias, updated_at = now() where id = p_member;
  update auth.users set email = v_alias, banned_until = 'infinity', updated_at = now() where id = p_member;
  delete from auth.refresh_tokens where user_id = p_member::text;
  delete from auth.sessions where user_id = p_member;
end; $$;
revoke all on function public.remove_member(uuid) from public, anon;
grant execute on function public.remove_member(uuid) to authenticated;