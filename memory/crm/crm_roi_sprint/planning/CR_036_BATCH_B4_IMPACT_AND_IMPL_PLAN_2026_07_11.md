# CR-036 Batch B.4 — Impact Analysis + Implementation Plan (Test Automation)

> **Session**: 2026-07-11 · PLANNING role
> **Scope source**: `CR_036_BATCH_B1_IMPL_PLAN_FINAL_2026_07_11.md` §9 — "B.4: pytest V15-V26 + Playwright V19/V23 + live E2E with real WhatsApp send to owner phone"
> **Also absorbs**: B.2 plan §3 ("Automation of V-B2-* lands in B.4") and B.3 plan §3 (V-B3-*)
> **Status**: AWAITING OWNER APPROVAL

---

## 1 · Impact Analysis

### 1.1 Test-infrastructure reality (verified 2026-07-11)

| Surface | Reality |
|---|---|
| pytest | `pytest==9.1.1` + `pytest-xdist` installed. 4 suites exist in `/app/backend/tests/` (CR-033/034/037, CR-035, CR-039, BUG-009/CR-042/043) |
| House convention | Self-contained test files (NO `conftest.py`): read `REACT_APP_BACKEND_URL` from `frontend/.env`, hit the **live** backend over HTTP, use `pymongo.MongoClient(MONGO_URL)` directly for seeding/asserts, synthetic `uuid4` rows with teardown cleanup, run serially `pytest -n 0` |
| Database | **LIVE production MongoDB** (`mygenie`) — every seeded row must be synthetic, namespaced, and cleaned up |
| Playwright | **NOT installed** (neither Python package nor browsers) — must be provisioned |
| Live sends | `test-template` / event / campaign sends hit real AuthKey → real WhatsApp messages. Must be opt-in only |
| V15-V26 matrix | Defined in `CR_036_BATCH_B1_IMPL_PLAN_FINAL_2026_07_11.md` §6; V-B2-1…10 in B.2 plan §3; V-B3-1…11 in B.3 plan §3 |

### 1.2 Verification-to-method mapping (the core of this batch)

| V | Automatable? | Method | Notes |
|---|---|---|---|
| V15/V16/V17 | ✅ pytest unit | import `core.meta_media.resolve_meta_app_id` directly, monkeypatch env | zero network |
| V18 (G5 fail-loud) | ✅ pytest integration | seed synthetic media template (no `send_media_url`) + synthetic campaign + 1 synthetic customer → `POST /campaigns/{id}/send` → assert `failed`/`media_missing` log row. **Safe: G5 skips AuthKey entirely** | full cleanup of 4 collections |
| V19 (banner+button) | ✅ Playwright | seed `needs_media_reupload=true` template → assert `media-reupload-banner`, `media-reupload-btn-{id}` (+ B.3 modal opens) | |
| V20 (sync no-media) | ⚠️ partial | pytest **static assert**: sync code path writes no `send_media_url` (source scan) — live AuthKey sync excluded (mutates real template rows) | |
| V21 (PUT approved→400) | ✅ pytest | seed synthetic `status=approved` template → content PUT expects 400; media-only PUT expects 200 (Q16 both branches) | |
| V22 (test-send inject) | ⛔ live-gated | real WhatsApp send → `@pytest.mark.live_send`, skipped unless `RUN_LIVE_SEND=1`; sends to owner phone only | |
| V23 (no audio option) | ✅ Playwright | Template Builder → header dropdown options exactly `[none, text, image, video, document]` | |
| V24 (3 send-paths media) | ✅ pytest static | source grep for `media_url=_media_url` at 3 campaign sites | |
| V25 (event fallback) | ⛔ live-gated | same `live_send` marker | |
| V26 (cross-tenant clone) | ⛔ deferred | no clone endpoint exists — stays a P2 backlog item | |
| V-B2-1…4, V-B2-10 | ✅ pytest | stats keys / `status_note` filter / export parity / enrichment / G5 row shape — synthetic rows + curl-level asserts | |
| V-B2-5…7 | ✅ Playwright | chip toggle, "Not Sent" badge, wizard block + disabled Next | |
| V-B3-2…5, V-B3-10/11 | ✅ pytest | chunk-flow error cases + assembly + resend regressions (V-B3-5 needs the Meta-creds test tenant) | |
| V-B3-6/7 | ✅ Playwright | progress bar, re-upload modal | |

