// الرئيسية: تتغير بحسب الدور (معلم / منسق مرفق / مدير النواة)، وتعرض ما يحتاج إجراء الآن
boot("dashboard.html", async (m, c) => {
  const today = todayISO();
  const [mine, mgr, fac] = await Promise.all([
    rpc("fb_bookings_list", { p_mode: "mine", p_from: today }),
    c.isMgr ? rpc("fb_bookings_list", { p_mode: "manage", p_from: today }) : [],
    c.isMgr ? rpc("fb_my_facilities") : [],
  ]);
  const act = (l) => (l || []).filter((b) => b.status === "pending" || b.status === "approved");
  const myUp = act(mine).sort((a, b) => (a.date < b.date ? -1 : 1));
  const pend = (mgr || []).filter((b) => b.status === "pending").sort((a, b) => (a.date < b.date ? -1 : 1));
  const todayAll = act(mgr).filter((b) => b.date === today).sort((a, b) => ((a.periods[0]?.starts || "") < (b.periods[0]?.starts || "") ? -1 : 1));
  const help = act(mgr).filter((b) => b.needs_help).length;
  const kpi = (i, v, t, k) => `<div class="kpi k${k}"><div class="ic">${ico(i)}</div><div><b>${v}</b><span>${t}</span></div></div>`;
  const reg = (h, i, k, t, d) => `<a class="card reg" href="${h}"><div class="ic k${k}">${ico(i)}</div><div><b>${t}</b><small>${d}</small></div></a>`;
  const openCnt = (fac || []).filter((f) => f.is_bookable).length;

  const kp = [kpi("calendar", myUp.length, "حجوزاتي القادمة", 0), kpi("hourglass", act(mine).filter((b) => b.status === "pending").length, "بانتظار اعتماد المنسق", 3)];
  if (c.isMgr) kp.push(kpi("inbox", pend.length, "طلبات بانتظار قرارك", 2), kpi("clock", todayAll.length, "حجوزات اليوم في مرافقك", 1), kpi("help", help, "تطلب مساعدة المنسق", 4));

  m.innerHTML = `<section class="dash-hero"><div><h2>مرحباً ${esc(c.who.name)}</h2><p>${esc(fmtDay(today))} · ${esc(fmtHijri(today))}</p></div><span class="yr"><i></i>${esc(c.role)}</span></section>
    <div class="grid">${kp.join("")}</div>
    ${c.isAdmin && fac.length && !openCnt ? `<div class="alert mt"><b>لم يُفعَّل أي مرفق للحجز بعد.</b> فعّل المرافق المناسبة من <a href="settings.html">الإعدادات</a> ليظهر الحجز للمعلمين.</div>` : ""}
    ${c.isMgr ? `<h3 class="sec">بانتظار قرارك ${pend.length ? `<span class="badge warn">${pend.length}</span>` : ""}</h3><div id="pd">${pend.length ? pend.slice(0, 6).map((b) => bookingCard(b)).join("") + (pend.length > 6 ? `<p><a href="requests.html">عرض كل الطلبات (${pend.length})</a></p>` : "") : empty("check", "لا توجد طلبات معلّقة", "ستظهر هنا طلبات الحجز الجديدة لمرافقك.")}</div>
      <h3 class="sec">حجوزات اليوم في مرافقك</h3><div id="td">${todayAll.length ? todayAll.map((b) => bookingCard(b)).join("") : '<p class="sub">لا توجد حجوزات اليوم.</p>'}</div>` : ""}
    <h3 class="sec">حجوزاتي القادمة</h3><div id="mu">${myUp.length ? myUp.slice(0, 5).map((b) => bookingCard(b, { hideBooker: true })).join("") + (myUp.length > 5 ? '<p><a href="my.html">عرض كل حجوزاتي</a></p>' : "") : empty("calendar", "لا توجد حجوزات قادمة", "احجز مرفقاً لحصة قادمة.")}<div class="acts mt"><a class="btn" href="book.html">${ico("plus")}حجز جديد</a></div></div>
    <h3 class="sec">اختصارات</h3><div class="grid">${reg("book.html", "plus", 0, "حجز جديد", "التاريخ والمرفق والحصص والأدوات.")}${reg("my.html", "calendar", 1, "حجوزاتي", "القادمة والسابقة والملغاة.")}${c.isMgr ? reg("schedule.html", "grid", 3, "جدول المرافق", "من يحجز أي حصة اليوم.") + reg("stats.html", "chart", 4, "الإحصائيات", "الأكثر زيارة والأكثر تفعيلاً.") + reg("settings.html", "gear", 2, "الإعدادات", c.isAdmin ? "المرافق والحصص وقواعد الحجز." : "إعدادات الحجز لمرافقك.") : ""}</div>`;
  bkActions(m, () => location.reload());
});
