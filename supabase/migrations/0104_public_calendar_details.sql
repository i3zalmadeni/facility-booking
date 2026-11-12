-- تقويم الحجوزات العام: المرافق المتاحة للحجز والحصص والخانات المحجوزة، مع اسم الحاجز ومادته وصورته العامة، وعدد الزوار والغرض
create or replace function public.fb_public_calendar(p_from date default null, p_to date default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $f$
declare v_today date := (now() at time zone 'Asia/Riyadh')::date; v_from date; v_to date;
begin
  v_from := coalesce(p_from, v_today); v_to := coalesce(p_to, v_from);
  if v_to < v_from or v_to - v_from > 45 then raise exception 'bad_range'; end if;
  return jsonb_build_object(
    'today', v_today, 'now', to_char(now() at time zone 'Asia/Riyadh', 'HH24:MI'),
    'closed_weekdays', coalesce((select to_jsonb(closed_weekdays) from public.fb_settings where id = 1), '[5,6]'::jsonb),
    'periods', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name_ar, 'kind', p.kind,
        'starts', to_char(p.starts_at, 'HH24:MI'), 'ends', to_char(p.ends_at, 'HH24:MI'), 'bookable', p.is_bookable) order by p.sort_order)
      from public.fb_periods p), '[]'::jsonb),
    'facilities', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name, 'type', ft.name_ar,
        'building', f.building, 'floor', f.floor, 'capacity', coalesce(s.max_visitors, f.capacity)) order by f.name)
      from public.facilities f
      join public.fb_facility_settings s on s.facility_id = f.id and s.is_bookable
      left join public.facility_types ft on ft.code = f.type_code
      where f.status <> 'closed'), '[]'::jsonb),
    'bookings', coalesce((select jsonb_agg(jsonb_build_object('date', b.booking_date, 'facility_id', b.facility_id, 'status', b.status,
        'id', b.id, 'booker', m.full_name, 'subject', m.specialty, 'photo', m.public_photo_path,
        'visitors', b.visitors, 'purpose', b.purpose, 'needs_help', b.needs_help,
        'periods', (select coalesce(jsonb_agg(bp.period_id), '[]'::jsonb) from public.fb_booking_periods bp where bp.booking_id = b.id))
        order by b.booking_date)
      from public.fb_bookings b
      join public.staff_members m on m.id = b.booked_by
      join public.fb_facility_settings s on s.facility_id = b.facility_id and s.is_bookable
      where b.status in ('pending','approved') and b.booking_date between v_from and v_to), '[]'::jsonb));
end $f$;
revoke execute on function public.fb_public_calendar(date, date) from public;
grant execute on function public.fb_public_calendar(date, date) to anon, authenticated;
