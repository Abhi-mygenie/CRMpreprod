# CR-096 — Implementation Plan: `POST /scan/feedback` hybrid intake
**Date**: 2026-10-09 · **Role**: Planning Agent · **IA**: `planning/CR_096_IMPACT_ANALYSIS.md` (closed; case table A–G frozen) · **Risk**: MEDIUM (public write; never-create + limits) · **Target**: w/c 27 Oct · **Status**: ✅ OWNER APPROVED 2026-10-09 (Q5 yes · Q6 yes) — implementation gate opens on "choose implementation role"; order 094 → 096 · **No code changed.**

## 0. New finding during planning (pre-existing, blocks usability of 096)
`GET /api/feedback` (staff list, `routers/feedback.py:53`) builds `Feedback(**f)` where `models/schemas.py:1150-1151` declares `customer_name: str`, `customer_phone: str` (**required**). All 8 existing scan-sourced feedback docs have `customer_name: None` → the staff list **500s for tenants 478/672/762 today** (code-certain; r69 returns 200 only because it has no scan feedback). CR-096's unlinked/anonymous rows (no name, maybe no phone) would hit the same wall. → **Q5**: fold a 2-line schema fix into 096 (`customer_name: Optional[str] = None`, `customer_phone: Optional[str] = None` on `Feedback`) — recommended **yes**; otherwise register as BUG-031 and ship first.

## 1. Edits
**E1 — `routers/scan.py` schema** (`:95-98`)
```python
class FeedbackSubmit(BaseModel):
    rating: int
    message: Optional[str] = None            # cap 500 chars (E3)
    order_id: Optional[str] = None
    restaurant_id: Optional[str] = None      # CR-096: required when no token (short form "689")
    phone: Optional[str] = None              # CR-096: optional; canonical digits expected
    country_code: Optional[str] = "+91"      # CR-096 (CR-102 lesson)
```
**E2 — optional token dependency** (local to `scan.py`, ~8 lines): `optional_customer_token(credentials = Depends(optional_security))` → `None` if no header; if a header **is** present → call `verify_customer_token` semantics (raise **401** on expired/invalid — Q1). Reuses `optional_security` from `core.auth:16`.
**E3 — route** (`:691-718`) rewritten:
```
auth = Depends(optional_customer_token)
rating 1–5 else 400 (as today) · message = (message or "")[:500]
if auth:                       # case A
    rid, customer_id, phone, cc, src = auth.rid, auth.customer_id, auth.phone, "+91", "token"
else:
    if not data.restaurant_id: 422 "restaurant_id required when not logged in"
    rid = _normalize_restaurant_id(data.restaurant_id)
    if not users.find_one(id=rid): 404 "Restaurant not found"
    retry = ip bucket fb-ip 10/60s → 429                       # IP first (BUG-025 order)
    if data.phone:                                             # cases C/D/F/G
        phone, cc, st = normalize_phone(data.phone, data.country_code)
        if st == "invalid": 400 "Enter a valid mobile number"  # case F — nothing stored
        retry = phone bucket fb-ph:{rid}:{cc}{phone} 3/600s → 429
        cust = customers.find_one(phone_match(rid, phone, cc) + is_blocked≠True, {id,name})
        customer_id = cust.id if cust else None; src = "phone"  # C linked / D unlinked / G blocked→unlinked
    else:                                                      # case E
        phone = cc = None; customer_id = None; src = "none"
order_id, order_id_raw = (data.order_id, None)
if order_id and not orders.find_one({"id": order_id, "user_id": rid}): order_id, order_id_raw = None, data.order_id   # Q3
doc = {id, user_id: rid, customer_id, customer_name: cust.name|None, customer_phone: phone, country_code: cc,
       rating, message, order_id, order_id_raw, status:"pending", source:"scan_and_order",
       identity_source: src, linked: customer_id is not None, created_at}
feedback.insert_one(doc)
if customer_id: customers.update_one({id}, {$set last_rating, $inc feedback_count})   # unchanged side-effect
return _resp(True, "Feedback submitted", {feedback_id, linked})
```
Never inserts into `customers`. Blocked customers never linked.
**E4 — `models/schemas.py:1150-1151`** (Q5): `customer_name`/`customer_phone` → `Optional[str] = None` on `Feedback` (response model only; `FeedbackCreate` for the staff manual form unchanged).
**E5 — index** `server.py` startup block: `db.feedback.create_index([("user_id", 1), ("created_at", -1)])` (wrapped like the others).
**E6 — `tests/test_cr096_feedback.py`** (new, r689 + owner r69 for staff list): F-A token path linked, `feedback_count` +1 · F-B expired/garbage token → 401 · F-C no token + `9838777712` → linked to existing, no create · F-D no token + unknown valid phone → unlinked, phone stored, customers count unchanged · F-E no token, no phone → anonymous unlinked `identity_source:"none"` · F-F `0000000000` → 400, no doc · F-G blocked customer (temp flag on a test doc, restored) → unlinked · F-H `order_id:"nope"` → stored, `order_id:null`, `order_id_raw:"nope"` · F-I no token, no `restaurant_id` → 422 · F-J unknown rid → 404 · F-K limits: 11th/min per IP → 429; 4th/10 min per phone → 429 · F-L rating 0 / 6 → 400 · F-M staff `GET /api/feedback` (owner r69, after inserting an anonymous row for r69) → 200 and the row appears · F-ZZ cleanup all `feedback` rows created (by ids) + assert customers count unchanged.

