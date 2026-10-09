# Smoke Test Brief — CR-2026-09-15-001

<div class="meta">MyGenie Customer App · Change: "Profile Orders, Points and Wallet tabs now load correctly" · QA status: PASS 7/8 (2026-10-08) · Tester: ____________ · Date: ____________</div>

## What this is about

The **Profile page** (tap ☰ → Profile after signing in) has four tabs — Profile, Orders, Points, and Wallet. The last three were completely broken for every diner: tapping **Orders**, **Points**, or **Wallet** showed a "Failed to load" error and an empty list instead of real data.

The cause was simple: the app was requesting data from old CRM addresses (API routes) that no longer exist. The CRM had moved to new addresses, and the app had not been updated to match.

## What the fix covers

**1. Orders tab now works**
Fetches from the correct CRM route. Order type codes are mapped to readable labels — "Dine-in" instead of the raw `dinein`, "Takeaway" instead of `takeaway`, and so on.

**2. Points tab now works**
Fetches from the correct CRM route. A sign bug was also fixed: "Bonus reward" transactions (e.g. a first-visit welcome bonus) were incorrectly showing a `−` (negative) sign. They now correctly show `+`.

**3. Wallet tab now works**
Fetches from the correct CRM route. The tab now also only appears when the restaurant has the Wallet feature switched **on** in admin settings — it was always visible before, even when the feature was off.

**4. "Showing N of M orders" count**
If a diner has more than 50 orders on record, a small line tells them the list is not complete — e.g. "Showing 50 of 120 orders".

The header card (name, tier badge, total points, wallet balance summary) was already working and is completely unchanged.

> **What must NOT have changed:** signing in, browsing the menu, placing an order, feedback — everything outside the Profile page behaves exactly as before.

## Before you start

| You need | Notes |
|---|---|
| A signed-in diner session | Enter your phone on the restaurant's home page and tap Browse Menu to sign in first |
| Restaurant **689** (Kunafa Mahal) | Or any restaurant you have access to |
| The hamburger menu (☰) | Top-right corner of the landing page — tap it to find Profile |

## The test — 3 steps (about 10 minutes)

### Step 1 — Orders tab loads correctly

1. Sign in at the restaurant's home page (enter your phone, tap Browse Menu).
2. Tap ☰ → **Profile** (or navigate to `/profile`).
3. Tap the **Orders** tab.
4. **Expected:** your order history appears — date, amount, order type (e.g. "Dine-in"), points earned. **No "Failed to load" error toast.**
5. If you have no previous orders: **Expected:** "No orders yet" message — **no error toast**.

Result: ☐ PASS ☐ FAIL — notes: ______________________________

### Step 2 — Points tab signs are correct

1. Tap the **Points** tab.
2. **Expected:** your points history appears — transactions listed with `+` or `−` signs.
3. Check specifically: any **"First visit bonus"** or **"Bonus reward"** entry must show a **`+`** sign (not `−`). Expired or redeemed entries show `−`.
4. **No "Failed to load" error toast.**

Result: ☐ PASS ☐ FAIL — notes: ______________________________

### Step 3 — Wallet tab and nothing else broke

1. Look at the tab bar at the top of the Profile page.
2. **Expected for restaurant 689:** **no Wallet tab button** (Wallet is off by default).
3. Back on the home page: add an item to the cart and open Review Order. **Expected:** all as usual, no errors.

Result: ☐ PASS ☐ FAIL — notes: ______________________________

### Optional extra (2 minutes)

In admin settings for any restaurant, switch **Wallet** on. Reload the Profile page for that restaurant. **Expected:** a Wallet tab now appears. Switch it back off afterwards.

Result: ☐ PASS ☐ FAIL ☐ skipped

## Reporting

- All steps match → reply **"Smoke PASS CR-2026-09-15-001"**.
- Anything different → reply **"Smoke FAIL CR-2026-09-15-001 — step N"** with what you saw and a screenshot. Do not try to work around it.

<div class="box"><b>Overall:</b> ☐ PASS &nbsp; ☐ FAIL &nbsp;&nbsp; Signed: ______________________ &nbsp; Date: ____________</div>
