// جدول المرافق اليومي: الحصص في الصفوف والمرافق في الأعمدة
boot("schedule.html", async (m, c) => {
  const [per, fa] = await Promise.all([sb.from("fb_periods").select("*").order("sort_order"), rpc("fb_my_facilities")]);
  if (per.error) throw per.error;
  const P = per.data || [], F = (fa || []).filter((f) => f.is_bookable);
  if (!F.length) { m.innerHTML = empty("building", "لا توجد مرافق مفعّلة للحجز ضمن صلاحياتك", "فعّل المرفق من صفحة الإعدادات."); return; }
  let date = todayISO(), rows = [];
  m.innerHTML = head("جدول المرافق", "الحجوزات المعتمدة (أخضر) والمنتظرة (برتقالي) لكل مرفق في اليوم المختار. اضغط الخانة لعرض التفاصيل.") +
    `<div class="datebar"><button class="btn sec sm" id="pv">${ico("up")}اليوم السابق</button><input type="date" id="d" value="${date}"><button class="btn sec sm" id="nx">اليوم التالي</button><button class="btn sec sm" id="tdy">اليوم</button><span class="t" id="dt"></span></div><div class="tw card" id="g" style="padding:0"></div>`;
  async function load() {
    $("#dt").textContent = `${fmtDay(date)} · ${fmtHijri(date)}`;
    rows = (await rpc("fb_bookings_list", { p_mode: "manage", p_from: date, p_to: date })).filter((b) => b.status === "pending" || b.status === "approved");
    draw();
  }
  function draw() {
    const cell = (p, f) => {
      const b = rows.find((x) => x.facility_id === f.id && x.periods.some((q) => q.id === p.id));
      return b ? `<button class="cell ${b.status}" data-b="${b.id}"><b>${esc(b.booker)}</b><small>${b.visitors} زائر${b.status === "pending" ? " · بانتظار الاعتماد" : ""}${b.needs_help ? " · يحتاج مساعدة" : ""}</small></button>` : '<span class="cellfree">—</span>';
    };
    $("#g").innerHTML = `<table class="sch"><thead><tr><th>الحصة</th>${F.map((f) => `<th>${esc(f.name)}</th>`).join("")}</tr></thead><tbody>${P.map((p) => p.is_bookable ? `<tr><td><b>${esc(p.name_ar)}</b><br><small class="sub">${hm(p.starts_at)} – ${hm(p.ends_at)}</small></td>${F.map((f) => `<td>${cell(p, f)}</td>`).join("")}</tr>` : `<tr class="brkrow"><td colspan="${F.length + 1}">${esc(p.name_ar)} · ${hm(p.starts_at)} – ${hm(p.ends_at)}</td></tr>`).join("")}</tbody></table>`;
  }
  const go = (d) => { date = d; $("#d").value = d; load().catch((x) => toast(mapErr(x), true)); };
  $("#d").onchange = (e) => e.target.value && go(e.target.value);
  $("#pv").onclick = () => go(addDays(date, -1)); $("#nx").onclick = () => go(addDays(date, 1)); $("#tdy").onclick = () => go(todayISO());
  $("#g").onclick = (e) => {
    const t = e.target.closest("[data-b]"); if (!t) return; const b = rows.find((x) => x.id === t.dataset.b);
    const md = modal(`<h3>تفاصيل الحجز</h3>${bookingCard(b)}<div class="acts mt"><button class="btn sec" id="cx">إغلاق</button></div>`, true);
    $("#cx", md.el).onclick = md.close;
    bkActions(md.el, async () => { md.close(); await load(); });
  };
  await load();
}, { mgr: true });
