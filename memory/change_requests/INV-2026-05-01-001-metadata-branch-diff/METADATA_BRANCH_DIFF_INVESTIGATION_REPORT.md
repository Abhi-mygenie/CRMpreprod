# Investigation Report — Metadata Branch Diff (`main` vs `14-may` / `14-may-phase2`)

**Scope:** Investigation only. No code changes, no branch merges. Git history is the source of truth.

---

## 1. Issue summary

User reported that metadata-related changes done "yesterday" are not reflecting on the live link previews. Screenshot evidence (WhatsApp preview of `https://sattivikdelights.com/`) shows:

- Title: **"MyGenie"**
- Description: **"Hyatt Centric Candolim Goa Digital Menu"**
- URL: `sattivikdelights.com`

Both of these strings come from the static `<title>` and `<meta name="description">` tags currently shipped in `frontend/public/index.html`. WhatsApp (and every other link-preview scraper — Facebook, Slack, iMessage, Twitter/X) does **not** execute JavaScript, so any client-side `document.title` update or React-Helmet injection cannot influence what they see; the scrapers only consume the raw HTML payload served from `/`.

The investigation finds that the metadata fix that removes the hardcoded `"Hyatt Centric Candolim Goa Digital Menu"` description **does exist in the repository**, but on branch **`14-may-phase2`** (not `14-may` as the user phrased it), and **has not been merged into `main`**.

---

## 2. Branches compared

| Branch | Remote ref | HEAD SHA | HEAD date (UTC) |
|---|---|---|---|
| `main` | `origin/main` | `3d5197c8ef3cfa5937910de1a793c2afbcf5f2e9` | 2026-05-13 18:03:56 |
| `14-may` | `origin/14-may` | `c11696e53b6d7e48cda17ed7c561812f97f692df` | 2026-05-13 18:01:19 |
| **`14-may-phase2`** | `origin/14-may-phase2` | `bb77b16f36a1969c3e92c4ca8acb709dbfb9c82c` | **2026-05-13 19:38:11** |

Branch existence confirmed via `git branch -a` after `git fetch --all --prune` against `https://github.com/Abhi-mygenie/customer-app5th-march.git`. All three remote refs are reachable.

---

## 3. Commit comparison summary

### 3.1 `main` vs `14-may` (the branch the user named)

```
git log --oneline origin/main..origin/14-may      → 0 commits
git log --oneline origin/14-may..origin/main      → 1 commit
git diff --stat origin/14-may..origin/main        →
  .emergent/emergent.yml | 2 +-
  .gitignore             | 9 +++++++++
  2 files changed, 10 insertions(+), 1 deletion(-)
```

**`14-may` is a strict ancestor of `main`.** Zero application-code differences. The single commit `main` has on top of `14-may` (3d5197c) only touches `.emergent/emergent.yml` and `.gitignore` — **no metadata files**.

> **There is no metadata gap between `main` and `14-may`.** Anything the user did on `14-may` is already on `main`.

### 3.2 `main` vs `14-may-phase2` (the branch where the metadata fix actually lives)

```
git log --oneline origin/main..origin/14-may-phase2 → 4 commits
```

| # | SHA | Date (UTC) | Files changed | Metadata? |
|---|---|---|---|---|
| 1 | `4bf93ae` | 2026-05-13 18:30:49 | `DEPLOYMENT_HANDOVER.md`, `memory/PRD.md` | No (docs) |
| 2 | **`38d0f39`** | **2026-05-13 19:07:21** | **`frontend/public/index.html` (+23 / −1)** | **YES** |
| 3 | `df3c635` | 2026-05-13 19:09:48 | `memory_repo/BUG_TRACKER.md` | No (docs) |
| 4 | `bb77b16` | 2026-05-13 19:38:11 | `.emergent/emergent.yml`, `.gitignore` | No (platform) |

Exactly one metadata commit (`38d0f39`) is on `14-may-phase2` and **not on `main`**.

### 3.3 Other branches that carry separate metadata work (informational)

A wider scan (`git log --all --oneline --since="2026-05-01" -- frontend/public/index.html frontend/src/components/DocumentTitleManager/* frontend/src/components/FaviconRouteReset/*`) showed earlier metadata-related commits on `8-may`, `latest-hyatt-fixes-7-may`, `7-may`, `hyatt-fixes-7-may`, `2-may-temp-`, `2_may_2026`, `6-may`, `abhi-2-may`, `11-may-uat`, and `conflict_060526_2311`. These are out of scope for the "yesterday" complaint (they predate the screenshot by ≥ 5 days), but the same merge-gap pattern could affect them. Out of scope for this report.

---

## 4. Metadata files changed in `14-may-phase2` (vs `main`)

Single file: `frontend/public/index.html`. Full diff of commit `38d0f39` (line ranges relative to the file head):

