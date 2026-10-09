# Cherry-Pick Plan — Metadata Phase 1 onto `main`

**Scope:** Planning only. Do not merge, cherry-pick, or modify code. Git history is the source of truth.

Prerequisite read: `./METADATA_BRANCH_DIFF_INVESTIGATION_REPORT.md`.

---

## 1. Summary

The link-preview metadata fix that the user observed as "missing" on `main` lives as exactly **one commit** on branch `14-may-phase2`:

| SHA | Date (UTC) | Files | Lines |
|---|---|---|---|
| `38d0f390223232adbec1ae195ea3dbd8a89207fb` | 2026-05-13 19:07:21 | `frontend/public/index.html` | +23 / −1 |

The commit's pre-image of `frontend/public/index.html` is **bit-for-bit identical** to the current `frontend/public/index.html` on `origin/main` (verified: `git diff origin/main:frontend/public/index.html 38d0f39^:frontend/public/index.html` returns empty). The cherry-pick will therefore apply with **zero conflicts** and produce exactly the same `index.html` as `14-may-phase2`.

Three other commits exist on `14-may-phase2` that are not on `main`: a documentation update (`4bf93ae`), a bug-tracker bump (`df3c635`), and a platform-config edit (`bb77b16`, touches `.emergent/emergent.yml` + `.gitignore`). None of them are part of the metadata fix and **none should be included** in this cherry-pick to keep the change surface minimal.

The recommended action is a **single-commit cherry-pick of `38d0f39` onto `main`**, followed by a CDN-cache invalidation so link-preview scrapers (WhatsApp, Facebook, Slack, iMessage, Twitter/X) re-fetch the updated HTML.

---

## 2. Source branch / commit

- **Branch:** `origin/14-may-phase2`
- **HEAD of branch:** `bb77b16f36a1969c3e92c4ca8acb709dbfb9c82c` (2026-05-13 19:38:11 UTC)
- **Target commit to cherry-pick:** `38d0f390223232adbec1ae195ea3dbd8a89207fb`
- **Author:** `emergent-agent-e1 <github@emergent.sh>`
- **Commit message:** `auto-commit for 03bd5de5-4634-403b-aa63-a9fcbdcfea67`
- **Files touched:** `frontend/public/index.html` only
- **Diff size:** +23 / −1 line; replaces one hardcoded `<meta name="description">` and adds 7 OG/Twitter tags + a documentation comment.

---

## 3. Target branch

- **Branch:** `origin/main`
- **HEAD of target:** `3d5197c8ef3cfa5937910de1a793c2afbcf5f2e9` (2026-05-13 18:03:56 UTC)
- **Pre-cherry-pick state of `frontend/public/index.html`:** identical to `38d0f39^` (verified empty diff).

---

## 4. Why cherry-pick instead of full merge

Both options were considered. Cherry-pick wins on every axis:

| Criterion | Cherry-pick `38d0f39` | Merge `origin/14-may-phase2` into `main` |
|---|---|---|
| Scope to the actual fix | ✅ exactly one file changed | ❌ also pulls 3 unrelated commits |
| Risk of unintended side-effects | ✅ none | ❌ `bb77b16` rewrites `.gitignore` and bumps `.emergent/emergent.yml`; would have to be reconciled with the existing `.gitignore` fixes already on `main` (the QA-fix from the deployment-readiness session) and would touch the platform image tag in `.emergent/emergent.yml`. |
| Conflict-free | ✅ guaranteed (pre-image == main) | ⚠ likely conflicts on `.gitignore` (already edited differently on `main`) and `.emergent/emergent.yml` (different image tag) |
| Easy to revert | ✅ `git revert <new-sha>` is a one-file change | ❌ revert of a merge commit is messier and may re-introduce other deltas |
| Audit clarity | ✅ commit message + one-file diff make it obvious | ❌ a merge brings in 4 commits whose subjects are auto-generated and not metadata-related |
| Pulls in documentation updates from phase2 (`DEPLOYMENT_HANDOVER.md`, `memory/PRD.md`, `memory_repo/BUG_TRACKER.md`) | ❌ no (acceptable trade-off; those are doc-only files that can be cherry-picked separately if desired) | ✅ yes |

**Decision: single-commit cherry-pick.** If the team later wants the doc/platform commits, they can be cherry-picked individually after this one is validated in production.

### Other commits on `14-may-phase2` — explicit exclusion list

| SHA | Date (UTC) | Files | Why excluded |
|---|---|---|---|
| `4bf93ae` | 2026-05-13 18:30:49 | `DEPLOYMENT_HANDOVER.md`, `memory/PRD.md` | Documentation-only; `main` already has its own `DEPLOYMENT_HANDOVER.md` produced during the deployment-readiness session — would conflict, and not part of the metadata fix. |
| `df3c635` | 2026-05-13 19:09:48 | `memory_repo/BUG_TRACKER.md` | Documentation-only; can be cherry-picked separately if Phase 2 planning needs the bug-tracker entry. |
| `bb77b16` | 2026-05-13 19:38:11 | `.emergent/emergent.yml`, `.gitignore` | Platform/`.gitignore` edits. `.gitignore` on `main` already has the deployment-fix cleanup; merging this commit risks re-introducing the duplicated `.env`-blocking entries that were intentionally removed earlier. Out of scope for metadata. |

