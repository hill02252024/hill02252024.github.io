// scripts/build-legacy-redirects.mjs
//
// Generates one tiny redirect-stub HTML per legacy /posts/N.html URL that
// Google still has in its index from the pre-/china/ subfolder era.
//
//   - If china/posts/N.html exists  → stub redirects 1-to-1 to it.
//   - If china/posts/N.html is gone → stub redirects to /china/ (the listing).
//
// Every stub is noindex,follow with a canonical pointing to the redirect
// target and a meta-refresh + JS replace, so Google treats it as a soft 301.
// Run once; the resulting /posts/ directory is then static.
import fs from "node:fs/promises";
import path from "node:path";

const SITE = "https://todays-tasks.com";
const LEGACY_DIR = "posts";
const SURVIVING_DIR = "china/posts";

// IDs 3..120, excluding 1, 2, 6 (never published at top-level /posts/).
const LEGACY_IDS = Array.from({ length: 118 }, (_, i) => i + 3)
  .filter(n => ![1, 2, 6].includes(n));

await fs.mkdir(LEGACY_DIR, { recursive: true });

async function exists(p) {
  try { await fs.stat(p); return true; } catch { return false; }
}

let alive = 0, dead = 0;
for (const id of LEGACY_IDS) {
  const surviving = await exists(`${SURVIVING_DIR}/${id}.html`);
  const target = surviving ? `/china/posts/${id}.html` : `/china/`;
  const html = `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <script>if(location.hostname==="hill02252024.github.io")location.replace("https://todays-tasks.com"+location.pathname+location.search+location.hash);</script>
  <meta charset="UTF-8" />
  <title>${surviving ? "Redirecting…" : "Removed"}</title>
  <meta name="robots" content="noindex,follow" />
  <link rel="canonical" href="${SITE}${target}" />
  <meta http-equiv="refresh" content="0; url=${target}" />
  <script>location.replace("${target}");</script>
</head>
<body><p>${surviving ? "Moved to" : "See"} <a href="${target}">${target}</a>.</p></body>
</html>
`;
  await fs.writeFile(path.join(LEGACY_DIR, `${id}.html`), html, "utf8");
  if (surviving) alive++; else dead++;
}
console.log(`✅ Wrote ${alive} 1-to-1 + ${dead} listing-fallback = ${LEGACY_IDS.length} legacy redirect stubs to /${LEGACY_DIR}/`);
