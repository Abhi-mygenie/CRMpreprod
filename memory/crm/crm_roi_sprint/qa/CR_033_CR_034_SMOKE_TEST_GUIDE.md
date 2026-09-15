# CR-033 + CR-034 — Smoke Test Guide

> **Document**: CR_033_CR_034_SMOKE_TEST_GUIDE.md
> **Created**: 2026-07-01
> **For**: Owner / QA acceptance testing
> **App URL**: https://react-python-crm-4.preview.emergentagent.com
> **Test credentials**: owner@cafe103.com / Qplazm@10

---

## What was built

| CR | Feature | Summary |
|---|---|---|
| **CR-033** | Additional Audience Filters | 20 new filter dimensions in the Audience builder (was 7). Fixes 6 broken filters that were silently ignored (BUG-A). New grouped accordion UI. |
| **CR-034** | Customer Tag System | Free-form tags on customers. Add/remove tags inline. Tag-based audience filter. Auto-tagged 2 VIP customers on deploy. |

---

## How to start

1. Open https://react-python-crm-4.preview.emergentagent.com
2. Login with **owner@cafe103.com** / **Qplazm@10**
3. Run each test below. Mark ✅ Pass or ❌ Fail.

---

## CR-033 — Audience Filters

### T01 · New dialog UI

**Steps:**
1. Go to **Marketing → Audiences**
2. Click **Create Audience**

**Expected:**
- Dialog is wider (not cramped)
- Shows 5 collapsible colour-coded sections:
  - 🟠 Loyalty & Tier
  - 🔵 Dates & Occasions
  - 🟢 WhatsApp & Engagement
  - 🟣 Customer Flags & Profile
  - 🟠 Tags
- Loyalty & Tier and Dates & Occasions open by default
- Others collapsed

**Pass condition:** All 5 accordion sections visible, dialog opens without errors.

---

### T02 · BUG-A Fix — Birthday This Month ⭐ (critical)

> This filter was broken before — it returned ALL 5,907 customers instead of ~2.

**Steps:**
1. Open Create Audience dialog
2. Click **Dates & Occasions** section
3. Tick **"Birthday this month"**
4. Click **Preview Count**

**Expected:** A small number (not your total customer count)

**Pass condition:** Count returned is significantly less than total customers (e.g. 0–20, not 5,907).

---

### T03 · BUG-A Fix — VIP Filter ⭐ (critical)

> This filter was broken before — VIP criterion was silently ignored.

**Steps:**
1. Open Create Audience dialog
2. Click **Customer Flags & Profile** section
3. Set **VIP Status = VIP Only**
4. Click **Preview Count**

**Expected:** A small positive number, not equal to your total customer count

**Pass condition:** Count > 0 and count < total customers.

---

### T04 · BUG-A Fix — WhatsApp Opted-In ⭐ (critical)

> This filter was broken before — opt-in criterion was silently ignored.

**Steps:**
1. Open Create Audience dialog
2. Click **WhatsApp & Engagement** section
3. Set **WhatsApp Opted-In = Opted In**
4. Click **Preview Count**

**Pass condition:** Count is a subset of your total customers, no error.

---

### T05 · New P1 filters — Dates

**Steps:**
1. Open Create Audience dialog → Dates & Occasions
2. Set **Birthday Month = Jul** → Preview Count (note the number)
3. Reset → Set **Signed Up = Last 30 days** → Preview Count

**Pass condition:** Both return a number without errors or blank screen.

---

### T06 · New P1 filters — Loyalty

**Steps:**
1. Open Create Audience dialog → Loyalty & Tier
2. Set **Wallet Balance = Zero** → Preview Count
3. Reset → Set **Coupons Used = None** → Preview Count

**Pass condition:** Both return counts without errors.

---

### T07 · New P1 filters — Flags

**Steps:**
1. Open Create Audience dialog → Customer Flags & Profile
2. Set **Lead Source = Walk-in** → Preview Count
3. Tick **"Has Complaint"** → Preview Count

