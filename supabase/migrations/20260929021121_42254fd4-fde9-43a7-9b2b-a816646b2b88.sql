create table public.picket_managers (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  added_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
grant select, insert, delete on public.picket_managers to authenticated;
grant all on public.picket_managers to service_role;
alter table public.picket_managers enable row level security;

create or replace function public.is_picket_manager() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from profiles where id = auth.uid() and role = 'Ketua')
      or exists(select 1 from picket_managers where user_id = auth.uid())
$$;

create policy "pm read" on public.picket_managers for select to authenticated using (true);
create policy "pm ketua insert" on public.picket_managers for insert to authenticated
  with check (public.get_my_role() = 'Ketua');
create policy "pm ketua delete" on public.picket_managers for delete to authenticated
  using (public.get_my_role() = 'Ketua');

create table public.picket_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  week_start date not null,
  deadline timestamptz not null,
  quota integer not null default 1,
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.picket_tasks to authenticated;
grant all on public.picket_tasks to service_role;
alter table public.picket_tasks enable row level security;
create policy "pt read" on public.picket_tasks for select to authenticated using (true);
create policy "pt manage ins" on public.picket_tasks for insert to authenticated with check (public.is_picket_manager());
create policy "pt manage upd" on public.picket_tasks for update to authenticated using (public.is_picket_manager()) with check (public.is_picket_manager());
create policy "pt manage del" on public.picket_tasks for delete to authenticated using (public.is_picket_manager());
create trigger picket_tasks_updated before update on public.picket_tasks for each row execute function public.set_updated_at();

create table public.picket_signups (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.picket_tasks(id) on delete cascade,
  member_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  status text not null default 'Diambil',
  before_url text,
  after_url text,
  note text,
  submitted_at timestamptz,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (task_id, member_id)
);
grant select, insert, update, delete on public.picket_signups to authenticated;
grant all on public.picket_signups to service_role;
alter table public.picket_signups enable row level security;
create policy "ps read" on public.picket_signups for select to authenticated using (true);
create policy "ps self insert" on public.picket_signups for insert to authenticated with check (member_id = auth.uid());
create policy "ps update" on public.picket_signups for update to authenticated
  using (member_id = auth.uid() or public.is_picket_manager())
  with check (member_id = auth.uid() or public.is_picket_manager());
create policy "ps delete" on public.picket_signups for delete to authenticated
  using ((member_id = auth.uid() and status = 'Diambil') or public.is_picket_manager());
create trigger picket_signups_updated before update on public.picket_signups for each row execute function public.set_updated_at();

create or replace function public.validate_picket_signup() returns trigger
language plpgsql security definer set search_path = public as $$
declare t picket_tasks; n int; mgr boolean := public.is_picket_manager();
begin
  if new.status not in ('Diambil','Dikumpulkan','Disetujui','Ditolak') then
    raise exception 'Status piket tidak valid';
  end if;
  select * into t from picket_tasks where id = new.task_id for update;
  if tg_op = 'INSERT' then
    if now() > t.deadline then raise exception 'Deadline piket sudah lewat'; end if;
    select count(*) into n from picket_signups where task_id = new.task_id;
    if n >= t.quota then raise exception 'Kuota piket ini sudah penuh'; end if;
    new.status := 'Diambil';
  else
    if not mgr then
      -- member: may only submit proof before deadline; cannot self-approve
      if new.status not in ('Diambil','Dikumpulkan') then raise exception 'Tidak diizinkan'; end if;
      if old.status = 'Disetujui' then raise exception 'Piket sudah disetujui'; end if;
      if now() > t.deadline then raise exception 'Deadline piket sudah lewat'; end if;
      new.reviewed_by := old.reviewed_by; new.reviewed_at := old.reviewed_at; new.review_note := old.review_note;
      new.member_id := old.member_id; new.task_id := old.task_id;
    end if;
  end if;
  return new;
end $$;
create trigger picket_signups_validate before insert or update on public.picket_signups
  for each row execute function public.validate_picket_signup();

create table public.picket_fines (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles(id) on delete cascade,
  week_start date not null,
  amount bigint not null,
  reason text,
  status text not null default 'Didenda',
  collection_id uuid references public.collections(id) on delete set null,
  created_by uuid references public.profiles(id),
  cancelled_by uuid references public.profiles(id),
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.picket_fines to authenticated;
grant all on public.picket_fines to service_role;
alter table public.picket_fines enable row level security;
create policy "pf read" on public.picket_fines for select to authenticated
  using (member_id = auth.uid() or public.is_picket_manager() or public.get_my_role() in ('Ketua','Waketu','Supervisor'));
create trigger picket_fines_updated before update on public.picket_fines for each row execute function public.set_updated_at();

create or replace function public.give_picket_fine(p_member uuid, p_week date, p_amount bigint, p_reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare cid uuid; fid uuid; nm text;
begin
  if not public.is_picket_manager() then raise exception 'Hanya pengelola piket'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Nominal denda harus lebih dari 0'; end if;
  if exists(select 1 from picket_fines where member_id = p_member and week_start = p_week and status = 'Didenda') then
    raise exception 'Anggota ini sudah didenda untuk minggu tersebut';
  end if;
  select coalesce(nickname, full_name) into nm from profiles where id = p_member;
  insert into collections (kind, title, description, amount_per_person, due_date, status, created_by)
  values ('Pengumpulan', 'Denda Piket — ' || nm || ' (minggu ' || to_char(p_week,'DD Mon YYYY') || ')',
          coalesce(p_reason, 'Belum melaksanakan piket hingga deadline'), p_amount, current_date + 7, 'Aktif', auth.uid())
  returning id into cid;
  insert into collection_payments (collection_id, member_id, status) values (cid, p_member, 'Belum_Bayar');
  insert into picket_fines (member_id, week_start, amount, reason, collection_id, created_by)
  values (p_member, p_week, p_amount, p_reason, cid, auth.uid()) returning id into fid;
  perform public.notify_user(p_member, 'picket_fine', 'Denda piket',
    'Kamu dikenakan denda piket Rp ' || p_amount || '. Cek halaman Kas.', '/cash');
  return fid;
end $$;

create or replace function public.cancel_picket_fine(p_fine uuid)
returns void language plpgsql security definer set search_path = public as $$
declare f picket_fines;
begin
  if not public.is_picket_manager() then raise exception 'Hanya pengelola piket'; end if;
  select * into f from picket_fines where id = p_fine;
  if f.id is null or f.status <> 'Didenda' then raise exception 'Denda tidak ditemukan'; end if;
  if exists(select 1 from collection_payments where collection_id = f.collection_id and status = 'Lunas') then
    raise exception 'Denda sudah lunas, tidak bisa dibatalkan';
  end if;
  delete from collection_payments where collection_id = f.collection_id;
  update collections set status = 'Dibatalkan' where id = f.collection_id;
  update picket_fines set status = 'Dibatalkan', cancelled_by = auth.uid(), cancelled_at = now() where id = p_fine;
end $$;

revoke execute on function public.give_picket_fine(uuid,date,bigint,text) from anon, public;
revoke execute on function public.cancel_picket_fine(uuid) from anon, public;
grant execute on function public.give_picket_fine(uuid,date,bigint,text) to authenticated;
grant execute on function public.cancel_picket_fine(uuid) to authenticated;
grant execute on function public.is_picket_manager() to authenticated;