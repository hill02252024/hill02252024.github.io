# HK Blocklist Data

Source of truth for the JSON consumed by the **HK Call Guard** Android
app at `AppConstants.hkJunkCallApiUrl`:

```
https://todays-tasks.com/hk-blocklist-data/data/blocklist.json
```

## Schema

```jsonc
[
  {
    "number":       "21100000",        // string, HK phone digits only
    "category":     "telemarketing",   // one of: telemarketing, scam,
                                       //         harassment, fraud, other
    "report_count": 312                // int, ≥ 1
  }
]
```

The app code that parses this lives in
`~/Desktop/hk_call_guard/lib/services/hkjunkcall_service.dart` —
keep the two in sync. The app's bundled seed lives at
`~/Desktop/hk_call_guard/assets/data/initial_blocklist.json`.

## How it's built

`.github/workflows/update_hk_blocklist.yml` runs daily at 06:07 UTC
(14:07 HK), or on-demand via `workflow_dispatch`. It calls
`scripts/build_hk_blocklist.py`, which:

1. Loads the existing on-disk JSON as the **floor**.
2. Attempts to scrape `hkjunkcall.com` for fresh entries.
3. Merges by number (max-wins on `report_count`, non-`other` category
   wins on category).
4. Refuses to write a smaller file than the floor (safety net for
   upstream regressions).
5. Validates schema strictly before writing.
6. Commits the result back to `main` only if it actually changed.

## Manually trigger

```bash
gh workflow run "Update HK Blocklist"
gh workflow run "Update HK Blocklist" -f dry_run=true
```

## Known limitations

- `hkjunkcall.com` returns **HTTP 403** to most non-HK IPs. GitHub
  Actions runners often hit this too. When that happens the safety
  net kicks in and we keep yesterday's file. No regression — but no
  growth either until a successful scrape lands.
- We do **not** ship per-user reports. The Android app does have an
  on-device report flow; if you want those to feed back here, build
  a privacy-preserving aggregation server first (the existing
  privacy claim is "0 bytes uploaded").
