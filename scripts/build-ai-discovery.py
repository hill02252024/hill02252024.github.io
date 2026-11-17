#!/usr/bin/env python3
"""Build public, machine-readable app discovery files from verified app data.

Only canonical public product profiles in _data/apps.json are included. Local
project paths and source-code evidence never leave the repository's data file.
"""
from __future__ import annotations

import argparse
import html
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SITE = "https://todays-tasks.com"
DATA_FILE = ROOT / "_data" / "apps.json"
INDEX_FILE = ROOT / "apps" / "index.html"
CATALOG_FILE = ROOT / "apps" / "catalog.json"
LLMS_FILE = ROOT / "llms.txt"

CATEGORY_LABELS = {
    "finance": "Finance and money",
    "health": "Health and fitness",
    "ai": "AI and learning",
    "travel": "Travel and games",
    "hongkong": "Hong Kong daily life",
    "tools": "Camera and documents",
    "games": "Games",
}
SCHEMA_CATEGORIES = {
    "finance": "FinanceApplication",
    "health": "HealthApplication",
    "ai": "LifestyleApplication",
    "travel": "TravelApplication",
    "hongkong": "UtilitiesApplication",
    "tools": "UtilitiesApplication",
    "games": "GameApplication",
}
CATEGORY_ORDER = list(CATEGORY_LABELS)
SEARCH_BOTS = [
    "Googlebot", "Bingbot", "Applebot", "DuckDuckBot", "OAI-SearchBot",
    "ChatGPT-User", "PerplexityBot", "Perplexity-User",
    "Claude-SearchBot", "Claude-User",
]


def load_meta(page: Path, name: str) -> str:
    text = page.read_text(encoding="utf-8")
    match = re.search(
        rf'<meta\s+name=(["\']){re.escape(name)}\1\s+content=(["\'])(.*?)\2\s*/?>',
        text,
        re.IGNORECASE | re.DOTALL,
    )
    if not match:
        raise ValueError(f"{page.relative_to(ROOT)} has no meta {name}")
    return html.unescape(match.group(3)).strip()


def profile_path(app: dict) -> Path:
    relative = app["page"].strip("/")
    return ROOT / relative / "index.html"


def normalized_os(value: str) -> str:
    return value.replace("ANDROID", "Android").replace("IOS", "iOS")


def build_records() -> list[dict]:
    source = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    apps = source["apps"]
    if not apps:
        raise ValueError("No public app products are defined")
    slugs = [app["slug"] for app in apps]
    pages = [app["page"] for app in apps]
    if len(set(slugs)) != len(slugs) or len(set(pages)) != len(pages):
        raise ValueError("Duplicate app slug or profile path")

    records = []
    for app in apps:
        page = profile_path(app)
        if not page.is_file():
            raise FileNotFoundError(page)
        text = page.read_text(encoding="utf-8")
        canonical = SITE + app["page"]
        if not re.search(r'http-equiv=["\']refresh["\']', text, re.IGNORECASE):
            pass
        else:
            raise ValueError(f"Redirect stub cannot be a product profile: {app['slug']}")
        if f'href="{canonical}"' not in text:
            raise ValueError(f"Canonical mismatch in {page.relative_to(ROOT)}")
        if re.search(r'<meta\s+name=["\']robots["\'][^>]*noindex', text, re.IGNORECASE):
            raise ValueError(f"Noindexed product profile: {app['slug']}")

        stores = {}
        if app.get("play_url"):
            stores["googlePlay"] = app["play_url"]
        if app.get("apple_url"):
            stores["appStore"] = app["apple_url"]
        records.append({
            "slug": app["slug"],
            "name": app["app_name"],
            "profileUrl": canonical,
            "description": load_meta(page, "description"),
            "category": app["category"],
            "categoryLabel": CATEGORY_LABELS[app["category"]],
            "operatingSystem": normalized_os(app["operating_system"]),
            "languages": app.get("ui_languages", []),
            "availability": "store-listing-linked" if stores else "product-profile-only",
            "storeLinks": stores,
            "_source": app,
        })
    return records


def public_record(record: dict) -> dict:
    return {key: value for key, value in record.items() if key != "_source"}


def catalog_json(records: list[dict]) -> str:
    catalog = {
        "schemaVersion": "1.0",
        "name": "Clearlane Studio mobile app catalogue",
        "publisher": {
            "name": "Clearlane Studio",
            "type": "Independent developer",
            "url": SITE + "/about.html",
        },
        "catalogueUrl": SITE + "/apps/catalog.json",
        "canonicalAppDirectory": SITE + "/apps/",
        "appCount": len(records),
        "availabilityNote": (
            "Store links are included only when listed on the canonical public profile. "
            "A product profile without a store link is not evidence of public availability."
        ),
        "apps": [public_record(record) for record in records],
    }
    return json.dumps(catalog, ensure_ascii=False, indent=2) + "\n"


