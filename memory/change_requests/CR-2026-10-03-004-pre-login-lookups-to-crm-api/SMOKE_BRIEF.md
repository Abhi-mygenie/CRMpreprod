# Smoke Test Brief — CR-2026-10-03-004 Part A

<div class="meta">MyGenie Customer App · Change: "Name auto-fill now fetches from CRM directly" · QA status: PASS — live UI verified 2026-10-08 · Tester: ____________ · Date: ____________</div>

## What this is about

When a diner opens the restaurant's home page and types their phone number, the app quietly checks whether that phone is a known customer. If it is, the diner's **name auto-fills** in the Name field — they don't have to type it themselves.

## What was wrong

To do that check, the app was asking **our own server**, which was then reading directly from the CRM's customer database through a back door. This was a boundary violation — we were reaching into CRM's data without going through CRM's official route.

## What the change does

The app now asks **CRM directly** using CRM's official lookup route. Our server no longer touches the CRM database for this step. The old back-door route on our server has been deleted.

The diner sees **no visible difference** — the name still auto-fills exactly as before. The change is entirely under the hood.

> **What must NOT have changed:** the name auto-fill behaviour, the Browse Menu flow, ordering, feedback — everything the diner sees works identically to before.

## Before you start

| You need | Notes |
|---|---|
| Restaurant **478** | Phone capture (name auto-fill) is enabled here |
| Test phone **9579504871** | A known customer — name should auto-fill |
| A browser | A fresh tab is fine |

## The test — 3 steps (about 5 minutes)

### Step 1 — Name auto-fills from phone

1. Open the restaurant 478 home page.
2. Tap the phone number field and type **9579504871**.
3. Wait about 1 second (do not tap Browse Menu yet).
4. **Expected:** the Name field fills in automatically — you should see a name appear. A brief **"Checking..."** message may flash below the fields while the lookup runs.
5. **No error toast** should appear at any point.

Result: ☐ PASS ☐ FAIL — notes: ______________________________

### Step 2 — Unknown phone — no fill, no error

1. Clear the phone field and type a phone number that is **not** a known customer (e.g. **9800000001**).
2. Wait 1 second.
3. **Expected:** name field stays empty. **No error toast.** App is silent — this is correct; it just means the phone is not yet a customer.

Result: ☐ PASS ☐ FAIL — notes: ______________________________

### Step 3 — Browse Menu still works

1. Re-enter phone **9579504871** and wait for the name to auto-fill.
2. Tap **Browse Menu**.
3. **Expected:** you land on the menu page. No errors, no stuck screens.

Result: ☐ PASS ☐ FAIL — notes: ______________________________

### Optional — Confirm old route is gone (technical check, 1 minute)

Open browser DevTools → Network tab → repeat Step 1. Confirm there is **no** network request to `/api/auth/check-customer`. The call should go to the CRM preprod domain instead.

Result: ☐ PASS ☐ FAIL ☐ skipped

## Reporting

- All steps match → reply **"Smoke PASS CR-2026-10-03-004"**.
- Anything different → reply **"Smoke FAIL CR-2026-10-03-004 — step N"** with what you saw and a screenshot. Do not try to work around it.

<div class="box"><b>Overall:</b> ☐ PASS &nbsp; ☐ FAIL &nbsp;&nbsp; Signed: ______________________ &nbsp; Date: ____________</div>