```diff
@@ -5,7 +5,29 @@
   <meta charset="utf-8" />
   <meta name="viewport" content="width=device-width, initial-scale=1" />
   <meta name="theme-color" content="#000000" />
-  <meta name="description" content="Hyatt Centric Candolim Goa Digital Menu" />
+
+  <!--
+    MyGenie default link-preview metadata (Phase 1 of the Metadata/SEO Preview CR).
+    These values are intentionally restaurant-neutral. Per-restaurant metadata is
+    NOT injected here; Phase 2 will introduce admin-configured metadata sourced
+    from /web/restaurant-info and will replace / override these defaults
+    field-by-field at runtime (and/or via SSR/edge injection for link-preview
+    scrapers that do not execute JS, e.g. WhatsApp / Facebook / iMessage / Slack).
+    Until Phase 2 ships, every page serves the MyGenie default below.
+
+    Note: og:image and twitter:image are intentionally omitted in Phase 1 — no
+    approved 1200x630 MyGenie raster asset is available yet. They will be added
+    once design provides the default asset, or sourced per-restaurant in Phase 2.
+  -->
+  <meta name="description" content="MyGenie Digital Menu" />
+  <meta property="og:title" content="MyGenie" />
+  <meta property="og:description" content="MyGenie Digital Menu" />
+  <meta property="og:type" content="website" />
+  <meta property="og:site_name" content="MyGenie" />
+  <meta name="twitter:card" content="summary" />
+  <meta name="twitter:title" content="MyGenie" />
+  <meta name="twitter:description" content="MyGenie Digital Menu" />
+
   <!-- <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
```

This is a **Phase 1** change. It only removes the Hyatt-specific hardcode and replaces it with neutral MyGenie defaults plus a baseline set of Open Graph and Twitter card tags. Per-restaurant overrides are explicitly deferred to Phase 2 (admin-config-driven, with SSR / edge-injection for non-JS scrapers).

---

## 5. Metadata changes missing from `main`

Exactly **eight static `<meta>` lines** are missing from `frontend/public/index.html` on `main`:

| Tag | Current (main) | Expected (14-may-phase2) |
|---|---|---|
| `<meta name="description">` | `"Hyatt Centric Candolim Goa Digital Menu"` | `"MyGenie Digital Menu"` |
| `<meta property="og:title">` | absent | `"MyGenie"` |
| `<meta property="og:description">` | absent | `"MyGenie Digital Menu"` |
| `<meta property="og:type">` | absent | `"website"` |
| `<meta property="og:site_name">` | absent | `"MyGenie"` |
| `<meta name="twitter:card">` | absent | `"summary"` |
| `<meta name="twitter:title">` | absent | `"MyGenie"` |
| `<meta name="twitter:description">` | absent | `"MyGenie Digital Menu"` |

Plus the documentation comment block explaining Phase 1 / Phase 2 intent.

> This is the direct, exact root cause of the screenshot symptom. `main`'s `index.html` still serves the **Hyatt** description, so any HTML scraper (WhatsApp, Facebook, Slack, iMessage, Twitter) hitting `sattivikdelights.com/` (or any other restaurant URL on the deployed `main`) sees `"Hyatt Centric Candolim Goa Digital Menu"`.

---

## 6. Metadata changes already present in `main`

