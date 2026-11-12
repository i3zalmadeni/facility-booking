-- ============================================================================
-- احجز مرفق: نظام حجز المرافق المرتبط بالنواة الرقمية (متوسطة لبيد بن ربيعة)
-- يعمل على قاعدة النواة نفسها. لا يعدّل أي جدول في النواة؛ يقرأ منها فقط:
--   facilities, facility_types, facility_equipment, staff_members, is_core_admin()
-- جميع جداول النظام بالبادئة fb_. تنفيذ الكتابة يتم عبر دوال محمية (SECURITY DEFINER)
-- والجداول نفسها للقراءة فقط من العميل، فلا يمكن تجاوز قواعد الحجز من المتصفح.
-- ============================================================================

-- ---------- الجداول ----------

-- الحصص والفسحة وأزمنتها (تُعدَّل من الإعدادات)
create table if not exists public.fb_periods (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name_ar     text not null,
  kind        text not null check (kind in ('class','break')),
  sort_order  int  not null,
  starts_at   time not null,
  ends_at     time not null,
  is_bookable boolean not null default true,
  updated_at  timestamptz not null default now(),
  check (ends_at > starts_at)
);

-- إعدادات عامة (صف واحد)
create table if not exists public.fb_settings (
  id                      int primary key default 1 check (id = 1),
  advance_days            int not null default 30 check (advance_days between 1 and 365),
  closed_weekdays         int[] not null default '{5,6}',   -- 0=الأحد ... 5=الجمعة 6=السبت
  max_periods_per_booking int not null default 7 check (max_periods_per_booking between 1 and 12),
  updated_at              timestamptz not null default now()
);

-- إعدادات الحجز لكل مرفق (المرفق نفسه وبياناته وتجهيزاته تبقى في النواة)
create table if not exists public.fb_facility_settings (
  facility_id  uuid primary key references public.facilities(id) on delete cascade,
  is_bookable  boolean not null default false,
  auto_approve boolean not null default false,
  max_visitors int check (max_visitors is null or max_visitors > 0),
  instructions text,
  updated_at   timestamptz not null default now()
);

