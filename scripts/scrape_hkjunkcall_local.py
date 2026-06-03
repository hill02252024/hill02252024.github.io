#!/usr/bin/env python3
"""
Local HKJunkCall scraper — run from a Hong Kong IP on your MacBook.

Why this exists:
  hkjunkcall.com returns nginx 403 to most non-HK IPs (and to GitHub
  Actions runners). So the supply-chain looks like:
    [your Mac, HK Wi-Fi]  --scrape-->  [hkjunkcall.com]
                       \\
                        \\--commit-->  [github.com:hill02252024/...]
                                       \\
                                        \\--workflow merges-->
                                          [hk-blocklist-data/data/blocklist.json]
                                          \\
                                           \\--GitHub Pages CDN-->
                                             [todays-tasks.com/...]
                                             \\
                                              \\--App fetch-->
                                                [HK Call Guard "Update Database Now"]

You run this once a month, eyeball the diff, push.

Output:
  hk-blocklist-data/sources/manual.csv  (overwrites — preserves header)

Format (per build_hk_blocklist.py's _coerce_row contract):
  number,category,report_count,note
  98765432,scam,15,from hkjunkcall.com 2026-06-04

Usage:
  pip3 install requests beautifulsoup4
  python3 scripts/scrape_hkjunkcall_local.py
  python3 scripts/scrape_hkjunkcall_local.py --dry-run     # don't write
  python3 scripts/scrape_hkjunkcall_local.py --max-pages 10  # short test
"""

from __future__ import annotations

import argparse
import csv
import io
import re
import sys
import time
from collections import Counter
from datetime import date
from pathlib import Path
from typing import Iterable, Optional

# Hard fail with a clear message if the user hasn't installed the deps
# yet. Default Python on macOS doesn't ship requests/bs4.
try:
    import requests
    from bs4 import BeautifulSoup
except ImportError as e:  # pragma: no cover
    print(
        f"\n[fatal] missing dependency: {e.name}\n"
        f"Install with:\n"
        f"    pip3 install requests beautifulsoup4\n",
        file=sys.stderr,
    )
    sys.exit(1)


# ── Config ─────────────────────────────────────────────────────────────
BASE = "https://hkjunkcall.com"

# Pages to walk. Each is the head of a paginated list; we follow
# "Next" links until exhausted or MAX_PAGES_PER_SECTION reached.
SEED_PATHS = [
    "/Phone/Top",      # most-reported
    "/Phone/Latest",   # newest reports
    "/Phone",          # general index
]

# Polite cap per section so a misbehaving paginator can't infinite-loop.
MAX_PAGES_PER_SECTION = 50
REQUEST_TIMEOUT = 15
DELAY_BETWEEN_REQUESTS = 1.3  # seconds — the brief says 1-2s

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 "
    "(KHTML, like Gecko) Version/17.5 Safari/605.1.15"
)
HEADERS = {
    "User-Agent": UA,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7",
    "Cache-Control": "no-cache",
}

# ── Phone + category detection ─────────────────────────────────────────
# 8 digits, leading 2-9 (matches HK landline + mobile + 800/900 ranges).
HK_PHONE_RE = re.compile(r"\b([2-9]\d{7})\b")

# Map UI labels (EN + 繁中) to the 5 canonical app categories. Anything
# that doesn't match falls back to "other" — the build script accepts
# any of these unchanged.
CATEGORY_HINTS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"telemark|tele\s*sale|推銷|促銷|電話推銷", re.I),
     "telemarketing"),
    (re.compile(r"scam|phish|釣魚|詐|騙|騙案|電騙",         re.I),
     "scam"),
    (re.compile(r"harass|nuisance|騷擾|無聊|惡作劇",          re.I),
     "harassment"),
    (re.compile(r"fraud|金融|貸款|loan|investment\s*scam|cc\s*scam",
                re.I),                                       "fraud"),
]
# Numeric extraction for report_count cells.
INT_RE = re.compile(r"\d+")


