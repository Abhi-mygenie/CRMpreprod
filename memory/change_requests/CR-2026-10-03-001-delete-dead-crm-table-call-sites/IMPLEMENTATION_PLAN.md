# IMPLEMENTATION PLAN — CR-2026-10-03-001
## Delete the dead CRM-table call sites in `server.py`

**Written by:** Role 2 — Planning Agent · **Date:** 2026-10-09 · **Risk:** HIGH by file · **No Fast Lane — owner Gate 3 required**
**Owner rulings 2026-10-09: D1 = (a) delete · D2 = (a) trim · D3 = (a) backend-only.** The alternative branches below are retained for the record only; they do not apply.
Role 3 locates every edit by **function / class name**, never by line number.

---

## Pre-flight (Role 3, before any edit)

```bash
cd /app
grep -rn "api/customer/\|set-password\"\|verify-password\|/api/auth/login" frontend/src --include=*.js --include=*.jsx | grep -v __tests__ | grep -v testIds
# Expected: only Login.jsx (admin), AuthContext.jsx L41 (/me) + L146 (dead login()), PasswordSetup.jsx (UI-state string). Anything else → STOP.
grep -c "db\.customers\|db\.orders\b\|db\.points_transactions\|db\.wallet_transactions\|db\.coupons" backend/server.py   # expect 13 + 1 (customer-lookup) = 14
pytest -m smoke -n 0 backend/tests/smoke/test_auth_flows.py backend/tests/smoke/test_cr_2026_10_03_002.py -q   # baseline green
```

---

## Edits — `backend/server.py` (single file, applied top-down)

| ID | Target (by name) | Action |
|---|---|---|
| **E1** | `customer_router = APIRouter(prefix="/customer", …)` | delete the line |
| **E2** | `class LoginRequest` | delete fields `restaurant_id`, `pos_id` (D2) |
| **E3** | `class LoginResponse` | delete field `restaurant_context`; fix comment `# "restaurant"` (D2) |
| **E4** | `class CustomerProfile`, `class OrderSummary`, `class PointsTransaction` | delete all three |
| **E5** | `class SetPasswordRequest`, `class VerifyPasswordRequest`, `class ResetPasswordRequest` | delete all three (`ResetPasswordRequest` is a pre-existing orphan from CR-2026-10-07-002) |
| **E6** | `get_current_user` | replace the `if user_type == "customer": … else:` with the single `db.users` read (keep the `# CR-2026-10-03-002` comment) |
| **E7** | `unified_login` | delete Step 1 block from `# Build user_id for restaurant-scoped customer lookup` through the customer `return LoginResponse(…)`; keep `identifier = …`; update docstring to "Restaurant admin login"; renumber `# Step 2` → `# Step 1`, `# Step 3` → `# Step 2` |
| **E8** | `set_password`, `verify_customer_password` | delete both functions incl. decorators |
| **E9** | `# Customer Routes` header + `get_customer_profile`, `get_customer_orders` | delete |
| **E10** | `get_customer_points`, `get_customer_wallet`, `get_customer_coupons`, `update_customer_profile` | delete (they sit after `get_table_config`) |
| **E11** | `api_router.include_router(customer_router)` | delete the line |

**If D1 = (b) quarantine instead:** E6–E11 become comment-out with a leading `# CR-2026-10-03-001:` marker on each line; E1–E5 are skipped (models must stay importable). Registry `code_markers: true`.
**If D2 = (b):** skip E2–E3.

## E12 — new smoke test `backend/tests/smoke/test_cr_2026_10_03_001.py`

Follows `test_cr_2026_10_03_003.py` pattern (`http_client`, `admin_jwt` fixtures, `pytestmark = pytest.mark.smoke`):

