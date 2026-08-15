/* ============================================================
 *  AIかけこみ寺 API layer（CfJ Summit デモ版）
 *  --------------------------------------------------------
 *  実サイトの assets/api.js は Supabase Auth と GAS API に依存するが、
 *  デモ版は認証も外部通信も持たない自己完結版にする。
 *
 *  - イベント: 伏字化済みの静的 events.json を読む
 *  - 出欠(RSVP): uid から決まる決定論的ダミーデータをメモリ上に生成し、
 *                回答・取消もメモリ上だけで完結させる（リロードで消える）
 *  - 表示される人数はすべてこのダミーデータから集計するので、
 *    バッジの人数と「出欠状況」の一覧が必ず一致する。
 * ============================================================ */

(function () {
  "use strict";

  /* events.js は window.AIK_API_URL の有無で出欠UIを出し分ける。
     デモでも出欠を体験してほしいのでダミー値を入れる（通信には使わない）。 */
  window.AIK_API_URL = "demo://local";

  var MY_KEY = "__me__";
  var store = {};      /* uid -> [rsvp, ...] */
  var seeded = false;

  var NAMES = ["メンバーA","メンバーB","メンバーC","メンバーD","メンバーE",
               "メンバーF","メンバーG","メンバーH","メンバーI","メンバーJ"];
  var COMMENTS = ["午前だけ参加できます","会場で合流します","はじめて参加します",
                  "受付を担当します","少し遅れて到着予定です",""];

  /* uid から決まる疑似乱数（毎回同じ結果になる＝画面がチラつかない） */
  function seedOf(uid) {
    var h = 0, s = String(uid);
    for (var i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) >>> 0; }
    return h;
  }
  function rnd(seed, n) { return n > 0 ? (seed % n) : 0; }

  function toInt(v) { var n = parseInt(v, 10); return (isNaN(n) || n < 0) ? 0 : n; }

  /* --- イベント1件ぶんのダミー出欠を作る --- */
  function seedEvent(ev) {
    if (!ev.recruit_support) { store[ev.uid] = []; return; }

    var cap = (ev.assist_capacity && ev.assist_capacity > 0) ? ev.assist_capacity : 6;
    var h = seedOf(ev.uid);

    /* ○参加は枠の 4〜7 割程度に収める（必ず残枠が1名以上あり、満席表示にしない） */
    var yes = Math.max(2, Math.min(cap - 1, Math.round(cap * 0.4) + rnd(h, Math.max(1, Math.floor(cap * 0.3)))));
    var maybe = 1 + rnd((h >> 3) ^ (h >> 17), 2);
    var no = rnd((h >> 5) ^ (h >> 13) ^ 0x5f, 2);

    var list = [];
    var idx = 0;
    function push(status, count) {
      for (var i = 0; i < count; i++) {
        var k = (h >> (i + 2)) % 6;
        list.push({
          name: NAMES[idx % NAMES.length],
          status: status,
          companions: 0,
          photo_ok: (status === "yes" && k === 0) ? "yes" : "",
          cert_request: (status === "yes" && k === 1) ? "yes" : "",
          comment: status === "yes" ? COMMENTS[k] : ""
        });
        idx++;
      }
    }
    push("yes", yes);
    push("maybe", maybe);
    push("no", no);
    store[ev.uid] = list;
  }

  /* --- 集計（events.js が読む *_count を埋める） --- */
  function head(list, status) {
    return list.reduce(function (a, r) {
      return a + (r.status === status ? 1 + toInt(r.companions) : 0);
    }, 0);
  }
  function applyCounts(ev) {
    var list = store[ev.uid] || [];
    ev.yes_count = head(list, "yes");
    ev.maybe_count = head(list, "maybe");
    ev.no_count = head(list, "no");
    ev.photo_request_count = list.filter(function (r) { return r.photo_ok === "yes"; }).length;
    return ev;
  }

  var events = [];

  function getEvents() {
    if (seeded) {
      return Promise.resolve({ events: events.map(applyCounts), pending: null });
    }
    return fetch("events.json?v=" + Date.now())
      .then(function (r) { return r.json(); })
      .catch(function () { return []; })
      .then(function (list) {
        events = Array.isArray(list) ? list : [];
        events.forEach(seedEvent);
        seeded = true;
        return { events: events.map(applyCounts), pending: null };
      });
  }

  /* --- デモ用トースト --- */
  function toast(msg) {
    var el = document.createElement("div");
    el.className = "demo-toast";
    el.textContent = msg;
    document.body.appendChild(el);
    requestAnimationFrame(function () { el.classList.add("is-shown"); });
    setTimeout(function () {
      el.classList.remove("is-shown");
      setTimeout(function () { el.remove(); }, 400);
    }, 3200);
  }

  var STATUS_LABEL = { yes: "出席", maybe: "未定", no: "欠席" };

  /* --- 回答（メモリ上だけ・送信しない） --- */
  function postRsvp(data) {
    var list = store[data.event_uid] || (store[data.event_uid] = []);
    var mine = {
      _key: MY_KEY,
      name: (data.name || "あなた") + "（あなた）",
      status: data.status,
      companions: toInt(data.companions),
      photo_ok: data.photo_ok || "",
      cert_request: data.cert_request || "",
      comment: data.comment || ""
    };
    var i = list.findIndex(function (r) { return r._key === MY_KEY; });
    if (i >= 0) list[i] = mine; else list.unshift(mine);

    events.forEach(function (ev) { if (ev.uid === data.event_uid) applyCounts(ev); });
    toast("✅ " + (STATUS_LABEL[data.status] || "出席") + "で回答しました（デモのため送信されません）");
    return Promise.resolve({ ok: true });
  }

  function cancelRsvp(eventUid) {
    var list = store[eventUid] || [];
    store[eventUid] = list.filter(function (r) { return r._key !== MY_KEY; });
    events.forEach(function (ev) { if (ev.uid === eventUid) applyCounts(ev); });
    toast("🗑 回答を取り消しました（デモのため送信されません）");
    return Promise.resolve({ ok: true });
  }

  function getEventRsvps(eventUid) {
    return Promise.resolve((store[eventUid] || []).slice());
  }

  /* リロードのたびに「未回答」から始める（localStorage は使わない） */
  function getMyRsvps() { return Promise.resolve([]); }

  window.AIK_API = {
    getEvents: getEvents,
    getMyRsvps: getMyRsvps,
    getEventRsvps: getEventRsvps,
    postRsvp: postRsvp,
    cancelRsvp: cancelRsvp
  };
})();
