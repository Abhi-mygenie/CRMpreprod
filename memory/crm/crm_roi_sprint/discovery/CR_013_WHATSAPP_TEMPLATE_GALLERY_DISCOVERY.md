# CR-013 — WhatsApp Template Gallery (Pre-Built Restaurant Templates)

**Sprint:** ROI Measurement Sprint
**Date:** 2026-05-28
**Status:** `cr013_registered_awaiting_discovery`
**Depends on:** CR-012 (Template Builder Production Readiness — discovery complete, not yet implemented)
**Related to:** CR-004 (WhatsApp variable mapping), CR-012 (template creation UI)

---

## 1. Purpose

Restaurant owners currently build WhatsApp templates from scratch — blank name, blank body, blank everything. Most restaurants need the **same 8-12 template types** (order confirmation, loyalty points earned, birthday greeting, feedback request, coupon earned, etc.). The Template Gallery provides a library of **pre-built, Meta-compliant templates** that owners can browse, preview, clone into their account, and customize before submitting to Meta.

This reduces template creation time from 10-15 minutes (compose + format + add examples + submit + wait for approval) to **30 seconds** (browse → clone → customize name → submit).

---

## 2. Proposed Scope

### 2.1 Gallery Templates (seed library)

| # | Template | Category | Variables | Buttons | Use Case |
|---|---|---|---|---|---|
| 1 | `order_confirmation` | Utility | `{{1}}` customer_name, `{{2}}` order_id, `{{3}}` order_amount | URL: "Track Order" | POS send_bill event |
| 2 | `welcome_first_visit` | Marketing | `{{1}}` customer_name, `{{2}}` restaurant_name, `{{3}}` points_earned | Quick Reply: "View Menu" | first_visit event |
| 3 | `points_earned` | Utility | `{{1}}` customer_name, `{{2}}` points_earned, `{{3}}` points_balance | — | points_earned event |
| 4 | `tier_upgrade` | Marketing | `{{1}}` customer_name, `{{2}}` old_tier, `{{3}}` tier | Quick Reply: "View Benefits" | tier_upgrade event |
| 5 | `birthday_greeting` | Marketing | `{{1}}` customer_name, `{{2}}` restaurant_name, `{{3}}` points_earned | Quick Reply: "Redeem Now" | birthday cron event |
| 6 | `anniversary_greeting` | Marketing | `{{1}}` customer_name, `{{2}}` restaurant_name | — | anniversary cron event |
| 7 | `coupon_earned` | Utility | `{{1}}` customer_name, `{{2}}` coupon_code, `{{3}}` coupon_title, `{{4}}` coupon_expiry | — | coupon_earned event |
| 8 | `feedback_request` | Utility | `{{1}}` customer_name, `{{2}}` restaurant_name | URL: "Give Feedback" → feedback_link | feedback_received or post-order |
| 9 | `points_expiring` | Utility | `{{1}}` customer_name, `{{2}}` expiring_points, `{{3}}` expiry_date | Quick Reply: "Visit Now" | points_expiring cron event |
| 10 | `wallet_credit` | Utility | `{{1}}` customer_name, `{{2}}` amount, `{{3}}` wallet_balance | — | wallet_credit event |
| 11 | `loyalty_reminder` | Marketing | `{{1}}` customer_name, `{{2}}` points_balance, `{{3}}` tier | Quick Reply: "Order Now" | Segment broadcast |
| 12 | `google_review_request` | Marketing | `{{1}}` customer_name, `{{2}}` restaurant_name | URL: "Leave Review" → google_review_link | Post-feedback or manual |

### 2.2 Gallery UX Flow

```
Templates Page → "Template Gallery" tab (new)
  → Browse cards with preview bubble, category badge, variable tags
  → Search / filter by category (Utility / Marketing)
  → Click "Use This Template"
  → Clone into Add Template modal (pre-filled, editable)
  → Owner customizes: name (auto-suffixed with restaurant), body text, examples
  → Save as Draft or Submit to Meta
```

### 2.3 Key UX Rules

- Gallery templates are **read-only seed data** — owners clone, never edit the gallery directly
- Cloned template gets a unique name: `{gallery_name}_{restaurant_slug}` (e.g., `order_confirmation_kunafa_mahal`)
- Owner can edit every field after cloning — the gallery is a starting point, not a constraint
- Gallery shows which templates the owner has **already cloned** (greyed "Already Added" badge)
- Variable mapping is **auto-suggested** based on the gallery template's variable names matching CRM variable keys

---

## 3. Implementation Approach

### Backend
- Seed gallery templates as a **static JSON array** in code (not DB) — no CRUD, no per-user state
- New endpoint: `GET /api/whatsapp/gallery-templates` — returns the seed library
- Clone flow reuses existing `POST /whatsapp/custom-templates` (Save as Draft) or `POST /whatsapp/create-and-sync-template` (Submit to Meta)

### Frontend
- New "Gallery" tab on Templates page (alongside Mapped / Not Mapped filters)
- Gallery card component: WhatsApp bubble preview, category badge, variable pills, "Use This Template" button
- Clone action: opens Add Template modal pre-filled with gallery template data
- "Already Added" detection: check if `custom_templates` contains a template with matching `gallery_source_id`

---

## 4. Dependencies

| Dependency | Status | Blocking? |
|---|---|---|
| CR-012 Phase 1 (Buttons builder UI) | Not started | **Yes for templates with buttons** — gallery templates 1, 2, 4, 5, 8, 9, 11, 12 have buttons. Clone would pre-fill buttons but owner can't see/edit them without G1 fix. |
| CR-004 P2.5-B (Coupon picker) | ✅ Complete | No — variable mapping is done separately after template creation |
| CR-012 P1-C (Name validation) | Not started | Nice-to-have — auto-generated names would already be valid |

**Recommendation:** Implement CR-012 Phase 1 (buttons UI) first, then CR-013 Gallery. Gallery without buttons builder = cloned templates with invisible buttons = confusing UX.

---

## 5. Effort Estimate

| Item | Sessions |
|---|---|
| Backend: gallery seed data (12 templates JSON) + endpoint | 0.5 |
| Frontend: Gallery tab + card component + clone flow | 1.5 |
| "Already Added" detection + auto-name generation | 0.5 |
| Testing + docs | 0.5 |
| **Total** | **~3 sessions** |

---

## 6. Out of Scope

- Gallery template CRUD (admin adds/edits gallery templates) — future, if needed
- AI-generated template suggestions based on restaurant type — future CR
- Multi-language gallery variants (one template per language) — future
- Template performance analytics ("which gallery template performs best") — future

---

## 7. Strict Non-Goals For This Registration

- No code changes
- No DB / env / deploy / migration changes
- No edits to CR-004 / CR-012 docs or CRM 1.0 baseline

---

## 8. Status

```
cr013_registered_awaiting_discovery
```

**Sequencing:** CR-012 Phase 1 (buttons UI) → CR-013 (gallery). Gallery without buttons builder is incomplete.

End of CR-013 Registration.