**Pass condition:** Both return counts without errors.

---

### T08 · Combine multiple filters (AND logic)

**Steps:**
1. Open Create Audience dialog
2. Set **Tier = Gold** (Loyalty section)
3. Set **Last Visit = 30+ days ago** (Dates section)
4. Click **Preview Count**

**Expected:** The count should be ≤ Gold customers count (stricter = smaller)

**Pass condition:** Number returned is reasonable, smaller than total Gold customers.

---

### T09 · Active filter chips are dismissible

**Steps:**
1. Open Create Audience dialog
2. Set Tier = Gold + tick Birthday This Month
3. Two chip tags should appear above the accordion (e.g. "Tier: Gold", "Birthday: This Month")
4. Click the **×** on the "Tier: Gold" chip
5. Click **Preview Count** again

**Expected:** Tier chip disappears. Count increases (only Birthday filter active now).

**Pass condition:** Chip is removed on click. Count updates correctly.

---

### T10 · Save a new audience

**Steps:**
1. Open Create Audience dialog
2. Set Tier = Gold
3. Enter name: **"Gold Customers — Smoke Test"**
4. Click **Preview Count** → note the number
5. Click **Create Audience**

**Expected:** Dialog closes. New audience card appears in the grid with the correct count.

**Pass condition:** Card visible with matching customer count.

---

### T11 · Edit existing audience with new filters

**Steps:**
1. Click **Edit** on any existing audience
2. Expand **WhatsApp & Engagement** section
3. Set **WhatsApp Opted-In = Opted In**
4. Click **Preview Count** → click **Update Audience**

**Pass condition:** Audience saved. Count on card updates when refreshed.

---

## CR-034 — Customer Tags

### T12 · Add a tag to a customer (Customers page)

**Steps:**
1. Go to **Customers**
2. Find any customer row
3. Look for a small **"+ tag"** button next to their badges
4. Click it → type **"VIP"** → select from dropdown OR press Enter

**Expected:** A coloured tag pill (e.g. orange "VIP") appears on that customer's row immediately.

**Pass condition:** Tag chip visible on the row, no error toast.

---

### T13 · Add a new custom tag (not in catalog)

**Steps:**
1. On any customer row → click **"+ tag"**
2. Type a brand-new tag name e.g. **"Anniversary Guest"**
3. Select **"+ Create 'Anniversary Guest'"** from the dropdown

**Expected:** New tag appears on the customer. Next time you open the tag picker, "Anniversary Guest" appears in the catalog.

**Pass condition:** Custom tag created and visible.

---

### T14 · Remove a tag

**Steps:**
1. On any customer row that has a tag
2. Click the **×** on a tag chip

**Expected:** Tag disappears from the row immediately.

**Pass condition:** Tag removed, no error.

---

### T15 · Tags on Customer Detail page

**Steps:**
1. Click into any customer → open their detail page
2. Below the name/tier area in the header, look for a **"+ add tag"** button
3. Click it → search for "VIP" → select it

**Expected:** "VIP" tag appears in the customer detail header area.

**Pass condition:** Tag visible on detail page, persists after page refresh.

---

### T16 · Tag filter in Audience builder

**Steps:**
1. Go to **Marketing → Audiences** → Create Audience
2. Click the **Tags** accordion section (last one, orange)
3. You should see your tag catalog (VIP, etc.)
4. Click "VIP" to add it as a filter
5. Click **Preview Count**

**Expected:** Count returned = only customers with "VIP" tag (should be 2+ after the backfill + any you added manually)

**Pass condition:** Count > 0, no error.

---

### T17 · ANY vs ALL tag matching

**Steps:**
1. In Create Audience dialog → Tags section
2. Add 2 tags: "VIP" + "Anniversary Guest"
3. A **Match: ANY (OR) / ALL (AND)** toggle should appear
4. Toggle to **ANY** → Preview Count → note number
5. Toggle to **ALL** → Preview Count → note number

