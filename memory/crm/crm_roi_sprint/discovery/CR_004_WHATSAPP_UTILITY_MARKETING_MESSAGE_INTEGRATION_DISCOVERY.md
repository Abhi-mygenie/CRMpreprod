# CR-004 — WhatsApp Utility + Marketing Message Integration

**Date:** 2026-02-26
**Status:** `cr004_whatsapp_utility_marketing_registered_awaiting_phase_0_discovery`
**Priority:** P2 (within ROI Measurement Sprint — independent of CR-002B / CR-003 / POS-CRM Cross-Sell)
**Sprint:** ROI Measurement for CRM
**Register:** `./ROI_MEASUREMENT_CR_REGISTER.md`

> **Naming note (2026-02-26):** A pre-existing planning doc already uses the `CR-004` code: `./CR_004_LOYALTY_DEFAULTS_AND_UI_BUG_FIX.md`. The user-supplied CR name `CR-004 WhatsApp Utility + Marketing Message Integration` is kept verbatim here as registered, but the two `CR-004` documents are *different* CRs. Renumbering (e.g. `CR-005`) can be decided by the owner before Phase 0 Discovery starts. This registration does not modify the older CR-004 (Loyalty) doc.

---

## 1. Purpose

CRM already has some WhatsApp integration work done, and utility / marketing templates may already exist. The full flow — provider, templates, automation rules, event triggers, send logs, opt-in/opt-out, failures — needs to be **discovered, connected, validated, and closed**.

This CR is about making sure CRM **customer events, coupon / loyalty / wallet events, order events, and marketing journeys** correctly trigger WhatsApp messages using the approved templates and provider integration.

This CR is separate from:
- **CR-002B** (customer detail screen visibility)
- **CR-003** (owner global coupon analytics)
- **POS-CRM Customer Cross-Sell Upsell Suggestions API**

---

## 2. Main Questions For Phase 0 Discovery

### Provider & templates
1. Which WhatsApp provider is currently wired — WATI, AuthKey, or another provider?
2. Which **utility** templates already exist?
3. Which **marketing** templates already exist?
4. Where are templates stored in CRM (collection / table / config)?
5. Is there any difference between utility and marketing template handling (auth, opt-in, throttling, billing category)?

### Automation rules & event triggers
6. Are templates mapped to automation rules / events?
7. Are seeded automation rules actually used by live trigger code, or are they dormant?
8. Which events currently trigger WhatsApp messages?
9. Which events are missing triggers?
10. Are coupon **issue / use** events connected to WhatsApp?
11. Are loyalty **earned / redeemed** events connected to WhatsApp?
12. Are wallet **added / used** events connected to WhatsApp?
13. Are **birthday / anniversary / customer segment** campaigns connected?
14. Are **marketing broadcasts / campaigns** supported or only planned?

### Observability & compliance
15. Are send logs stored? Where?
16. Are failed WhatsApp sends tracked (status, error, retry policy)?
17. Are customer **opt-in / opt-out** rules respected?

---

## 3. Expected Future Capability

- **Utility messages** work for transactional / customer-service events (order placed, coupon issued, coupon used, loyalty earned/redeemed, wallet added/used, etc.).
- **Marketing messages** work for campaign / segment / broadcast flows (birthday, anniversary, win-back, segment push).
- Templates are **selectable / mappable** from CRM admin.
- Events trigger the **correct template** with correct parameters.
- **Send status** (queued, sent, delivered, read, failed) is logged per message.
- **Failures** are visible for QA / support, with reason and retry state.
- **Opt-in / opt-out** is enforced before sending marketing.

---

## 4. Out Of Scope

- Owner-level coupon analytics → owned by **CR-003**.
- Customer detail screen data correctness → owned by **CR-002B**.
- POS-facing cross-sell / upsell suggestions → owned by **POS-CRM Customer Cross-Sell Upsell Suggestions API**.
- Building new providers from scratch — discovery first.
- Sending real WhatsApp messages during registration / discovery.
- Any change to closed CRM 1.0 baseline close document.

---

## 5. Future Flow

```
Phase 0 Discovery
  → Provider / template / trigger mapping
    → Planning
      → Implementation
        → WhatsApp Integration QA
          → Final Reconciliation
```

This placeholder doc covers only **registration**. Phase 0 discovery has NOT started yet.

---

## 6. Dependencies / Relationships

| Relationship | Detail |
|---|---|
| Independent of | CR-002B, CR-003, POS-CRM Cross-Sell API — can run in parallel once owner picks it up. |
| Soft-benefits from | CR-002B (customer-level coupon/loyalty/wallet data must be correct for transactional WhatsApp content to be correct). |
| Inherits | CRM 1.0 baseline (closed, production-promotable) as the substrate. |

---

## 7. Strict Non-Goals For This Registration

- No code changes
- No DB changes
- No env / deploy / migration changes
- No QA execution
- **No real WhatsApp messages** sent in this registration run
- No merging into CR-002B, CR-003, or POS-CRM Cross-Sell CR
- No edits to the closed CRM 1.0 baseline close document

---

## 8. Recommended Next Agent (when picked up)

`CR-004 WhatsApp Integration Discovery Agent` — runs Phase 0 Discovery: identify provider, enumerate existing templates (utility + marketing), map automation rules → trigger code → events, audit send logs / opt-in / opt-out behavior.

---

## 9. Status

```
cr004_whatsapp_utility_marketing_registered_awaiting_phase_0_discovery
```