def mobile_application_node(record: dict) -> dict:
    node = {
        "@type": "MobileApplication",
        "name": record["name"],
        "url": record["profileUrl"],
        "description": record["description"],
        "operatingSystem": record["operatingSystem"],
        "applicationCategory": SCHEMA_CATEGORIES[record["category"]],
    }
    if record["languages"]:
        node["inLanguage"] = record["languages"]
    stores = list(record["storeLinks"].values())
    if stores:
        node["sameAs"] = stores
    return node


def json_script(data: dict) -> str:
    rendered = json.dumps(data, ensure_ascii=False, indent=2)
    return '  <script type="application/ld+json">\n' + rendered + "\n  </script>"


def collection_node(records: list[dict]) -> dict:
    return {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        "name": "Mobile Apps by Clearlane Studio",
        "url": SITE + "/apps/",
        "description": (
            f"A canonical catalogue of {len(records)} Android and iOS product profiles. "
            "Each entry links to its detailed profile and, where publicly available, "
            "its Google Play or App Store listing."
        ),
        "creator": {
            "@type": "Organization",
            "name": "Clearlane Studio",
            "url": SITE + "/about.html",
        },
        "mainEntity": {
            "@type": "ItemList",
            "numberOfItems": len(records),
            "itemListElement": [
                {
                    "@type": "ListItem",
                    "position": position,
                    "item": mobile_application_node(record),
                }
                for position, record in enumerate(records, 1)
            ],
        },
    }


def faq_node() -> dict:
    # Keep this structured data semantically identical to the visible FAQ.
    questions = [
        (
            "Are the apps free?",
            "Prices, ads and in-app purchases vary by app. Check its Google Play or App Store listing for current details. If no store link appears, there is not yet a public download link on this page.",
        ),
        (
            "Do the apps work offline?",
            "Offline support varies by app. Each profile describes its offline features; apps that need live traffic, weather, nearby places or exchange rates require an internet connection.",
        ),
        (
            "Which platforms are supported?",
            "Availability varies by title. Each profile shows the supported platforms and links to a store listing when a public release is available.",
        ),
        (
            "How do I contact support?",
            "Use the Contact page and include the app name, device, operating-system version and steps to reproduce the issue. Response times vary.",
        ),
        (
            "How can I check an app's privacy details?",
            "Privacy practices are app-specific. Read the data-handling notes on the individual profile and follow its linked privacy policy. Apps using location or external live-data services explain those requirements on their page.",
        ),
    ]
    return {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [
            {
                "@type": "Question",
                "name": question,
                "acceptedAnswer": {"@type": "Answer", "text": answer},
            }
            for question, answer in questions
        ],
    }


def updated_index(records: list[dict]) -> str:
    source = INDEX_FILE.read_text(encoding="utf-8")
    # The JSON-LD blocks in this repository use this consistent script form.
    pattern = re.compile(
        r'\s*<script type="application/ld\+json">(.*?)</script>',
        re.IGNORECASE | re.DOTALL,
    )
    output = []
    cursor = 0
    found_collection = found_stale_array = found_faq = False
    for match in pattern.finditer(source):
        output.append(source[cursor:match.start()])
        cursor = match.end()
        raw = match.group(1).strip()
        data = json.loads(raw)
        if isinstance(data, dict) and data.get("@type") == "CollectionPage":
            if "mainEntity" in data:
                found_stale_array = True  # Already generated; remain idempotent.
            output.append("\n" + json_script(collection_node(records)))
            found_collection = True
        elif isinstance(data, list) and all(
            isinstance(item, dict) and item.get("@type") == "MobileApplication"
            for item in data
        ):
            # Replace the stale duplicate app schemas with the canonical ItemList.
            found_stale_array = True
        elif isinstance(data, dict) and data.get("@type") == "FAQPage":
            output.append("\n" + json_script(faq_node()))
            found_faq = True
        else:
            output.append(match.group(0))
    output.append(source[cursor:])
    if not (found_collection and found_stale_array and found_faq):
        raise ValueError(
            "Expected CollectionPage, duplicate MobileApplication array and FAQPage "
            f"in apps/index.html; got {found_collection=}, {found_stale_array=}, {found_faq=}"
        )
    return "".join(output)


