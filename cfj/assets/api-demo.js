/* ============================================================
 *  AIかけこみ寺 API layer（CfJ Summit デモ版）
 *  --------------------------------------------------------
 *  実サイトの assets/api.js は Supabase Auth と GAS API に依存するが、
 *  デモ版は伏字化済みの静的 events.json を読むだけの自己完結版にする。
 *  RSVP 系は window.AIK_API_URL が未定義なので events.js 側で
 *  描画されない（出欠ボタン・出欠一覧は出ない）。
 * ============================================================ */

(function () {
  "use strict";

  function getEvents() {
    return fetch("events.json?v=" + Date.now())
      .then(function (r) { return r.json(); })
      .then(function (events) { return { events: events, pending: null }; })
      .catch(function () { return { events: [], pending: null }; });
  }

  function none() { return Promise.resolve([]); }
  function unsupported() { return Promise.reject(new Error("デモ版では利用できません")); }

  window.AIK_API = {
    getEvents: getEvents,
    getMyRsvps: none,
    getEventRsvps: none,
    postRsvp: unsupported,
    cancelRsvp: unsupported
  };
})();
