/* =======================================================================
   /nav.js — single source of truth for the site nav.

   Drops in as <script src="/nav.js"></script> after <body>.
   Injects the canonical header, lights up the active link, and wires
   the mobile hamburger. No external deps. Works at any URL depth
   because every nav link is an absolute path.
   ======================================================================= */
(function () {
  "use strict";

  var NAV_ITEMS = [
    { href: "/tools/",                 label: "🔒 Tools" },
    { href: "/apps.html",              label: "Apps" },
    { href: "/productivity-tips.html", label: "Productivity Tips" },
    { href: "/time-blocking-guide.html", label: "Time Blocking" },
    { href: "/etsy-guides.html",       label: "Templates" },
    { href: "/about.html",             label: "About" }
  ];

  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function isActive(href) {
    var path = location.pathname;
    // Normalise trailing index.html and trailing slashes for comparison
    var normPath = path.replace(/\/index\.html$/, "/");
    var normHref = href.replace(/\/index\.html$/, "/");
    if (normPath === normHref) return true;
    // Treat /tools/* as Tools-active
    if (normHref === "/tools/" && normPath.indexOf("/tools/") === 0) return true;
    return false;
  }

  function buildNav() {
    var links = NAV_ITEMS.map(function (it) {
      var active = isActive(it.href);
      return '<a href="' + it.href + '"' +
             (active ? ' aria-current="page" class="active"' : '') +
             '>' + escapeHtml(it.label) + '</a>';
    }).join("");

    return (
      '<header class="site-header" id="ttSiteHeader">' +
        '<div class="site-header-inner">' +
          '<a class="site-brand" href="/">Today\'s Tasks</a>' +
          '<button class="nav-toggle" type="button" aria-label="Toggle navigation" aria-expanded="false" aria-controls="primary-nav">' +
            '<span class="nav-toggle-bar"></span>' +
            '<span class="nav-toggle-bar"></span>' +
            '<span class="nav-toggle-bar"></span>' +
          '</button>' +
          '<nav class="site-nav" id="primary-nav" aria-label="Primary">' +
            links +
          '</nav>' +
          '<a class="site-cta" href="/apps.html">Todo App</a>' +
        '</div>' +
      '</header>'
    );
  }

  function injectStyles() {
    // Self-contained fallback styles — only kick in if the host page
    // hasn't loaded /style.css yet. Real styling stays in /style.css.
    if (document.getElementById("ttNavFallbackStyles")) return;
    var s = document.createElement("style");
    s.id = "ttNavFallbackStyles";
    s.textContent =
      "#ttSiteHeader.site-header{background:#fff;border-bottom:1px solid #e2e8f0;position:sticky;top:0;z-index:40}" +
      "#ttSiteHeader .site-header-inner{max-width:1200px;margin:0 auto;display:flex;align-items:center;gap:18px;padding:12px 20px}" +
      "#ttSiteHeader .site-brand{font-weight:800;color:#0f172a;text-decoration:none;font-size:17px}" +
      "#ttSiteHeader .site-nav{display:flex;gap:18px;flex:1;flex-wrap:wrap}" +
      "#ttSiteHeader .site-nav a{color:#334155;text-decoration:none;font-weight:600;font-size:14.5px}" +
      "#ttSiteHeader .site-nav a.active,#ttSiteHeader .site-nav a[aria-current=page]{color:#0d9488}" +
      "#ttSiteHeader .site-cta{background:#0d9488;color:#fff;padding:8px 16px;border-radius:999px;text-decoration:none;font-weight:700;font-size:14px}" +
      "#ttSiteHeader .nav-toggle{display:none;background:transparent;border:none;padding:6px;cursor:pointer;flex-direction:column;gap:4px}" +
      "#ttSiteHeader .nav-toggle-bar{display:block;width:22px;height:2px;background:#0f172a;border-radius:2px}" +
      "@media(max-width:768px){" +
        "#ttSiteHeader .nav-toggle{display:inline-flex}" +
        "#ttSiteHeader .site-nav{position:absolute;top:100%;left:0;right:0;flex-direction:column;background:#fff;border-bottom:1px solid #e2e8f0;padding:10px 20px;gap:10px;display:none}" +
        "#ttSiteHeader.is-open .site-nav{display:flex}" +
        "#ttSiteHeader .site-cta{margin-left:auto}" +
      "}";
    document.head.appendChild(s);
  }

  function mount() {
    // Avoid double-mount: if any existing .site-header is present, replace it.
    var existing = document.querySelector("header.site-header,header.site-nav");
    var wrap = document.createElement("div");
    wrap.innerHTML = buildNav();
    var header = wrap.firstElementChild;

    if (existing) {
      existing.parentNode.replaceChild(header, existing);
    } else {
      document.body.insertBefore(header, document.body.firstChild);
    }

    injectStyles();

    // Hamburger toggle
    var toggle = header.querySelector(".nav-toggle");
    toggle.addEventListener("click", function () {
      var open = header.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });

    // Close menu when an in-nav link is clicked (mobile UX)
    header.querySelectorAll(".site-nav a").forEach(function (a) {
      a.addEventListener("click", function () {
        header.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });

    // Close on outside-click (mobile)
    document.addEventListener("click", function (e) {
      if (!header.contains(e.target)) {
        header.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });

    // ESC closes mobile menu
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        header.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