---

## 5. Exact commands

Run from a clean working tree on `main`. **No write actions are taken by this plan; commands are provided for the next agent / human to execute.**

```bash
# 0) Sanity — start clean
git status                                    # expect: clean
git fetch --all --prune

# 1) Switch to main and update
git checkout main
git pull --ff-only origin main                # expect: fast-forward or already up to date

# 2) (Optional, recommended) Create a topic branch for the cherry-pick — safer than picking directly onto main
git checkout -b metadata/phase1-index-html-cherrypick

# 3) Cherry-pick the single Phase 1 commit
git cherry-pick -x 38d0f390223232adbec1ae195ea3dbd8a89207fb
#   -x  → appends "(cherry picked from commit 38d0f39…)" to the message so the
#         origin commit is recorded; helpful for future audits.
#   Conflict expectation: NONE (verified empty pre-image diff vs main).

# 4) Local verification (see §6 for the full checklist)
git show --stat HEAD                          # expect: 1 file, +23 / -1 in frontend/public/index.html
git diff origin/14-may-phase2..HEAD -- frontend/public/index.html
#   expect: empty (your topic branch's index.html now matches 14-may-phase2's)

# 5) Push topic branch, open a PR into main, get review
git push origin metadata/phase1-index-html-cherrypick
#   Then on the platform of record: open PR "metadata/phase1-index-html-cherrypick → main"

# 6) After PR review + approval, merge with a fast-forward (or squash) per repo convention
#   No need to re-base; the cherry-pick is already on top of main's tip.
```

### If anything is unexpected

```bash
# Abort an in-progress cherry-pick (if conflicts appear despite the dry check)
git cherry-pick --abort

# Roll back the cherry-pick after it has been committed (single commit; clean revert)
git revert <new-cherry-pick-sha>
```

---

## 6. Verification checklist (post-cherry-pick, pre-PR)

| # | Check | How | Expected result |
|---|---|---|---|
| 6.1 | Only one file changed | `git show --stat HEAD` | `frontend/public/index.html \| 24 +++++++++++++++++++++++-` (1 file, +23 / −1) |
| 6.2 | Old Hyatt description gone | `grep "Hyatt Centric Candolim Goa Digital Menu" frontend/public/index.html` | empty (no match) |
| 6.3 | New MyGenie default description present | `grep 'name="description" content="MyGenie Digital Menu"' frontend/public/index.html` | exactly one match |
| 6.4 | OG tags present | `grep -c 'property="og:' frontend/public/index.html` | `4` (og:title, og:description, og:type, og:site_name) |
| 6.5 | Twitter tags present | `grep -c 'name="twitter:' frontend/public/index.html` | `3` (twitter:card, twitter:title, twitter:description) |
| 6.6 | `<title>MyGenie</title>` still present | `grep "<title>MyGenie</title>" frontend/public/index.html` | one match (unchanged from main) |
| 6.7 | Boot script unchanged | `git diff origin/main HEAD -- frontend/public/index.html` | diff shows only the metadata block; the inline `<script>(function () { try { var seg = …` boot block is untouched |
| 6.8 | Runtime metadata components unchanged | `git diff origin/main HEAD -- frontend/src/components/DocumentTitleManager/ frontend/src/components/FaviconRouteReset/ frontend/src/App.js frontend/src/index.js` | empty |
| 6.9 | Final index.html parses as valid HTML | `npx html-validate frontend/public/index.html` *or* open it in a browser locally | no parse errors |
| 6.10 | Frontend builds | `cd frontend && yarn build` | "Compiled successfully" (warnings only, same set as before — the 10 `react-hooks/exhaustive-deps` warnings noted in the deployment handover) |
| 6.11 | Build output contains the new tags | `grep -c 'og:title' frontend/build/index.html` | `1` |
| 6.12 | No regression on backend / supervisor | `sudo supervisorctl status` | `backend RUNNING`, `frontend RUNNING` |

---

## 7. Deployment / cache checklist