create table if not exists public.fb_bookings (
  id            uuid primary key default gen_random_uuid(),
  facility_id   uuid not null references public.facilities(id),
  booked_by     uuid not null references public.staff_members(id),
  booking_date  date not null,
  visitors      int  not null check (visitors > 0),
  purpose       text,
  needs_help    boolean not null default false,
  help_note     text,
  status        text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  decided_by    uuid references public.staff_members(id),
  decided_at    timestamptz,
  decision_note text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists fb_bookings_date_idx on public.fb_bookings (booking_date, facility_id);
create index if not exists fb_bookings_user_idx on public.fb_bookings (booked_by, booking_date desc);

-- حصص الحجز. الفهرس الفريد الجزئي هو الضمان النهائي لمنع ازدواج الحجز
create table if not exists public.fb_booking_periods (
  booking_id   uuid not null references public.fb_bookings(id) on delete cascade,
  period_id    uuid not null references public.fb_periods(id),
  facility_id  uuid not null references public.facilities(id),
  booking_date date not null,
  active       boolean not null default true,
  primary key (booking_id, period_id)
);
create unique index if not exists fb_booking_periods_slot_uq
  on public.fb_booking_periods (facility_id, booking_date, period_id) where active;

-- الأدوات المطلوبة (تُنسخ أسماؤها وقت الحجز لتبقى في السجل)
create table if not exists public.fb_booking_items (
  id           uuid primary key default gen_random_uuid(),
  booking_id   uuid not null references public.fb_bookings(id) on delete cascade,
  equipment_id uuid references public.facility_equipment(id) on delete set null,
  name         text not null,
  quantity     int  not null check (quantity > 0)
);
create index if not exists fb_booking_items_booking_idx on public.fb_booking_items (booking_id);

-- ---------- بيانات أولية (قابلة للتعديل من الإعدادات) ----------
insert into public.fb_settings (id) values (1) on conflict (id) do nothing;

-- أزمنة افتراضية مبدئية فقط؛ يعدّلها مدير النواة من صفحة الإعدادات
insert into public.fb_periods (code, name_ar, kind, sort_order, starts_at, ends_at, is_bookable) values
  ('p1','الحصة الأولى','class',1,'07:00','07:45',true),
  ('p2','الحصة الثانية','class',2,'07:45','08:30',true),
  ('p3','الحصة الثالثة','class',3,'08:30','09:15',true),
  ('brk','الفسحة','break',4,'09:15','09:45',false),
  ('p4','الحصة الرابعة','class',5,'09:45','10:30',true),
  ('p5','الحصة الخامسة','class',6,'10:30','11:15',true),
  ('p6','الحصة السادسة','class',7,'11:15','12:00',true),
  ('p7','الحصة السابعة','class',8,'12:00','12:45',true)
on conflict (code) do nothing;

-- صف إعدادات لكل مرفق موجود في النواة (غير مفعّل للحجز حتى يفعّله المسؤول)
insert into public.fb_facility_settings (facility_id) select id from public.facilities on conflict do nothing;

-- ---------- دوال الهوية والصلاحية ----------
create or replace function public.fb_me() returns uuid
language sql stable security definer set search_path = '' as $f$
  select id from public.staff_members where user_id = auth.uid() and is_active limit 1 $f$;

create or replace function public.fb_is_admin() returns boolean
language sql stable security definer set search_path = '' as $f$
  select coalesce(public.is_core_admin(), false) $f$;

-- منسق الحجز = المسؤول الرئيسي أو البديل عن المرفق في سجل المرافق بالنواة
create or replace function public.fb_is_coord(p_facility uuid) returns boolean
language sql stable security definer set search_path = '' as $f$
  select coalesce(exists (select 1 from public.facilities f
    where f.id = p_facility and public.fb_me() is not null
      and public.fb_me() in (f.primary_staff_id, f.backup_staff_id)), false) $f$;

create or replace function public.fb_can_manage(p_facility uuid) returns boolean
language sql stable security definer set search_path = '' as $f$
  select public.fb_is_admin() or public.fb_is_coord(p_facility) $f$;

-- من أنا في هذا النظام
create or replace function public.fb_whoami() returns jsonb
language sql stable security definer set search_path = '' as $f$
  select case when public.fb_me() is null then null else jsonb_build_object(
    'staff_id', public.fb_me(),
    'name', (select full_name from public.staff_members where id = public.fb_me()),
    'is_admin', public.fb_is_admin(),
    'facility_ids', coalesce((select jsonb_agg(f.id) from public.facilities f
        where public.fb_me() in (f.primary_staff_id, f.backup_staff_id)), '[]'::jsonb)) end $f$;

-- ---------- سياسات RLS: القراءة فقط من العميل ----------
alter table public.fb_periods          enable row level security;
alter table public.fb_settings         enable row level security;
alter table public.fb_facility_settings enable row level security;
alter table public.fb_bookings         enable row level security;
alter table public.fb_booking_periods  enable row level security;
alter table public.fb_booking_items    enable row level security;

drop policy if exists fb_periods_read on public.fb_periods;
create policy fb_periods_read on public.fb_periods for select to authenticated using (public.fb_me() is not null);
drop policy if exists fb_periods_admin on public.fb_periods;
create policy fb_periods_admin on public.fb_periods for update to authenticated using (public.fb_is_admin()) with check (public.fb_is_admin());

drop policy if exists fb_settings_read on public.fb_settings;
create policy fb_settings_read on public.fb_settings for select to authenticated using (public.fb_me() is not null);
drop policy if exists fb_settings_admin on public.fb_settings;
create policy fb_settings_admin on public.fb_settings for update to authenticated using (public.fb_is_admin()) with check (public.fb_is_admin());

drop policy if exists fb_fs_read on public.fb_facility_settings;
create policy fb_fs_read on public.fb_facility_settings for select to authenticated using (public.fb_me() is not null);
drop policy if exists fb_fs_ins on public.fb_facility_settings;
create policy fb_fs_ins on public.fb_facility_settings for insert to authenticated with check (public.fb_can_manage(facility_id));
drop policy if exists fb_fs_upd on public.fb_facility_settings;
create policy fb_fs_upd on public.fb_facility_settings for update to authenticated using (public.fb_can_manage(facility_id)) with check (public.fb_can_manage(facility_id));

drop policy if exists fb_bookings_read on public.fb_bookings;
create policy fb_bookings_read on public.fb_bookings for select to authenticated
  using (booked_by = public.fb_me() or public.fb_can_manage(facility_id));
drop policy if exists fb_bp_read on public.fb_booking_periods;
create policy fb_bp_read on public.fb_booking_periods for select to authenticated
  using (exists (select 1 from public.fb_bookings b where b.id = booking_id));
drop policy if exists fb_bi_read on public.fb_booking_items;
create policy fb_bi_read on public.fb_booking_items for select to authenticated
  using (exists (select 1 from public.fb_bookings b where b.id = booking_id));

revoke all on public.fb_periods, public.fb_settings, public.fb_facility_settings,
  public.fb_bookings, public.fb_booking_periods, public.fb_booking_items from anon, public, authenticated;
grant select on public.fb_periods, public.fb_settings, public.fb_facility_settings,
  public.fb_bookings, public.fb_booking_periods, public.fb_booking_items to authenticated;
grant update on public.fb_periods, public.fb_settings to authenticated;
grant insert, update on public.fb_facility_settings to authenticated;

-- ---------- المحافظة على التزامن بين حالة الحجز وحصصه ----------
create or replace function public.fb_sync_active() returns trigger
language plpgsql security definer set search_path = '' as $f$
begin
  new.updated_at := now();
  if new.status is distinct from old.status then
    update public.fb_booking_periods set active = (new.status in ('pending','approved')) where booking_id = new.id;
  end if;
  return new;
end $f$;
drop trigger if exists fb_bookings_sync on public.fb_bookings;
create trigger fb_bookings_sync before update on public.fb_bookings for each row execute function public.fb_sync_active();

-- ---------- دوال القراءة ----------

-- المرافق المفتوحة للحجز مع تجهيزاتها ومنسقيها
create or replace function public.fb_facilities() returns jsonb
language sql stable security definer set search_path = '' as $f$
  select coalesce(jsonb_agg(t.x order by t.x->>'name'), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', f.id, 'code', f.code, 'name', f.name, 'type', ft.name_ar,
      'building', f.building, 'floor', f.floor, 'room_no', f.room_no,
      'capacity', coalesce(s.max_visitors, f.capacity),
      'auto_approve', s.auto_approve, 'instructions', s.instructions,
      'coordinators', (select coalesce(jsonb_agg(m.full_name), '[]'::jsonb) from public.staff_members m
                        where m.id in (f.primary_staff_id, f.backup_staff_id)),
      'equipment', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name, 'quantity', e.quantity) order by e.name), '[]'::jsonb)
                      from public.facility_equipment e where e.facility_id = f.id)) as x
    from public.facilities f
    join public.fb_facility_settings s on s.facility_id = f.id
    left join public.facility_types ft on ft.code = f.type_code
    where s.is_bookable and f.status <> 'closed' and public.fb_me() is not null) t $f$;

