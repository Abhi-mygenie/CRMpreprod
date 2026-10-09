# Smoke Test Brief — CR-2026-10-03-004 (Parts A + B + C)

<div class="meta">MyGenie Customer App · Change: "CRM database back-door reads replaced with CRM API calls" · QA status: PASS — all parts · Tester: ____________ · Date: ____________</div>

## What this is about

Your app and CRM share a database. The app was reading some of CRM's data tables directly — bypassing CRM's official API. This CR closes that back door across three steps, each of which is tested below.

> **What must NOT have changed:** name auto-fill on the landing page, the Browse Menu flow, the checkout loyalty earn preview (numbers will be different — see Step 4), order placement, feedback — all core flows work identically to before.

## Before you start

| You need | Notes |
|---|---|
| Restaurant **689** | Loyalty is live here; used for Parts B and C |
| Restaurant **478** | Phone capture is enabled here; used for Part A |
| A test phone **9579504871** | Known customer on both restaurants |
| A browser in a fresh tab | |

---

## Part A — Landing page name auto-fill (2 steps, ~3 minutes)

*What changed: the name lookup now calls CRM's API instead of your backend reading CRM's database directly. The diner sees no difference.*

### Step 1 — Known phone auto-fills name

1. Open the restaurant **478** home page.
2. Tap the phone field and type **9579504871**.
3. Wait about 1 second (do not tap Browse Menu yet).
4. **Expected:** the Name field fills in automatically. No error toast.

Result: ☐ PASS ☐ FAIL — notes: ______________________________

### Step 2 — Unknown phone — silent, no error

1. Clear the phone field and type **9800000001** (not a known customer).
2. Wait 1 second.
3. **Expected:** Name field stays empty. No toast, no error message.

Result: ☐ PASS ☐ FAIL — notes: ______________________________

---

## Part B — Checkout loyalty preview (3 steps, ~5 minutes)

*What changed: loyalty earn rates and redemption values now come from CRM's API. Numbers will look different for non-Bronze diners — this is a correction, not a regression. Redemption caps from CRM are now enforced.*

### Step 3 — Earn preview loads from CRM

1. On restaurant **689**, add any items to cart and go to the checkout page.
2. Scroll to the loyalty section ("You will earn X points…" or "Earn rewards…").
3. **Expected:** the section appears. No error, no blank/broken layout.
4. Optional — open browser DevTools → Network tab → confirm a call to the CRM domain ending in `/scan/loyalty-rules/689`. There should be **no** call to `/api/loyalty-settings/689`.

Result: ☐ PASS ☐ FAIL — notes: ______________________________

### Step 4 — Redemption value is per tier

1. Log in as a **Gold** or **Silver** tier customer on restaurant **689**.
2. Go to checkout with items in cart. Look at the loyalty earn section ("You will earn X points — Worth ₹Y").
3. **Expected:** the "Worth ₹Y" figure is higher than it was before this change. A Gold diner should see roughly ₹3 per point, not ₹1 per point. The exact number depends on the cart value and CRM's current config.

> This is a **correction** — the old number was wrong (showing the flat rate for all tiers). The new number is the correct per-tier rate from CRM.

Result: ☐ PASS ☐ FAIL — notes: ______________________________

### Step 5 — Use Points button respects CRM cap

1. Log in as a customer with points on restaurant **689**.
2. Go to checkout and click **Use Points**.
3. **Expected:** the discount applied is at most ₹110 (restaurant 689's `max_redemption_amount` from CRM). If the customer has enough points to exceed ₹110, the discount still shows ₹110 — the excess points are not applied.
4. Also confirm: if the customer does not have enough points to meet the minimum threshold (`min_redemption_points`), the Use button does nothing.

Result: ☐ PASS ☐ FAIL — notes: ______________________________

---

## Part C — Checkout phone field no longer triggers name auto-fill (1 step, ~2 minutes)

*What changed: the checkout page used to silently look up a diner's points and tier when they typed their phone in the order form. That lookup is removed. Name still comes from the landing page as before.*

### Step 6 — Typing phone on checkout does not auto-fill name

1. On restaurant **689**, go to checkout **without** logging in.
2. If a name is already showing in the customer name field (pre-filled from the landing page), clear it manually.
3. Click into the phone field and type or edit a phone number.
4. **Expected:** the name field does **not** auto-fill. No points or tier information appears. No error toast.
5. Also confirm: the points/tier "Use Points" block in the price summary is **not visible** for a non-logged-in diner.

Result: ☐ PASS ☐ FAIL — notes: ______________________________

---

## Regression — order placement still works (1 step)

### Step 7 — Place an order end to end

1. On restaurant **689**, add items, fill in name and phone, and place an order (any payment method).
2. **Expected:** order completes successfully. Order success page loads. No errors at any step.

Result: ☐ PASS ☐ FAIL — notes: ______________________________

---

## Reporting

- All steps match → reply **"Smoke PASS CR-2026-10-03-004"**.
- Anything different → reply **"Smoke FAIL CR-2026-10-03-004 — step N"** with what you saw and a screenshot. Do not try to work around it.

<div class="box"><b>Overall:</b> ☐ PASS &nbsp; ☐ FAIL &nbsp;&nbsp; Signed: ______________________ &nbsp; Date: ____________</div>