| # | Step | Expected result |
|---|---|---|
| 7.1 | Merge the cherry-pick PR into `main` | `main`'s `index.html` now matches `14-may-phase2`'s. |
| 7.2 | Trigger Emergent native deploy (or downstream deploy pipeline) | New `index.html` shipped to the production edge / origin. |
| 7.3 | Bust CDN cache for the affected paths | Specifically invalidate: `/`, `/index.html`, `/<restaurantId>/*` (e.g. `/618`, `/716`, `/478`, …) — anything the SPA serves with this same `index.html`. |
| 7.4 | Confirm origin serves the new HTML | `curl -s https://18march.mygenie.online/ \| grep -E "og:title\|MyGenie Digital Menu\|Hyatt Centric"` should match the **new** strings only (no "Hyatt Centric"). |
| 7.5 | Force scraper re-crawl | For WhatsApp: send the URL again *with a unique query string* (e.g. `https://18march.mygenie.online/?v=phase1`) — WhatsApp's preview cache is keyed on the URL, so a fresh query forces re-scrape. For Facebook / X: use their respective "debug" / "card validator" tools. |
| 7.6 | Visual confirmation in WhatsApp / iMessage / Slack | Title shows "MyGenie", description shows "MyGenie Digital Menu" (no more "Hyatt Centric Candolim Goa Digital Menu"). |
| 7.7 | Browser smoke test (in-app, non-scraper) | Navigate to `/<restaurantId>` in a real browser — `<title>` should still update at runtime to the restaurant's name via `DocumentTitleManager` (unchanged behaviour). |

---

## 8. Phase 2 note (explicitly out of scope of this plan)

Phase 1 only ships **restaurant-neutral** defaults. After this cherry-pick lands, every link preview — for every restaurant — will read:

- Title: **MyGenie**
- Description: **MyGenie Digital Menu**

This is by design and exactly what the inline comment in `38d0f39` documents. Per-restaurant link-preview metadata (e.g. "Sattvik Delights" / restaurant tagline / restaurant logo) is **Phase 2** and is **not** built on any branch today.

Phase 2 cannot be solved by adding more code to React / `index.html` alone because every major link-preview scraper (WhatsApp, Facebook, iMessage, Slack, Telegram, Twitter/X) ignores JavaScript. The two viable Phase 2 architectures, both new work:

1. **Server-side / edge injection.** A small server / edge function (Cloudflare Worker, Nginx with sub_filter, Next.js / Remix SSR, etc.) parses the requested path, calls `/api/v1/web/restaurant-info?restaurant_web=<rid>`, and rewrites the `<title>` / `<meta>` tags in `index.html` before responding. Existing React app stays unchanged.
2. **Per-restaurant pre-rendered HTML at build / deploy time.** A build step generates `/<rid>/index.html` for every known restaurant with the right metadata baked in, and the ingress serves the right variant per route. Trades runtime simplicity for slower onboarding of new restaurants.

A separate planning ticket should be opened. The Phase 1 fix in this plan is the safe stepping stone; it eliminates the misleading Hyatt-specific text for **every** non-Hyatt restaurant while Phase 2 is being designed.

---

## 9. Risks

| # | Risk | Likelihood | Mitigation |
|---|---|---|---|
| 9.1 | Cherry-pick conflict | **Very low** — pre-image == main, verified empty diff | If it ever conflicts (e.g. someone re-pushes to `main` first), `git cherry-pick --abort` and re-base; resolve `frontend/public/index.html` manually using `git checkout 38d0f39 -- frontend/public/index.html`. |
| 9.2 | CDN / edge cache continues serving old HTML | Medium (depends on TTL) | Step 7.3 explicit invalidation; if invalidation is not possible, append a one-time query param to test URLs. |
| 9.3 | WhatsApp preview cache (out-of-band) | Medium — WhatsApp caches link previews ~30 days per exact URL | Use a unique `?v=phase1` query for the verification re-share; the canonical URL will refresh on its own once the WhatsApp cache expires for new shares. Document this on the rollout note so users aren't alarmed by stale previews for previously-shared links. |
| 9.4 | New tags break a brittle scraper that didn't expect them | Very low | The tags added (og:*, twitter:*) are W3C/OGP-standard and universally supported. |
| 9.5 | Phase 2 expectations rolled into Phase 1 by stakeholders | Medium | Communicate clearly in the PR description and rollout note that link previews will read "MyGenie / MyGenie Digital Menu" for **every** restaurant post-Phase-1; per-restaurant previews require Phase 2 (separate ticket). |
| 9.6 | Future merges from `14-may-phase2` to `main` see `38d0f39` already applied | Low | Because we used `-x`, the cherry-pick's commit message records the origin SHA; future tooling can reason about it. Git also tracks this via `git cherry-pick`-aware merge resolution. |
| 9.7 | Production deploy pipeline uses `CI=true yarn build` | Existing known issue from the deployment handover; not introduced by this cherry-pick | n/a — Phase 1 cherry-pick does not change `eslint` surface; existing pipeline workaround applies. |

---

## 10. Final verdict

**`ready_for_cherrypick`**

Evidence:

- Single, well-scoped commit (`38d0f39`) that touches one file only (`frontend/public/index.html`).
- Pre-image of that file is identical to `main`'s current head → cherry-pick is mechanically guaranteed to apply cleanly.
- No application code, no runtime, no test, no business-logic surface is affected.
- The three non-metadata commits on `14-may-phase2` are explicitly excluded and documented as such.
- Verification + cache-bust steps are concrete and runnable.
- Phase 2 (per-restaurant metadata) is correctly identified as architecturally out of scope and needs SSR/edge injection in a separate ticket.

No clarification is required from the user before proceeding — the merge plan can be executed as soon as a human with push access to `origin` is ready.

— End of plan —