-- المرافق التي يديرها المستخدم (الكل لمدير النواة) مع إعدادات الحجز
create or replace function public.fb_my_facilities() returns jsonb
language sql stable security definer set search_path = '' as $f$
  select coalesce(jsonb_agg(t.x order by t.x->>'name'), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', f.id, 'code', f.code, 'name', f.name, 'type', ft.name_ar, 'building', f.building,
      'status', f.status, 'capacity', f.capacity,
      'is_bookable', coalesce(s.is_bookable, false), 'auto_approve', coalesce(s.auto_approve, false),
      'max_visitors', s.max_visitors, 'instructions', s.instructions,
      'coordinators', (select coalesce(jsonb_agg(m.full_name), '[]'::jsonb) from public.staff_members m
                        where m.id in (f.primary_staff_id, f.backup_staff_id))) as x
    from public.facilities f
    left join public.fb_facility_settings s on s.facility_id = f.id
    left join public.facility_types ft on ft.code = f.type_code
    where public.fb_can_manage(f.id)) t $f$;

-- توفر الحصص لمرفق في تاريخ (يظهر لكل المنسوبين اسم من حجز الحصة)
create or replace function public.fb_availability(p_facility uuid, p_date date)
returns table (period_id uuid, state text, booker text)
language sql stable security definer set search_path = '' as $f$
  select p.id, case when bp.booking_id is null then 'free' else b.status end, m.full_name
  from public.fb_periods p
  left join public.fb_booking_periods bp
         on bp.period_id = p.id and bp.facility_id = p_facility and bp.booking_date = p_date and bp.active
  left join public.fb_bookings b on b.id = bp.booking_id
  left join public.staff_members m on m.id = b.booked_by
  where public.fb_me() is not null
  order by p.sort_order $f$;