**Coverage outcome**: 100% of automatable V-items automated; 3 items live-send-gated (owner-triggered); 1 deferred (V26).

### 1.3 Gaps this batch must close

| ID | Gap | Severity |
|---|---|---|
| GAP-B4-1 | CR-036's 40+ verification points are all manual today — every future batch risks silent regression of B.1/B.2/B.3 behaviour | MAJOR |
| GAP-B4-2 | No UI automation exists at all in the repo — V19/V23-class checks can't be re-run cheaply | MAJOR |
| GAP-B4-3 | No safe convention for tests that would send real WhatsApp messages | MINOR |

### 1.4 Engineering decisions (owner may veto)

| ID | Decision | Rationale |
|---|---|---|
| D-B4-1 | **Playwright for Python** (`pip install playwright && playwright install chromium`) in the backend venv — UI specs live beside pytest in `tests/e2e/`, one runner (`pytest`) for everything | Single toolchain; house tests are already Python; avoids adding a JS test runner to the frontend build |
| D-B4-2 | One shared `tests/cr036_helpers.py` (NOT `conftest.py`): env/URL loading, login (`owner@18march.com` creds from `test_credentials.md`), `seed_template()/seed_log_row()` factories with a `cr036test_` name prefix, `cleanup(ids)` teardown | Keeps the established self-contained-file convention while de-duplicating seeding across 2 suites |
| D-B4-3 | Live-send tests marked `@pytest.mark.live_send`, skipped unless `RUN_LIVE_SEND=1` env is set; they send ONLY to the owner-supplied phone number | Real messages cost money and ping real phones — never in a default run |
| D-B4-4 | All synthetic Mongo rows carry `{"cr036_test_marker": True}` in addition to uuid ids; module teardown deletes by marker | Belt-and-braces cleanup on live prod DB even if an assert dies mid-test |
| D-B4-5 | Playwright runs headless against the live preview URL with the real login (no seeded auth bypass); UI seeds via direct Mongo insert then page reload | Matches how V19 was specified in B.1 §6 |

### 1.5 Files WILL change / be created

| File | Type |
|---|---|
| `backend/tests/cr036_helpers.py` | NEW — shared seeding/login/cleanup helpers |
| `backend/tests/test_cr036_batch_b_api.py` | NEW — pytest: V15-18, V20*, V21, V24, V-B2-1…4/10, V-B3-2…5/10/11, live-gated V22/V25 |
| `backend/tests/e2e/__init__.py` + `backend/tests/e2e/test_cr036_batch_b_ui.py` | NEW — Playwright: V19, V23, V-B2-5…7, V-B3-6/7 |
| `backend/requirements.txt` | `playwright` added via pip freeze |
| `backend/pytest.ini` (or `pyproject` section) | NEW — register `live_send` marker (kills warnings) |
| `memory/RUNBOOK.md` | EDIT — "how to run the CR-036 suites" section |

### 1.6 Files WILL NOT change

**No application code.** `routers/*`, `core/*`, all frontend pages/components untouched. If a test exposes a product bug, it gets registered as its own fix item — not silently patched inside B.4.

### 1.7 Blast radius / risks

- Prod-DB safety: only marker-tagged synthetic rows are written/deleted (D-B4-4). No real template, campaign, or log row is mutated. V18's campaign send is safe because the G5 gate returns before any AuthKey call — this exact property is what V18 proves.
- `playwright install chromium` downloads ~150 MB into the pod — one-time; if the pod image blocks it, fallback is documented: keep V19/V23/V-B2-5…7 as testing-agent/manual checks and land the pytest suite alone (owner informed at run time).
- Suites must run `-n 0` (serial) like all house suites — documented in RUNBOOK.

### 1.8 Open questions for owner

| Q | Question | Options |
|---|---|---|
| **Q22** | Install Playwright (+ ~150 MB chromium) in the pod for UI automation? | (a) yes · (b) pytest-only, UI checks stay manual/testing-agent |
| **Q23** | Live-send tests (V22/V25/V-B3-9): which phone number should receive them, and run them this session or leave `RUN_LIVE_SEND=1` for owner to trigger? | (a) owner runs later · (b) run once now with owner's number |

---

## 2 · Implementation Plan (step-by-step)

**S-B4-1 · Provision** — `pip install playwright && playwright install chromium` → `pip freeze > requirements.txt`. Create `pytest.ini` with `markers = live_send: sends real WhatsApp messages`.

