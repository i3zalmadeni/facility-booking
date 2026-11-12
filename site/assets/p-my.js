// حجوزاتي: القادمة والسابقة والملغاة/المرفوضة
boot("my.html", async (m, c) => {
  let rows = [], tab = "up";
  const today = todayISO();
  const load = async () => { rows = (await rpc("fb_bookings_list", { p_mode: "mine" })) || []; };
  const groups = () => ({
    up: rows.filter((b) => (b.status === "pending" || b.status === "approved") && b.date >= today).sort((a, b) => (a.date < b.date ? -1 : 1)),
    past: rows.filter((b) => (b.status === "pending" || b.status === "approved") && b.date < today),
    off: rows.filter((b) => b.status === "rejected" || b.status === "cancelled"),
  });
  function paint() {
    const g = groups(), list = g[tab];
    m.innerHTML = head("حجوزاتي", "تابع حالة طلباتك. يمكنك إلغاء الحجز القادم قبل موعده.") +
      `<div class="bar"><div class="tabs" style="margin:0">${[["up", "القادمة"], ["past", "السابقة"], ["off", "الملغاة والمرفوضة"]].map(([k, l]) => `<button class="${k === tab ? "on" : ""}" data-t="${k}">${l} (${g[k].length})</button>`).join("")}</div><a class="btn" href="book.html" style="flex:0 0 auto">${ico("plus")}حجز جديد</a></div>
      <div id="ls">${list.length ? list.map((b) => bookingCard(b, { hideBooker: true })).join("") : empty("calendar", tab === "up" ? "لا توجد حجوزات قادمة" : "لا توجد حجوزات هنا", tab === "up" ? "احجز مرفقاً لحصة قادمة من صفحة حجز جديد." : "")}</div>`;
    $$("[data-t]", m).forEach((b) => (b.onclick = () => { tab = b.dataset.t; paint(); }));
  }
  bkActions(m, async () => { await load(); paint(); });
  await load(); paint();
});