-- قائمة الحجوزات: mine = حجوزاتي، manage = حجوزات المرافق التي أديرها
create or replace function public.fb_bookings_list(
  p_mode text, p_from date default null, p_to date default null,
  p_status text default null, p_facility uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $f$
declare v_me uuid := public.fb_me(); v_adm boolean := public.fb_is_admin();
begin
  if v_me is null then raise exception 'not_staff'; end if;
  if p_mode not in ('mine','manage') then raise exception 'bad_mode'; end if;
  if p_mode = 'manage' and not (v_adm or exists (select 1 from public.facilities f where v_me in (f.primary_staff_id, f.backup_staff_id))) then
    raise exception 'forbidden';
  end if;
  return coalesce((
    select jsonb_agg(x.j order by x.d desc, x.c desc) from (
      select b.booking_date d, b.created_at c, jsonb_build_object(
        'id', b.id, 'facility_id', b.facility_id, 'facility', f.name, 'building', f.building,
        'date', b.booking_date, 'visitors', b.visitors, 'purpose', b.purpose,
        'needs_help', b.needs_help, 'help_note', b.help_note, 'status', b.status,
        'decision_note', b.decision_note, 'decided_by', dm.full_name, 'decided_at', b.decided_at,
        'created_at', b.created_at, 'booker', m.full_name, 'mine', (b.booked_by = v_me),
        'can_manage', (v_adm or v_me in (f.primary_staff_id, f.backup_staff_id)),
        'periods', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name_ar, 'starts', p.starts_at, 'ends', p.ends_at) order by p.sort_order), '[]'::jsonb)
                      from public.fb_booking_periods bp join public.fb_periods p on p.id = bp.period_id where bp.booking_id = b.id),
        'items', (select coalesce(jsonb_agg(jsonb_build_object('name', i.name, 'quantity', i.quantity) order by i.name), '[]'::jsonb)
                    from public.fb_booking_items i where i.booking_id = b.id)) j
      from public.fb_bookings b
      join public.facilities f on f.id = b.facility_id
      join public.staff_members m on m.id = b.booked_by
      left join public.staff_members dm on dm.id = b.decided_by
      where ((p_mode = 'mine' and b.booked_by = v_me)
          or (p_mode = 'manage' and (v_adm or v_me in (f.primary_staff_id, f.backup_staff_id))))
        and (p_from is null or b.booking_date >= p_from)
        and (p_to is null or b.booking_date <= p_to)
        and (p_status is null or b.status = p_status)
        and (p_facility is null or b.facility_id = p_facility)
      order by b.booking_date desc, b.created_at desc limit 500) x), '[]'::jsonb);
end $f$;

-- ---------- دوال التنفيذ ----------

create or replace function public.fb_create_booking(
  p_facility uuid, p_date date, p_periods uuid[], p_visitors int,
  p_purpose text default null, p_equipment jsonb default '[]'::jsonb,
  p_needs_help boolean default false, p_help_note text default null) returns jsonb
language plpgsql security definer set search_path = '' as $f$
declare
  v_me uuid := public.fb_me();
  cfg public.fb_settings; fs public.fb_facility_settings; fac public.facilities; eq public.facility_equipment;
  v_today date := (now() at time zone 'Asia/Riyadh')::date;
  v_now time := (now() at time zone 'Asia/Riyadh')::time;
  v_bid uuid; v_n int; v_cap int; v_status text; it jsonb; q int;