`main` already contains the following metadata-adjacent runtime code (identical to what's on `14-may-phase2`):

| File | What it does | Affects link previews? |
|---|---|---|
| `frontend/public/index.html` L13 | `<title>MyGenie</title>` (static fallback) | YES — this is the "MyGenie" title in the screenshot. Unchanged by the missing commit. |
| `frontend/public/index.html` L15–17 | `<link rel="icon" … href="/favicon.svg" />` | YES (favicon). |
| `frontend/public/index.html` boot script | Reads `localStorage.restaurant_config_<rid>` to apply brand colours / fonts synchronously on hard refresh. Does **not** touch `<meta>` tags. | No. |
| `frontend/src/components/DocumentTitleManager/DocumentTitleManager.jsx` | At runtime, sets `document.title` to `restaurant.name` on restaurant routes (uses `useRestaurantDetails`). Caches name in localStorage so the next hard refresh shows it. | **Runtime only** — does not help scrapers that don't execute JS. |
| `frontend/src/components/FaviconRouteReset/FaviconRouteReset.jsx` | At runtime, swaps the favicon `<link rel="icon">` href to the restaurant's logo on restaurant routes. | **Runtime only** — same caveat. |
| `frontend/package.json` | No `react-helmet` / `react-helmet-async` dependency on either branch. | n/a |

`git diff origin/main..origin/14-may-phase2 -- frontend/src/components/DocumentTitleManager/ frontend/src/components/FaviconRouteReset/ frontend/src/App.js frontend/src/index.js` → **empty**. Confirms no runtime-metadata code differs between the two branches.

---

## 7. Possible runtime reasons changes may not reflect

The user asked us to investigate runtime reasons even if the code looks correct. Listing them for completeness, then mapping to evidence:

| # | Possible runtime reason | Apply here? |
|---|---|---|
| 7.1 | **Code not merged to `main`** | **YES — this is the root cause.** Commit `38d0f39` lives only on `14-may-phase2`. |
| 7.2 | Build cache / CDN cache holding stale `index.html` | Possible secondary cause if the merge happens but the static `index.html` was cached at the CDN. Not the current cause because the file on `main` is genuinely the old version. |
| 7.3 | SPA navigation reset — React updates `document.title` on client nav but scrapers fetch `/` and get the original HTML | Always applies (architectural). The Phase 1 commit on `14-may-phase2` deliberately fixes this by editing the static HTML rather than relying on runtime injection. |
| 7.4 | Index.html / static metadata still overriding runtime metadata | Inverted on this codebase: scrapers only ever see the static `index.html`. There is no runtime overlay (no `react-helmet`). So static is the **only** thing that matters for link previews. |
| 7.5 | Route-level override / hardcoded fallback inside React components | Searched — none found on either branch. |
| 7.6 | Wrong import path / branch mismatch in deployed bundle | n/a — the runtime components (`DocumentTitleManager`, `FaviconRouteReset`) are already wired in `main` and identical to `14-may-phase2`. They function correctly for in-app `<title>` updates; they simply cannot help link-preview scrapers (architectural). |
| 7.7 | Per-restaurant metadata expected but not yet sourced from `/web/restaurant-info` | **YES, but partially out of scope.** Even after merging `38d0f39`, link previews will show "MyGenie" / "MyGenie Digital Menu" — **not** the restaurant name — because Phase 2 (admin-config-driven, SSR/edge injection) is not implemented on any branch yet. The Phase 1 commit's own inline comment documents this. |

---

## 8. Root cause verdict

**`not_merged`** (with a phase-2 follow-up known to be still pending).

Exact attribution:

- The user said the change is on **"14-may"**. Strictly speaking, `14-may` is fully merged into `main` (it is an ancestor). No metadata work lives only on `14-may`.
- The change the user is actually thinking of lives on **`14-may-phase2`**, specifically commit **`38d0f39`** (2026-05-13 19:07 UTC = "yesterday"). That commit, plus three non-code commits, is the entire delta from `main` to `14-may-phase2`. `main` is missing the eight static `<meta>` tags that the commit added/changed.
- Once `38d0f39` is in `main`, scrapers will see "MyGenie" / "MyGenie Digital Menu" instead of the Hyatt-specific text. That alone resolves the screenshot symptom.
- Showing the **restaurant's** name and description on the link preview (e.g. "Sattvik Delights / <tagline>") is a separate, **not-yet-built** Phase 2 deliverable that requires either SSR/edge injection or static per-restaurant pre-rendering, because all major link-preview scrapers ignore JavaScript.

So this is a **merge gap for Phase 1**, plus a **known runtime/architecture gap for Phase 2** (per-restaurant metadata to scrapers, which has not been built on any branch).

---

## 9. Recommended next step

1. **Confirm with the user** that they meant `14-may-phase2` (not bare `14-may`). The four-commit delta from §3.2 is the candidate set.
2. If confirmed, plan a clean merge of `14-may-phase2` → `main`. The application-code surface is exactly one file (`frontend/public/index.html`, +23/−1) plus three documentation/platform commits that can be cherry-picked or fast-forwarded as appropriate. No code conflicts are expected because `main`'s `index.html` is identical to the pre-image of the commit's diff. Suggested approach options:
   - Cherry-pick `38d0f39` onto `main` (smallest, safest, only the metadata fix).
   - Or merge `origin/14-may-phase2` into `main` (also brings the doc updates and the `.emergent` / `.gitignore` edits).
3. After merge: invalidate any CDN cache for `/` and `/<restaurantId>/*` so scrapers re-fetch the updated `index.html`.
4. Validate with a fresh WhatsApp/iMessage link preview against a restaurant URL — expected new behaviour is "MyGenie" / "MyGenie Digital Menu" everywhere (still neutral, not per-restaurant).
5. **Open a separate Phase 2 ticket** for per-restaurant link-preview metadata. Implementation will require either:
   - SSR / edge function that fetches `/web/restaurant-info?restaurant_web=<rid>` server-side and injects per-restaurant `<title>` / `<meta>` tags into the HTML before serving it; or
   - Static per-restaurant `index.html` variants pre-rendered at build / deploy time.
   The CR file `memory_repo/BUG_TRACKER.md` was bumped by commit `df3c635` on `14-may-phase2` and is likely the existing tracking entry — verify when planning Phase 2.

---

## 10. Final verdict

**`ready_for_merge_plan`**

Evidence is conclusive and the fix surface is tiny (one file, +23/−1 lines, no code-merge conflict expected). A merge plan can be produced immediately. The one remaining ambiguity ("did the user mean `14-may` or `14-may-phase2`?") is a wording clarification, not a technical blocker — the user can confirm during the merge-plan review.

A **second, parallel** investigation should also be opened for the per-restaurant link-preview metadata (Phase 2). That feature has not been implemented on any branch and is architecturally distinct (needs server-side / edge injection because scrapers don't execute JS). It is out of scope for the immediate "yesterday's change isn't reflecting" complaint.

— End of report —
