# POS reply — round 1 · validated
## Ref: INV-2026-09-15-002 · `MESSAGE_TO_POS_2026-10-03.md` · Answers received 2026-10-03
## Verdict: **2 answers accepted · 2 parked by POS · 1 answer that is not an answer · 1 new scope-widening fact**

---

## 1. Row by row

| # | POS answer | What it means | Status |
|---|---|---|---|
| **P1** | **"no, (b)"** — POS does **not** read `pos_event_logs` | **The decisive answer of this whole thread.** CRM is write-only (3 writes / 0 reads, their own file:line). We never touch it. POS does not read it. → **No component anywhere reads this collection.** Every Call Waiter / Pay Bill row ever written is unread. The feature is dead end-to-end, exactly as suspected | ✅ **ANSWERED** — and it triggers contract amendment **A-1** |
| **P2** | "park it as is, will get back" | Direction (CRM-pushes vs move-to-POS) deferred by POS | 🅿️ **PARKED by POS** |
| **P3** | "feature is not live, park it as is" | Confirms Pay Bill is not a live POS feature; no payment semantics to settle yet | 🅿️ **PARKED by POS**. Contract clause **§3 I6** stays as the reserved definition |
| **P4.1** | "ok" | ⚠️ **This acknowledges the question, it does not answer it.** We asked for the **exact path** and **response shape** of the post-login profile endpoint. We have neither | ❌ **STILL OPEN** → contract **O-14** |
| **P4.2** | "yes it can hold — for franchise; will need to check response shape for that" | **New fact, and it widens scope.** `restaurants[]` can carry multiple outlets. Shape for the multi-entry case still to come | ⚠️ **PARTLY ANSWERED** → contract **O-13** |
| **P4.3** | "walk me through" | Owner wants the rationale explained before answering. Done in §4 below | 📖 **EXPLAINED, awaiting answer** |

---

## 2. P1 = (b) — the consequence, and why it needs an amendment

Frozen **§2d** annotates `pos_event_logs` as *"consumer = **POS** — required"*. POS has now stated
it does not read the collection. So the annotation in a **signed, frozen** section is factually
wrong.

**We are not editing it.** §2 is inside frozen Part 1, and clause **§8 C1** requires written
agreement from both teams plus a version bump for any §2 change. Raised instead as contract
item **A-1**, with proposed v1.1 text:

> *owner = CRM (sole writer) · consumer = **NONE** as at 2026-10-03 · POS has confirmed it does not
> read this collection · the events are unconsumed; a consumer must be designated before any
> producer is wired.*

Ownership does **not** change — CRM remains the sole writer. Only the consumer annotation moves.
This is the first real exercise of the change-control process the contract exists for, and it is
worth doing properly rather than quietly correcting a line.

**Effect on `CR-2026-10-03-005`:** the bug is confirmed as *"buttons that can never work in the
current architecture"* rather than *"buttons not yet wired"*. With P2 and P3 both parked by POS and
the feature not live, the CR moves to **PARKED** — correctly, and now with evidence rather than
assumption. The one thing still worth doing independently is the parked 672 config flag, since a
dead button is dead regardless of who owns the design.

---

## 3. P4.2 — franchise multi-outlet is a real scope change

| Layer | What it does today |
|---|---|
| Our admin login | `server.py:587-626` reads **one** `users` row and returns **one** `restaurant_id`; the token is minted from `user["id"]` alone (`:613`) |
| CRM | silently takes `restaurants[0]` |
| Our config store | `customer_app_config` is keyed **per `restaurant_id`** — one document per outlet (13 in UAT) |

So a franchise admin with three outlets currently lands on whichever outlet is first in the array,
with no indication that the other two exist. CRM inherited the same behaviour.

**This materially widens `CR-2026-09-15-004`** (POS-direct admin login). It is no longer "swap the
identity source"; it needs:
1. an **outlet picker** after login when `restaurants[]` has more than one entry;
2. a notion of **currently-selected outlet** threaded through every admin operation — config save,
   QR generation, visibility toggles — because each one is per-restaurant;
