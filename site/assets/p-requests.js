// طلبات الحجز للمرافق التي ينسقها المستخدم (مدير النواة يرى الكل)
boot("requests.html", async (m, c) => {
  const FA = (await rpc("fb_my_facilities")) || [];
  let st = "pending", fid = "", from = "", to = "", rows = [];
  async function load() {
    rows = (await rpc("fb_bookings_list", { p_mode: "manage", p_status: st || null, p_facility: fid || null, p_from: from || null, p_to: to || null })) || [];
    if (st === "pending") rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.created_at < b.created_at ? -1 : 1));
    drawList();
  }
  function drawList() {
    const need = rows.filter((b) => b.needs_help && b.status !== "cancelled" && b.status !== "rejected").length;
    $("#ls").innerHTML = (rows.length ? `<p class="sub">${rows.length} حجز${need ? ` · ${need} منها يطلب مساعدة المنسق` : ""}</p>` + rows.map((b) => bookingCard(b)).join("") : empty("inbox", st === "pending" ? "لا توجد طلبات بانتظار قرارك" : "لا توجد حجوزات مطابقة", ""));
  }
  m.innerHTML = head("طلبات الحجز", c.isAdmin ? "كل مرافق المدرسة. اعتمد الطلب أو ارفضه مع ذكر السبب." : "المرافق التي أنت منسقها (المسؤول الرئيسي أو البديل في سجل المرافق بالنواة).") +
    `<div class="bar"><select id="s"><option value="pending">بانتظار الاعتماد</option><option value="approved">المعتمدة</option><option value="rejected">المرفوضة</option><option value="cancelled">الملغاة</option><option value="">كل الحالات</option></select>
      <select id="f"><option value="">كل المرافق</option>${FA.map((f) => `<option value="${f.id}">${esc(f.name)}</option>`).join("")}</select>
      <input type="date" id="a" aria-label="من تاريخ" title="من تاريخ"><input type="date" id="b" aria-label="إلى تاريخ" title="إلى تاريخ"></div><div id="ls"></div>`;
  const on = (id, fn) => ($(id).onchange = (e) => { fn(e.target.value); load().catch((x) => toast(mapErr(x), true)); });
  on("#s", (v) => (st = v)); on("#f", (v) => (fid = v)); on("#a", (v) => (from = v)); on("#b", (v) => (to = v));
  bkActions(m, load);
  await load();
}, { mgr: true });
