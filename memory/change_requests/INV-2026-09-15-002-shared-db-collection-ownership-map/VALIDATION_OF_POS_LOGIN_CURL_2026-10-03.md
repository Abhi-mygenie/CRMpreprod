# POS login curl — validated against both endpoints
## Ref: contract §7 O-14 · CR-2026-09-15-004 · Date: 2026-10-03 · Host: `preprod.mygenie.online/api/v1`
## Verdict: **Login works on BOTH paths. But it does NOT answer P4.1 — there is no restaurant data in the response. And one security finding.**

---

## 1. What was tested

The owner supplied a curl for `POST /auth/vendoremployee/common-login`. Our backend calls a
**different** path — `POST /auth/vendoremployee/login` (`server.py:425-437`, built from
`MYGENIE_API_URL = https://preprod.mygenie.online/api/v1`). Both were run with the same
owner-supplied credentials.

| Path | Status | Verdict |
|---|---|---|
| `/auth/vendoremployee/common-login` (owner's curl) | **200** | works |
| `/auth/vendoremployee/login` (**what our code calls**) | **200** | ✅ **works — no live bug.** This was the first thing worth checking: if POS had renamed `login` → `common-login`, `refresh_pos_token` would be silently returning `None` and admin QR generation would be broken |

## 2. Response shapes — they differ

| Field | `/login` (ours) | `/common-login` |
|---|---|---|
| `token` | ✅ 120-char opaque string | ✅ 120-char opaque string |
| `crm_token` | ✅ | ✅ |
| `firebase_token` | `null` | `null` |
| `first_login` | `"false"` (string, not bool) | `"false"` |
| role field | **`role_name`** (singular) + **`role`** array | **`role_names`** + **`permissions`** array (53 entries) |
| `zone_wise_topic` | `"zone_5_restaurant"` | same |
| `login_type` | — | `"employee"` |

`common-login` looks like the newer, richer variant: named permissions instead of a role array, plus
`login_type`. **For our purposes the difference is irrelevant** — `refresh_pos_token` reads only
`data.get("token")` (`server.py:441`), which both return. **No change needed on our side.**

**Question for POS (add to the next round):** which of the two is canonical, and is `/login`
deprecated? If `login` is on a path to removal, we want to migrate deliberately rather than
discover it through failing admin QR.

## 3. ⚠️ It does NOT answer P4.1 — there is no restaurant data in either response

Both responses contain **no `restaurants[]`, no restaurant id, and no restaurant name.** Full key
list from `/common-login`: `token`, `firebase_token`, `crm_token`, `first_login`, `role_names`,
`permissions`, `zone_wise_topic`, `login_type`. From `/login`: the same minus `permissions`/
`login_type`, plus `role`/`role_name`.

So this confirms rather than closes the gap:

- CRM reads `restaurants[0].id` and `name` from a **separate profile call** made *after* login.
- **We still do not have that endpoint's path or response shape.** Contract **O-14 remains open**,
  and `CR-2026-09-15-004` still cannot be planned.
- `zone_wise_topic: "zone_5_restaurant"` is tempting but is **not** a restaurant id — it is a
  messaging/zone topic. Do **not** parse a restaurant id out of it.

**What we still need from POS:** the exact path of the post-login profile call, and its response
shape — including the multi-entry franchise case (**O-13**).

## 4. 🔴 Security finding — a `dp_live_` credential returned from a preprod host

Both logins returned the **same** value:

```
crm_token: dp_live_...   (identical across both endpoints and both calls)
```

Two things concern me, in order:

1. **The `dp_live_` prefix on a preprod host.** Either the prefix is misleading, or **preprod is
   handing out a production CRM credential.** If the latter, anyone with preprod POS login
   credentials holds a live CRM key — and preprod credentials are, by nature, shared more freely
   than production ones.
2. **It is static, not a session token.** Identical across separate logins, so it is a stored
   per-restaurant API key rather than something minted per session. That makes it long-lived, and
   it almost certainly corresponds to the `api_key` field in CRM's `users` row — **exactly the
   secret class that `CR-2026-10-03-002` exists to stop loading into our process memory.** Which is
   a neat confirmation that the projection CR is pointed at a real secret, not a theoretical one.

**Recommended (owner's call, not registered as a CR):**
- Ask POS/CRM to confirm whether `dp_live_*` on preprod is genuinely a production key or merely
  badly named. One question, potentially significant answer.
- **This value has now been pasted into a chat and returned in two HTTP responses during testing.**
  If it is a live key, treat it as exposed and rotate it. I have deliberately **not** written the
  value into any memory document.

## 5. Credential handling for this test

The owner supplied a real POS account (`owner@18march.com`). Recorded in
`memory/test_credentials.md` under a POS preprod section so the testing agent does not have to ask
again. Note these are **third-party POS credentials on a shared preprod host**, not an account we
created or control — so they can be revoked without notice, and should not be assumed stable.

Separately, note our backend already holds a **different** POS service account in `backend/.env`
(`MYGENIE_POS_LOGIN_PHONE` / `MYGENIE_POS_LOGIN_PASSWORD`) used for QR and table operations. Two
distinct POS identities are in play; worth not conflating them when planning CR-2026-09-15-004.

```text
Validation complete: POS login curl
/auth/vendoremployee/login (ours): 200 OK — no live bug, refresh_pos_token still works
/auth/vendoremployee/common-login (owner's): 200 OK — newer variant, richer role/permission fields
Our parsing: reads only data["token"] — both paths satisfy it, NO code change needed
P4.1 / O-14: NOT answered — neither response contains restaurants[], id or name. Profile endpoint still unknown
New question for POS: which path is canonical, is /login deprecated?
Security finding: crm_token is a static `dp_live_`-prefixed key issued by a PREPROD host — confirm whether it is a production credential; if so, treat as exposed and rotate
Value not written to any memory doc
```