## 2. Edit order
E6 (red) → E4 (schema, safe alone) → E5 (index) → E1 → E2 → E3 → run 096 suite → regression: `test_cr089_skip_otp.py`, `test_cr093_lookup.py` (shared limiter), `test_cr085a` A2/A3, staff feedback page screenshot (Playwright) → QA handover.

## 3. Verification → F-A…F-M + V-UI: CRM Feedback page lists anonymous row without crash (desktop + 390px) · V-DB: `customers` count equal; no doc with test phones created.
## 4. Files
**WILL change**: `backend/routers/scan.py` (schema + dep + route ≈ 70 lines), `backend/models/schemas.py` (2 lines, Q5), `backend/server.py` (1 index line), `backend/tests/test_cr096_feedback.py` (new). **WILL NOT touch**: `core/phone.py`, `core/auth.py`, `routers/feedback.py`, `routers/pos.py`, `FeedbackPage.jsx`, stored data.
## 5. Rollback: `git revert`; index harmless; feedback rows written meanwhile keep the new fields (additive).
## 6. Consumer note (ship-time): phone optional; canonical digits + `country_code`; `restaurant_id` short form required without token; 400 on invalid phone → show inline; 401 → re-run skip-otp; remove sign-in card. Contract v1.1 additive.
## 7. Risks
| Risk | Mitigation |
|---|---|
| spam on public write | IP 10/min + phone 3/10 min + 500-char cap + 404 unknown rid |
| identity leak via "linked:true" (phone enumeration) | response returns `linked` only — same information `lookup` already exposes publicly (`exists`); acceptable; **Q6** drop `linked` from response if owner prefers (recommend keep — app needs it to show "thanks, points history updated") |
| staff list 500 on null name/phone | E4 |

```
Planning complete: CR-096 · Stage: Implementation Plan · Risk: MEDIUM
Files WILL change: routers/scan.py · models/schemas.py (Feedback optional fields) · server.py (index) · tests/test_cr096_feedback.py
Files WILL NOT touch: core/phone.py · core/auth.py · routers/feedback.py · routers/pos.py · FeedbackPage.jsx · stored data
Owner decisions: Q5 fold Feedback-schema fix (recommend yes) · Q6 keep `linked` in response (recommend yes)
Next: Gate approval → Implementation (target w/c 27 Oct)
```
