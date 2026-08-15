/* ============================================================
 *  AIかけこみ寺 メンバー向けサイト（CfJ Summit デモ版）- Sidebar Nav
 *  --------------------------------------------------------
 *  実サイトの assets/nav.js から認証・GitHub Issues 連携を外した版。
 *  デモに含めないページはリンクにせず「デモ版では省略」と表示する。
 * ============================================================ */

(function () {
  "use strict";

  var NAV = [
    { key: "home",       icon: "🏠",   label: "トップ",         href: "/cfj/internal/" },
    { key: "accounting", icon: "💰",   label: "会計帳簿",       href: "/cfj/accounting/" },
    { key: "members",    icon: "🔰",   label: "はじめての方へ" },
    { key: "plan",       icon: "🗂️",  label: "運営マニュアル" },
    { key: "policy",     icon: "⚖️",  label: "運営方針" },
    { key: "npo",        icon: "🏛️",  label: "団体について" }
  ];

  function item(n, activeKey) {
    if (!n.href) {
      return '<li><span class="is-disabled">'
        + '<span class="nav-icon">' + n.icon + "</span>"
        + "<span>" + n.label + "</span>"
        + '<span class="demo-omit">デモ版では省略</span>'
        + "</span></li>";
    }
    return '<li><a href="' + n.href + '" class="' + (n.key === activeKey ? "active" : "") + '">'
      + '<span class="nav-icon">' + n.icon + "</span>"
      + "<span>" + n.label + "</span>"
      + "</a></li>";
  }

  function buildSidebar(activeKey) {
    return [
      '<aside class="sidebar" id="akk-sidebar-aside">',
      '<button class="sidebar-close" id="akk-sidebar-close" aria-label="メニューを閉じる">✕</button>',
      '<div class="sidebar-brand">',
      '<div class="sidebar-brand-name">AIかけこみ寺</div>',
      '<div class="sidebar-brand-sub">メンバー向け（デモ）</div>',
      "</div>",
      '<ul class="nav">',
      NAV.map(function (n) { return item(n, activeKey); }).join(""),
      "</ul>",
      '<div class="sidebar-foot">',
      '<a href="/cfj/" style="color:var(--text-mute);font-size:0.82rem;text-decoration:none;display:flex;align-items:center;gap:6px;">↩ CfJ Summit リンク集へ戻る</a>',
      "</div>",
      "</aside>",
      '<div class="sidebar-backdrop" id="akk-sidebar-bd"></div>',
      '<button class="menu-btn" id="akk-menu-btn" aria-label="メニューを開く">☰ メニュー</button>'
    ].join("");
  }

  function init() {
    var host = document.getElementById("akk-sidebar");
    if (!host) return;
    host.innerHTML = buildSidebar(document.body.dataset.page || "home");

    var aside = document.getElementById("akk-sidebar-aside");
    var bd = document.getElementById("akk-sidebar-bd");
    var btn = document.getElementById("akk-menu-btn");
    var closeBtn = document.getElementById("akk-sidebar-close");
    var open = function () { aside.classList.add("open"); bd.classList.add("show"); };
    var close = function () { aside.classList.remove("open"); bd.classList.remove("show"); };
    if (btn && aside && bd) {
      btn.addEventListener("click", open);
      bd.addEventListener("click", close);
      if (closeBtn) closeBtn.addEventListener("click", close);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
