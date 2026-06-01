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

    // No fallback styles — every page loads /style.css which already
    // styles .site-header / .site-nav / .site-brand / .site-cta / .nav-toggle.
    // Injecting our own would override the canonical look (background blur,
    // centred nav, accent CTA, etc.) and is the root cause of the visual
    // drift between /tools/ and the rest of the site.

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
