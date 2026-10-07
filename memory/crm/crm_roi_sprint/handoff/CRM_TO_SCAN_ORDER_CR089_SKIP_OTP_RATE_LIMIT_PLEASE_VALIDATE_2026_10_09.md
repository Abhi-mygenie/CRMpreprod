# OUTBOUND DRAFT — CRM → Scan & Order agent — CR-089 `skip-otp` now rate-limited on preview, please validate — 2026-10-09
**Owner sends; agents never send.**

## What changed
`POST https://preprod-crm-app-1.preview.emergentagent.com/api/scan/auth/skip-otp` now has a speed limit. **Request, response and behaviour on success are unchanged** (find-or-create, 24 h token). One new outcome:

| Response | When |
|---|---|
| `429 {"detail":"Too many login attempts"}` + header `Retry-After: <seconds>` | more than **30 calls/min from one IP**, or more than **5 calls per 5 min for one phone+restaurant** |

Limits are **separate** from `lookup`'s — your normal `lookup → skip-otp` sequence costs 1 tick on each, never 2 on one.

## Why
`skip-otp` is now the only identity path and it creates a customer for every unknown phone; with no limit anyone could mass-create customers or probe the phone space. This is preventive — no abuse has been seen.

## What to validate
1. Normal landing flow still works: phone → (`lookup`) → `skip-otp` → `/auth/me`.
2. Handle 429 on `skip-otp` the same way you already handle it on `lookup`: back off for `Retry-After`, show a gentle "please try again in a moment".
3. Deliberately trip it once (6 quick `skip-otp` calls for one phone) and confirm your UI recovers after `Retry-After`.
4. Reply with evidence so we can close CR-089. Also still pending from you: evidence for CR-098 (register/login → 404) and CR-093 (`lookup` live).

```bash
BASE=https://preprod-crm-app-1.preview.emergentagent.com
for i in 1 2 3 4 5 6; do curl -s -o /dev/null -w '%{http_code}\n' -X POST $BASE/api/scan/auth/skip-otp -H 'Content-Type: application/json' -d '{"phone":"<an existing phone>","restaurant_id":"689"}'; done   # 200 ×5 then 429
```