# ── Per-source scraping ────────────────────────────────────────────────
class ScrapeReport:
    """In-memory accumulator with verbose stats for the final summary."""

    def __init__(self) -> None:
        self.entries: dict[str, dict] = {}  # number → row dict
        self.pages_fetched: int = 0
        self.pages_failed: list[str] = []  # URLs that 4xx/5xx/timed-out
        self.pages_zero_match: list[str] = []  # 200 but no phones found
        self.section_counts: dict[str, int] = {}  # path → entries added

    def add(self, number: str, category: str, report_count: int,
            note: str) -> None:
        # First sighting wins on category, max wins on report_count.
        # This mirrors the build script's merge semantics.
        existing = self.entries.get(number)
        if existing is None:
            self.entries[number] = {
                "number": number,
                "category": category,
                "report_count": report_count,
                "note": note,
            }
            return
        if existing["category"] == "other" and category != "other":
            existing["category"] = category
        if report_count > existing["report_count"]:
            existing["report_count"] = report_count


def _polite_get(session: requests.Session, url: str,
                report: ScrapeReport) -> Optional[str]:
    """One GET with timeout + delay + status check. Returns body or None."""
    try:
        resp = session.get(url, headers=HEADERS, timeout=REQUEST_TIMEOUT)
    except (requests.RequestException, TimeoutError) as e:
        print(f"  [fail] {url} → {type(e).__name__}: {e}",
              file=sys.stderr)
        report.pages_failed.append(url)
        return None
    finally:
        time.sleep(DELAY_BETWEEN_REQUESTS)
    if resp.status_code != 200:
        print(f"  [fail] {url} → HTTP {resp.status_code}",
              file=sys.stderr)
        report.pages_failed.append(url)
        return None
    report.pages_fetched += 1
    return resp.text


def _classify_from_context(text: str) -> str:
    for pat, cat in CATEGORY_HINTS:
        if pat.search(text):
            return cat
    return "other"


def _parse_listing(html: str, section_path: str, report: ScrapeReport,
                   url_for_log: str) -> int:
    """Walk the page DOM, extract phone numbers + per-row metadata.

    HKJunkCall historically wraps each entry in a table row. We don't
    rely on a fixed selector — we look for any anchor whose href looks
    like a phone detail page (/Phone/12345678) and treat its row as
    the entry. If the page has changed shape, we fall back to scanning
    the flat text for HK 8-digit numbers and inferring category from
    the surrounding 80 chars.

    Returns the number of NEW entries added (after dedup).
    """
    soup = BeautifulSoup(html, "html.parser")
    added = 0

    # Strategy A — structured: find anchors that point at a number's
    # detail page. Each anchor's enclosing <tr> (or parent) tends to
    # carry the category label and the report count.
    anchors = soup.select("a[href*='/Phone/']")
    seen_here: set[str] = set()
    for a in anchors:
        href = a.get("href", "")
        m = HK_PHONE_RE.search(href)
        if not m:
            # Try the anchor text itself — some pages put the number
            # there even when href is /Phone/Top.
            m = HK_PHONE_RE.search(a.get_text(" ", strip=True))
        if not m:
            continue
        number = m.group(1)
        if number in seen_here:
            continue
        seen_here.add(number)

        # Row context = nearest table row, falling back to parent.
        row_node = a.find_parent(["tr", "li", "div"]) or a
        row_text = row_node.get_text(" ", strip=True) if row_node else ""

        category = _classify_from_context(row_text)
        rc = _extract_report_count(row_text, fallback_number=number)
        report.add(
            number=number,
            category=category,
            report_count=rc,
            note=f"from hkjunkcall.com {date.today().isoformat()}",
        )
        added += 1

    # Strategy B — fallback: flat-text scan. Helps when HKJunkCall
    # re-renders pages in a way Strategy A doesn't cover (e.g.
    # client-rendered grids that flush the numbers into plain text).
    if not anchors:
        flat = re.sub(r"<[^>]+>", " ", html)
        flat = re.sub(r"\s+", " ", flat)
        for m in HK_PHONE_RE.finditer(flat):
            number = m.group(1)
            if number in seen_here:
                continue
            seen_here.add(number)
            start = max(0, m.start() - 80)
            end = min(len(flat), m.end() + 80)
            ctx = flat[start:end]
            report.add(
                number=number,
                category=_classify_from_context(ctx),
                report_count=_extract_report_count(ctx,
                                                   fallback_number=number),
                note=f"from hkjunkcall.com {date.today().isoformat()}",
            )
            added += 1

    if added == 0:
        report.pages_zero_match.append(url_for_log)

    report.section_counts[section_path] = (
        report.section_counts.get(section_path, 0) + added
    )
    return added


