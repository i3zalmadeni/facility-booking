// الإحصائيات: الأكثر زيارة، الأكثر تفعيلاً (نسبة استغلال الحصص)، المعلمون الأكثر تفعيلاً، التوزيع بالحصص والأيام
boot("stats.html", async (m, c) => {
  const today = todayISO();
  let range = "month", from = monthStart(today), to = today, by = "visitors";
  const closedDays = ((await sb.from("fb_settings").select("closed_weekdays").eq("id", 1).maybeSingle()).data || {}).closed_weekdays || [5, 6];
  const PRE = { month: ["هذا الشهر", () => [monthStart(today), today]], d30: ["آخر 30 يوماً", () => [addDays(today, -29), today]], d90: ["آخر 90 يوماً", () => [addDays(today, -89), today]], custom: ["نطاق مخصص", null] };
  m.innerHTML = head("الإحصائيات", c.isAdmin ? "كل مرافق المدرسة. تُحتسب الحجوزات المعتمدة فقط." : "المرافق التي تنسقها فقط. تُحتسب الحجوزات المعتمدة فقط.") +
    `<div class="bar"><div class="tabs" style="margin:0" id="rg">${Object.entries(PRE).map(([k, [l]]) => `<button data-r="${k}" class="${k === range ? "on" : ""}">${l}</button>`).join("")}</div><input type="date" id="a" value="${from}" aria-label="من"><input type="date" id="b" value="${to}" aria-label="إلى"></div><div id="sOut"><p class="sub">جارٍ التحميل…</p></div>`;
  const rank = (items, val, fmtv, sub) => { const mx = Math.max(1, ...items.map(val)); return items.length ? items.map((x, i) => `<div class="rank"><span class="n ${i === 0 ? "g" : ""}">${i + 1}</span><span><b>${esc(x.name)}</b>${sub ? ` <small>${sub(x)}</small>` : ""}</span><span class="v">${fmtv(x)}</span><div class="track"><i style="width:${Math.round((val(x) / mx) * 100)}%"></i></div></div>`).join("") : '<p class="sub">لا توجد بيانات في هذه الفترة.</p>'; };
  async function load() {
    $("#sOut").innerHTML = '<p class="sub">جارٍ التحميل…</p>';
    let s; try { s = await rpc("fb_stats", { p_from: from, p_to: to }); } catch (e) { $("#sOut").innerHTML = `<p class="err">${esc(mapErr(e))}</p>`; return; }
    const cap = Math.max(1, s.days_open * s.slots_per_day), T = s.totals, F = s.facilities || [];
    const util = (f) => pct(f.periods, cap);
    const topV = [...F].filter((f) => f[by] > 0).sort((a, b) => b[by] - a[by] || b.bookings - a.bookings).slice(0, 8);
    const topU = [...F].sort((a, b) => util(b) - util(a) || b.periods - a.periods).slice(0, 8);
    const wd = Array.from({ length: 7 }, (_, d) => ({ name: DAYS_AR[d], count: (s.by_weekday.find((x) => x.dow === d) || {}).count || 0 })).filter((x, d) => !closedDays.includes(d));
    $("#sOut").innerHTML = `<div class="grid">
        <div class="kpi k0"><div class="ic">${ico("check")}</div><div><b>${T.approved}</b><span>حجوزات معتمدة</span></div></div>
        <div class="kpi k1"><div class="ic">${ico("users")}</div><div><b>${T.visitors}</b><span>إجمالي الزوار</span></div></div>
        <div class="kpi k3"><div class="ic">${ico("clock")}</div><div><b>${T.periods}</b><span>حصص مستخدمة</span></div></div>
        <div class="kpi k2"><div class="ic">${ico("hourglass")}</div><div><b>${T.pending}</b><span>بانتظار الاعتماد</span></div></div>
        <div class="kpi k4"><div class="ic">${ico("x")}</div><div><b>${T.rejected + T.cancelled}</b><span>مرفوضة وملغاة</span></div></div></div>
      <div class="grid mt">
        <div class="card"><div class="row2"><b>${ico("trophy")} المرافق الأكثر زيارة</b><div class="tabs" style="margin:0" id="by"><button data-by="visitors" class="${by === "visitors" ? "on" : ""}">بالزوار</button><button data-by="bookings" class="${by === "bookings" ? "on" : ""}">بالحجوزات</button></div></div>${rank(topV, (f) => f[by], (f) => f[by], (f) => `${f.bookings} حجز · ${f.visitors} زائر`)}</div>
        <div class="card"><b>${ico("signal")} المرافق الأكثر تفعيلاً</b><p class="sub" style="margin:2px 0 0">نسبة الحصص المحجوزة من حصص المرفق المتاحة (${s.days_open} يوم × ${s.slots_per_day} حصص).</p>${rank(topU, util, (f) => util(f) + "%", (f) => `${f.periods} حصة`)}</div>
        <div class="card"><b>${ico("users")} المعلمون الأكثر تفعيلاً للمرافق</b>${rank((s.teachers || []).slice(0, 8), (t) => t.bookings, (t) => t.bookings + " حجز", (t) => `${t.periods} حصة · ${t.visitors} زائر`)}</div></div>
      <div class="grid mt"><div class="card brk"><b>الحجوزات حسب الحصة</b>${bars(s.by_period, (x) => x.name, (x) => x.count)}</div>
        <div class="card brk"><b>الحجوزات حسب اليوم</b>${bars(wd, (x) => x.name, (x) => x.count)}</div></div>`;
    $$("#by [data-by]").forEach((b) => (b.onclick = () => { by = b.dataset.by; load(); }));
  }
  const bars = (items, nm, v) => { const mx = Math.max(1, ...items.map(v)); return items.map((x) => `<div class="row3"><span>${esc(nm(x))}</span><b>${v(x)}</b><div class="track"><i style="width:${Math.round((v(x) / mx) * 100)}%"></i></div></div>`).join("") || '<span class="sub">—</span>'; };
  const run = () => load().catch((e) => toast(mapErr(e), true));
  $("#rg").onclick = (e) => { const b = e.target.closest("[data-r]"); if (!b) return; range = b.dataset.r; $$("#rg button").forEach((x) => x.classList.toggle("on", x === b)); if (PRE[range][1]) { [from, to] = PRE[range][1](); $("#a").value = from; $("#b").value = to; run(); } };
  const cust = () => { if ($("#a").value && $("#b").value) { from = $("#a").value; to = $("#b").value; range = "custom"; $$("#rg button").forEach((x) => x.classList.toggle("on", x.dataset.r === "custom")); run(); } };
  $("#a").onchange = cust; $("#b").onchange = cust;
  await load();
}, { mgr: true });