begin
  if v_me is null then raise exception 'not_staff'; end if;
  select * into cfg from public.fb_settings where id = 1;
  select * into fac from public.facilities where id = p_facility;
  select * into fs from public.fb_facility_settings where facility_id = p_facility;
  if fac.id is null or fs.facility_id is null or not fs.is_bookable or fac.status = 'closed' then raise exception 'facility_unavailable'; end if;
  if p_date is null or p_date < v_today then raise exception 'date_past'; end if;
  if p_date > v_today + cfg.advance_days then raise exception 'date_too_far'; end if;
  if extract(dow from p_date)::int = any (cfg.closed_weekdays) then raise exception 'date_closed'; end if;
  if p_periods is null or coalesce(array_length(p_periods, 1), 0) = 0 then raise exception 'no_periods'; end if;
  if (select count(distinct x) from unnest(p_periods) x) > cfg.max_periods_per_booking then raise exception 'too_many_periods'; end if;
  select count(*) into v_n from public.fb_periods
    where id = any (p_periods) and is_bookable and (p_date > v_today or ends_at > v_now);
  if v_n <> (select count(distinct x) from unnest(p_periods) x) then raise exception 'period_unavailable'; end if;
  if p_visitors is null or p_visitors < 1 then raise exception 'visitors_invalid'; end if;
  v_cap := coalesce(fs.max_visitors, fac.capacity);
  if v_cap is not null and p_visitors > v_cap then raise exception 'over_capacity'; end if;
  v_status := case when fs.auto_approve then 'approved' else 'pending' end;

  begin
    insert into public.fb_bookings (facility_id, booked_by, booking_date, visitors, purpose, needs_help, help_note, status, decided_at)
    values (p_facility, v_me, p_date, p_visitors, nullif(btrim(p_purpose), ''), coalesce(p_needs_help, false),
            case when coalesce(p_needs_help, false) then nullif(btrim(p_help_note), '') end, v_status,
            case when v_status = 'approved' then now() end)
    returning id into v_bid;
    insert into public.fb_booking_periods (booking_id, period_id, facility_id, booking_date)
      select v_bid, x, p_facility, p_date from (select distinct unnest(p_periods) as x) s;
  exception when unique_violation then
    raise exception 'slot_taken';
  end;

  for it in select * from jsonb_array_elements(coalesce(p_equipment, '[]'::jsonb)) loop
    select * into eq from public.facility_equipment where id = (it->>'id')::uuid and facility_id = p_facility;
    if eq.id is null then raise exception 'equipment_invalid'; end if;
    q := (it->>'quantity')::int;
    if q is null or q < 1 or q > eq.quantity then raise exception 'equipment_quantity'; end if;
    insert into public.fb_booking_items (booking_id, equipment_id, name, quantity) values (v_bid, eq.id, eq.name, q);
  end loop;

  return jsonb_build_object('id', v_bid, 'status', v_status);
end $f$;

