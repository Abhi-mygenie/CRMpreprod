# IMPACT ANALYSIS — CR-2026-10-04-002 (test-harness defects)

**Status:** ⚠️ **WRITTEN RETROACTIVELY** — see `/app/memory/GATE_RECONCILIATION_2026-10-04.md`
**Role:** Planning (Role 2) · **Severity:** P1 · **Risk:** LOW (test-only files)
**Verdict:** the change is correct and should stand; it alters **no application code**

---

## 1. Why this is P1 and not housekeeping

Owner decision **D-S2** is *"extend snapshots to all 44 routes first, then split the monolith in one
pass."* That strategy rests entirely on the suite being runnable and trustworthy. It was neither:

| # | Defect | Effect |
|---|---|---|
| D1 | `admin_jwt` logs in once per xdist worker; CR-2026-09-12-004 limits `/api/auth/login` to **5/min per IP** | two suite runs inside one minute → `assert 429 == 200` → **4 ERRORS**, every authenticated test dead |
| D2 | `testpaths = backend/tests` while `pytest.ini` lives *in* `backend/` (rootdir `/app/backend`) | `PytestConfigWarning: No files were found in testpaths`; pytest silently fell back to recursive discovery, so the setting was decorative |
| D3 | `pytest-asyncio` + `syrupy` pinned in `requirements.txt` but **absent from the pod** | `Missing required plugins`, then `ModuleNotFoundError: syrupy` — unrunnable until installed by hand |

D1 is the one that matters. The safety net failed **precisely when it is used most** — repeatedly,
during a refactor — and it was broken by a *sibling CR in its own wave*. Nobody re-ran the suite
after CR-2026-09-12-004 shipped, which is how a registry row reading *"✅ CLOSED — 22/22 PASS,
safety net live"* came to describe something that could not execute.

## 2. Blast radius

| | |
|---|---|
| Application code touched | **none** |
| Files | `backend/tests/conftest.py`, `backend/pytest.ini` |
| Worst case if wrong | the suite misreports; production behaviour cannot change |
| Reversibility | total |

## 3. Options considered

| # | Option | Verdict |
|---|---|---|
| A | Back off and retry while the response is 429 | **CHOSEN** — the suite runs against the app exactly as deployed, limiter included |
| B | Raise or disable the rate limit under a test env flag | **REJECTED** — the limiter is a shipped P0 control (CR-2026-09-12-004); a test suite that switches off the security control it is meant to protect is worthless, and it would add a prod-reachable bypass flag |
| C | Give each worker its own account | **REJECTED** — `users` is CRM-owned; creating accounts there violates contract §2 |
| D | Drop `-n 2` so only one login happens per run | **REJECTED** — halves speed and still breaks on two runs in a minute |

Option A's cost is honest and small: a run that collides with the window takes ~21 s longer.

## 4. Residual risk accepted

- A run started within 60 s of **four** prior runs can still exhaust 3 retries (63 s of waiting) and
  fail. Acceptable: the fix removes the common case, and a hard failure is correct if the limiter is
  genuinely saturated.
- `-n 2` means 2 logins per run, so the usable budget is ~2 runs/minute. If B1 (44-route snapshots)
  pushes authenticated tests much higher, revisit with a module-scoped token cache.

## 5. Coverage finding (not a defect — input to Track B)

Green but thin: **21 tests over ~16 of 44 routes.** Uncovered: `/check-customer`, `/set-password`,
`/verify-password`, `/profile` (GET+PUT), `/orders`, `/get-order-details/{id}`, `/points`, `/wallet`,
`/coupons`, `/feedback` (POST), `/banners` ×3, `/pages` ×3, `/non-qr-block`, 8 × `/docs/*` —
i.e. the money-and-identity surface. This is the evidence behind D-S2 and is tracked as sprint item
**B1**, not here.
