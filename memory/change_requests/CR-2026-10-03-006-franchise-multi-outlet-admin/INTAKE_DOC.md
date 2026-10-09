# INTAKE DOC — CR-2026-10-03-006

## Item Identity

| Field | Value |
|-------|-------|
| **CR ID** | CR-2026-10-03-006 |
| **Title** | Franchise support — an admin who manages several outlets must be able to choose which one they are administering |
| **Classification** | CR — FEATURE (multi-tenant admin), carrying a latent-bug fix |
| **Date Registered** | 2026-10-03 |
| **Reported By** | POS answer to **P4.2** (2026-10-03): *"yes it can hold — for franchise"*. Split out of CR-2026-09-15-004 by **owner decision 2026-10-03**: *"Separate CR — get single-outlet POS login working first, franchises later"* |
| **Severity** | **P2** — no franchise admin is known to be affected today, but the behaviour is silent and wrong when it happens |
| **Risk** | **CRITICAL by area** — admin authentication + every per-restaurant admin write. Touches the token, the admin shell and config save |
| **Status** | 📝 REGISTERED (Role 1 done) — **BLOCKED on POS multi-entry response shape (contract O-13)** |
| **Parent** | CR-2026-09-15-004 (must land first — this builds on POS-direct login) |
| **Blast radius** | **LARGE** — admin auth, admin layout, config context, and anything keyed by `restaurant_id` |

## 1. Problem

POS's `restaurants[]` array can contain **more than one outlet** for a franchise operator. Nothing
in our stack expects that.

| Layer | Behaviour today | Evidence |
|---|---|---|
| Our admin login | reads **one** `users` row and returns **one** `restaurant_id`; the token is minted from `user["id"]` alone, with no outlet dimension | `server.py:587-626`, token at `:613` |
| CRM's admin login | silently takes `restaurants[0]` | CRM INV-022 C1 |
| Our config store | `customer_app_config` is keyed **per `restaurant_id`** — one document per outlet (13 in UAT) | `server.py` config routes |
| Our admin UI | assumes a single restaurant for the whole session — no outlet in the header, no switcher | `AdminLayout.jsx`, `AdminConfigContext.jsx` |

**Consequence:** a franchise admin managing three outlets signs in and silently administers
whichever outlet POS happens to return first. They get no indication the other two exist, and no
way to reach them. Worse than a missing feature — **they may believe they are editing outlet B's
settings while actually editing outlet A's.**

Note this is a **latent** bug: it predates the POS-direct login work, because `users` already
carries one `restaurant_id` per row. Moving to POS-direct login does not cause it — it simply makes
the multi-outlet reality visible for the first time.

## 2. Scope

**IN**
- **Outlet selection after login** when `restaurants[]` has more than one entry: a picker, with a
  single-outlet admin seeing no change at all (straight through, exactly as today).
- A **"currently selected outlet"** concept that survives navigation, and a decision on whether it
  survives across sessions (cookie/localStorage vs re-pick each login).
- **Visible outlet context** in the admin shell, so it is always obvious which outlet is being
  edited — the mitigation for the "edited the wrong outlet" failure above.
- An **outlet switcher** that re-points every per-restaurant operation: config load/save, QR
  generation, visibility toggles, dietary tags.
- Threading the selected outlet through `AdminConfigContext` so `PUT /api/config/` writes to the
  right document. **Note:** `saveConfig` currently PUTs the entire ~106-key config object
  (`AdminConfigContext.jsx:226-241`), so a stale selected-outlet value would write one outlet's
  whole config over another's. This is the single most dangerous part of the CR.

**OUT**
- **POS-direct admin login itself** → CR-2026-09-15-004. That CR stays **single-outlet** and keeps
  the `restaurants[0]` behaviour as an explicit interim (see §3).
- The `users` projection → CR-2026-10-03-002.
- Any change to how CRM handles multi-outlet — their `restaurants[0]` choice is theirs.
- Customer-facing flows. A diner scans one QR for one outlet; nothing here touches them.
- Franchise-level *reporting* or cross-outlet aggregation — not requested, explicitly not in scope.

