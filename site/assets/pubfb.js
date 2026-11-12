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
// الحصة الجارية أو التالية بتوقيت الرياض
function nowPeriod(C) {
  if (C.closed_weekdays.includes(pDow(C.today))) return { t: "لا دوام اليوم", s: "off" };
  const n = C.now, cur = C.periods.find((p) => p.starts <= n && n < p.ends), nx = C.periods.find((p) => p.starts > n);
  if (cur) return { t: "الآن: " + cur.name, s: "on", sub: `تنتهي ${cur.ends}` };
  if (nx) return { t: "التالي: " + nx.name, s: "next", sub: `تبدأ ${nx.starts}` };
  return { t: "انتهى اليوم الدراسي", s: "off" };
}
const facCard = (f) => `<div class="fac rv"><span class="fac-i">${ico("building")}</span><div><b>${pesc(f.name)}</b><small>${pesc([f.type, f.building].filter(Boolean).join(" · ") || "مرفق مدرسي")}</small></div>${f.capacity ? `<span class="fac-c">${ico("users")}${f.capacity}</span>` : ""}</div>`;
