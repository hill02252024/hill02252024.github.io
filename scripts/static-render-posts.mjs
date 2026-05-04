// scripts/static-render-posts.mjs
//
// Fetches all China-explore posts from the Apps Script feed and writes one
// static HTML file per post under /posts/<slug>.html. The slug is derived from
// the post id (or from a sanitized title when present), guaranteeing stable
// URLs that don't depend on JS execution.
//
// Why: previously each post lived at /post.html?id=<id> and was rendered at
// runtime by JS. That weakens SEO (query-string canonicals, JS-dependent
// content) and breaks if the Apps Script endpoint is rate-limited. Static
// pages fix both. The dynamic /post.html template is kept as a fallback.
//
// Usage: node scripts/static-render-posts.mjs
//        npx run from the GitHub Action alongside build-sitemaps.mjs.
import fs from "node:fs/promises";
import path from "node:path";

const FEED_URL = "https://script.google.com/macros/s/AKfycbwq5InzCeyUnW-GHe6bNqReMQMzWvwKe_pAZpD7ONHZ4LZrBdt8lgtpdxu1c57AaPx3ww/exec";
const SITE = "https://todays-tasks.com";
const OUT_DIR = "posts";

function escHtml(s = "") {
  return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
}
function escAttr(s = "") { return escHtml(s); }
function iso(d) { try { return new Date(d).toISOString(); } catch { return new Date().toISOString(); } }

// Slug derivation: stable, URL-safe, prefers id (the Apps Script id is already
// short and unique). Falls back to a sanitized title prefix when id is empty.
function makeSlug(item) {
  const id = String(item.id || "").trim();
  if (id && /^[A-Za-z0-9_-]+$/.test(id)) return id;
  const title = String(item.title || "").trim();
  const base = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base || `post-${Math.random().toString(36).slice(2, 10)}`;
}

function renderBody(p) {
  const text = [p.excerpt, p.content].filter(Boolean).join("\n\n");
  return text.split(/\n{2,}/).map(seg => `<p>${escHtml(seg).replace(/\n/g, "<br>")}</p>`).join("");
}

function postHtml(p, prev, next) {
  const slug = makeSlug(p);
  const url = `${SITE}/${OUT_DIR}/${slug}.html`;
  const title = p.title || "China Explore";
  const desc = p.excerpt || "中國美食與景點實地體驗筆記。";
  const img = p.image || `${SITE}/assets/1.jpg`;
  const tags = (p.tags || []).map(t => `<span class="tag">#${escHtml(t)}</span>`).join("");
  const dateStr = p.created ? new Date(p.created).toISOString().slice(0, 10) : "";
  const isFood = (p.kind || "").includes("食");
  const q = encodeURIComponent([(p.city || ""), p.title].filter(Boolean).join(" "));
  const authority = isFood
    ? `<a class="btn primary" href="https://www.dianping.com/search/keyword/2/0_${q}" target="_blank" rel="nofollow noopener">權威連結：大眾點評</a>`
    : `<a class="btn primary" href="https://www.tripadvisor.com/Search?q=${q}" target="_blank" rel="nofollow noopener">權威連結：Tripadvisor</a>`;
  const prevLink = prev ? `<a class="btn" href="/${OUT_DIR}/${makeSlug(prev)}.html">← 上一篇：${escHtml(prev.title || "")}</a>` : `<span></span>`;
  const nextLink = next ? `<a class="btn" href="/${OUT_DIR}/${makeSlug(next)}.html">下一篇：${escHtml(next.title || "")} →</a>` : `<span></span>`;

  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escHtml(title)}｜China Explore</title>
  <meta name="description" content="${escAttr(desc.slice(0, 160))}" />
  <meta name="robots" content="index,follow,max-image-preview:large" />
  <link rel="canonical" href="${url}" />

  <meta property="og:locale" content="zh_TW" />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="Today's Tasks" />
  <meta property="og:title" content="${escAttr(title)}" />
  <meta property="og:description" content="${escAttr(desc.slice(0, 200))}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:image" content="${escAttr(img)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escAttr(title)}" />
  <meta name="twitter:description" content="${escAttr(desc.slice(0, 200))}" />
  <meta name="twitter:image" content="${escAttr(img)}" />

  <meta name="google-adsense-account" content="ca-pub-7165265186193287" />
  <link rel="preconnect" href="https://pagead2.googlesyndication.com" crossorigin>
  <link rel="preconnect" href="https://googleads.g.doubleclick.net" crossorigin>
  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7165265186193287" crossorigin="anonymous"></script>

  <link rel="stylesheet" href="/style.css" />

  <script type="application/ld+json">
  {
    "@context":"https://schema.org",
    "@type":"BreadcrumbList",
    "itemListElement":[
      {"@type":"ListItem","position":1,"name":"Home","item":"${SITE}/"},
      {"@type":"ListItem","position":2,"name":"China Explore","item":"${SITE}/china-explore.html"},
      {"@type":"ListItem","position":3,"name":${JSON.stringify(title)},"item":"${url}"}
    ]
  }
  </script>
  <script type="application/ld+json">
  {
    "@context":"https://schema.org",
    "@type":"BlogPosting",
    "headline":${JSON.stringify(title)},
    "description":${JSON.stringify(desc.slice(0, 200))},
    "image":"${escAttr(img)}",
    ${dateStr ? `"datePublished":"${dateStr}",` : ""}
    "author":{"@type":"Person","name":"Hill"},
    "publisher":{"@type":"Organization","name":"Today's Tasks"},
    "articleSection":${JSON.stringify(p.kind || "")},
    "mainEntityOfPage":"${url}",
    "inLanguage":"zh-Hant"
  }
  </script>

  <style>
    /* Page-specific extensions on top of the global design system. */
    .wrap { max-width: 860px; margin: 0 auto; padding: 24px; }
    .breadcrumbs { font-size: 13.5px; color: var(--text-subtle); margin: 8px 0 12px; }
    .breadcrumbs a { color: var(--accent); }
    .hero {
      border-radius: var(--r-lg); overflow: hidden;
      margin: 12px 0 20px; background: var(--surface);
    }
    .hero img { width: 100%; height: auto; object-fit: cover; display: block; }
    .article {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--r-lg); padding: 28px 28px 24px;
    }
    .article h1 { font-size: clamp(24px, 3vw, 30px); margin: 0 0 10px; }
    .article p { margin: 14px 0; line-height: 1.75; }
    .meta { font-size: 14px; color: var(--text-subtle); margin: 0 0 14px; }
    .tags { margin: 8px 0 4px; display: flex; gap: 8px; flex-wrap: wrap; }
    .tag {
      font-size: 12px; background: var(--accent-soft); color: var(--accent-hover);
      border: 1px solid #bfdbfe; border-radius: 999px; padding: 2px 9px;
    }
    .cta-row { display: flex; gap: 10px; flex-wrap: wrap; margin: 18px 0 4px; }
    .pager { display: flex; justify-content: space-between; gap: 10px; margin: 20px 0; }
    .pager a { flex: 1; text-align: center; }
    .author {
      margin-top: 22px; padding: 16px 18px;
      border: 1px solid var(--border); border-radius: var(--r);
      background: var(--surface-2); color: var(--text-muted); font-size: 14px;
    }
  </style>