def _extract_report_count(text: str, fallback_number: str) -> int:
    """Read a likely report-count integer from the row text.

    Look for the integer that is NOT the phone digits. Numbers
    immediately adjacent to keywords like "次"/"reports"/"投訴" win.
    Falls back to 1 (treated as "seen once") so we never poison the
    blocklist with a misread count.
    """
    # Drop the phone number itself so we don't pick it as report_count.
    stripped = text.replace(fallback_number, " ")
    # Prefer counts near the keyword.
    for kw_pat in (r"(\d{1,6})\s*(?:次|reports?|投訴|舉報)",
                   r"(?:reports?|舉報|投訴)\s*(\d{1,6})"):
        m = re.search(kw_pat, stripped, re.I)
        if m:
            try:
                v = int(m.group(1))
                if 1 <= v <= 100000:
                    return v
            except ValueError:
                pass
    # Otherwise the LAST plausible integer on the row.
    cands = [int(x) for x in INT_RE.findall(stripped) if 1 <= len(x) <= 6]
    cands = [x for x in cands if 1 <= x <= 100000]
    if cands:
        return cands[-1]
    return 1


def _find_next_url(html: str, current_url: str) -> Optional[str]:
    """Return the URL of the next page, or None if there isn't one.

    We accept three common patterns:
      1. <a rel="next" href="...">
      2. <a> whose text contains 下一頁 / Next / »
      3. ?page=N or /page/N in the current URL we can bump
    """
    soup = BeautifulSoup(html, "html.parser")

    # Pattern 1: rel=next
    a = soup.find("a", attrs={"rel": "next"})
    if a and a.get("href"):
        return _join(current_url, a["href"])

    # Pattern 2: text-based — last resort because some sites have
    # multiple "next" sigils. We accept the first match.
    for a in soup.find_all("a"):
        label = a.get_text(" ", strip=True)
        if not label:
            continue
        if label in ("下一頁", "下一页", "Next", ">", "»") and a.get("href"):
            return _join(current_url, a["href"])

    # Pattern 3: numeric paginator. Look for ?page=N pattern in URL.
    m = re.search(r"([?&])page=(\d+)", current_url)
    if m:
        prefix, n = m.group(1), int(m.group(2))
        new_url = current_url[:m.start()] + prefix + f"page={n + 1}" + \
            current_url[m.end():]
        # Only accept if the page itself links to a higher page number
        # (sanity — don't paginate past the end).
        anchor_pages = [int(x) for x in re.findall(r"[?&]page=(\d+)", html)
                        if x.isdigit()]
        if anchor_pages and max(anchor_pages) >= n + 1:
            return new_url

    return None


def _join(base: str, href: str) -> str:
    if href.startswith("http://") or href.startswith("https://"):
        return href
    if href.startswith("/"):
        return BASE + href
    # Relative — join against base's directory.
    return BASE + "/" + href.lstrip("./")


def _walk_section(session: requests.Session, path: str, max_pages: int,
                  report: ScrapeReport) -> None:
    url: Optional[str] = BASE + path
    visited: set[str] = set()
    page_no = 0
    while url and page_no < max_pages:
        if url in visited:
            break
        visited.add(url)
        page_no += 1
        print(f"  page {page_no}: GET {url}", file=sys.stderr)
        html = _polite_get(session, url, report)
        if html is None:
            break
        added = _parse_listing(html, path, report, url)
        print(f"  page {page_no}: +{added} entries "
              f"(running total in section: "
              f"{report.section_counts.get(path, 0)})", file=sys.stderr)
        if added == 0 and page_no >= 2:
            # Empty page after the first usually means we ran past
            # the last real page. Stop.
            break
        url = _find_next_url(html, url)


# ── Output ─────────────────────────────────────────────────────────────
CSV_HEADER = """\
# HK Call Guard manual entries — populated by scrape_hkjunkcall_local.py.
#
# This file is REGENERATED each time you run the scraper. If you want
# to add purely-manual entries that survive a re-scrape, keep a
# separate CSV (e.g. hk-blocklist-data/sources/personal.csv) and add
# a second --manual-csv flag in the workflow.
#
# Format: number,category,report_count,note
#   - number       HK digits (8 digits)
#   - category     telemarketing | scam | harassment | fraud | other
#   - report_count integer >= 1
#   - note         free text, ignored by the Android app
#
# Lines starting with '#' and blank lines are skipped by the builder.
# Last regenerated: {timestamp}
# Total entries:   {total}
# Per category:    {by_cat}
"""


