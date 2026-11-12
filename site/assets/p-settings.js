// الإعدادات: المرافق (مدير النواة ومنسق المرفق)، الحصص وأزمنتها وقواعد الحجز (مدير النواة)
boot("settings.html", async (m, c) => {
  const TABS = [["fac", "المرافق"], ...(c.isAdmin ? [["per", "الحصص والأزمنة"], ["gen", "قواعد الحجز"]] : [])];
  let tab = "fac", F = (await rpc("fb_my_facilities")) || [];
  const coreFac = (window.CORE_URL || "#") + "facilities.html";
  const draw = () => { m.querySelector("#tabs").innerHTML = TABS.map(([k, l]) => `<button data-t="${k}" class="${k === tab ? "on" : ""}">${l}</button>`).join(""); ({ fac: drawFac, per: drawPer, gen: drawGen })[tab](); };
  m.innerHTML = head("الإعدادات", c.isAdmin ? "ما يُفعَّل للحجز وأزمنة الحصص وقواعد الحجز." : "إعدادات الحجز للمرافق التي تنسقها.") + '<div class="tabs" id="tabs"></div><div id="pn"></div>';
  $("#tabs").onclick = (e) => { const b = e.target.closest("[data-t]"); if (b) { tab = b.dataset.t; draw(); } };
  const saveFac = async (id, patch) => { const { error } = await sb.from("fb_facility_settings").upsert({ facility_id: id, ...patch, updated_at: new Date().toISOString() }, { onConflict: "facility_id" }); if (error) throw new Error(mapErr(error)); Object.assign(F.find((f) => f.id === id), patch); };

  // ----- المرافق -----
  function drawFac() {
    const pn = $("#pn");
    pn.innerHTML = `<div class="note">منسق الحجز لكل مرفق هو <b>المسؤول الرئيسي أو البديل</b> المسجّل للمرفق في سجل المرافق بالنواة الرقمية. لتغييره عدّل المرفق في <a href="${esc(coreFac)}">سجل المرافق</a>. المرفق غير المفعّل لا يظهر للمعلمين في الحجز.</div>
      ${c.isAdmin ? `<div class="bar"><button class="btn sec sm" id="all1">تفعيل كل المرافق</button><button class="btn sec sm" id="all0">إيقاف الكل</button></div>` : ""}
      <div class="tw"><table><thead><tr><th>المرفق</th><th>المبنى</th><th>المنسق</th><th>مفعّل للحجز</th><th>اعتماد تلقائي</th><th>أقصى زوار</th><th></th></tr></thead><tbody>${F.map((f) => `<tr data-id="${f.id}"><td><b>${esc(f.name)}</b><br><small class="sub">${esc(f.type || "")}${f.status === "closed" ? " · مغلق في النواة" : ""}</small></td><td>${esc(f.building || "—")}</td><td>${(f.coordinators || []).map(esc).join("، ") || '<span class="err">غير محدد</span>'}</td>
        <td><label class="tgl"><input type="checkbox" data-k="is_bookable" ${f.is_bookable ? "checked" : ""}><span></span></label></td>
        <td><label class="tgl"><input type="checkbox" data-k="auto_approve" ${f.auto_approve ? "checked" : ""}><span></span></label></td>
        <td><input type="number" min="1" data-k="max_visitors" value="${f.max_visitors ?? ""}" placeholder="${f.capacity ?? "السعة"}"></td>
        <td><button class="btn sm sec" data-k="ins">التعليمات</button></td></tr>`).join("") || '<tr><td colspan="7">لا توجد مرافق ضمن صلاحياتك.</td></tr>'}</tbody></table></div>
      <p class="sub">الاعتماد التلقائي: يُعتمد الحجز فور إرساله دون مراجعة المنسق. أقصى زوار: يقيّد العدد دون سعة المرفق في النواة إن لزم.</p>`;
    pn.onchange = async (e) => {
      const el = e.target.closest("[data-k]"); if (!el) return; const id = el.closest("tr").dataset.id, k = el.dataset.k;
      try {
        if (el.type === "checkbox") await saveFac(id, { [k]: el.checked });
        else if (k === "max_visitors") await saveFac(id, { max_visitors: el.value ? Math.max(1, +el.value) : null });
        toast("تم الحفظ");
      } catch (x) { toast(mapErr(x), true); if (el.type === "checkbox") el.checked = !el.checked; }
    };
    pn.onclick = (e) => {
      const b = e.target.closest("button[data-k='ins']");
      if (b) { const f = F.find((x) => x.id === b.closest("tr").dataset.id); const md = modal(`<h3>تعليمات حجز: ${esc(f.name)}</h3><label>تظهر للمعلم عند اختيار المرفق</label><textarea id="in" maxlength="500">${esc(f.instructions || "")}</textarea><div class="acts mt"><button class="btn" id="sv">حفظ</button><button class="btn sec" id="cx">إلغاء</button></div>`);
        $("#cx", md.el).onclick = md.close; $("#sv", md.el).onclick = async () => { try { await saveFac(f.id, { instructions: $("#in", md.el).value.trim() || null }); md.close(); toast("تم الحفظ"); } catch (x) { toast(mapErr(x), true); } }; return; }
      const all = e.target.closest("#all1,#all0"); if (!all) return; const on = all.id === "all1";
      (async () => { try { for (const f of F.filter((x) => x.status !== "closed")) await saveFac(f.id, { is_bookable: on }); toast(on ? "فُعّلت المرافق" : "أُوقفت المرافق"); drawFac(); } catch (x) { toast(mapErr(x), true); } })();
    };
  }

  // ----- الحصص -----
  async function drawPer() {
    const { data, error } = await sb.from("fb_periods").select("*").order("sort_order"); if (error) throw error;
    const P = data || [], pn = $("#pn");
    pn.onchange = null; pn.onclick = null;
    pn.innerHTML = `<div class="note">حدّد بداية كل حصة ونهايتها. تظهر هذه الأزمنة للمعلمين في نموذج الحجز وفي الجدول. الفسحة لا تُحجز افتراضياً ويمكنك فتحها إن أردت.</div>
      <div class="tw"><table><thead><tr><th>الاسم</th><th>تبدأ</th><th>تنتهي</th><th>متاحة للحجز</th></tr></thead><tbody>${P.map((p) => `<tr data-id="${p.id}"><td><input type="text" data-f="name" value="${esc(p.name_ar)}" maxlength="40"> ${p.kind === "break" ? '<span class="badge">فسحة</span>' : ""}</td><td><input type="time" data-f="s" value="${hm(p.starts_at)}"></td><td><input type="time" data-f="e" value="${hm(p.ends_at)}"></td><td><label class="tgl"><input type="checkbox" data-f="b" ${p.is_bookable ? "checked" : ""}><span></span></label></td></tr>`).join("")}</tbody></table></div>
      <p class="err" id="pe"></p><div class="acts mt"><button class="btn" id="sv">حفظ الحصص</button></div>`;
    $("#sv").onclick = async () => {
      const rows = $$("tbody tr", pn).map((tr) => ({ id: tr.dataset.id, name_ar: $('[data-f="name"]', tr).value.trim(), starts_at: $('[data-f="s"]', tr).value, ends_at: $('[data-f="e"]', tr).value, is_bookable: $('[data-f="b"]', tr).checked }));
      let msg = ""; rows.forEach((r, i) => { if (!msg) { if (!r.name_ar || !r.starts_at || !r.ends_at) msg = "أكمل اسم كل حصة ووقتيها."; else if (r.ends_at <= r.starts_at) msg = `نهاية «${r.name_ar}» يجب أن تكون بعد بدايتها.`; else if (i && r.starts_at < rows[i - 1].ends_at) msg = `تبدأ «${r.name_ar}» قبل انتهاء «${rows[i - 1].name_ar}».`; } });
      $("#pe").textContent = msg; if (msg) return;
      try { for (const r of rows) { const { error: e2 } = await sb.from("fb_periods").update({ name_ar: r.name_ar, starts_at: r.starts_at, ends_at: r.ends_at, is_bookable: r.is_bookable, updated_at: new Date().toISOString() }).eq("id", r.id); if (e2) throw new Error(mapErr(e2)); } toast("تم حفظ الحصص"); } catch (x) { toast(mapErr(x), true); }
    };
  }

  // ----- قواعد الحجز -----
  async function drawGen() {
    const { data, error } = await sb.from("fb_settings").select("*").eq("id", 1).maybeSingle(); if (error) throw error;
    const s = data || { advance_days: 30, closed_weekdays: [5, 6], max_periods_per_booking: 7 }, pn = $("#pn");
    pn.onchange = null; pn.onclick = null;
    pn.innerHTML = `<div class="card"><div class="fg"><div><label>أقصى مدة للحجز المسبق (بالأيام)</label><input type="number" id="ad" min="1" max="365" value="${s.advance_days}"></div><div><label>أقصى عدد حصص في الحجز الواحد</label><input type="number" id="mx" min="1" max="12" value="${s.max_periods_per_booking}"></div></div>
      <h3 class="sec">أيام لا يُقبل فيها الحجز</h3><div>${DAYS_AR.map((d, i) => `<label class="chk"><input type="checkbox" data-d="${i}" ${(s.closed_weekdays || []).includes(i) ? "checked" : ""}> ${d}</label>`).join("")}</div>
      <div class="acts mt"><button class="btn" id="sv">حفظ القواعد</button></div></div>`;
    $("#sv").onclick = async () => {
      const ad = Math.round(+$("#ad").value), mx = Math.round(+$("#mx").value), cl = $$("[data-d]:checked", pn).map((x) => +x.dataset.d);
      if (!(ad >= 1 && ad <= 365) || !(mx >= 1 && mx <= 12)) { toast("تحقق من القيم المدخلة.", true); return; }
      if (cl.length >= 7) { toast("لا يمكن إغلاق كل أيام الأسبوع.", true); return; }
      const { error: e2 } = await sb.from("fb_settings").update({ advance_days: ad, max_periods_per_booking: mx, closed_weekdays: cl, updated_at: new Date().toISOString() }).eq("id", 1);
      e2 ? toast(mapErr(e2), true) : toast("تم حفظ القواعد");
    };
  }
  draw();
}, { mgr: true });
