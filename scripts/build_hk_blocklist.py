#!/usr/bin/env python3
"""
Build hk-blocklist-data/data/blocklist.json from upstream sources.

Design goals (in priority order):
  1. NEVER make the user's situation worse. If we cannot produce a
     credible candidate, leave the existing JSON untouched. The
     consumer is the HK Call Guard Android app — silently shipping
     fewer entries than yesterday breaks user-visible counts.
  2. Schema-compatible with the app's `assets/data/initial_blocklist.json`:
       [{"number": str, "category": str, "report_count": int}, ...]
       category ∈ {telemarketing, scam, harassment, fraud, other}
  3. Be tolerant of source failures. hkjunkcall.com is rate-limited
     and IP-restricted; we degrade gracefully when we can't reach it.

Exit code 0 in every "stable" outcome (kept current, wrote larger,
no source available). Exit code != 0 only on internal errors. The
GitHub workflow uses the exit code to decide whether to fail loudly.

CLI:
  python build_hk_blocklist.py
    --input  hk-blocklist-data/data/blocklist.json
    --output hk-blocklist-data/data/blocklist.json
    [--allow-shrink]     # disable the don't-shrink safety net (debug)
    [--dry-run]          # print what we'd write, don't touch disk
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable, Optional
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


# ── Schema ────────────────────────────────────────────────────────────────
ALLOWED_CATEGORIES = {
    "telemarketing", "scam", "harassment", "fraud", "other",
}

# Map common upstream labels (English + 繁體中文) into the app's canonical
# five categories. Anything we can't map falls back to "other".
CATEGORY_HINTS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"telemark|推銷|促銷|電話推銷|telesale", re.I), "telemarketing"),
    (re.compile(r"scam|詐騙|騙|釣魚|phish", re.I),              "scam"),
    (re.compile(r"harass|騷擾|nuisance|無聊|nonsense", re.I),   "harassment"),
    (re.compile(r"fraud|金融|cc|credit\s*card|loan|貸款", re.I), "fraud"),
]

# Hong Kong landline / mobile lengths. Strip everything that isn't a digit
# (or leading +) then reject anything outside this range. Keeps junk URLs
# and TLDs from poisoning the dataset.
MIN_DIGITS = 7
MAX_DIGITS = 15


@dataclass
class Entry:
    number: str
    category: str
    report_count: int

    def to_dict(self) -> dict:
        return {
            "number": self.number,
            "category": self.category,
            "report_count": self.report_count,
        }


# ── Source: existing on-disk JSON (always available, always tried first) ──
def load_existing(path: Path) -> list[Entry]:
    if not path.exists():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as e:
        print(f"[warn] existing JSON unreadable: {e}", file=sys.stderr)
        return []
    out: list[Entry] = []
    for row in data:
        e = _coerce_row(row)
        if e is not None:
            out.append(e)
    return out


# ── Source: hkjunkcall.com (best effort) ──────────────────────────────────
HKJC_USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)
HKJC_HEADERS = {
    "User-Agent": HKJC_USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7",
    "Cache-Control": "no-cache",
}

# Numbers that appear on the public summary table in HKJunkCall's
# homepage / "top reported" pages. We try a few well-known paths; if
# the site blocks us (Cloudflare / nginx 403 from GitHub Actions IPs)
# we silently degrade.
HKJC_PATHS = [
    "https://hkjunkcall.com/",
    "https://hkjunkcall.com/Phone",
    "https://hkjunkcall.com/Phone/Top",
    "https://hkjunkcall.com/Phone/Latest",
]

# HK phone numbers: 8 digits, may be prefixed with +852.
HK_PHONE_RE = re.compile(r"(?:\+?852[ \-]?)?([2-9]\d{7})\b")


def fetch_hkjunkcall(timeout: int = 12) -> list[Entry]:
    """Best-effort scrape. Returns [] on any failure (network, 403, parse).

    HKJunkCall renders the "top reported numbers" tables server-side, so
    we extract anchor texts that look like HK phone numbers from the
    HTML. Category is inferred from nearby text via CATEGORY_HINTS.
    """
    collected: dict[str, Entry] = {}
    for url in HKJC_PATHS:
        try:
            req = Request(url, headers=HKJC_HEADERS)
            with urlopen(req, timeout=timeout) as resp:
                if resp.status != 200:
                    print(f"[hkjunkcall] {url} → HTTP {resp.status}",
                          file=sys.stderr)
                    continue
                body = resp.read().decode("utf-8", errors="replace")
        except HTTPError as e:
            print(f"[hkjunkcall] {url} → HTTP {e.code}", file=sys.stderr)
            continue
        except (URLError, TimeoutError, ConnectionError) as e:
            print(f"[hkjunkcall] {url} → {type(e).__name__}: {e}",
                  file=sys.stderr)
            continue
        except Exception as e:  # paranoia — never let one URL kill us
            print(f"[hkjunkcall] {url} → unexpected {type(e).__name__}: {e}",
                  file=sys.stderr)
            continue
        for entry in _extract_numbers_from_html(body):
            # Keep the first occurrence (the homepage tends to surface
            # the highest-report numbers first).
            collected.setdefault(entry.number, entry)
        time.sleep(0.8)  # be polite between requests
    return list(collected.values())


def _extract_numbers_from_html(html: str) -> Iterable[Entry]:
    # Strip tags to a flat text so the category-hint regexes can latch
    # onto Chinese keywords that sit next to each number.
    text = re.sub(r"<[^>]+>", " ", html)
    text = re.sub(r"\s+", " ", text)
    seen: set[str] = set()
    for m in HK_PHONE_RE.finditer(text):
        number = m.group(1)
        if number in seen:
            continue
        seen.add(number)
        # Look at a 60-char window around the match for category hints.
        start = max(0, m.start() - 60)
        end = min(len(text), m.end() + 60)
        ctx = text[start:end]
        category = _infer_category(ctx)
        yield Entry(number=number, category=category, report_count=1)


def _infer_category(ctx: str) -> str:
    for pat, cat in CATEGORY_HINTS:
        if pat.search(ctx):
            return cat
    return "other"


# ── Normalisation, dedup, safety ─────────────────────────────────────────
def _coerce_row(row: object) -> Optional[Entry]:
    """Tolerant per-row coercion. Returns None for invalid rows."""
    if not isinstance(row, dict):
        return None
    raw_num = row.get("number") or row.get("phone")
    if not isinstance(raw_num, str):
        return None
    cleaned = re.sub(r"[^0-9+]", "", raw_num)
    if cleaned.startswith("+852"):
        cleaned = cleaned[4:]
    if cleaned.startswith("00852"):
        cleaned = cleaned[5:]
    if cleaned.startswith("852") and len(cleaned) == 11:
        cleaned = cleaned[3:]
    if not (MIN_DIGITS <= len(cleaned) <= MAX_DIGITS):
        return None
    raw_cat = (row.get("category") or "other")
    cat = raw_cat if raw_cat in ALLOWED_CATEGORIES else _infer_category(
        str(raw_cat))
    rc = row.get("report_count") or row.get("count") or 1
    try:
        rc = int(rc)
    except (TypeError, ValueError):
        rc = 1
    if rc < 1:
        rc = 1
    return Entry(number=cleaned, category=cat, report_count=rc)


def merge(*sources: list[Entry]) -> list[Entry]:
    """Last-write-wins on category, max-wins on report_count, unique by number."""
    bag: dict[str, Entry] = {}
    for src in sources:
        for e in src:
            existing = bag.get(e.number)
            if existing is None:
                bag[e.number] = e
                continue
            # Merge: prefer non-"other" category; sum the counts.
            cat = e.category if existing.category == "other" else existing.category
            bag[e.number] = Entry(
                number=e.number,
                category=cat,
                report_count=max(existing.report_count, e.report_count),
            )
    out = list(bag.values())
    # Stable sort: most-reported first; tiebreak by number.
    out.sort(key=lambda x: (-x.report_count, x.number))
    return out


# ── Reporting ────────────────────────────────────────────────────────────
@dataclass
class BuildReport:
    decision: str = ""  # "kept"|"wrote"|"shrink-blocked"
    existing_count: int = 0
    candidate_count: int = 0
    final_count: int = 0
    sources_attempted: list[str] = field(default_factory=list)
    sources_succeeded: list[str] = field(default_factory=list)
    category_breakdown: dict[str, int] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "decision": self.decision,
            "existing_count": self.existing_count,
            "candidate_count": self.candidate_count,
            "final_count": self.final_count,
            "sources_attempted": self.sources_attempted,
            "sources_succeeded": self.sources_succeeded,
            "category_breakdown": self.category_breakdown,
        }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--input", required=True,
        help="Path to the current blocklist.json (used as floor + fallback)")
    ap.add_argument(
        "--output", required=True,
        help="Where to write the new blocklist.json")
    ap.add_argument(
        "--allow-shrink", action="store_true",
        help="Allow the new file to have fewer entries than the old one. "
             "Off by default — protects against upstream regressions.")
    ap.add_argument(
        "--dry-run", action="store_true",
        help="Don't touch the output file; print the candidate JSON instead.")
    ap.add_argument(
        "--report", default="",
        help="If set, write a JSON build report to this path.")
    args = ap.parse_args()

    in_path = Path(args.input)
    out_path = Path(args.output)
    report = BuildReport()

    existing = load_existing(in_path)
    report.existing_count = len(existing)
    print(f"[info] existing entries: {len(existing)}")

    report.sources_attempted.append("hkjunkcall.com")
    scraped = fetch_hkjunkcall()
    if scraped:
        report.sources_succeeded.append(
            f"hkjunkcall.com ({len(scraped)})")
        print(f"[info] hkjunkcall scraped: {len(scraped)}")
    else:
        print("[info] hkjunkcall returned 0 entries (likely blocked).")

    candidate = merge(existing, scraped)
    report.candidate_count = len(candidate)
    print(f"[info] merged candidate: {len(candidate)}")

    # ── Safety net: never let the file shrink ──
    if len(candidate) < len(existing) and not args.allow_shrink:
        print(
            f"[warn] candidate ({len(candidate)}) < existing "
            f"({len(existing)}). Refusing to overwrite. "
            "Pass --allow-shrink to override.",
            file=sys.stderr)
        report.decision = "shrink-blocked"
        report.final_count = len(existing)
        _write_report(args.report, report)
        return 0  # not an error — this is the safety net working

    # ── Schema sanity: each row must have str/str/int and category in set ──
    for e in candidate:
        if not isinstance(e.number, str) or not e.number:
            print(f"[fatal] empty number in candidate: {e}", file=sys.stderr)
            return 2
        if e.category not in ALLOWED_CATEGORIES:
            print(
                f"[fatal] illegal category '{e.category}' for {e.number}",
                file=sys.stderr)
            return 2
        if not isinstance(e.report_count, int) or e.report_count < 1:
            print(f"[fatal] bad report_count for {e.number}: "
                  f"{e.report_count}", file=sys.stderr)
            return 2

    # ── Decide write vs keep ──
    payload = [e.to_dict() for e in candidate]
    out_text = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    if not args.dry_run and out_path.exists():
        try:
            old_text = out_path.read_text(encoding="utf-8")
        except OSError:
            old_text = ""
        if old_text.strip() == out_text.strip():
            print("[info] no change vs existing file — keeping as is.")
            report.decision = "kept"
            report.final_count = len(candidate)
            report.category_breakdown = _breakdown(candidate)
            _write_report(args.report, report)
            return 0

    report.decision = "wrote"
    report.final_count = len(candidate)
    report.category_breakdown = _breakdown(candidate)

    if args.dry_run:
        print(out_text)
    else:
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(out_text, encoding="utf-8")
        print(f"[info] wrote {out_path} ({len(candidate)} entries)")

    _write_report(args.report, report)
    return 0


def _breakdown(entries: list[Entry]) -> dict[str, int]:
    out: dict[str, int] = {}
    for e in entries:
        out[e.category] = out.get(e.category, 0) + 1
    return out


def _write_report(path_str: str, r: BuildReport) -> None:
    if not path_str:
        return
    path = Path(path_str)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(r.to_dict(), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    sys.exit(main())
