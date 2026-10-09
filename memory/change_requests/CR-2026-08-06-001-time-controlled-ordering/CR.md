# CR-2026-08-06-001 — Time-Controlled Ordering Per Channel

## Quick Reference

| Field | Value |
|-------|-------|
| **CR ID** | CR-2026-08-06-001 |
| **Title** | Per-channel time-controlled ordering (Delivery, Takeaway, Dine-in, Room, Walk-in) |
| **Status** | IMPLEMENTATION COMPLETE — QA READY |
| **Severity** | P1 |
| **Risk** | HIGH → CRITICAL |
| **Created** | 2026-08-06 |
| **Source** | INV-2026-08-06-001 |

## Gate Progress

- [x] Investigation (INV-2026-08-06-001) — **CLOSED 2026-08-06**
- [x] Intake — **COMPLETE 2026-08-06** — P1, HIGH→CRITICAL, 8 files, blast radius LARGE
- [x] Planning / Impact Analysis — **GATE CLOSED 2026-08-06** — 8 decisions (D1–D8), 4 UI surfaces mapped, 18 test cases, design mock approved by owner
- [x] Implementation Plan — **COMPLETE 2026-08-06** — 15 edits across 8 files, execution order defined, 18 verification cases, 12 self-test checks
- [x] Implementation — **COMPLETE 2026-08-06** — 16 edits total (15 planned + 1 backend bug fix), all 4 phases delivered, 100% tests pass
- [x] Self-Test — **PASS** — all ST-1 to ST-12 checks green, frontend compiles clean
- [ ] **QA — NEXT**
- [ ] Implementation Plan
- [ ] Implementation
- [ ] Self-Test
- [ ] QA
- [ ] Owner Smoke / Acceptance

---

## Owner Request (verbatim)

> "need a way that delivery takeaway room and table walkin all ordering can be time controlled,
>  currently customer can place order in midnight also"
> "ideally when he clicks on browse menu we should show delivery unavailable and show delivery time"
> "yes course he should be able to place order" [corrected] → "no he cannot place order"
> "show same message, customer should not be able to place order"
> "shift controls all channel — i want control over channels"
> "2. Menu page ok during impact i want to see design"

---

## All Decisions — D1–D7

| # | Decision | Owner Answer |
|---|----------|-------------|
| D1 | Per-channel or global hours? | **Per-channel** — Delivery, Takeaway, Dine-in, Room, Walk-in each have independent hours |
| D2 | What shows on menu when channel is closed? | Banner: channel unavailable + opening time shown |
| D3 | Can customer place order when channel is closed? | **NO — hard block.** Same unavailability message shown. |
| D4 | Confirm dialog or "proceed anyway"? | **NO** — no dialog, no bypass. Just block and show message. |
| D5 | Default when no channel-specific hours are configured? | **Open (24/7)** — absence of config = always open |
| D6 | Global `restaurantShifts` role going forward? | **Becomes the fallback** for any channel that has no specific hours set |
| D7 | Closed channel on the order-type selector (landing/menu)? | **Show, grayed out with hours** — not hidden |
| D8 | Design mock approved? | **YES — 2026-08-06.** All 4 surfaces (landing selector, menu banner, review order block, admin channel hours) approved as designed in `/cr-2026-08-06-001-design-mock.html` |

---

## Behaviour Summary (plain English)

### Menu page (customer browses)
- Customer selects or arrives in Delivery mode outside delivery hours
- Menu items still visible
- Banner shown: *"Delivery is unavailable right now. Available from 11:00 AM."*
- Add to Cart disabled for that channel
- Closed channel still appears in order type selector — grayed out with hours shown

### Review Order page (customer submits)
- Same check run at submission time
- If channel is closed: same message shown, Submit button blocked
- No confirm dialog, no bypass

### Fallback logic
```
channel hours configured?
  YES → use channel-specific hours
  NO  → use global restaurantShifts as fallback
  global restaurantShifts also absent → open 24/7
```

---

## Open Questions — ALL RESOLVED

| # | Question | Resolution |
|---|----------|------------|
| OQ-1 | Per-channel or global? | RESOLVED — per-channel, independent |
| OQ-2 | Default when no hours set? | RESOLVED — open 24/7 |
| OQ-3 | Global restaurantShifts role? | RESOLVED — becomes fallback per channel |
| OQ-4 | Closed channel hidden or shown? | RESOLVED — shown, grayed out with hours |
| OQ-5 | Hard block or soft gate? | RESOLVED — hard block, same message, no bypass |

**All decisions captured. No blockers. Ready for Intake.**

---

## Investigation Evidence

### What exists today
| Component | Current behaviour |
|-----------|------------------|
| `restaurantShifts` in config | Global — one schedule for all channels |
| `isRestaurantOpen()` | Called in `MenuItems.jsx` only — gates Add to Cart |
| `ReviewOrder.jsx` | **Zero time-gate checks** — orders always go through |
| Admin Settings page | Has UI for global shifts — no per-channel section |
| Channel type selector | No availability status shown per channel |

### Gap
1. Order placement (ReviewOrder.jsx) completely unprotected by time
2. No per-channel schedule — one clock for everything
3. No customer feedback on which channels are open/closed and when

---

*Investigation closed: 2026-08-06*