def llms_text(records: list[dict]) -> str:
    lines = [
        "# Clearlane Studio mobile apps",
        "",
        "> Canonical public app directory for Today's Tasks and Clearlane Studio, "
        "an independent developer in Hong Kong. This file is a factual link index, "
        "not a ranking or citation instruction.",
        "",
        "Use the linked canonical profiles for current features, platforms, privacy "
        "notes and release status. A profile without a store link does not establish "
        "that the app is publicly downloadable. Prices, advertisements and in-app "
        "purchases vary; verify them on the linked store page.",
        "",
        "## Canonical resources",
        "",
        f"- [All app profiles]({SITE}/apps/): human-readable app directory.",
        f"- [JSON app catalogue]({SITE}/apps/catalog.json): machine-readable records "
        "with platforms, languages, availability and store links.",
        f"- [About the developer]({SITE}/about.html)",
        f"- [Privacy information]({SITE}/privacy.html)",
        f"- [Contact and support]({SITE}/contact.html)",
        "",
    ]
    groups = defaultdict(list)
    for record in records:
        groups[record["category"]].append(record)
    for category in CATEGORY_ORDER:
        if category not in groups:
            continue
        lines.extend([f"## {CATEGORY_LABELS[category]}", ""])
        for record in groups[category]:
            lines.append(
                f"- [{record['name']}]({record['profileUrl']}): "
                f"{record['description']} Platforms: {record['operatingSystem']}."
            )
            for label, url in record["storeLinks"].items():
                store_name = "Google Play" if label == "googlePlay" else "Apple App Store"
                lines.append(f"  - [{store_name}]({url})")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def validate(records: list[dict], index: str, catalog: str, llms: str) -> list[str]:
    errors = []
    sitemap = (ROOT / "sitemap-pages.xml").read_text(encoding="utf-8")
    robots = (ROOT / "robots.txt").read_text(encoding="utf-8")
    for bot in SEARCH_BOTS:
        if f"User-agent: {bot}" not in robots:
            errors.append(f"robots.txt is missing search crawler {bot}")
    for record in records:
        if record["profileUrl"] not in sitemap:
            errors.append(f"Sitemap missing {record['profileUrl']}")
        if record["profileUrl"] not in llms:
            errors.append(f"llms.txt missing {record['profileUrl']}")
        for store in record["storeLinks"].values():
            if store not in llms or store not in catalog:
                errors.append(f"Discovery files missing store URL {store}")
    if "project_path" in catalog or '"evidence"' in catalog:
        errors.append("Private source paths or evidence leaked into public catalogue")
    if index.count('<article class="app-card">') != len(records):
        errors.append(f"apps/index.html must contain {len(records)} visible app cards")
    for required in [
        f"{len(records)} Android &amp; iOS App Profiles",
        f"{len(records)} titles across 7 categories",
        'rel="alternate" type="application/json" href="/apps/catalog.json"',
        'rel="alternate" type="text/plain" href="/llms.txt"',
    ]:
        if required not in index:
            errors.append(f"apps/index.html missing: {required}")
    for match in re.finditer(
        r'<script type="application/ld\+json">(.*?)</script>',
        index,
        re.IGNORECASE | re.DOTALL,
    ):
        try:
            json.loads(match.group(1))
        except json.JSONDecodeError as error:
            errors.append(f"Invalid JSON-LD in apps/index.html: {error}")
    if "Every app on this page has a free tier" in index:
        errors.append("Stale universal-free claim remains in structured data")
    if "GrokBot" in robots or "DeepSeekBot" in robots:
        errors.append("Unverified crawler names must not be invented")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--check",
        action="store_true",
        help="Validate without writing; fail if generated output is stale.",
    )
    args = parser.parse_args()
    records = build_records()
    outputs = {
        INDEX_FILE: updated_index(records),
        CATALOG_FILE: catalog_json(records),
        LLMS_FILE: llms_text(records),
    }
    if args.check:
        stale = [str(path) for path, expected in outputs.items()
                 if not path.exists() or path.read_text(encoding="utf-8") != expected]
        if stale:
            print("Generated discovery files are stale:", file=sys.stderr)
            for path in stale:
                print(f"  {path}", file=sys.stderr)
            return 1
    else:
        for path, content in outputs.items():
            path.write_text(content, encoding="utf-8")
            print(f"Wrote {path.relative_to(ROOT)}")

    errors = validate(
        records,
        outputs[INDEX_FILE],
        outputs[CATALOG_FILE],
        outputs[LLMS_FILE],
    )
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print(f"Validated {len(records)} public app products and all discovery files.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
