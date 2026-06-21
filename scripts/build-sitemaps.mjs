// scripts/build-sitemaps.mjs
//
// Builds two sitemap files for the apex domain:
//   sitemap-pages.xml  — homepage + every static, indexable HTML page
//   sitemap.xml        — sitemap index referencing sitemap-pages.xml
//
// A page is included unless it lives in a non-content directory, is the 404
// page, or carries a `noindex` robots meta tag. Pages are discovered by
// scanning the filesystem so the list can never go stale.
//
// (The former China-explore post pipeline — remote feed fetch,
// sitemap-posts.xml, feed.xml — was removed in the 2026 cleanup that took the
// off-theme travel cluster off the site.)
import fs from "node:fs/promises";
import path from "node:path";

const SITE = "https://todays-tasks.com";

function iso(d) { try { return new Date(d).toISOString(); } catch { return new Date().toISOString(); } }

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
        if (await hasNoindexMeta(full)) continue;
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

const now = iso(Date.now());
const allPages = await collectStaticPages();
// Homepage "/" is emitted separately (with lastmod); the rest sorted for a
// stable, diff-friendly order.
const STATIC_PAGES = allPages.filter(p => p !== "/").sort();

// ---- sitemap-pages.xml ----
const sitemapPages = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE}/</loc><lastmod>${now}</lastmod></url>
  ${STATIC_PAGES.map(p => `<url><loc>${SITE}${p}</loc></url>`).join("\n  ")}
</urlset>`;

await fs.writeFile("sitemap-pages.xml", sitemapPages, "utf8");

// ---- sitemap.xml (index) ----
const sitemapIndex = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>${SITE}/sitemap-pages.xml</loc><lastmod>${now}</lastmod></sitemap>
</sitemapindex>`;

await fs.writeFile("sitemap.xml", sitemapIndex, "utf8");

console.log(`✅ sitemap-pages.xml (${STATIC_PAGES.length + 1} pages), sitemap.xml (index) updated.`);