**Expected:** ANY count ≥ ALL count (OR is always broader than AND)

**Pass condition:** Both return counts. ANY count ≥ ALL count.

---

### T18 · Tag filter in a Campaign

**Steps:**
1. Create an audience with Tags = "VIP" (from T16 above)
2. Save it as **"VIP Tag Audience"**
3. Go to **Marketing → Campaigns** → New Campaign
4. In the Audience step, select **"VIP Tag Audience"**

**Expected:** Campaign wizard accepts the audience, shows correct recipient count.

**Pass condition:** Campaign can be created with the tag-based audience.

---

### T19 · Auto-backfill — VIP flag customers got tagged

**Steps:**
1. Go to Customers
2. Open the filter drawer → find **VIP Status = VIP Only** → Apply
3. Any customers shown should now also display a **"VIP"** tag chip

**Expected:** VIP-flagged customers have the "VIP" tag automatically (migration ran on deploy)

**Pass condition:** At least 1 customer visible with VIP tag chip.

---

### T20 · Tenant isolation — tags are per-restaurant

**Steps:**
1. Login as **owner@cafe103.com** → add a tag "Cafe103-VIP" to a customer
2. Logout → login as **owner@kunafamahal.com**
3. Go to any customer → click **"+ tag"**
4. Check that **"Cafe103-VIP"** does NOT appear in the tag catalog

**Expected:** Tags are scoped per restaurant. No cross-tenant leakage.

**Pass condition:** "Cafe103-VIP" not visible for the second restaurant.

---

## Full Test Checklist

| # | Test | Area | Priority | Result |
|---|---|---|---|---|
| T01 | New accordion dialog UI | CR-033 | Medium | |
| T02 | Birthday filter — not returning all 5907 customers | CR-033 | **Critical** | |
| T03 | VIP filter — not ignoring the criterion | CR-033 | **Critical** | |
| T04 | WA Opted-In filter — not ignoring the criterion | CR-033 | **Critical** | |
| T05 | New date filters (birthday month, signed up) | CR-033 | Medium | |
| T06 | New loyalty filters (wallet balance, coupons) | CR-033 | Medium | |
| T07 | New flag filters (lead source, has complaint) | CR-033 | Medium | |
| T08 | Multiple filters combine with AND | CR-033 | High | |
| T09 | Active chips dismissible | CR-033 | Medium | |
| T10 | Save new audience | CR-033 | High | |
| T11 | Edit existing audience with new filters | CR-033 | Medium | |
| T12 | Add tag to customer row | CR-034 | **Critical** | |
| T13 | Create new custom tag | CR-034 | High | |
| T14 | Remove a tag | CR-034 | High | |
| T15 | Tags on customer detail page | CR-034 | High | |
| T16 | Tag filter in audience builder | CR-034 | **Critical** | |
| T17 | ANY vs ALL tag matching | CR-034 | Medium | |
| T18 | Tag audience used in a campaign | CR-034 | High | |
| T19 | Auto-backfill VIP customers | CR-034 | Medium | |
| T20 | Tenant isolation | CR-034 | High | |

**Critical tests: T02, T03, T04, T12, T16 — minimum bar to consider CRs working.**

---

## What to do if a test fails

| Symptom | Likely cause | Action |
|---|---|---|
| Preview count returns total customer count (5907) | BUG-A still present | Report: filter key, value used, count returned |
| "Failed to add tag" toast | API endpoint issue | Report: customer name, tag text, browser console error |
| Tag section not visible in Audiences | CR-034 Tags accordion missing | Screenshot + report |
| Login fails with 503 | MyGenie API unreachable | Backend team to check .env MYGENIE_API_URL |
| Dialog doesn't open | Frontend compile error | Hard refresh (Ctrl+Shift+R) then report |

---

*End of Smoke Test Guide — CR-033 + CR-034*
