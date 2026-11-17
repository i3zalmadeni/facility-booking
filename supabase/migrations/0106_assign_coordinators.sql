-- 0106: تعيين منسقي الحجز (المسؤول الرئيسي والبديل) من داخل «احجز مرفق» لمدير النواة فقط.
-- المنسق هو المسؤول الرئيسي أو البديل للمرفق في سجل المرافق، فيظهر له «طلبات الحجز» و«جدول المرافق» تلقائيًا.

-- قائمة المنسوبين الفعّالين للاختيار (مدير النواة فقط)
create or replace function public.fb_staff_options() returns jsonb
language plpgsql stable security definer set search_path = '' as $f$
begin
  if not public.fb_is_admin() then raise exception 'forbidden'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'name', m.full_name) order by m.full_name)
                   from public.staff_members m where m.is_active), '[]'::jsonb);
end $f$;

-- تعيين/تغيير منسقي مرفق واحد. null يعني بلا منسق. لا يغيّر شيئًا آخر في سجل المرافق.
create or replace function public.fb_set_coordinators(p_facility uuid, p_primary uuid, p_backup uuid) returns void
language plpgsql security definer set search_path = '' as $f$
begin
  if not public.fb_is_admin() then raise exception 'forbidden'; end if;
  if not exists (select 1 from public.facilities where id = p_facility) then raise exception 'not_found'; end if;
  if p_primary is not null and p_primary = p_backup then raise exception 'same_coordinator'; end if;
  if p_primary is not null and not exists (select 1 from public.staff_members where id = p_primary and is_active) then raise exception 'not_staff'; end if;
  if p_backup is not null and not exists (select 1 from public.staff_members where id = p_backup and is_active) then raise exception 'not_staff'; end if;
  update public.facilities set primary_staff_id = p_primary, backup_staff_id = p_backup, updated_at = now() where id = p_facility;
end $f$;

-- fb_my_facilities تُرجع الآن معرّفي المنسقين أيضًا (للعرض في الإعدادات)
create or replace function public.fb_my_facilities() returns jsonb
language sql stable security definer set search_path = '' as $f$
  select coalesce(jsonb_agg(t.x order by t.x->>'name'), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', f.id, 'code', f.code, 'name', f.name, 'type', ft.name_ar, 'building', f.building,
      'status', f.status, 'capacity', f.capacity,
      'is_bookable', coalesce(s.is_bookable, false), 'auto_approve', coalesce(s.auto_approve, false),
      'max_visitors', s.max_visitors, 'instructions', s.instructions,
      'primary_id', f.primary_staff_id, 'backup_id', f.backup_staff_id,
      'coordinators', (select coalesce(jsonb_agg(m.full_name), '[]'::jsonb) from public.staff_members m
                        where m.id in (f.primary_staff_id, f.backup_staff_id))) as x
    from public.facilities f
    left join public.fb_facility_settings s on s.facility_id = f.id
    left join public.facility_types ft on ft.code = f.type_code
    where public.fb_can_manage(f.id)) t $f$;

revoke execute on function public.fb_staff_options(), public.fb_set_coordinators(uuid, uuid, uuid) from public, anon;
grant execute on function public.fb_staff_options(), public.fb_set_coordinators(uuid, uuid, uuid) to authenticated;
