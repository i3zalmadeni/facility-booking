// نموذج الحجز: التاريخ ← المرفق ← الحصص ← عدد الزوار ← الأدوات ← مساعدة المنسق
boot("book.html", async (m, c) => {
  const [facs, per, cf] = await Promise.all([rpc("fb_facilities"), sb.from("fb_periods").select("*").order("sort_order"), sb.from("fb_settings").select("*").eq("id", 1).maybeSingle()]);
  if (per.error) throw per.error;
  const P = per.data || [], F = facs || [], cfg = cf.data || { advance_days: 30, closed_weekdays: [5, 6], max_periods_per_booking: 7 };
  if (!F.length) { m.innerHTML = empty("building", "لا توجد مرافق مفتوحة للحجز بعد", c.isAdmin ? "فعّل المرافق من الإعدادات ثم المرافق." : "يظهر المرفق هنا بعد تفعيله للحجز من مدير النواة أو منسق المرفق."); return; }
  if (!P.some((p) => p.is_bookable)) { m.innerHTML = empty("clock", "لم تُضبط الحصص بعد", c.isAdmin ? "اضبط الحصص وأزمنتها من الإعدادات." : "يضبط مدير النواة الحصص وأزمنتها أولاً."); return; }

  const today = todayISO(), maxDate = addDays(today, cfg.advance_days), closed = new Set(cfg.closed_weekdays || []);
  const isClosed = (d) => closed.has(dow(d));
  // أول يوم صالح للحجز: يتجاوز أيام الإغلاق، ويبدأ من الغد إذا انتهت حصص اليوم
  const lastEnd = P.filter((p) => p.is_bookable).reduce((a, p) => (hm(p.ends_at) > a ? hm(p.ends_at) : a), "");
  const firstOpen = () => { let d = nowHM() >= lastEnd ? addDays(today, 1) : today; for (let i = 0; i < 14 && isClosed(d); i++) d = addDays(d, 1); return d; };
  const pre = new URLSearchParams(location.search).get("f");
  let date = firstOpen(), fac = F.find((x) => x.id === pre) || F[0], sel = new Set(), avail = {}, tk = 0;

  m.innerHTML = head("حجز مرفق", "اختر التاريخ والمرفق ثم الحصص المطلوبة. يصلك قرار المنسق في صفحة حجوزاتي.") +
    `<div class="card"><h3 class="sec" style="margin-top:0">1. التاريخ والمرفق</h3><div class="fg">
      <div><label for="d">التاريخ</label><input type="date" id="d" min="${today}" max="${maxDate}" value="${date}"><p class="sub" id="dl" style="margin:4px 0 0"></p></div>
      <div><label for="f">المرفق</label><select id="f">${F.map((x) => `<option value="${x.id}" ${x.id === fac.id ? "selected" : ""}>${esc(x.name)}${x.type ? " · " + esc(x.type) : ""}</option>`).join("")}</select></div></div><div id="fc"></div></div>
    <div class="card mt"><h3 class="sec" style="margin-top:0">2. الحصص <small class="sub" id="pl"></small></h3><p class="err" id="pe"></p><div class="pgrid2" id="pg"></div></div>
    <div class="card mt"><h3 class="sec" style="margin-top:0">3. الزوار والأدوات</h3><div class="fg"><div><label for="v">عدد الزوار</label><input type="number" id="v" min="1" inputmode="numeric" placeholder="مثال: 25"><p class="sub" id="vh" style="margin:4px 0 0"></p></div>
      <div class="full"><label for="pu">الغرض من الحجز (اختياري)</label><input id="pu" maxlength="200" placeholder="مثال: تجربة علمية لطلاب الثاني المتوسط"></div></div>
      <div id="eq"></div></div>
    <div class="card mt"><h3 class="sec" style="margin-top:0">4. مساعدة منسق المرفق</h3><label class="sw"><span class="tgl"><input type="checkbox" id="h"><span></span></span>أحتاج مساعدة منسق المرفق أثناء الحجز</label><div id="hw" hidden><label for="hn">ما المطلوب من المنسق؟</label><textarea id="hn" maxlength="300" placeholder="مثال: تجهيز الأجهزة قبل بداية الحصة"></textarea></div></div>
    <div class="sumbar"><div class="s" id="sm"></div><button class="btn" id="go" disabled>إرسال الحجز</button></div>`;

  const dow2 = (d) => DAYS_AR[dow(d)];
  const drawDate = () => { const e = $("#dl"); e.className = "sub"; e.textContent = date ? `${dow2(date)} · ${fmtHijri(date)}` : ""; if (date && isClosed(date)) { e.classList.add("err"); e.textContent = `${dow2(date)} خارج أيام الحجز المعتمدة.`; } };
  const drawFac = () => {
    const co = (fac.coordinators || []).join("، "), loc = [fac.building, fac.floor && "دور " + fac.floor, fac.room_no && "غرفة " + fac.room_no].filter(Boolean).join(" · ");
    $("#fc").innerHTML = `<div class="fcard"><div class="meta">${loc ? `<span>${ico("pin")}${esc(loc)}</span>` : ""}${fac.capacity ? `<span>${ico("users")}السعة ${fac.capacity}</span>` : ""}${co ? `<span>${ico("user")}منسق المرفق: ${esc(co)}</span>` : ""}<span>${ico("check")}${fac.auto_approve ? "يُعتمد الحجز مباشرة" : "يحتاج اعتماد المنسق"}</span></div>${fac.instructions ? `<p style="margin:8px 0 0"><b>تعليمات المرفق:</b> ${esc(fac.instructions)}</p>` : ""}</div>`;
    $("#v").max = fac.capacity || ""; $("#vh").textContent = fac.capacity ? `الحد الأقصى ${fac.capacity} زائراً.` : "";
    $("#eq").innerHTML = (fac.equipment || []).length ? `<h3 class="sec">الأدوات المتوفرة في المرفق (اختر ما تحتاجه)</h3>${fac.equipment.map((e) => `<div class="eqrow"><label><input type="checkbox" data-e="${e.id}"> ${esc(e.name)} <small class="sub">(المتوفر ${e.quantity})</small></label><input type="number" min="1" max="${e.quantity}" value="1" data-q="${e.id}" disabled aria-label="الكمية"></div>`).join("")}` : '<p class="sub" style="margin-top:12px">لا توجد أدوات مسجلة لهذا المرفق في النواة.</p>';
  };
  const pState = (p) => {
    const a = avail[p.id] || { state: "free" };
    if (!p.is_bookable) return { dis: true, cls: "brk", note: p.kind === "break" ? "استراحة" : "غير متاحة" };
    if (date === today && hm(p.ends_at) <= nowHM()) return { dis: true, cls: "", note: "انتهت" };
    if (a.state === "approved") return { dis: true, cls: "taken", note: "محجوزة · " + (a.booker || "") };
    if (a.state === "pending") return { dis: true, cls: "wait", note: "بانتظار الاعتماد · " + (a.booker || "") };
    return { dis: false, cls: sel.has(p.id) ? "on" : "", note: sel.has(p.id) ? "محددة" : "متاحة" };
  };
  const drawPeriods = () => {
    $("#pe").textContent = "";
    if (!date || isClosed(date)) { $("#pg").innerHTML = '<p class="sub">اختر تاريخاً ضمن أيام الحجز لعرض الحصص.</p>'; $("#pl").textContent = ""; return; }
    $("#pg").innerHTML = P.map((p) => { const s = pState(p); return `<button type="button" class="pbtn ${s.cls}" data-p="${p.id}" ${s.dis ? "disabled" : ""} aria-pressed="${sel.has(p.id)}"><b>${esc(p.name_ar)}</b><small>${hm(p.starts_at)} – ${hm(p.ends_at)}</small><em>${esc(s.note)}</em></button>`; }).join("");
    $("#pl").textContent = sel.size ? `(${sel.size} محددة)` : "";
  };
  const selPeriods = () => P.filter((p) => sel.has(p.id));
  const valid = () => {
    const v = +$("#v").value, ps = selPeriods();
    return !!date && !isClosed(date) && ps.length > 0 && v >= 1 && (!fac.capacity || v <= fac.capacity);
  };
  const drawSum = () => {
    const ps = selPeriods();
    $("#sm").innerHTML = ps.length ? `<b>${esc(fac.name)}</b> · ${esc(fmtDay(date))} · ${ps.length} حصة (${hm(ps[0].starts_at)} – ${hm(ps[ps.length - 1].ends_at)})` : "اختر حصة واحدة على الأقل.";
    $("#go").disabled = !valid();
  };
  async function loadAvail() {
    const t = ++tk; avail = {};
    if (!date || isClosed(date)) { sel.clear(); drawPeriods(); drawSum(); return; }
    try {
      const rows = await rpc("fb_availability", { p_facility: fac.id, p_date: date });
      if (t !== tk) return;
      avail = Object.fromEntries((rows || []).map((r) => [r.period_id, r]));
    } catch (e) { toast(mapErr(e), true); }
    [...sel].forEach((id) => { const p = P.find((x) => x.id === id); if (!p || pState(p).dis) sel.delete(id); });
    drawPeriods(); drawSum();
  }

  $("#d").onchange = (e) => { date = e.target.value; sel.clear(); drawDate(); loadAvail(); };
  $("#f").onchange = (e) => { fac = F.find((x) => x.id === e.target.value); sel.clear(); drawFac(); loadAvail(); };
  $("#pg").onclick = (e) => {
    const b = e.target.closest("[data-p]"); if (!b || b.disabled) return; const id = b.dataset.p;
    if (sel.has(id)) sel.delete(id); else { if (sel.size >= cfg.max_periods_per_booking) { $("#pe").textContent = `الحد الأقصى ${cfg.max_periods_per_booking} حصص في الحجز الواحد.`; return; } sel.add(id); }
    drawPeriods(); drawSum();
  };
  $("#eq").onchange = (e) => { const cb = e.target.closest("[data-e]"); if (cb) $(`[data-q="${cb.dataset.e}"]`).disabled = !cb.checked; };
  $("#h").onchange = (e) => { $("#hw").hidden = !e.target.checked; };
  $("#v").oninput = drawSum;
  $("#go").onclick = async () => {
    if (!valid()) return; const go = $("#go"); go.disabled = true; go.textContent = "جارٍ الإرسال…";
    const equipment = $$("[data-e]:checked").map((cb) => ({ id: cb.dataset.e, quantity: +$(`[data-q="${cb.dataset.e}"]`).value || 1 }));
    try {
      const r = await rpc("fb_create_booking", { p_facility: fac.id, p_date: date, p_periods: [...sel], p_visitors: +$("#v").value, p_purpose: $("#pu").value, p_equipment: equipment, p_needs_help: $("#h").checked, p_help_note: $("#hn").value });
      toast(r.status === "approved" ? "تم الحجز واعتماده" : "أُرسل طلب الحجز إلى منسق المرفق");
      setTimeout(() => (location.href = "my.html"), 900);
    } catch (e) { toast(mapErr(e), true); go.textContent = "إرسال الحجز"; await loadAvail(); }
  };
  drawDate(); drawFac(); await loadAvail();
});