3. a decision on whether the selected outlet is remembered across sessions.

**Still needed from POS:** the response shape for the multi-entry case (are entries
`{id, name}` only? is there a flag for primary/head office? can an entry be inactive?).
Tracked as **O-13**. Noted in the CR so planning does not start from the single-outlet assumption.

---

## 4. P4.3 — walk-through: why we asked about rate limit and token lifetime

The short version: **we call POS's login on every single admin login already, and we are about to
depend on it much more heavily.**

### What happens today
`server.py:609` → `refresh_pos_token(email, password)` → `POST {MYGENIE_API_URL}/auth/vendoremployee/login`
with the admin's real email and password, on **every** admin login. The returned token is handed to
the frontend and kept in `localStorage` for admin operations such as QR generation
(`server.py:896-903` reads it back as the `X-POS-Token` header). It is **not** stored in our
database — so there is no cache, and no refresh path other than logging in again.

### What changes after CR-2026-09-15-004
POS stops being a side-call and becomes **the** identity provider: every admin login becomes a POS
login, plus a profile call. Hence three concrete worries:

| # | Worry | Why it matters to you |
|---|---|---|
| **1 — rate limit** | If POS throttles `vendoremployee/login` per account or per IP, then all of our admin traffic arriving from **one server IP** could trip a per-IP limit. Today that would look to you like our backend hammering your login endpoint; to us it would look like admins randomly unable to sign in | We need to know the limit so we can stay under it, and so you do not see unexplained bursts from us |
| **2 — token lifetime** | We hold the POS token in `localStorage` with **no expiry handling**. If it is short-lived, admins get silent failures mid-session — QR generation stops working with no clear reason, because the token expired and nothing refreshes it. If it is long-lived, that is a different conversation: a long-lived credential in browser storage | Tells us whether we must build a refresh path now, and whether `localStorage` is acceptable |
| **3 — no refresh endpoint** | We currently re-obtain the token only by re-sending the password. If you have a refresh endpoint, we would much rather use it than keep the password in play | Avoids us re-authenticating with raw credentials more often than necessary |

**What a complete answer looks like:** "login is limited to *N* attempts per *window* per
account/IP; the token is valid for *X* hours; refresh via *this endpoint* (or: no refresh, log in
again)." Three lines is plenty.

**Why it is P4 and not urgent:** nothing is broken today — admin logins are infrequent enough that
we have not hit a limit. It becomes important the moment POS is the only identity path, because
then a rate limit or a short token stops being an inconvenience and starts being an outage.

---

## 5. Net position after this reply

| Thread | Before | After |
|---|---|---|
| `pos_event_logs` consumer | unknown | ✅ **nobody.** Confirmed write-only estate-wide → amendment **A-1** |
| Call Waiter / Pay Bill (CR-2026-10-03-005) | blocked on POS | 🅿️ **PARKED** — POS parked both the direction (P2) and the semantics (P3); feature not live |
| Admin login (CR-2026-09-15-004) | blocked on one unknown (P5) | still blocked, and now **wider**: profile shape **O-14**, franchise multi-outlet **O-13**, plus the F3 approval |
| Ownership map freeze | blocked on POS | **still blocked** — O-13/O-14 outstanding, though the `pos_event_logs` row itself is now settled |

```text
Validation complete: POS reply round 1
Accepted: P1 (=b, decisive) · P4.2 (partial, new fact)
Parked by POS: P2 (direction) · P3 (Pay Bill semantics — feature not live)
Not answered: P4.1 — "ok" acknowledged the question; exact path + response shape still needed (O-14)
Explained, awaiting answer: P4.3 (rate limit / token lifetime / refresh) — §4 above
New contract items: A-1 (frozen §2d amendment, needs CRM agreement + v1.1) · O-13 (franchise multi-outlet) · O-14 (profile shape)
Frozen Part 1: NOT edited. A-1 goes through §8 change control
Next: ask POS for the two shapes · raise A-1 with CRM · CR-2026-10-03-005 → PARKED
```
