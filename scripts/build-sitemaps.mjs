// scripts/build-sitemaps.mjs
//
// Builds two sitemap files for the apex domain:
//   sitemap-pages.xml  — homepage + every static, indexable HTML page
//   sitemap.xml        — sitemap index referencing sitemap-pages.xml
//
// A page is included unless it lives in a non-content directory, is the 404
// page, carries a `noindex` robots meta tag, or is a redirect stub. Pages
// are discovered by
// scanning the filesystem so the list can never go stale.
//
// (The former China-explore post pipeline — remote feed fetch,
// sitemap-posts.xml, feed.xml — was removed in the 2026 cleanup that took the
// off-theme travel cluster off the site.)
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const SITE = "https://todays-tasks.com";

function iso(d) { try { return new Date(d).toISOString(); } catch { return new Date().toISOString(); } }

/// lastmod must describe when a page actually changed, not when this script
/// happened to run. Stamping Date.now() on every run made the nightly job
/// rewrite the homepage <lastmod> daily on a site whose content had not moved,
/// producing a commit a day of pure noise and telling Google the homepage was
/// freshly edited when it was not.
///
/// One `git log` pass builds path -> most-recent-commit-date. git log is
/// reverse-chronological, so the first date seen for a path is the latest one.
/// This needs full history: a shallow clone (actions/checkout's default
/// fetch-depth: 1) yields an almost-empty map, which is why the workflow now
/// sets fetch-depth: 0.
function gitLastModMap() {
  const map = new Map();
  let out;
  try {
    out = execFileSync(
      "git",
      ["log", "--no-merges", "--date-order", "--format=%x00%cI", "--name-only"],
      { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }
    );
  } catch {
    return map; // not a git checkout, or git unavailable
  }
  let current = null;
  for (const line of out.split("\n")) {
    if (line.startsWith("\u0000")) { current = line.slice(1).trim(); continue; }
    const f = line.trim();
    if (!f || !current) continue;
    if (!map.has(f)) map.set(f, current);
  }
  return map;
}

const GIT_LASTMOD = gitLastModMap();

/// Returns an ISO timestamp for a file, or null when no honest one exists.
///
/// Order: real commit date -> mtime, but mtime ONLY for files git does not
/// track. For a tracked file with no commit date (shallow clone) mtime is the
/// checkout time, i.e. "now" for every file at once — exactly the fake-freshness
/// bug this function exists to remove. In that case emit nothing: a missing
/// lastmod is a legitimate sitemap; a wrong one is a lie to the crawler.
function lastModOf(relPath) {
  const git = GIT_LASTMOD.get(relPath);
  if (git) return git;
  let tracked = true;
  try {
    execFileSync("git", ["ls-files", "--error-unmatch", "--", relPath],
                 { stdio: "ignore" });
  } catch { tracked = false; }
  if (tracked) return null;
  try { return iso(fsSync.statSync(relPath).mtime); } catch { return null; }
}

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

/// A redirect stub: a page whose only job is to send a crawler somewhere else.
/// It must stay crawlable (so the redirect and its canonical are seen) but must
/// never be submitted in the sitemap — a sitemap is a list of pages you want
/// indexed, and this is a page you want followed.
///
/// Detected structurally rather than by a marker: a zero-delay meta refresh
/// plus a canonical that points somewhere other than the page itself.
async function isRedirectStub(file) {
  try {
    const html = await fs.readFile(file, "utf8");
    return /<meta\s+http-equiv=["']refresh["']\s+content=["']0;\s*url=/i.test(html)
        && /<link\s+rel=["']canonical["']/i.test(html);
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
        if (await isRedirectStub(full)) continue;
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
/// URL path -> the file that serves it, so lastmod can be looked up per page.
function fileFor(urlPath) {
  if (urlPath === "/") return "index.html";
  const rel = urlPath.slice(1);
  return rel.endsWith("/") ? rel + "index.html" : rel;
}

const seen = [];
function urlEntry(urlPath) {
  const lm = lastModOf(fileFor(urlPath));
  if (lm) seen.push(lm);
  return `<url><loc>${SITE}${urlPath}</loc>` +
         (lm ? `<lastmod>${lm}</lastmod>` : "") + `</url>`;
}

const homeEntry = urlEntry("/");
const pageEntries = STATIC_PAGES.map(urlEntry);

const sitemapPages = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${homeEntry}
  ${pageEntries.join("\n  ")}
</urlset>`;

await fs.writeFile("sitemap-pages.xml", sitemapPages, "utf8");

// ---- sitemap.xml (index) ----
// The index's lastmod is the newest page lastmod, not the clock. Using the
// clock here churned this file daily for the same reason the homepage churned.
const indexLastmod = seen.length ? seen.slice().sort().at(-1) : null;
const sitemapIndex = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>${SITE}/sitemap-pages.xml</loc>${indexLastmod ? `<lastmod>${indexLastmod}</lastmod>` : ""}</sitemap>
</sitemapindex>`;

await fs.writeFile("sitemap.xml", sitemapIndex, "utf8");

console.log(`✅ sitemap-pages.xml (${STATIC_PAGES.length + 1} pages), sitemap.xml (index) updated.`);
