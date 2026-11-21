// الرئيسية: لمنسق البوابة «نظرة عامة» بنافذة لكل قسم (أعداد تفتح أقسامها، بلا قوائم مكررة)،
// وللمعلم ومسؤول المرفق «مكتبي»: صفحة واحدة فيها حجوزاتي (كانت صفحة مستقلة) وما ينتظر قراره على مرفقه.
boot("dashboard.html", async (m, c) => (c.asCoord ? coordHome(m, c) : myDesk(m, c)));

const kpiA = (h, i, v, t, k) => `<a class="kpi k${k} kpa" href="${h}"><div class="ic">${ico(i)}</div><div><b>${v}</b><span>${t}</span></div></a>`;
const win = (h, i, t, d, rows) => `<section class="card fbw"><a class="fbw-h" href="${h}"><span class="pb-ic">${ico(i)}</span><span><b>${t}</b><small>${d}</small></span><span class="fbw-go">فتح ‹</span></a>
  <div class="fbw-r">${rows.map(([href, label, v, tone]) => `<a href="${href}"><span>${label}</span><b class="${tone && v ? tone : ""}">${v}</b></a>`).join("")}</div></section>`;

async function coordHome(m, c) {
  const today = todayISO(), ms = monthStart(today), wk = addDays(today, 6);
  const [all, fac] = await Promise.all([rpc("fb_bookings_list", { p_mode: "manage", p_from: ms < today ? ms : today }), rpc("fb_my_facilities")]);
  const A = all || [], F = fac || [];
  const act = (b) => b.status === "pending" || b.status === "approved";
  const pend = A.filter((b) => b.status === "pending" && b.date >= today);
  const help = A.filter((b) => act(b) && b.needs_help && b.date >= today).length;
  const todayN = A.filter((b) => act(b) && b.date === today).length;
  const week = A.filter((b) => b.status === "approved" && b.date >= today && b.date <= wk).length;
  const month = A.filter((b) => b.status === "approved" && b.date >= ms && b.date <= today);
  const visitors = month.reduce((s, b) => s + (+b.visitors || 0), 0);
  const top = Object.entries(month.reduce((o, b) => ((o[b.facility] = (o[b.facility] || 0) + 1), o), {})).sort((a, b) => b[1] - a[1])[0];
  const open = F.filter((f) => f.is_bookable), noCoord = open.filter((f) => !f.primary_id && !f.backup_id), auto = open.filter((f) => f.auto_approve).length;

  m.innerHTML = `
    ${F.length && !open.length ? `<div class="alert"><b>لم يُفعَّل أي مرفق للحجز بعد.</b> فعّل المرافق المناسبة من <a href="settings.html?tab=fac">إدارة البوابة ← المرافق ومنسقوها</a> ليظهر الحجز للمعلمين.</div>` : ""}
    ${noCoord.length ? `<div class="alert"><b>مرافق مفعّلة للحجز بلا منسق:</b> ${noCoord.map((f) => esc(f.name)).join("، ")}. لن يعتمد طلباتها غيرك حتى تعيّن لها منسقًا من <a href="settings.html?tab=fac">إدارة البوابة</a>.</div>` : ""}
    <div class="grid kgrid2">${kpiA("requests.html", "inbox", pend.length, "طلبات بانتظار قرارك", 2)}${kpiA("schedule.html", "clock", todayN, "حجوزات اليوم", 1)}${kpiA("requests.html", "help", help, "تطلب مساعدة المنسق", 4)}${kpiA("stats.html", "chart", month.length, "حجوزات معتمدة هذا الشهر", 0)}</div>
    <div class="fbws">
      ${win("requests.html", "calendar", "الحجوزات", "طلبات الحجز وجدول المرافق اليومي", [["requests.html", "بانتظار قرارك", pend.length, "warn"], ["requests.html", "تطلب مساعدة المنسق", help, "warn"], ["schedule.html", "حجوزات اليوم", todayN], ["schedule.html", "معتمدة خلال 7 أيام", week]])}
      ${win("stats.html", "chart", "الإحصائيات", "هذا الشهر، للحجوزات المعتمدة فقط", [["stats.html", "الحجوزات المعتمدة", month.length], ["stats.html", "عدد الزوار", visitors], ["stats.html", "الأكثر حجزًا", top ? `${esc(top[0])} (${top[1]})` : "—"]])}
      ${win("settings.html?tab=fac", "gear", "إدارة البوابة", "المرافق ومنسقوها، والحصص، وقواعد الحجز، والإعلانات", [["settings.html?tab=fac", "مرافق مفعّلة للحجز", `${open.length} من ${F.length}`], ["settings.html?tab=fac", "مفعّلة بلا منسق", noCoord.length, "bad"], ["settings.html?tab=fac", "باعتماد تلقائي", auto]])}
    </div>`;
}

async function myDesk(m, c) {
  const today = todayISO();
  const [mine, mg] = await Promise.all([rpc("fb_bookings_list", { p_mode: "mine" }), c.ownFac ? rpc("fb_bookings_list", { p_mode: "manage", p_status: "pending" }) : []]);
  let rows = mine || [], tab = "up";
  const own = (mg || []).filter((b) => c.myFac.includes(b.facility_id));
  const groups = () => ({
    up: rows.filter((b) => (b.status === "pending" || b.status === "approved") && b.date >= today).sort((a, b) => (a.date < b.date ? -1 : 1)),
    past: rows.filter((b) => (b.status === "pending" || b.status === "approved") && b.date < today).sort((a, b) => (a.date > b.date ? -1 : 1)),
    off: rows.filter((b) => b.status === "rejected" || b.status === "cancelled"),
  });
  function paint() {
    const g = groups(), list = g[tab], wait = g.up.filter((b) => b.status === "pending").length;
    m.innerHTML = `<div class="grid kgrid2">${kpiA("#ls", "calendar", g.up.length, "حجوزاتي القادمة", 0)}${kpiA("#ls", "hourglass", wait, "بانتظار اعتماد المنسق", 3)}${c.ownFac ? kpiA("myfac.html", "inbox", own.length, "حجوزات مرفقي بانتظار قرارك", 2) : ""}</div>
      <h3 class="sec">حجوزاتي</h3>
      <div class="bar"><div class="tabs" style="margin:0">${[["up", "القادمة"], ["past", "السابقة"], ["off", "الملغاة والمرفوضة"]].map(([k, l]) => `<button type="button" class="${k === tab ? "on" : ""}" data-t="${k}">${l} (${g[k].length})</button>`).join("")}</div><a class="btn" href="book.html" style="flex:0 0 auto">${ico("plus")}حجز جديد</a></div>
      <div id="ls">${list.length ? list.map((b) => bookingCard(b, { hideBooker: true })).join("") : empty("calendar", tab === "up" ? "لا توجد حجوزات قادمة" : "لا توجد حجوزات هنا", tab === "up" ? "احجز مرفقاً لحصة قادمة من «حجز جديد»." : "")}</div>`;
    $$(".tabs [data-t]", m).forEach((b) => (b.onclick = () => { tab = b.dataset.t; paint(); }));
  }
  bkActions(m, async () => { rows = (await rpc("fb_bookings_list", { p_mode: "mine" })) || []; paint(); });
  paint();
}
