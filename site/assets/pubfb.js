// أدوات الصفحات العامة: قراءة تقويم الحجوزات العام (بلا أسماء) من قاعدة النواة، وأدوات التاريخ
const pesc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const P_DAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const pAdd = (iso, n) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const pDow = (iso) => new Date(iso + "T12:00:00Z").getUTCDay();
const pToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });
const pFmt = (iso, o) => new Date(iso + "T12:00:00Z").toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { timeZone: "UTC", ...o });
const pDay = (iso) => pFmt(iso, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const pShort = (iso) => pFmt(iso, { day: "numeric", month: "long" });
const pHijri = (iso) => new Date(iso + "T12:00:00Z").toLocaleDateString("ar-SA-u-ca-islamic-umalqura-nu-latn", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const pWeekStart = (iso) => pAdd(iso, -pDow(iso)); // الأحد
function pubCalendar(from, to) {
  return fetch(APP_CONFIG.supabaseUrl + "/rest/v1/rpc/fb_public_calendar", { method: "POST", headers: { apikey: APP_CONFIG.supabaseKey, "content-type": "application/json" }, body: JSON.stringify({ p_from: from, p_to: to }) })
    .then((r) => { if (!r.ok) throw new Error("load"); return r.json(); });
}
// حالة الخانة: مرفق + حصة + تاريخ
const slotOf = (C, date, fid, pid) => (C.bookings.find((b) => b.date === date && b.facility_id === fid && b.periods.includes(pid)) || {}).status || "";
const bookOf = (C, date, fid, pid) => C.bookings.find((b) => b.date === date && b.facility_id === fid && b.periods.includes(pid));
const pPhoto = (ph) => (ph ? APP_CONFIG.supabaseUrl + "/storage/v1/object/public/public-photos/" + encodeURI(ph) : "");
// بطاقة الحاجز: الصورة (أو الحرف الأول) والاسم والمادة
const whoHTML = (b) => { const n = (b.booker || "").trim(); return `<span class="who"><span class="who-p"><b>${pesc(n ? n[0] : "")}</b>${b.photo ? `<img src="${pPhoto(b.photo)}" alt="" loading="lazy" onerror="this.remove()">` : ""}</span><span class="who-t"><strong>${pesc(n || "—")}</strong>${b.subject ? `<small>${pesc(b.subject)}</small>` : ""}</span></span>`; };
// الحصة الجارية أو التالية بتوقيت الرياض
function nowPeriod(C) {
  if (C.closed_weekdays.includes(pDow(C.today))) return { t: "لا دوام اليوم", s: "off" };
  const n = C.now, cur = C.periods.find((p) => p.starts <= n && n < p.ends), nx = C.periods.find((p) => p.starts > n);
  if (cur) return { t: "الآن: " + cur.name, s: "on", sub: `تنتهي ${cur.ends}` };
  if (nx) return { t: "التالي: " + nx.name, s: "next", sub: `تبدأ ${nx.starts}` };
  return { t: "انتهى اليوم الدراسي", s: "off" };
}
const LBL = { approved: "محجوز", pending: "بانتظار الاعتماد" };
const perOf = (C, b) => b.periods.map((id) => C.periods.find((p) => p.id === id)).filter(Boolean).sort((x, y) => (x.starts < y.starts ? -1 : 1));
const facName = (C, id) => (C.facilities.find((f) => f.id === id) || {}).name || "";
// بطاقة حجز كاملة: الشخص، المرفق، اليوم، الحصص وأوقاتها، الزوار والغرض
function bkCard(C, b, showDate) {
  const ps = perOf(C, b);
  return `<article class="bkc ${b.status}"><div class="bkc-h">${whoHTML(b)}<span class="bkc-s">${LBL[b.status] || ""}</span></div>
    <div class="bkc-f">${ico("building")}<b>${pesc(facName(C, b.facility_id))}</b></div>
    ${showDate ? `<div class="bkc-r">${ico("calendar")}<span>${pDay(b.date)}</span></div>` : ""}
    <div class="bkc-r">${ico("clock")}<span>${ps.length ? `${ps[0].starts} – ${ps[ps.length - 1].ends}` : "—"}</span></div>
    <div class="bkc-p">${ps.map((p) => `<span>${pesc(p.name)}<small>${p.starts}</small></span>`).join("")}</div>
    <div class="bkc-m">${b.visitors ? `<span>${ico("users")}${b.visitors} زائر</span>` : ""}${b.needs_help ? `<span>${ico("help")}بمساعدة المنسق</span>` : ""}</div>
    ${b.purpose ? `<p class="bkc-n">${pesc(b.purpose)}</p>` : ""}</article>`;
}
// بطاقة مرفق: النوع والمبنى والسعة وحالته الآن وشريط حصص اليوم
function facCard(f, C) {
  const open = !C.closed_weekdays.includes(pDow(C.today)), P = C.periods.filter((p) => p.bookable);
  const cur = open && P.find((p) => p.starts <= C.now && C.now < p.ends), busy = cur && slotOf(C, C.today, f.id, cur.id);
  const free = open ? P.filter((p) => p.ends > C.now && !slotOf(C, C.today, f.id, p.id)).length : 0;
  return `<article class="fcd"><div class="fcd-h"><span class="fcd-i">${ico("building")}</span><div><b>${pesc(f.name)}</b><small>${pesc(f.type || "مرفق مدرسي")}</small></div>${cur ? `<span class="fcd-s ${busy ? "busy" : "free"}">${busy ? "محجوز الآن" : "متاح الآن"}</span>` : ""}</div>
    <div class="fcd-m">${f.building ? `<span>${ico("pin")}${pesc(f.building)}</span>` : ""}${f.capacity ? `<span>${ico("users")}يتسع ${f.capacity}</span>` : ""}</div>
    <div class="fcd-b" aria-hidden="true">${P.map((p) => `<i class="${open ? slotOf(C, C.today, f.id, p.id) : ""}${cur && cur.id === p.id ? " cur" : ""}" title="${pesc(p.name)}"></i>`).join("")}</div>
    <div class="fcd-f"><small>${open ? (free ? `${free} حصص متاحة اليوم` : "لا حصص متاحة اليوم") : "لا دوام اليوم"}</small><a href="book.html">احجز ${ico("arrow")}</a></div></article>`;
}