| Test | Assert |
|---|---|
| `test_set_password_gone` | `POST /api/auth/set-password` → 404/405 |
| `test_verify_password_gone` | `POST /api/auth/verify-password` → 404/405 |
| `test_customer_routes_gone` | `GET /api/customer/{profile,orders,points,wallet,coupons}` + `PUT /api/customer/profile` with admin JWT → 404/405 (not 403 — route must not exist) |
| `test_admin_login_still_restaurant` | `POST /api/auth/login` with UAT admin creds → 200, `user_type == "restaurant"`, `pos_token` key present, **no** `restaurant_context` key (D2) |
| `test_me_alive` | `GET /api/auth/me` with admin JWT → 200, `user_type == "restaurant"` |
| `test_live_crm_boundary_routes_untouched` | `GET /api/customer-lookup/478?phone=9579504871` → 200 · `GET /api/loyalty-settings/478` → 200 |
| `test_static_no_dead_touches` | read `server.py`: `db.customers` count == 1 · `db.orders`, `db.points_transactions`, `db.wallet_transactions`, `db.coupons` count == 0 · none of `CustomerProfile|OrderSummary|PointsTransaction|SetPasswordRequest|VerifyPasswordRequest|ResetPasswordRequest|customer_router` present |

## Post-edit verification (Role 3 self-test, all required)

```bash
cd /app/backend && python -c "import server" && echo IMPORT_OK
curl -s -o /dev/null -w "%{http_code}\n" "$(grep REACT_APP_BACKEND_URL ../frontend/.env | cut -d= -f2)/api/healthz"   # 200
cd /app && pytest -m smoke -n 0 backend/tests/smoke/ -q          # all green incl. new file
pytest -m contract -n 0 backend/tests/contracts/ -q               # snapshots unchanged
tail -n 50 /var/log/supervisor/backend.err.log | grep -i "error\|traceback" || echo LOG_CLEAN
```
Then **testing_agent (backend only)**: admin login + `/me`, deleted routes 404, `customer-lookup` + `loyalty-settings` 200, config GET/PUT for rid 689 with admin JWT, `/api/healthz`.

## Verification matrix

| Acceptance (intake §6) | Covered by |
|---|---|
| 1 grep returns only `customer-lookup` | E12 static test + pre/post grep count 14 → 1 |
| 2 `db.feedback` count = 0 (already done by CR-003) | E12 static test (assert 0) |
| 3 admin login, `/me`, config save unaffected | E12 + existing `test_auth_flows.py`, `test_cr_2026_10_03_002.py` + testing_agent config PUT |
| 4 customer flows unaffected | **owner smoke** (SMOKE_BRIEF) — landing → menu → cart → order → Profile tabs; no backend route in that path is touched |
| 5 backend starts clean, healthz 200, no NameError | import check + healthz + log tail |
| 6 no OUT route altered | E12 `test_live_crm_boundary_routes_untouched` + `git diff` review limited to the named functions |

## Rollback

Single file, removal only: `git checkout -- backend/server.py && rm backend/tests/smoke/test_cr_2026_10_03_001.py`, backend hot-reloads. No data migration, nothing to undo in Mongo.

## Sequencing

Lands **before** CR-2026-09-15-004 (which rewrites the admin branch of the same two functions). Independent of all CRM-blocked items.

## Smoke brief

Required (user-flow regression on a hotspot file) — 3 steps: admin login + Visibility page load · diner landing → menu → cart → Review Order · Profile Orders/Points tabs. Produced after QA PASS per §9.

```text
Planning complete: CR-2026-10-03-001
Stage: Implementation Plan
Code reality: FULL — removal only, 11 named edits + 1 new smoke test
Risk: HIGH by file (Part C hotspot) · LOW by behaviour · rollback = git checkout one file
Files WILL change: backend/server.py · backend/tests/smoke/test_cr_2026_10_03_001.py (new)
Files WILL NOT touch: frontend/* · .env · customer-lookup · loyalty-settings · db.users reads · contract snapshots
Owner decisions: D1 (a) · D2 (a) · D3 (a) — RULED 2026-10-09
Docs: memory/change_requests/CR-2026-10-03-001-delete-dead-crm-table-call-sites/IMPLEMENTATION_PLAN.md
Next: "Gate 3 accepted for CR-2026-10-03-001" → Role 3  (Gate 3 NOT yet open — owner explicitly held it 2026-10-09)
```

---

## Appendix A — Line-level edit map (pinned 2026-10-09)