-- قرار المنسق: اعتماد أو رفض (مع سبب)
create or replace function public.fb_decide_booking(p_id uuid, p_approve boolean, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $f$
declare b public.fb_bookings;
begin
  select * into b from public.fb_bookings where id = p_id for update;
  if b.id is null then raise exception 'not_found'; end if;
  if not public.fb_can_manage(b.facility_id) then raise exception 'forbidden'; end if;
  if b.status <> 'pending' then raise exception 'not_pending'; end if;
  if not p_approve and nullif(btrim(p_note), '') is null then raise exception 'note_required'; end if;
  update public.fb_bookings set status = case when p_approve then 'approved' else 'rejected' end,
    decided_by = public.fb_me(), decided_at = now(), decision_note = nullif(btrim(p_note), '') where id = p_id;
end $f$;

-- الإلغاء: صاحب الحجز (قبل انقضاء تاريخه) أو المنسق/المدير
create or replace function public.fb_cancel_booking(p_id uuid, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $f$
declare b public.fb_bookings; v_today date := (now() at time zone 'Asia/Riyadh')::date; v_owner boolean; v_mgr boolean;
begin
  select * into b from public.fb_bookings where id = p_id for update;
  if b.id is null then raise exception 'not_found'; end if;
  v_owner := (b.booked_by = public.fb_me()); v_mgr := public.fb_can_manage(b.facility_id);
  if not (v_owner or v_mgr) then raise exception 'forbidden'; end if;
  if b.status not in ('pending','approved') then raise exception 'not_active'; end if;
  if v_owner and not v_mgr and b.booking_date < v_today then raise exception 'date_past'; end if;
  update public.fb_bookings set status = 'cancelled',
    decided_by = case when v_mgr and not v_owner then public.fb_me() else decided_by end,
    decided_at = case when v_mgr and not v_owner then now() else decided_at end,
    decision_note = coalesce(nullif(btrim(p_note), ''), decision_note) where id = p_id;
end $f$;

-- ---------- الإحصائيات (مدير النواة: كل المرافق، المنسق: مرافقه فقط) ----------
create or replace function public.fb_stats(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $f$
declare v_me uuid := public.fb_me(); v_adm boolean := public.fb_is_admin(); v_days int; v_slots int; res jsonb;
begin
  if v_me is null or not (v_adm or exists (select 1 from public.facilities f where v_me in (f.primary_staff_id, f.backup_staff_id))) then
    raise exception 'forbidden';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 then raise exception 'bad_range'; end if;
  select count(*) into v_days from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') d
    where not (extract(dow from d)::int = any (coalesce((select closed_weekdays from public.fb_settings where id = 1), '{}'::int[])));
  select count(*) into v_slots from public.fb_periods where is_bookable;

  with scope_f as (
    select f.id from public.facilities f where v_adm or v_me in (f.primary_staff_id, f.backup_staff_id)),
  allb as (
    select b.* from public.fb_bookings b
     where b.booking_date between p_from and p_to and b.facility_id in (select id from scope_f)),
  ok as (
    select b.id, b.facility_id, b.booked_by, b.visitors,
           (select count(*) from public.fb_booking_periods bp where bp.booking_id = b.id)::int as pc
      from allb b where b.status = 'approved')
  select jsonb_build_object(
    'days_open', v_days, 'slots_per_day', v_slots,
    'totals', jsonb_build_object(
      'approved', (select count(*) from ok),
      'pending', (select count(*) from allb where status = 'pending'),
      'rejected', (select count(*) from allb where status = 'rejected'),
      'cancelled', (select count(*) from allb where status = 'cancelled'),
      'visitors', (select coalesce(sum(visitors), 0) from ok),
      'periods', (select coalesce(sum(pc), 0) from ok)),
    'facilities', coalesce((
      select jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name, 'bookings', coalesce(o.bk, 0),
                                          'visitors', coalesce(o.vs, 0), 'periods', coalesce(o.pc, 0))
                       order by coalesce(o.bk, 0) desc, f.name)
        from public.facilities f
        join scope_f sf on sf.id = f.id
        join public.fb_facility_settings s on s.facility_id = f.id and s.is_bookable
        left join (select facility_id, count(*) bk, sum(visitors) vs, sum(pc) pc from ok group by facility_id) o on o.facility_id = f.id
    ), '[]'::jsonb),
    'teachers', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'name', m.full_name, 'bookings', t.bk, 'visitors', t.vs, 'periods', t.pc)
                       order by t.bk desc, m.full_name)
        from (select booked_by, count(*) bk, sum(visitors) vs, sum(pc) pc from ok group by booked_by) t
        join public.staff_members m on m.id = t.booked_by
    ), '[]'::jsonb),
    'by_period', coalesce((
      select jsonb_agg(jsonb_build_object('name', p.name_ar, 'count', coalesce(c.n, 0)) order by p.sort_order)
        from public.fb_periods p
        left join (select bp.period_id, count(*) n from public.fb_booking_periods bp join ok on ok.id = bp.booking_id group by bp.period_id) c on c.period_id = p.id
       where p.is_bookable
    ), '[]'::jsonb),
    'by_weekday', coalesce((
      select jsonb_agg(jsonb_build_object('dow', d.dow, 'count', d.n) order by d.dow)
        from (select extract(dow from b.booking_date)::int dow, count(*) n from allb b join ok on ok.id = b.id group by 1) d
    ), '[]'::jsonb)
  ) into res;
  return res;
end $f$;

-- ---------- صلاحيات التنفيذ ----------
revoke execute on function public.fb_me(), public.fb_is_admin(), public.fb_is_coord(uuid), public.fb_can_manage(uuid),
  public.fb_whoami(), public.fb_facilities(), public.fb_my_facilities(), public.fb_availability(uuid, date),
  public.fb_bookings_list(text, date, date, text, uuid),
  public.fb_create_booking(uuid, date, uuid[], int, text, jsonb, boolean, text),
  public.fb_decide_booking(uuid, boolean, text), public.fb_cancel_booking(uuid, text),
  public.fb_stats(date, date), public.fb_sync_active() from public, anon;
grant execute on function public.fb_me(), public.fb_is_admin(), public.fb_is_coord(uuid), public.fb_can_manage(uuid),
  public.fb_whoami(), public.fb_facilities(), public.fb_my_facilities(), public.fb_availability(uuid, date),
  public.fb_bookings_list(text, date, date, text, uuid),
  public.fb_create_booking(uuid, date, uuid[], int, text, jsonb, boolean, text),
  public.fb_decide_booking(uuid, boolean, text), public.fb_cancel_booking(uuid, text),
  public.fb_stats(date, date) to authenticated;