**GREY ZONE (Planning decides)**
- Whether an outlet's identity belongs **in the token** (safer, requires re-issuing the token on
  switch) or in **client state** (simpler, but the backend must then validate the admin owns the
  outlet on **every** request — otherwise it becomes an authorisation hole).
- Whether a "head office" or "primary" outlet concept exists — depends on POS's response shape.

## 3. Relationship to CR-2026-09-15-004 (read before planning either)

Owner has split them. To keep that split safe:

- CR-2026-09-15-004 ships **single-outlet**, taking `restaurants[0]` — **identical to both our
  current behaviour and CRM's**, so it introduces **no regression**.
- That interim must be **recorded in code and in the CR**, not left as an accident, so the next
  reader knows `restaurants[0]` is a deliberate placeholder with a CR behind it.
- **Acceptance criterion for CR-004 (added):** if `restaurants[]` has more than one entry, the
  backend **logs a warning** naming the outlets it is ignoring. That turns this from an invisible
  problem into a detectable one while this CR waits, and tells us whether any real franchise admin
  exists today.

## 4. Duplicate check

| Item | Relationship | Verdict |
|---|---|---|
| CR-2026-09-15-004 | parent; shares `server.py` auth and the same POS profile response | **DISTINCT by owner decision** — sequence strictly after it |
| CR-2026-09-12-009 (`pos_id` / `+91` hardcoding) | also concerns hardcoded single-tenant assumptions in the same area | RELATED — worth reading together at Planning |
| CR-2026-10-03-002 | same two functions, different concern (projection) | RELATED — tiny, lands first |

## 5. Code exists? **NONE.** No outlet concept exists anywhere in the admin stack.

## 6. Files (expected)

| Likely to change | Will NOT touch |
|---|---|
| `backend/server.py` (auth + per-restaurant route guards) · `frontend/src/context/AdminConfigContext.jsx` · `frontend/src/layouts/AdminLayout.jsx` · `frontend/src/context/AuthContext.jsx` · a new outlet-picker component | any customer-facing page · `CartContext` · order payload · CRM-owned collections |

## 7. Acceptance criteria

1. A **single-outlet** admin sees **no change whatsoever** — no picker, no extra click. This is the criterion that protects the 13 existing tenants.
2. A **multi-outlet** admin is asked which outlet to administer, and the choice is obvious and reversible.
3. The selected outlet is **visible at all times** in the admin shell.
4. Config save writes to the **selected** outlet's document and to no other — verified by reading both documents before and after a save.
5. Switching outlet re-loads config, QR and visibility for the new outlet with no stale data from the previous one.
6. A direct request for an outlet the admin does **not** own is **rejected by the backend**, not merely hidden in the UI.
7. No regression to admin login, `/api/auth/me`, config save or QR generation for the existing single-outlet tenants.
8. `yarn build` clean (no `CI=true`).

## 8. Prerequisites / blockers
1. **POS multi-entry response shape** (contract **O-13**) — is an entry just `{id, name}`? Is there a primary/head-office flag? Can an entry be inactive? **Owner is waiting for POS to come back; not being chased.**
2. **CR-2026-09-15-004 must land first** — this builds on POS-direct login.
3. Owner decision on the picker UX and on whether the selection persists across sessions.
4. Whether any **real** franchise admin exists today — the warning log added to CR-004 (§3) will answer this.

```text
Intake complete: CR-2026-10-03-006
Classification: CR — FEATURE (multi-tenant admin) with a latent-bug fix
Severity: P2
Risk: CRITICAL (admin auth + every per-restaurant write)
Duplicate check: DISTINCT (split from CR-2026-09-15-004 by owner decision 2026-10-03)
Evidence: captured (POS P4.2 answer; server.py:587-626,613; AdminConfigContext.jsx:226-241; config keyed per restaurant_id)
Blast radius: LARGE
Docs updated: this file, ../README.md, ../../PRD.md, ../CR-2026-09-15-004-admin-login-users-table-dependency/INTAKE_DOC.md
Next: BLOCKED — POS response shape (O-13) → CR-2026-09-15-004 ships → Planning
```
