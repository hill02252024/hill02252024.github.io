// scripts/build-sitemaps.mjs
//
// Builds three sitemap files:
//   sitemap-pages.xml  — homepage + static indexable pages (apex domain)
//   sitemap-posts.xml  — China-explore posts that pass the indexability gate
//   sitemap.xml        — sitemap index referencing both
//
// Indexability gate matches scripts/static-render-posts.mjs (Phase 3d):
//   - >= 250 English words OR >= 500 Chinese characters of body content.
import fs from "node:fs/promises";
import path from "node:path";

const FEED_URL = "https://script.google.com/macros/s/AKfycbwq5InzCeyUnW-GHe6bNqReMQMzWvwKe_pAZpD7ONHZ4LZrBdt8lgtpdxu1c57AaPx3ww/exec";
const SITE = "https://todays-tasks.com";
const POST_DIR = "china/posts";
const MIN_ENGLISH_WORDS = 250;
const MIN_CJK_CHARS = 500;

function esc(s=""){return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
function iso(d){try{return new Date(d).toISOString()}catch{return new Date().toISOString();}}

function shouldIndex(p) {
  // 2026-05-16 — China-explore cluster permanently noindex.
  // todays-tasks.com is an English-language productivity site; mixing in
  // Chinese-language travel/food posts confuses topical focus and triggered
  // "thin content" AdSense rejections. Pages still render so old links
  // don't 404, but none are indexable and none appear in sitemap-posts.xml.
  // To re-enable later, restore the previous length-gate from git history.
  void p;
  return false;
}

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

// Remote feed only affects the homepage <lastmod> and the (currently always
// empty, because shouldIndex() === false) posts sitemap + RSS. A network hiccup
// must NOT block the pages sitemap — fall back to an empty feed and carry on.
let json;
try {
  const res = await fetch(FEED_URL, {cache:"no-store"});
  if(!res.ok){throw new Error("Fetch feed failed: "+res.status);}
  json = await res.json();
} catch (e) {
  console.warn(`⚠️  feed fetch failed (${e.message}); building pages sitemap with empty posts feed.`);
  json = { updated: Date.now(), items: [] };
}
const items = Array.isArray(json.items)?json.items:[];
const now = iso(Date.now());

// Only items that pass shouldIndex go into the sitemap.
// Slug derivation must match static-render-posts.mjs exactly so URLs line up.
const itemsWithSlug = items.map(it => ({ ...it, _slug: makeSlug(it) }));
const seenSlugs = new Map();
for (const it of itemsWithSlug) {
  const count = (seenSlugs.get(it._slug) || 0) + 1;
  seenSlugs.set(it._slug, count);
  if (count > 1) it._slug = `${it._slug}-${count}`;
}

// Cross-check against on-disk rendered HTML so the sitemap can never disagree
// with what's actually published (the two scripts fetch the feed independently
// and could otherwise race when the spreadsheet content shifts mid-build).
async function postFileIsIndexable(slug) {
  try {
    const html = await fs.readFile(`${POST_DIR}/${slug}.html`, "utf8");
    return !/<meta\s+name="robots"\s+content="[^"]*noindex/i.test(html);
  } catch {
    return false; // file missing → not in sitemap
  }
}

const indexableItems = [];
for (const it of itemsWithSlug) {
  if (shouldIndex(it) && await postFileIsIndexable(it._slug)) {
    indexableItems.push(it);
  }
}
const postUrls = indexableItems.map(it => ({
  loc: `${SITE}/${POST_DIR}/${it._slug}.html`,
  lastmod: iso(it.created || json.updated || Date.now()),
}));

// Static indexable pages — discovered by scanning the filesystem instead of a
// hand-maintained list (which had gone stale: apps.html, pricing.html, learn/,
// every /apps/* and every /tools/* were missing). A page is included unless it
// is in a non-content directory, is the 404 page, or carries a robots
// `noindex` meta tag (which excludes the whole intentionally-hidden /china/
// cluster and anything else marked noindex). URLs follow the canonical scheme:
// apex https, no www, directory index pages as a trailing-slash URL.
const EXCLUDE_DIRS = new Set([
  ".git", ".github", "node_modules",
  "templates",          // article.html is a {{SLUG}} template, not a page
  "scripts", "functions",
  "hk-blocklist-data",  // generated data, not content
  "assets",             // css/js/images, no pages
]);