**S-B4-2 · `cr036_helpers.py`** — `load_urls()`, `login() -> token`, `auth_headers(token)`, `db()` (pymongo), `seed_custom_template(**overrides)`, `seed_log_row(**overrides)`, `seed_campaign_with_customer()`, `cleanup_marker_rows()` — every seed sets `cr036_test_marker: True` and `template_name`/`campaign name` prefix `cr036test_`.

**S-B4-3 · `test_cr036_batch_b_api.py`** — classes in dependency order:
- `TestResolver` (V15/16/17 — direct import + monkeypatch)
- `TestStaticContracts` (V20 source-scan, V24 grep of `campaigns.py`)
- `TestQ16ApprovedTemplate` (V21 both branches)
- `TestG5FailLoud` (V18: seed → send → assert log row shape incl. V-B2-10 `id`/`customer_name`/`template_name` keys)
- `TestMessageStatusApi` (V-B2-1 stats keys · V-B2-2 `status_note` filter + no-param parity · V-B2-3 export row-count parity · V-B2-4 authkey-templates enrichment keys)
- `TestChunkedUpload` (V-B3-2/3/4 error paths; V-B3-5 full 6 MB happy path — auto-skips if tenant lacks Meta creds)
- `TestResendMediaRecheck` (V-B3-10/11; V-B3-9 under `live_send`)
- `TestLiveSends` (`@pytest.mark.live_send`: V22, V25)
Module teardown: `cleanup_marker_rows()`.

**S-B4-4 · `tests/e2e/test_cr036_batch_b_ui.py`** — Playwright sync API, module-scoped logged-in `page` fixture:
- V19: seed reupload template → `/templates` → banner + per-row button → (B.3) button opens `media-reupload-modal`, not a navigation
- V23: Template Builder header dropdown option set
- V-B2-5: chip hidden at 0 → seed `media_missing` row → visible with count → click filters → click clears
- V-B2-6: amber "Not Sent" badge + reason text on seeded failed row
- V-B2-7: wizard with blocked template → "• media required" suffix + `campaign-media-block` banner + Next disabled
- V-B3-6/7: progress bar appears on a generated 5 MB file; modal PUT decrements banner count
Teardown: `cleanup_marker_rows()`.

**S-B4-5 · Execute & fix** — `cd /app/backend && pytest tests/test_cr036_batch_b_api.py -n 0 -v` then `pytest tests/e2e -n 0 -v`. Product bugs found → registered separately, tests xfail-linked until fixed.

**S-B4-6 · RUNBOOK entry** — commands, `RUN_LIVE_SEND` contract, marker-cleanup one-liner:
`db.getSiblingDB('mygenie').getCollectionNames().forEach(...)` scoped delete of `cr036_test_marker` rows.

---

## 3 · Acceptance criteria

| # | Criterion |
|---|---|
| A1 | Default `pytest -n 0` run: all non-live tests pass, `live_send` reported as skipped |
| A2 | Zero residual `cr036_test_marker` rows in any collection after a run |
| A3 | Playwright suite passes headless against the preview URL with real login |
| A4 | Re-running the full suite twice back-to-back passes (idempotent seeding) |
| A5 | RUNBOOK documents both suites + live-send procedure |

## 4 · Effort

| Step | Effort |
|---|---|
| S-B4-1 provision | ~15 min |
| S-B4-2 helpers | ~30 min |
| S-B4-3 API suite | ~1.5 h |
| S-B4-4 UI suite | ~1.25 h |
| S-B4-5/6 run+fix+doc | ~30 min |
| **Total** | **~4 h** |

## 5 · Sequencing dependency

B.4 tests assert B.2 and B.3 behaviour — **implement after B.2 and B.3 ship** (or trim the matching test classes if owner reorders). V15-V24 subset could land any time (B.1 is already shipped).

## 6 · DO NOT (this batch)

- Do NOT change any application code (test-only batch)
- Do NOT write any non-marker row to production collections
- Do NOT run `live_send` tests without `RUN_LIVE_SEND=1` + owner's phone number
- Do NOT use `conftest.py` (house convention: self-contained files + explicit helper import)
- Do NOT run suites with xdist parallelism (`-n 0` only)

---

*End of CR-036 Batch B.4 plan — awaiting owner approval (Q22, Q23) to open the Implementation gate.*