def write_csv(out_path: Path, report: ScrapeReport,
              dry_run: bool) -> None:
    rows = list(report.entries.values())
    # Stable sort: most-reported first; tiebreak by number.
    rows.sort(key=lambda r: (-r["report_count"], r["number"]))
    by_cat = Counter(r["category"] for r in rows)

    buf = io.StringIO()
    buf.write(CSV_HEADER.format(
        timestamp=date.today().isoformat(),
        total=len(rows),
        by_cat=dict(by_cat),
    ))
    buf.write("\n")
    writer = csv.writer(buf)
    for r in rows:
        writer.writerow([
            r["number"], r["category"], r["report_count"], r["note"]
        ])
    payload = buf.getvalue()

    if dry_run:
        print("\n[dry-run] would write:\n" + "-" * 60)
        print(payload[:600], "\n... (truncated)" if len(payload) > 600
              else "")
        print("-" * 60)
        return

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(payload, encoding="utf-8")
    print(f"\n[ok] wrote {out_path} ({len(rows)} entries)")


# ── CLI ────────────────────────────────────────────────────────────────
def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--output", default="",
        help="Override CSV output path. Defaults to "
             "hk-blocklist-data/sources/manual.csv next to the script.")
    ap.add_argument(
        "--max-pages", type=int, default=MAX_PAGES_PER_SECTION,
        help="Max pages to walk per section "
             f"(default {MAX_PAGES_PER_SECTION}).")
    ap.add_argument(
        "--dry-run", action="store_true",
        help="Don't touch the output file; print what we'd write.")
    args = ap.parse_args()

    if args.output:
        out_path = Path(args.output).expanduser().resolve()
    else:
        # Default: sibling of the scripts/ directory.
        out_path = (Path(__file__).resolve().parent.parent /
                    "hk-blocklist-data" / "sources" / "manual.csv")

    print(f"[info] target: {out_path}", file=sys.stderr)
    print(f"[info] sections: {SEED_PATHS}", file=sys.stderr)
    print(f"[info] max pages per section: {args.max_pages}",
          file=sys.stderr)
    print(f"[info] delay between requests: {DELAY_BETWEEN_REQUESTS}s\n",
          file=sys.stderr)

    report = ScrapeReport()
    session = requests.Session()
    for path in SEED_PATHS:
        print(f"\n[section] {path}", file=sys.stderr)
        try:
            _walk_section(session, path, args.max_pages, report)
        except Exception as e:  # paranoia: keep the run alive
            print(f"  [warn] section {path} aborted: "
                  f"{type(e).__name__}: {e}", file=sys.stderr)

    # ── Summary ──
    print("\n" + "=" * 60)
    print(f"Total unique numbers: {len(report.entries)}")
    cat_counter = Counter(r["category"] for r in report.entries.values())
    for cat in ("telemarketing", "scam", "harassment", "fraud", "other"):
        print(f"  {cat:<14s} {cat_counter.get(cat, 0)}")
    print(f"Pages fetched OK:  {report.pages_fetched}")
    print(f"Pages failed:      {len(report.pages_failed)}")
    for f in report.pages_failed[:10]:
        print(f"  - {f}")
    if len(report.pages_failed) > 10:
        print(f"  (+ {len(report.pages_failed) - 10} more)")
    print(f"Pages with 0 phones: {len(report.pages_zero_match)}")
    print(f"Per-section haul:")
    for path in SEED_PATHS:
        print(f"  {path:<20s} {report.section_counts.get(path, 0)}")
    print("=" * 60)

    if not report.entries:
        print(
            "\n[warn] 0 numbers collected. Common causes:\n"
            "  - You're not on a HK IP — hkjunkcall.com 403s most\n"
            "    non-HK ASNs at the nginx layer.\n"
            "  - The site moved its number list under a new URL —\n"
            "    edit SEED_PATHS at the top of this script.\n"
            "  - You're behind a corporate proxy that strips cookies.\n",
            file=sys.stderr,
        )
        # Empty result — DO NOT overwrite the existing CSV, that would
        # wipe out a good prior scrape. Exit non-zero so a CI / make
        # wrapper notices.
        return 2

    write_csv(out_path, report, dry_run=args.dry_run)
    return 0


if __name__ == "__main__":
    sys.exit(main())