Pinned to `backend/server.py` **1,741 lines · md5 `2aea049a46a0a794b18f0071d8ed3183`**. Role 3 pre-flight: `md5sum backend/server.py` — if it differs, re-derive ranges by the function names in the table before editing. Apply **bottom-up** so earlier ranges stay valid.

| ID | Lines (inclusive) | First line → last line (verbatim anchors) | Action | Net |
|---|---|---|---|---|
| E11 | 1590 | `api_router.include_router(customer_router)` | delete line | −1 |
| E10d | 909–930 | `@customer_router.put("/profile")` → blank after `return {"success": True, "user": updated}` | delete | −22 |
| E10c | 891–908 | `@customer_router.get("/coupons")` → blank after `return {"coupons": coupons}` | delete | −18 |
| E10b | 871–890 | `@customer_router.get("/wallet")` → blank after `}` | delete | −20 |
| E10a | 847–870 | `@customer_router.get("/points", response_model=List[PointsTransaction])` → blank after `) for t in transactions]` | delete | −24 |
| E9 | 670–717 | `# ============================================` / `# Customer Routes` header → blank after `) for o in orders]` (covers `get_customer_profile` 674–692 + `get_customer_orders` 694–716) | delete | −48 |
| E8b | 624–669 | `@auth_router.post("/verify-password")` → blank after closing `}` of return | delete | −46 |
| E8a | 553–623 | `@auth_router.post("/set-password")` → blank after closing `}` of else-return | delete | −71 |
| E7 | 434–497 | docstring L434–437 → **replace** with `"""Restaurant admin login (password)."""`; L438 `identifier = …` **keep**; L439–497 (`# Build user_id …` through blank after customer `return LoginResponse(…)`) **delete**; L498 `# Step 2: Check users collection` → `# Step 1: …`; L542 `# Step 3: Not found in either collection` → `# Step 2: Not found` | replace/delete | ≈ −61 |
| E6 | 357–360 | `    if user_type == "customer":` / `        user = await db.customers.find_one(...)` / `    else:` / `        user = await db.users.find_one(..., USERS_AUTH_PROJECTION)  # CR-2026-10-03-002` → single line `    user = await db.users.find_one({"id": user_id}, USERS_AUTH_PROJECTION)  # CR-2026-10-03-002` | replace 4→1 | −3 |
| E5 | 276–297 | `class SetPasswordRequest(BaseModel):` → blank after `pos_id: Optional[str] = "0001"` of `ResetPasswordRequest` (covers 276–282, 284–288, 290–296 + separators) | delete | −22 |
| E4 | 113–144 | `class CustomerProfile(BaseModel):` → blank after `balance_after: int = 0` (covers 113–125, 127–134, 136–143 + separators; L145 `class AppConfigUpdate` stays) | delete | −32 |
| E3 | 107, 111 | L107 `user_type: str  # "customer" or "restaurant"` → `user_type: str  # "restaurant"`; L111 `restaurant_context: Optional[dict] = None  # Restaurant info for customer` delete | edit + delete | −1 |
| E2 | 102–103 | `restaurant_id: Optional[str] = None  # From POS API response (e.g., "698")` / `pos_id: Optional[str] = "0001"  # Default MyGenie, …` | delete | −2 |
| E1 | 89 | `customer_router = APIRouter(prefix="/customer", tags=["Customer"])` | delete line | −1 |

**Expected result:** ≈ 1,741 − 372 ≈ **1,369 lines**. Post-edit static checks (E12 `test_static_no_dead_touches`) are the authority, not the arithmetic.

**Untouched anchors that must still be present verbatim after the edit** (Role 3 greps each):
`def verify_password(` · `async def refresh_pos_token(` · `@auth_router.get("/me")` · `@api_router.post("/pos/auth-token")` · `@api_router.get("/table-config")` · `@config_router.get("/{restaurant_id}")` · `@api_router.get("/loyalty-settings/{restaurant_id}")` · `@api_router.get("/customer-lookup/{restaurant_id}")` · `USERS_AUTH_PROJECTION` · `USERS_LOGIN_PROJECTION` · `api_router.include_router(auth_router)` · `api_router.include_router(config_router)`
