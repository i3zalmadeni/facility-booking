/* المنطق المشترك لنظام «احجز مرفق». الهوية من core.css وchrome.js (نسخة هوية النواة الرقمية). */
const sb = supabase.createClient(APP_CONFIG.supabaseUrl, APP_CONFIG.supabaseKey);
async function doLogout(to) {
  try { await Promise.race([sb.auth.signOut({ scope: "local" }), new Promise((r) => setTimeout(r, 2500))]); } catch (_) {}
  try { Object.keys(localStorage).filter((k) => /^sb-.*-auth-token/.test(k)).forEach((k) => localStorage.removeItem(k)); sessionStorage.clear(); } catch (_) {}
  location.replace(to || "index.html");
}
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

// ===== التاريخ والوقت (بتوقيت الرياض) =====
const TZ = "Asia/Riyadh";
const todayISO = () => new Date().toLocaleDateString("en-CA", { timeZone: TZ });
const nowHM = () => new Date().toLocaleTimeString("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const addDays = (iso, n) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dow = (iso) => new Date(iso + "T12:00:00Z").getUTCDay(); // 0=الأحد ... 5=الجمعة 6=السبت
const monthStart = (iso) => iso.slice(0, 8) + "01";
const DAYS_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const fmtDay = (iso) => (iso ? new Date(iso + "T12:00:00Z").toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "—");
const fmtHijri = (iso) => (iso ? new Date(iso + "T12:00:00Z").toLocaleDateString("ar-SA-u-ca-islamic-umalqura-nu-latn", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "");
const hm = (t) => String(t || "").slice(0, 5);
const fmtT = (d) => (d ? new Date(d).toLocaleString("ar-SA-u-ca-gregory-nu-latn", { dateStyle: "medium", timeStyle: "short", timeZone: TZ }) : "—");
const pct = (n, d) => (d > 0 ? Math.min(100, Math.round((n / d) * 100)) : 0);

const STATUS = { pending: ["بانتظار الاعتماد", "warn"], approved: ["معتمد", "ok"], rejected: ["مرفوض", "bad"], cancelled: ["ملغى", ""] };
const ERR = {
  not_staff: "حسابك غير مرتبط بسجل منسوب فعّال في النواة الرقمية.",
  facility_unavailable: "هذا المرفق غير متاح للحجز حالياً.",
  date_past: "لا يمكن الحجز أو الإلغاء في تاريخ سابق.",
  date_too_far: "التاريخ أبعد من المدة المسموح بالحجز فيها.",
  date_closed: "هذا اليوم خارج أيام الحجز المعتمدة.",
  no_periods: "اختر حصة واحدة على الأقل.",
  too_many_periods: "تجاوزت الحد الأقصى لعدد الحصص في الحجز الواحد.",
  period_unavailable: "إحدى الحصص المختارة غير متاحة للحجز أو انتهى وقتها.",
  visitors_invalid: "أدخل عدد الزوار.",
  over_capacity: "عدد الزوار يتجاوز سعة المرفق.",
  slot_taken: "سبق حجز إحدى الحصص المختارة. حدّث الصفحة واختر وقتاً آخر.",
  equipment_invalid: "إحدى الأدوات ليست من تجهيزات هذا المرفق.",
  equipment_quantity: "كمية الأداة المطلوبة تتجاوز المتوفر.",
  forbidden: "لا تملك صلاحية تنفيذ هذه العملية.",
  not_found: "الحجز غير موجود.",
  not_pending: "سبق البت في هذا الطلب.",
  note_required: "اكتب سبب الرفض.",
  not_active: "هذا الحجز غير نشط.",
  bad_range: "نطاق التاريخ غير صحيح.",
};
const mapErr = (e) => { const m = e?.message || String(e); return ERR[m] || (/permission denied|row-level security/i.test(m) ? ERR.forbidden : m); };
async function rpc(fn, args) {
  const { data, error } = await sb.rpc(fn, args || {});
  if (error) throw new Error(mapErr(error));
  return data;
}

// ===== واجهة =====
function toast(msg, bad) { const d = document.createElement("div"); d.className = "toast" + (bad ? " bad" : ""); d.textContent = msg; document.body.appendChild(d); setTimeout(() => d.remove(), 3800); }
function modal(html, wide) {
  const ov = document.createElement("div"); ov.className = "ov"; ov.innerHTML = `<div class="md" role="dialog" aria-modal="true" ${wide ? 'style="max-width:860px"' : ""}>${html}</div>`;
  const close = () => ov.remove(); ov.addEventListener("mousedown", (e) => { if (e.target === ov) close(); });
  document.body.appendChild(ov); return { el: ov.firstChild, close };
}
const head = (t, s) => `<h2>${esc(t)}</h2>${s ? `<p class="sub">${esc(s)}</p>` : ""}`;
const empty = (icon, t, s) => `<div class="card empty"><div class="big">${ico(icon)}</div><b>${esc(t)}</b>${s ? `<p class="sub">${esc(s)}</p>` : ""}</div>`;
const badge = (st) => { const [l, c] = STATUS[st] || [st, ""]; return `<span class="badge ${c}">${l}</span>`; };

// نافذة سبب (رفض/إلغاء). تُرجع النص أو null عند الإلغاء
function askNote(title, label, required, hint) {
  return new Promise((res) => {
    const md = modal(`<h3>${esc(title)}</h3>${hint ? `<p class="sub">${esc(hint)}</p>` : ""}<label>${esc(label)}</label><textarea id="nt" maxlength="400"></textarea><p class="err" id="ne"></p><div class="acts mt"><button class="btn" id="ok">تأكيد</button><button class="btn sec" id="no">رجوع</button></div>`);
    $("#no", md.el).onclick = () => { md.close(); res(null); };
    $("#ok", md.el).onclick = () => { const v = $("#nt", md.el).value.trim(); if (required && !v) { $("#ne", md.el).textContent = "هذا الحقل مطلوب."; return; } md.close(); res(v); };
    $("#nt", md.el).focus();
  });
}

// ===== بطاقة الحجز المشتركة =====
const pchips = (ps) => (ps || []).map((p) => `<span class="pchip">${esc(p.name)} <small>${hm(p.starts)}–${hm(p.ends)}</small></span>`).join("");
function bookingCard(b, o = {}) {
  const today = todayISO(), acts = [];
  if (b.can_manage && b.status === "pending") acts.push(`<button class="btn sm" data-act="approve" data-id="${b.id}">${ico("check")}اعتماد</button><button class="btn sm bad" data-act="reject" data-id="${b.id}">${ico("x")}رفض</button>`);
  if ((b.status === "pending" || b.status === "approved") && ((b.mine && b.date >= today) || b.can_manage)) acts.push(`<button class="btn sm sec" data-act="cancel" data-id="${b.id}" data-mgr="${b.can_manage && !b.mine ? 1 : 0}">إلغاء الحجز</button>`);
  const tools = (b.items || []).map((i) => `<span>${ico("tool")}${esc(i.name)} × ${i.quantity}</span>`).join("");
  return `<div class="item bk s-${b.status}"><div class="row2"><div><b>${esc(b.facility)}</b> ${badge(b.status)}${b.needs_help ? ' <span class="badge info">يحتاج مساعدة المنسق</span>' : ""}<br><small>${esc(fmtDay(b.date))} <span class="hj">· ${esc(fmtHijri(b.date))}</span></small></div><div class="acts">${acts.join("")}</div></div>
    <div class="pchips">${pchips(b.periods)}</div>
    <div class="bk-meta">${o.hideBooker ? "" : `<span>${ico("user")}${esc(b.booker)}</span>`}<span>${ico("users")}${b.visitors} زائر</span>${tools}</div>
    ${b.purpose ? `<p class="bk-n"><small>الغرض:</small> ${esc(b.purpose)}</p>` : ""}${b.needs_help && b.help_note ? `<p class="bk-n"><small>طلب المساعدة:</small> ${esc(b.help_note)}</p>` : ""}
    ${b.decision_note ? `<p class="bk-n ${b.status === "rejected" ? "err" : ""}"><small>${b.status === "rejected" ? "سبب الرفض" : "ملاحظة"}${b.decided_by ? " (" + esc(b.decided_by) + ")" : ""}:</small> ${esc(b.decision_note)}</p>` : ""}</div>`;
}
// يربط أزرار البطاقات (اعتماد/رفض/إلغاء) مرة واحدة على حاوية الصفحة
function bkActions(root, onDone) {
  root.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-act]"); if (!btn || btn.disabled) return;
    const id = btn.dataset.id, act = btn.dataset.act;
    try {
      if (act === "approve") { btn.disabled = true; await rpc("fb_decide_booking", { p_id: id, p_approve: true }); toast("تم اعتماد الحجز"); }
      else if (act === "reject") { const n = await askNote("رفض طلب الحجز", "سبب الرفض (يظهر للمعلم)", true); if (n === null) return; await rpc("fb_decide_booking", { p_id: id, p_approve: false, p_note: n }); toast("تم رفض الطلب"); }
      else if (act === "cancel") { const n = await askNote("إلغاء الحجز", "سبب الإلغاء (اختياري)", false, btn.dataset.mgr === "1" ? "سيصل السبب إلى صاحب الحجز." : ""); if (n === null) return; await rpc("fb_cancel_booking", { p_id: id, p_note: n }); toast("تم إلغاء الحجز"); }
      onDone && (await onDone());
    } catch (x) { toast(mapErr(x), true); btn.disabled = false; }
  });
}