</head>
<body>
  <nav class="site-nav" aria-label="Primary">
    <a href="/">Home</a>
    <a href="/todo.html">Todo App</a>
    <a href="/productivity-tips.html">Productivity Tips</a>
    <a href="/time-management-strategies.html">Time Management</a>
    <a href="/digital-vs-paper-todo-lists.html">Digital To-Do Lists</a>
    <a href="/how-to-use-todays-tasks.html">How to Use</a>
    <a href="/weekly-review-checklist.html">Weekly Review</a>
    <a href="/etsy-guides.html">Templates</a>
    <a href="/about.html">About</a>
    <a href="/contact.html">Contact</a>
    <a href="/privacy.html">Privacy Policy</a>
  </nav>

  <main class="wrap">
    <nav class="breadcrumbs" aria-label="Breadcrumbs">
      <a href="/">Home</a> › <a href="/china-explore.html">China Explore</a> › <span>${escHtml(title)}</span>
    </nav>

    <article class="article">
      ${p.image ? `<div class="hero"><img src="${escAttr(p.image)}" alt="${escAttr(title)}" loading="eager"></div>` : ""}
      <h1>${escHtml(title)}</h1>
      <div class="meta">${[p.city, p.province, p.kind, dateStr].filter(Boolean).map(escHtml).join(" · ")}</div>
      <div class="tags">${tags}</div>

      ${renderBody(p) || "<p>（尚無內容）</p>"}

      <div class="cta-row">
        ${authority}
        <a class="btn" href="/china-explore.html">回到清單</a>
      </div>

      <div class="author">
        <strong>作者：</strong>Hill（Today's Tasks）｜實地踩點與在地體驗筆記。<br>
        文章與照片著作權所有，未經授權請勿轉載或改作（© Today's Tasks）。
      </div>

      <div class="pager">
        ${prevLink}
        ${nextLink}
      </div>
    </article>
  </main>

  <div class="footer-secondary" style="text-align:center;font-size:13px;color:#6b7280;margin:16px 0 6px">
    <a href="/about.html">About</a> · <a href="/contact.html">Contact</a> · <a href="/privacy.html">Privacy</a>
  </div>
  <footer style="text-align:center">© 2025 Today's Tasks. All rights reserved.</footer>
</body>
</html>
`;
}

const res = await fetch(FEED_URL, { cache: "no-store" });
if (!res.ok) throw new Error("Fetch feed failed: " + res.status);
const json = await res.json();
const items = (Array.isArray(json.items) ? json.items : []).slice().sort((a, b) => new Date(b.created || 0) - new Date(a.created || 0));

await fs.mkdir(OUT_DIR, { recursive: true });

// Pre-compute slugs once so prev/next links are stable.
const itemsWithSlug = items.map(it => ({ ...it, _slug: makeSlug(it) }));
const seenSlugs = new Map();
for (const it of itemsWithSlug) {
  // Disambiguate slug collisions by appending a numeric suffix.
  const count = (seenSlugs.get(it._slug) || 0) + 1;
  seenSlugs.set(it._slug, count);
  if (count > 1) it._slug = `${it._slug}-${count}`;
}

let written = 0;
for (let i = 0; i < itemsWithSlug.length; i++) {
  const p = itemsWithSlug[i];
  const prev = itemsWithSlug[i + 1] || null;
  const next = itemsWithSlug[i - 1] || null;
  const html = postHtml(p, prev, next);
  await fs.writeFile(path.join(OUT_DIR, `${p._slug}.html`), html, "utf8");
  written++;
}

console.log(`✅ static-render-posts.mjs wrote ${written} files to /${OUT_DIR}/`);
