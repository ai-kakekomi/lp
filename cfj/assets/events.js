/* ===== Event list renderer =====
 * Reads from AIK_API.getEvents() and renders into #akk-events.
 * Preserves ICS calendar download from the original inline script.
 * =============================================================== */
(function () {
  "use strict";

  /* 参加者(受講者)申込のGAS API。apply.html と同じエンドポイント。
     ?uid=<uid> → { remaining, status }。内部向けなので実数を表示してよい。 */
  /* デモ版: 外部API呼び出しは行わない */
  var APPLY_API_URL = "";

  /* --- ICS helpers (migrated from inline script) --- */
  function pad(n) { return String(n).padStart(2, "0"); }
  function esc(s) { return String(s).replace(/([\\,;])/g, "\\$1").replace(/\n/g, "\\n"); }
  function dtstamp() {
    var d = new Date();
    return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) +
      "T" + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + "Z";
  }
  function buildICS(ev) {
    var lines = [
      "BEGIN:VCALENDAR", "VERSION:2.0",
      "PRODID:-//AI Kakekomi//Internal//JA", "CALSCALE:GREGORIAN",
      "BEGIN:VEVENT",
      "UID:" + ev.uid + "@ai-kakekomi.com",
      "DTSTAMP:" + dtstamp()
    ];
    if (ev.allday) {
      lines.push("DTSTART;VALUE=DATE:" + ev.start);
      lines.push("DTEND;VALUE=DATE:" + ev.end);
    } else {
      lines.push("DTSTART:" + ev.start);
      lines.push("DTEND:" + ev.end);
    }
    lines.push("SUMMARY:" + esc(ev.title));
    if (ev.loc) lines.push("LOCATION:" + esc(ev.loc));
    lines.push("END:VEVENT", "END:VCALENDAR");
    return lines.join("\r\n");
  }
  function downloadICS(ev) {
    var ics = buildICS(ev);
    var blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = ev.uid + ".ics";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  /* --- Time formatting --- */
  function fmtTime(dtStr) {
    dtStr = String(dtStr || "");
    if (dtStr.length < 9) return "";
    var h = dtStr.substring(9, 11);
    var m = dtStr.substring(11, 13);
    return parseInt(h, 10) + ":" + m;
  }
  function fmtDate(dtStr) {
    dtStr = String(dtStr || "");
    if (!dtStr) return "";
    var y = parseInt(dtStr.substring(0, 4), 10);
    var mo = parseInt(dtStr.substring(4, 6), 10);
    var d = parseInt(dtStr.substring(6, 8), 10);
    var days = ["日", "月", "火", "水", "木", "金", "土"];
    var dt = new Date(y, mo - 1, d);
    return mo + "/" + d + "(" + days[dt.getDay()] + ")";
  }
  /* 一覧カードの日付カラム用: 曜日と日付を分けて返す */
  function getDow(dtStr) {
    dtStr = String(dtStr || "");
    if (!dtStr) return null;
    var y = parseInt(dtStr.substring(0, 4), 10);
    var mo = parseInt(dtStr.substring(4, 6), 10);
    var d = parseInt(dtStr.substring(6, 8), 10);
    var days = ["日", "月", "火", "水", "木", "金", "土"];
    var dt = new Date(y, mo - 1, d);
    var dow = dt.getDay();
    return { label: days[dow], mmdd: mo + "/" + d, isSaturday: (dow === 6), isSunday: (dow === 0) };
  }
  function fmtTimeRange(ev) {
    if (ev.allday) return "時間未定";
    var s = fmtTime(ev.start);
    var e = fmtTime(ev.end);
    return e ? s + "〜" + e : s + "〜";
  }

  /* --- Help button + hint toggle --- */
  /* --- 同伴者・サポート枠のヘルパー ---
     companions = 同伴者数（本人を含まない）。
     yes_count は GAS 側で「本人+同伴者」の人数に集計済み。ここでは件数として扱わない。 */
  function toInt(v) {
    var n = parseInt(v, 10);
    return (isNaN(n) || n < 0) ? 0 : n;
  }
  function assistCapOf(ev) {
    return (ev.assist_capacity && ev.assist_capacity > 0) ? ev.assist_capacity : 0;
  }
  function isAssistFull(ev) {
    var cap = assistCapOf(ev);
    return cap ? (ev.yes_count || 0) >= cap : false;
  }
  /* 自分の回答を差し引いた、他メンバーぶんの確定人数 */
  function assistUsedByOthers(ev, existingRsvp) {
    var mine = (existingRsvp && existingRsvp.status === "yes") ? (1 + toInt(existingRsvp.companions)) : 0;
    return Math.max(0, (ev.yes_count || 0) - mine);
  }

  function buildHelpBtn(text) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "help-btn";
    btn.textContent = "?";
    btn.setAttribute("aria-label", "説明を表示");
    var hint = document.createElement("div");
    hint.className = "rsvp-hint";
    hint.textContent = text;
    hint.hidden = true;
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      hint.hidden = !hint.hidden;
    });
    return { btn: btn, hint: hint };
  }

  /* --- Render a single event --- */
  function renderEvent(ev) {
    var li = document.createElement("li");
    var liClasses = [];
    if (ev.fee_type === "paid") liClasses.push("is-paid");
    var dow = getDow(ev.start);
    if (dow) {
      if (dow.isSaturday) liClasses.push("is-saturday");
      else if (dow.isSunday) liClasses.push("is-sunday");
    }
    li.className = liClasses.join(" ");

    /* -- 上部: 日時（＋集合情報があれば同じ行に） -- */
    var when = document.createElement("div");
    when.className = "event-when";
    var dateSpan = document.createElement("span");
    dateSpan.className = "event-date";
    var mmdd = dow ? dow.mmdd : fmtDate(ev.start);
    dateSpan.appendChild(document.createTextNode(mmdd));
    if (dow) {
      var dowSpan = document.createElement("span");
      dowSpan.className = "event-dow";
      dowSpan.textContent = "(" + dow.label + ")";
      dateSpan.appendChild(dowSpan);
    }
    var timeSpan = document.createElement("span");
    timeSpan.className = "event-time";
    timeSpan.textContent = fmtTimeRange(ev);
    when.appendChild(dateSpan);
    when.appendChild(timeSpan);
    if (ev.gather_time) {
      var gatherTop = document.createElement("span");
      gatherTop.className = "event-gather";
      gatherTop.textContent = "集合 " + ev.gather_time;
      when.appendChild(gatherTop);
    }

    /* -- メイン -- */
    var main = document.createElement("div");
    main.className = "event-main";

    var titleDiv = document.createElement("div");
    titleDiv.className = "event-title";
    titleDiv.textContent = ev.title;
    if (ev.tag) {
      var tag = document.createElement("span");
      tag.className = "tag-nespa";
      tag.textContent = ev.tag;
      titleDiv.appendChild(tag);
    }

    var locRow = document.createElement("div");
    locRow.className = "event-loc-row";

    /* 場所 */
    if (ev.loc) {
      if (ev.loc_url) {
        var locLink = document.createElement("a");
        locLink.className = "event-loc";
        locLink.href = ev.loc_url;
        locLink.target = "_blank";
        locLink.rel = "noopener";
        locLink.textContent = "📍" + ev.loc;
        locRow.appendChild(locLink);
      } else {
        var locSpan = document.createElement("span");
        locSpan.className = "event-loc";
        locSpan.textContent = "📍" + ev.loc;
        locRow.appendChild(locSpan);
      }
    }

    /* パートナー */
    if (ev.partner_name) {
      var partner = document.createElement("a");
      partner.className = "badge-partner";
      partner.textContent = "🤝 " + ev.partner_name;
      if (ev.partner_url) {
        partner.href = ev.partner_url;
        partner.target = "_blank";
        partner.rel = "noopener";
      }
      locRow.appendChild(partner);
    }

    var meta = document.createElement("div");
    meta.className = "event-meta";

    /* 有償/無償バッジ */
    var feeBadge = document.createElement("span");
    feeBadge.className = "badge-fee " + (ev.fee_type === "paid" ? "fee-paid" : "fee-free");
    feeBadge.textContent = ev.fee_type === "paid" ? "有償" : "無償";
    meta.appendChild(feeBadge);

    /* 広報公開許可 */
    var pub = document.createElement("span");
    if (ev.publicity === "ok") {
      pub.className = "badge-publicity pub-ok";
      pub.textContent = "📣 公開OK";
      pub.title = "主催者から広報公開の許可を得ています。SNS・note等での発信が可能です。";
    } else if (ev.publicity === "ng") {
      pub.className = "badge-publicity pub-ng";
      pub.textContent = "🔒 公開NG";
      pub.title = "主催者から広報公開の許可を得ていません。SNS・note等での発信は控えてください。";
    } else {
      pub.className = "badge-publicity pub-pending";
      pub.textContent = "公開許可 未確認";
      pub.title = "広報公開の可否を主催者に確認中です。確認が取れるまで発信は控えてください。";
    }
    meta.appendChild(pub);

    /* 定員 / 受講者申込状況 */
    if (ev.capacity && ev.capacity > 0) {
      var cap = document.createElement("span");
      cap.className = "badge-capacity";
      cap.textContent = "👥 定員" + ev.capacity + "名";
      meta.appendChild(cap);

      /* 申込制の回は、実際の受講者申込状況を取得して表示（内部向けなので実数OK） */
      if (ev.apply_required && APPLY_API_URL) {
        cap.textContent = "👥 定員" + ev.capacity + "名（申込確認中…）";
        fetch(APPLY_API_URL + "?uid=" + encodeURIComponent(ev.uid))
          .then(function (r) { return r.json(); })
          .then(function (g) {
            if (!g || typeof g.remaining !== "number") {
              cap.textContent = "👥 定員" + ev.capacity + "名";
              return;
            }
            var rem = Math.max(0, g.remaining);
            var applied = (typeof g.applied === "number") ? g.applied : Math.max(0, ev.capacity - g.remaining);
            var full = g.status === "full" || g.remaining <= 0;
            if (full) {
              cap.classList.add("is-full");
              cap.textContent = "👥 満席 申込" + applied + "/定員" + ev.capacity + "名";
            } else {
              cap.textContent = "👥 申込 " + applied + " / 定員 " + ev.capacity + "名（残 " + rem + "）";
              if (rem <= 10) { cap.style.background = "#FDEBD0"; cap.style.color = "#B9770E"; }
            }
          })
          .catch(function () { cap.textContent = "👥 定員" + ev.capacity + "名"; });
      }
    }

    /* サポート募集・登壇バッジは属性バッジ列とは別の行に独立させる（幅は中身に合わせる） */
    var extraRow = document.createElement("div");
    extraRow.className = "event-extra-row";

    /* サポート枠の残り。yes_count は同伴者を含む「人数」（GAS側で集計） */
    var assistCap  = assistCapOf(ev);
    var assistFull = isAssistFull(ev);

    if (ev.recruit_support) {
      var recruit = document.createElement("span");
      recruit.className = "badge-recruit";
      if (assistCap) {
        if (assistFull) {
          recruit.classList.add("is-full");
          recruit.textContent = "サポート枠 満席 " + ev.yes_count + "/" + assistCap + "名";
        } else {
          recruit.textContent = "サポート募集中 " + ev.yes_count + "/" + assistCap + "名（残 " + (assistCap - ev.yes_count) + "）";
        }
      } else {
        recruit.textContent = "サポート募集中";
      }
      extraRow.appendChild(recruit);
    }

    /* 登壇バッジ */
    if (ev.badge === "stage") {
      var stage = document.createElement("span");
      stage.className = "badge-stage";
      stage.textContent = "登壇予定";
      extraRow.appendChild(stage);
    }

    main.appendChild(titleDiv);
    main.appendChild(locRow);
    main.appendChild(meta);
    if (extraRow.children.length > 0) main.appendChild(extraRow);

    /* -- Action row: ○△× + counts + 出欠状況 + カレンダー -- */
    var actions = document.createElement("div");
    actions.className = "event-actions";

    /* 出欠ボタン */
    if (ev.recruit_support && window.AIK_API_URL) {
      var existing = myRsvps[ev.uid] || null;
      var rsvpBtn = document.createElement("button");
      rsvpBtn.type = "button";
      if (existing) {
        /* 回答済みの人は満席でも変更・取消できる（取消で枠が空くため） */
        var sl = { yes: "○ 参加", maybe: "△ 未定", no: "× 不参加" };
        rsvpBtn.className = "btn-rsvp-answer is-answered status-" + existing.status;
        rsvpBtn.textContent = (sl[existing.status] || "○ 参加") + "（変更）";
      } else if (assistFull) {
        rsvpBtn.className = "btn-rsvp-answer is-full";
        rsvpBtn.textContent = "サポート枠は満席です";
        rsvpBtn.disabled = true;
        rsvpBtn.title = "枠が空くと回答できるようになります。どうしても参加したい場合は代表にご連絡ください。";
      } else {
        rsvpBtn.className = "btn-rsvp-answer";
        rsvpBtn.textContent = "出欠を回答する";
      }
      if (!rsvpBtn.disabled) {
        rsvpBtn.addEventListener("click", function () { showRsvpModal(ev, existing, existing ? existing.status : "yes"); });
      }
      actions.appendChild(rsvpBtn);
    }

    /* Counts removed — サポート人数バッジで十分 */

    /* 📷 count */
    if (ev.photo_request_count > 0) {
      var pc = document.createElement("span");
      pc.className = "badge-photo";
      pc.textContent = "📷" + ev.photo_request_count;
      pc.title = "撮影希望者がいます";
      actions.appendChild(pc);
    }

    /* 出欠状況 button */
    if (ev.recruit_support && window.AIK_API_URL) {
      var attBtn = document.createElement("button");
      attBtn.type = "button";
      attBtn.className = "btn-attendance";
      attBtn.textContent = "出欠状況";
      attBtn.addEventListener("click", function () { showAttendanceTable(ev); });
      actions.appendChild(attBtn);
    }

    /* カレンダーボタン（右寄せ） */
    var calBtn = document.createElement("button");
    calBtn.type = "button";
    calBtn.className = "btn-cal";
    calBtn.textContent = "＋カレンダー";
    calBtn.addEventListener("click", function () { downloadICS(ev); });
    actions.appendChild(calBtn);

    main.appendChild(actions);
    li.appendChild(when);
    li.appendChild(main);
    return li;
  }

  /* --- Render all events --- */
  function renderAll(events) {
    var container = document.getElementById("akk-events");
    if (!container) return;

    var visible = events.filter(function (ev) {
      return ev.visible !== false;
    });

    /* 開催済み(status:"done")は予定表から外し、実績欄へ */
    var upcoming = visible.filter(function (ev) { return ev.status !== "done"; });
    var done = visible.filter(function (ev) { return ev.status === "done"; });

    if (upcoming.length === 0) {
      container.innerHTML = '<p style="color:var(--text-mute);">現在予定されているイベントはありません。</p>';
    } else {
      var ul = document.createElement("ul");
      ul.className = "event-list";
      upcoming.forEach(function (ev) {
        try { ul.appendChild(renderEvent(ev)); }
        catch (e) { console.error("renderEvent error:", ev.uid, e); }
      });
      container.innerHTML = "";
      container.appendChild(ul);
    }

    renderPast(done);
  }

  /* --- Render 開催実績 (status:"done") --- */
  function renderPast(done) {
    var host = document.getElementById("akk-past");
    if (!host) return;
    if (done.length === 0) { host.innerHTML = ""; return; }

    var count = done.length;
    var totalPeople = 0;
    var hasNumbers = false;
    done.forEach(function (ev) {
      if (typeof ev.actual_participants === "number") {
        totalPeople += ev.actual_participants;
        hasNumbers = true;
      }
    });

    var sorted = done.slice().sort(function (a, b) {
      return String(b.start).localeCompare(String(a.start));
    });

    host.innerHTML = "";

    var heading = document.createElement("h2");
    heading.textContent = "🎓 開催実績";
    host.appendChild(heading);

    var summary = document.createElement("div");
    summary.className = "past-summary";
    summary.innerHTML = "累計 <b>" + count + "</b> 回開催" +
      (hasNumbers ? " ／ 延べ <b>" + totalPeople + "</b> 名にAI教室をお届け" : "");
    host.appendChild(summary);

    var ul = document.createElement("ul");
    ul.className = "past-list";
    sorted.forEach(function (ev) {
      var li = document.createElement("li");
      li.className = "past-item";
      if (ev.fee_type === "paid") li.classList.add("is-paid");

      var when = document.createElement("span");
      when.className = "past-date";
      when.textContent = fmtDate(ev.start);
      li.appendChild(when);

      var title = document.createElement("span");
      title.className = "past-title";
      title.textContent = ev.title;
      li.appendChild(title);

      if (typeof ev.actual_participants === "number") {
        var p = document.createElement("span");
        p.className = "past-people";
        p.textContent = "👥 " + ev.actual_participants + "名参加";
        li.appendChild(p);
      }
      ul.appendChild(li);
    });
    host.appendChild(ul);
  }

  /* --- RSVP state --- */
  var myRsvps = {};
  var allEvents = [];

  function setMyRsvp(uid, rsvp) {
    if (rsvp) myRsvps[uid] = rsvp;
    else delete myRsvps[uid];
  }

  /* --- RSVP Modal (調整さん風) --- */
  function showRsvpModal(ev, existingRsvp, initialStatus) {
    var overlay = document.createElement("div");
    overlay.className = "rsvp-overlay";
    var modal = document.createElement("div");
    modal.className = "rsvp-modal";

    var title = document.createElement("h3");
    title.textContent = ev.title;
    modal.appendChild(title);
    var subtitle = document.createElement("p");
    subtitle.className = "rsvp-modal-date";
    subtitle.textContent = fmtDate(ev.start) + " " + fmtTimeRange(ev);
    modal.appendChild(subtitle);

    /* ○△× */
    var selectedStatus = initialStatus || (existingRsvp && existingRsvp.status) || "yes";
    var sfGroup = document.createElement("div");
    sfGroup.className = "rsvp-field";
    var sfLabel = document.createElement("label");
    sfLabel.textContent = "出欠";
    sfGroup.appendChild(sfLabel);
    var sfBtns = document.createElement("div");
    sfBtns.className = "rsvp-status-btns rsvp-status-modal";
    [
      { v: "yes", l: "○ 参加", c: "status-yes" },
      { v: "maybe", l: "△ 未定", c: "status-maybe" },
      { v: "no", l: "× 不参加", c: "status-no" }
    ].forEach(function (s) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "rsvp-status-btn " + s.c + (s.v === selectedStatus ? " is-active" : "");
      btn.textContent = s.l;
      btn.addEventListener("click", function () {
        sfBtns.querySelectorAll(".rsvp-status-btn").forEach(function (b) { b.classList.remove("is-active"); });
        btn.classList.add("is-active");
        selectedStatus = s.v;
        if (tGroup) tGroup.hidden = (selectedStatus !== "yes");
        if (compGroup) compGroup.hidden = (selectedStatus !== "yes");
      });
      sfBtns.appendChild(btn);
    });
    sfGroup.appendChild(sfBtns);
    modal.appendChild(sfGroup);

    /* Name */
    var nGroup = document.createElement("div");
    nGroup.className = "rsvp-field";
    var nLabel = document.createElement("label");
    nLabel.textContent = "名前";
    nGroup.appendChild(nLabel);
    var nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "rsvp-input";
    nameInput.placeholder = "表示名（出欠状況に表示されます）";
    nameInput.value = (existingRsvp && existingRsvp.name) || localStorage.getItem("akk_rsvp_name") || "";
    nGroup.appendChild(nameInput);
    modal.appendChild(nGroup);

    /* 同伴者数（○参加のときだけ表示） */
    var compGroup = null;
    var compInput = null;
    if (ev.recruit_support) {
      compGroup = document.createElement("div");
      compGroup.className = "rsvp-field";
      compGroup.hidden = (selectedStatus !== "yes");
      var compLabel = document.createElement("label");
      compLabel.textContent = "一緒に参加する人数";
      compGroup.appendChild(compLabel);
      compInput = document.createElement("input");
      compInput.type = "number";
      compInput.min = "0";
      compInput.step = "1";
      compInput.className = "rsvp-input";
      compInput.value = String(toInt(existingRsvp && existingRsvp.companions));
      compGroup.appendChild(compInput);
      var compHint = document.createElement("p");
      compHint.className = "rsvp-hint";
      var capForHint = assistCapOf(ev);
      compHint.textContent = "ご家族・ご友人と一緒に来られる場合、ご自身を除いた人数を入れてください（おひとりなら 0 のまま）。"
        + (capForHint ? "サポート枠の残りは " + Math.max(0, capForHint - assistUsedByOthers(ev, existingRsvp)) + "名です。" : "");
      compGroup.appendChild(compHint);
      modal.appendChild(compGroup);
    }

    /* Photo */
    var photoCheck = document.createElement("input");
    photoCheck.type = "checkbox";
    photoCheck.id = "rsvp-photo";
    if (existingRsvp && existingRsvp.photo_ok === "yes") photoCheck.checked = true;
    var pGroup = document.createElement("div");
    pGroup.className = "rsvp-field rsvp-checkbox-row";
    pGroup.appendChild(photoCheck);
    var pLabel = document.createElement("label");
    pLabel.htmlFor = "rsvp-photo";
    pLabel.textContent = "📷 自己アピール写真の撮影を希望";
    pGroup.appendChild(pLabel);
    var pHelp = buildHelpBtn("当日、AI教室でボランティアとして活躍するあなたの写真を他のメンバーに撮ってもらえます。就活のガクチカや自己アピール資料にそのまま使えます。");
    pGroup.appendChild(pHelp.btn);
    modal.appendChild(pGroup);
    modal.appendChild(pHelp.hint);

    /* Certificate */
    var certCheck = document.createElement("input");
    certCheck.type = "checkbox";
    certCheck.id = "rsvp-cert";
    if (existingRsvp && existingRsvp.cert_request === "yes") certCheck.checked = true;
    var certGroup = document.createElement("div");
    certGroup.className = "rsvp-field rsvp-checkbox-row";
    certGroup.appendChild(certCheck);
    var certLabel = document.createElement("label");
    certLabel.htmlFor = "rsvp-cert";
    certLabel.textContent = "📜 ボランティア証明書の発行を希望";
    certGroup.appendChild(certLabel);
    var certHelp = buildHelpBtn("AIかけこみ寺が発行するボランティア活動証明書です。就活・内申・奨学金申請などの提出書類としてお使いいただけます。参加後にメールでお届けします。");
    certGroup.appendChild(certHelp.btn);
    modal.appendChild(certGroup);
    modal.appendChild(certHelp.hint);

    /* Comment */
    var cGroup = document.createElement("div");
    cGroup.className = "rsvp-field";
    var cLabel = document.createElement("label");
    cLabel.textContent = "コメント";
    cGroup.appendChild(cLabel);
    var commentInput = document.createElement("input");
    commentInput.type = "text";
    commentInput.className = "rsvp-input";
    commentInput.placeholder = "一言（任意）";
    commentInput.value = (existingRsvp && existingRsvp.comment) || "";
    cGroup.appendChild(commentInput);
    modal.appendChild(cGroup);

    /* Transport (collect_transport && ○のときだけ表示) */
    var tGroup = null;
    var transportSelect = null;
    if (ev.collect_transport) {
      tGroup = document.createElement("div");
      tGroup.className = "rsvp-field";
      tGroup.hidden = (selectedStatus !== "yes");
      var tLabel = document.createElement("label");
      tLabel.textContent = "交通費";
      tGroup.appendChild(tLabel);
      transportSelect = document.createElement("select");
      transportSelect.className = "rsvp-select";
      [{ v: "", l: "-- 選択 --" }, { v: "want", l: "支給希望" }, { v: "decline", l: "辞退" }].forEach(function (o) {
        var opt = document.createElement("option");
        opt.value = o.v;
        opt.textContent = o.l;
        if (existingRsvp && existingRsvp.transport === o.v) opt.selected = true;
        transportSelect.appendChild(opt);
      });
      tGroup.appendChild(transportSelect);
      modal.appendChild(tGroup);
    }

    /* Actions */
    var mActions = document.createElement("div");
    mActions.className = "rsvp-actions";
    var submitBtn = document.createElement("button");
    submitBtn.type = "button";
    submitBtn.className = "rsvp-submit";
    submitBtn.textContent = existingRsvp ? "更新する" : "回答する";
    submitBtn.addEventListener("click", function () {
      if (!nameInput.value.trim()) {
        nameInput.focus();
        nameInput.style.borderColor = "var(--accent)";
        return;
      }
      var companions = compInput ? toInt(compInput.value) : 0;

      /* 定員オーバーの事前チェック（○参加のときだけ）。
         他メンバーぶんの確定人数に、自分＋同伴者を足して枠を超えないか見る。 */
      var capCheck = assistCapOf(ev);
      if (capCheck && selectedStatus === "yes") {
        var left = capCheck - assistUsedByOthers(ev, existingRsvp);
        if (1 + companions > left) {
          submitBtn.textContent = left > 0
            ? "サポート枠の残りは" + left + "名です"
            : "サポート枠が満席になりました";
          submitBtn.disabled = false;
          if (compInput) { compInput.focus(); compInput.style.borderColor = "var(--accent)"; }
          return;
        }
      }

      submitBtn.disabled = true;
      submitBtn.textContent = "送信中...";
      localStorage.setItem("akk_rsvp_name", nameInput.value.trim());
      var payload = {
        event_uid: ev.uid,
        role: "assistant",
        status: selectedStatus,
        name: nameInput.value.trim(),
        companions: selectedStatus === "yes" ? companions : 0,
        photo_ok: photoCheck.checked ? "yes" : "",
        cert_request: certCheck.checked ? "yes" : "",
        comment: commentInput.value.trim()
      };
      if (transportSelect && selectedStatus === "yes") {
        payload.transport = transportSelect.value;
      }
      AIK_API.postRsvp(payload).then(function () {
        setMyRsvp(ev.uid, payload);
        overlay.remove();
        renderAll(allEvents);
      }).catch(function (err) {
        submitBtn.disabled = false;
        submitBtn.textContent = "エラー: " + err.message;
      });
    });
    mActions.appendChild(submitBtn);

    if (existingRsvp) {
      var delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "rsvp-cancel-btn";
      delBtn.textContent = "回答を取り消す";
      delBtn.addEventListener("click", function () {
        delBtn.disabled = true;
        AIK_API.cancelRsvp(ev.uid).then(function () {
          setMyRsvp(ev.uid, null);
          overlay.remove();
          renderAll(allEvents);
        });
      });
      mActions.appendChild(delBtn);
    }

    var closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "rsvp-close-btn";
    closeBtn.textContent = "閉じる";
    closeBtn.addEventListener("click", function () { overlay.remove(); });
    mActions.appendChild(closeBtn);

    modal.appendChild(mActions);
    overlay.appendChild(modal);
    overlay.addEventListener("click", function (e) { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  }

  /* --- Attendance Table Modal --- */
  function showAttendanceTable(ev) {
    var overlay = document.createElement("div");
    overlay.className = "rsvp-overlay";
    var modal = document.createElement("div");
    modal.className = "rsvp-modal attendance-modal";

    var title = document.createElement("h3");
    title.textContent = "出欠状況";
    modal.appendChild(title);
    var subtitle = document.createElement("p");
    subtitle.className = "rsvp-modal-date";
    subtitle.textContent = ev.title + " — " + fmtDate(ev.start);
    modal.appendChild(subtitle);

    var loading = document.createElement("p");
    loading.className = "rsvp-modal-date";
    loading.textContent = "読み込み中...";
    modal.appendChild(loading);

    var mActions = document.createElement("div");
    mActions.className = "rsvp-actions";
    var closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "rsvp-close-btn";
    closeBtn.textContent = "閉じる";
    closeBtn.addEventListener("click", function () { overlay.remove(); });
    mActions.appendChild(closeBtn);
    modal.appendChild(mActions);

    AIK_API.getEventRsvps(ev.uid).then(function (rsvps) {
      loading.remove();
      if (rsvps.length === 0) {
        var empty = document.createElement("p");
        empty.className = "rsvp-modal-date";
        empty.textContent = "まだ回答がありません";
        modal.insertBefore(empty, mActions);
        return;
      }
      var statusLabels = { yes: "○", maybe: "△", no: "×" };
      var order = { yes: 0, maybe: 1, no: 2 };
      rsvps.sort(function (a, b) { return (order[a.status] || 3) - (order[b.status] || 3); });

      var table = document.createElement("table");
      table.className = "attendance-table";
      var thead = document.createElement("thead");
      var hr = document.createElement("tr");
      ["名前", "出欠", "📷", "📜", "コメント"].forEach(function (h) {
        var th = document.createElement("th");
        th.textContent = h;
        hr.appendChild(th);
      });
      thead.appendChild(hr);
      table.appendChild(thead);

      var tbody = document.createElement("tbody");
      rsvps.forEach(function (r) {
        var tr = document.createElement("tr");
        tr.className = "att-row-" + (r.status || "yes");
        var td1 = document.createElement("td");
        var comp = toInt(r.companions);
        td1.textContent = (r.name || "—") + (comp ? "（+" + comp + "名）" : "");
        tr.appendChild(td1);
        var td2 = document.createElement("td");
        td2.className = "td-status td-" + (r.status || "yes");
        td2.textContent = statusLabels[r.status] || "○";
        tr.appendChild(td2);
        var td3 = document.createElement("td");
        td3.textContent = r.photo_ok === "yes" ? "📷" : "";
        tr.appendChild(td3);
        var td3b = document.createElement("td");
        td3b.textContent = r.cert_request === "yes" ? "📜" : "";
        tr.appendChild(td3b);
        var td4 = document.createElement("td");
        td4.className = "td-comment";
        td4.textContent = r.comment || "";
        tr.appendChild(td4);
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      modal.insertBefore(table, mActions);

      /* 同伴者を含めた人数で集計する（バッジの N/M 名と一致させる） */
      function sumHead(st) {
        return rsvps.reduce(function (a, r) {
          return a + (r.status === st ? 1 + toInt(r.companions) : 0);
        }, 0);
      }
      var yes = sumHead("yes"), maybe = sumHead("maybe"), no = sumHead("no");
      var summary = document.createElement("div");
      summary.className = "attendance-summary";
      summary.textContent = "○" + yes + "名  △" + maybe + "名  ×" + no + "名";
      modal.insertBefore(summary, mActions);
    });

    overlay.appendChild(modal);
    overlay.addEventListener("click", function (e) { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  }

  /* --- Init --- */
  function init() {
    var container = document.getElementById("akk-events");
    if (!container) return;

    var rsvpPromise = window.AIK_API_URL
      ? AIK_API.getMyRsvps().then(function (list) {
          list.forEach(function (r) { myRsvps[r.event_uid] = r; });
        })
      : Promise.resolve();

    Promise.all([AIK_API.getEvents(), rsvpPromise]).then(function (results) {
      var result = results[0];
      allEvents = result.events;
      renderAll(allEvents);
      if (result.pending) {
        result.pending.then(function (freshEvents) {
          allEvents = freshEvents;
          renderAll(allEvents);
        });
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
