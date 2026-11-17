-- حجوزات الخطط: الحجوزات القائمة بناءً على برامج الخطط الذكية واجتماعات مجموعات التعلم المهنية،
-- مع اسم البرنامج واسم الخطة. للقراءة العامة كبقية تقويم الحجوزات (لا بيانات شخصية جديدة).
create or replace function public.fb_public_plan_bookings(p_from date default null, p_to date default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $f$
declare v_from date := coalesce(p_from, (now() at time zone 'Asia/Riyadh')::date); v_to date;
begin
  v_to := coalesce(p_to, v_from);
  if v_to < v_from or v_to - v_from > 45 then raise exception 'bad_range'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'booking_id', b.id, 'ref', pb.program_ref,
      'program', coalesce(pm.title, a.data->>'name', b.purpose),
      'plan', coalesce(pc.name, pl.data->>'name'),
      'source', case when pm.id is not null then 'community' else 'smart_plans' end)
    order by b.booking_date)
    from public.sp_program_bookings pb
    join public.fb_bookings b on b.id = pb.booking_id
    left join public.pc_meetings pm on pb.program_ref = 'm:' || pm.id::text
    left join public.pc_communities pc on pc.id = pm.community_id
    left join public.sp_records a on a.col = 'executions' and a.data->>'type' = 'add' and 'c-' || a.id::text = pb.program_ref
    left join public.sp_records pl on pl.col = 'executions' and pl.data->>'type' = 'plan-add' and pl.data->'plan'->>'id' = a.data->'data'->>'plan_id'
    where b.status in ('pending','approved') and b.booking_date between v_from and v_to), '[]'::jsonb);
end $f$;
revoke execute on function public.fb_public_plan_bookings(date, date) from public;
grant execute on function public.fb_public_plan_bookings(date, date) to anon, authenticated;
