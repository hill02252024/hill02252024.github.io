// scripts/build-sitemaps.mjs
//
// Builds three sitemap files:
//   sitemap-pages.xml  — homepage + static indexable pages (apex domain)
//   sitemap-posts.xml  — dynamic China-explore posts (post.html?id=…)
//   sitemap.xml        — sitemap index referencing both
//
// Run via the daily GitHub Action (.github/workflows/build-sitemaps.yml).
import fs from "node:fs/promises";

const FEED_URL = "https://script.google.com/macros/s/AKfycbwq5InzCeyUnW-GHe6bNqReMQMzWvwKe_pAZpD7ONHZ4LZrBdt8lgtpdxu1c57AaPx3ww/exec";
const SITE = "https://todays-tasks.com";

function esc(s=""){return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
function iso(d){try{return new Date(d).toISOString()}catch{return new Date().toISOString();}}

const res = await fetch(FEED_URL, {cache:"no-store"});
if(!res.ok){throw new Error("Fetch feed failed: "+res.status);}
const json = await res.json();
const items = Array.isArray(json.items)?json.items:[];
const now = iso(Date.now());

// Static-rendered post URLs (one HTML file per item under /posts/<id>.html).
// Slug = item id verbatim (matches scripts/static-render-posts.mjs makeSlug
// when id is alphanumeric — which is the Apps Script default).
const postUrls = items.map(it=>({
  loc:`${SITE}/posts/${encodeURIComponent(String(it.id||"")).replace(/%20/g,"-")}.html`,
  lastmod:iso(it.created||json.updated||Date.now()),
}));

// Static pages that should be indexed. Keep this list aligned with robots.txt;
// noindexed pages (admin, thin blogs) MUST NOT appear here.
const STATIC_PAGES = [
  "/about.html",
  "/contact.html",
  "/privacy.html",
  "/productivity-tips.html",
  "/productivity-tips-busy-professionals.html",
  "/time-management-strategies.html",
  "/digital-vs-paper-todo-lists.html",
  "/how-to-use-todays-tasks.html",
  "/weekly-review-checklist.html",
  "/etsy-guides.html",
  "/todo.html",
];

// ---- sitemap-pages.xml ----
const sitemapPages=`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE}/</loc><lastmod>${iso(json.updated||Date.now())}</lastmod></url>
  <url><loc>${SITE}/china-explore.html</loc></url>
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

// ---- feed.xml ----
const latest=items.slice().sort((a,b)=>new Date(b.created||0)-new Date(a.created||0)).slice(0,50);
const rss=`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>China Explore – 最新更新</title>
<link>${SITE}</link>
<description>中國美食美景分享</description>
<lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${latest.map(it=>{
  const url=`${SITE}/posts/${encodeURIComponent(String(it.id||"")).replace(/%20/g,"-")}.html`;
  return `<item><title>${esc(it.title||"")}</title>
  <link>${esc(url)}</link><guid>${esc(url)}</guid>
  <pubDate>${new Date(it.created||Date.now()).toUTCString()}</pubDate>
  <description><![CDATA[${(it.excerpt||"").slice(0,300)}]]></description></item>`;
}).join("\n")}
</channel></rss>`;

await fs.writeFile("feed.xml", rss, "utf8");

console.log(`✅ sitemap-pages.xml (${STATIC_PAGES.length + 2}), sitemap-posts.xml (${postUrls.length}), sitemap.xml (index), feed.xml (${latest.length}) updated.`);
