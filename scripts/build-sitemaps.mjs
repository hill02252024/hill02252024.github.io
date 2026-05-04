// scripts/build-sitemaps.mjs
import fs from "node:fs/promises";

const FEED_URL = "https://script.google.com/macros/s/AKfycbwq5InzCeyUnW-GHe6bNqReMQMzWvwKe_pAZpD7ONHZ4LZrBdt8lgtpdxu1c57AaPx3ww/exec";
const SITE = "https://todays-tasks.com";

function esc(s=""){return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
function iso(d){try{return new Date(d).toISOString()}catch{return new Date().toISOString();}}

const res = await fetch(FEED_URL, {cache:"no-store"});
if(!res.ok){throw new Error("Fetch feed failed: "+res.status);}
const json = await res.json();
const items = Array.isArray(json.items)?json.items:[];

const urls = items.map(it=>({
  loc:`${SITE}/post.html?id=${encodeURIComponent(it.id)}`,
  lastmod:iso(it.created||json.updated||Date.now()),
}));

// Static pages that should be indexed. Keep this list aligned with robots.txt;
// noindexed pages (admin, thin blogs, modified_index) MUST NOT appear here.
const STATIC_PAGES = [
  "/about.html",
  "/contact.html",
  "/privacy.html",
  "/productivity-tips.html",
  "/article1.html",
  "/article2.html",
  "/article3.html",
  "/article4.html",
  "/article5.html",
  "/etsy-guides.html",
  "/todo.html",
];

// ---- sitemap.xml ----
const sitemap=`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE}/</loc><lastmod>${iso(json.updated||Date.now())}</lastmod></url>
  <url><loc>${SITE}/china-explore.html</loc></url>
  ${STATIC_PAGES.map(p=>`<url><loc>${SITE}${p}</loc></url>`).join("\n  ")}
  ${urls.map(u=>`<url><loc>${esc(u.loc)}</loc><lastmod>${u.lastmod}</lastmod></url>`).join("\n  ")}
</urlset>`;

await fs.writeFile("sitemap.xml", sitemap, "utf8");

// ---- feed.xml ----
const latest=items.slice().sort((a,b)=>new Date(b.created||0)-new Date(a.created||0)).slice(0,50);
const rss=`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>China Explore – 最新更新</title>
<link>${SITE}</link>
<description>中國美食美景分享</description>
<lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${latest.map(it=>{
  const url=`${SITE}/post.html?id=${encodeURIComponent(it.id)}`;
  return `<item><title>${esc(it.title||"")}</title>
  <link>${esc(url)}</link><guid>${esc(url)}</guid>
  <pubDate>${new Date(it.created||Date.now()).toUTCString()}</pubDate>
  <description><![CDATA[${(it.excerpt||"").slice(0,300)}]]></description></item>`;
}).join("\n")}
</channel></rss>`;

await fs.writeFile("feed.xml", rss, "utf8");

console.log(`✅ sitemap.xml (${urls.length}) & feed.xml (${latest.length}) updated.`);