async function hasNoindexMeta(file) {
  try {
    const html = await fs.readFile(file, "utf8");
    return /<meta\s+name=["']robots["']\s+content=["'][^"']*noindex/i.test(html);
  } catch { return false; }
}

/// Returns the canonical URL paths of every public, indexable HTML page,
/// including "/" for the root index. Caller emits "/" separately.
async function collectStaticPages(root = ".") {
  const found = new Set();
  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory()) {
        if (EXCLUDE_DIRS.has(e.name) || e.name.startsWith(".")) continue;
        await walk(path.join(dir, e.name));
      } else if (e.isFile() && e.name.endsWith(".html")) {
        if (e.name === "404.html") continue;
        const full = path.join(dir, e.name);
        if (await hasNoindexMeta(full)) continue; // excludes /china/* etc.
        let rel = full.split(path.sep).join("/");
        if (rel.startsWith("./")) rel = rel.slice(2);
        let urlPath;
        if (rel === "index.html") urlPath = "/";
        else if (rel.endsWith("/index.html")) {
          urlPath = "/" + rel.slice(0, -"index.html".length); // dir + trailing /
        } else {
          urlPath = "/" + rel;
        }
        found.add(urlPath);
      }
    }
  }
  await walk(root);
  return Array.from(found);
}

const allPages = await collectStaticPages();
// Homepage "/" is emitted separately (with lastmod); the rest sorted for a
// stable, diff-friendly order.
const STATIC_PAGES = allPages.filter(p => p !== "/").sort();

// ---- sitemap-pages.xml ----
const sitemapPages=`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE}/</loc><lastmod>${iso(json.updated||Date.now())}</lastmod></url>
  ${STATIC_PAGES.map(p=>`<url><loc>${SITE}${p}</loc></url>`).join("\n  ")}
</urlset>`;

await fs.writeFile("sitemap-pages.xml", sitemapPages, "utf8");

// ---- sitemap-posts.xml ----
const sitemapPosts=`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${postUrls.map(u=>`<url><loc>${esc(u.loc)}</loc><lastmod>${u.lastmod}</lastmod></url>`).join("\n  ")}
</urlset>`;

await fs.writeFile("sitemap-posts.xml", sitemapPosts, "utf8");

// ---- sitemap.xml (index) ----
const sitemapIndex=`<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>${SITE}/sitemap-pages.xml</loc><lastmod>${now}</lastmod></sitemap>
  <sitemap><loc>${SITE}/sitemap-posts.xml</loc><lastmod>${now}</lastmod></sitemap>
</sitemapindex>`;

await fs.writeFile("sitemap.xml", sitemapIndex, "utf8");

// ---- feed.xml (RSS — only indexable posts) ----
const latest=indexableItems.slice().sort((a,b)=>new Date(b.created||0)-new Date(a.created||0)).slice(0,50);
const rss=`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>China Explore – 最新更新</title>
<link>${SITE}</link>
<description>中國美食美景分享</description>
<lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${latest.map(it=>{
  const url=`${SITE}/${POST_DIR}/${it._slug}.html`;
  return `<item><title>${esc(it.title||"")}</title>
  <link>${esc(url)}</link><guid>${esc(url)}</guid>
  <pubDate>${new Date(it.created||Date.now()).toUTCString()}</pubDate>
  <description><![CDATA[${(it.excerpt||"").slice(0,300)}]]></description></item>`;
}).join("\n")}
</channel></rss>`;

await fs.writeFile("feed.xml", rss, "utf8");

console.log(`✅ sitemap-pages.xml (${STATIC_PAGES.length + 1}), sitemap-posts.xml (${postUrls.length} indexable / ${items.length} total), sitemap.xml (index), feed.xml (${latest.length}) updated.`);