// ===== الهيكل: ترويسة لوحة التحكم بنمط أنظمة النواة =====
const NAV = [
  ["dashboard.html", "الرئيسية", "home", "ما يخصك الآن: طلباتك وجدولك", null],
  ["book.html", "حجز جديد", "plus", "اختر التاريخ والمرفق والحصص", null],
  ["my.html", "حجوزاتي", "calendar", "حجوزاتك القادمة والسابقة", null],
  ["requests.html", "طلبات الحجز", "inbox", "طلبات المرافق التي تنسقها: اعتماد أو رفض", "mgr", "pending_total"],
  ["schedule.html", "جدول المرافق", "grid", "من يحجز أي حصة في كل مرفق خلال اليوم", "mgr"],
  ["stats.html", "الإحصائيات", "chart", "الأكثر زيارة والأكثر تفعيلاً", "mgr"],
  ["settings.html", "الإعدادات", "gear", "المرافق والحصص وقواعد الحجز", "mgr"],
];
async function boot(page, render, o = {}) {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { location.replace("login.html?next=" + encodeURIComponent(location.pathname.split("/").pop() + location.search)); return; }
  const shell = document.getElementById("shell");
  const fail = (msg) => {
    shell.innerHTML = `<main class="wrap"><div class="card" style="max-width:520px;margin:48px auto"><h3 style="margin-top:0">تعذر فتح لوحة التحكم</h3><p class="err">${esc(msg)}</p><div class="acts mt"><button class="btn" id="rt">إعادة المحاولة</button><button class="btn sec" id="lo">تسجيل الخروج</button></div></div></main>`;
    $("#rt").onclick = () => location.reload(); $("#lo").onclick = () => doLogout();
  };
  let who;
  try { who = await rpc("fb_whoami"); } catch (e) { console.error(e); fail(/function .* does not exist|schema cache|Could not find/i.test(String(e.message)) ? "لم يُنفَّذ سكربت قاعدة البيانات الخاص بالنظام بعد (supabase/migrations/0101_facility_booking.sql)." : "تعذر الاتصال بالخادم أو التحقق من حسابك."); return; }
  if (!who) { await doLogout("login.html?e=nostaff"); return; }
  const isAdmin = who.is_admin === true, isCoord = (who.facility_ids || []).length > 0, isMgr = isAdmin || isCoord;
  if (o.mgr && !isMgr) { location.replace("dashboard.html"); return; }
  const ctx = { who, isAdmin, isCoord, isMgr, uid: session.user.id, role: isAdmin ? "مدير النواة الرقمية" : isCoord ? "منسق الحجز" : "المعلم" };
  const items = NAV.filter((n) => !n[4] || isMgr);
  const cur = NAV.find((n) => n[0] === page) || [page, "لوحة التحكم", "grid", ""];
  shell.innerHTML =
    `<header class="dash"><div class="wrap top">${brandHTML("dashboard.html")}<div class="idl"><a class="sitelink" href="index.html">الموقع الإلكتروني</a>${headMoe}<span class="vdiv"></span><span class="corelink">النواة الرقمية</span></div></div>
     <div class="strip" aria-hidden="true"></div>
     <div class="dnav"><div class="wrap dn"><div class="dnav-in">${items.map(([h, n, e, t, , bd]) => `<a href="${h}" title="${esc(t)}" class="${h === page ? "on" : ""}" ${h === page ? 'aria-current="page"' : ""}>${ico(e)}${n}${bd ? `<span class="bdg" data-b="${bd}"></span>` : ""}</a>`).join("")}</div>
     <div class="dwho"><span class="dname">${esc(who.name)}</span><a class="loginbtn" href="#" id="out">خروج</a></div></div></div></header>
     <div class="pagebar"><div class="wrap pb"><div class="pb-t"><small>${esc(ctx.role)}</small><h1>${esc(cur[1])}</h1></div><p class="pb-d">${esc(cur[3])}</p>
     <div class="pb-u"><span id="pbTime"></span><button class="btn sec sm" id="pbRefresh" type="button">${ico("refresh")}تحديث</button></div></div></div>
     <main class="wrap" id="main"></main>${footerHTML}`;
  bindNav();
  $("#pbTime").textContent = "حُدِّثت " + new Date().toLocaleTimeString("ar-SA-u-nu-latn", { hour: "numeric", minute: "2-digit", timeZone: TZ });
  $("#pbRefresh").onclick = () => location.reload();
  $("#out").onclick = (e) => { e.preventDefault(); doLogout(); };
  if (isMgr) rpc("fb_bookings_list", { p_mode: "manage", p_status: "pending" }).then((l) => { $$("[data-b]").forEach((e) => { e.textContent = (l || []).length || ""; }); }).catch(() => {});
  const main = $("#main");
  try { await render(main, ctx); } catch (e) { console.error(e); main.innerHTML = `<p class="err">تعذر تحميل الصفحة: ${esc(mapErr(e))}</p>`; }
}
