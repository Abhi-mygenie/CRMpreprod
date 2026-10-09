# CR-2026-05-30-001 — Item 2 Parking Document

| Field | Value |
|---|---|
| Date parked | 2026-05-30 |
| Status | **PARKED — investigation only, no code changes** |
| Reason for parking | Owner: "this is too heavy" — implementation effort + risk vs current production tolerance not yet justified |
| Resume trigger | Owner re-prioritises OR failure rate increases OR new production datapoint arrives |

---

## 1. What's parked

**Item 2 of CR-2026-05-30-001** — "Table scan creates new table / order lands as walk-in in production at ~1-in-10 to 1-in-15 frequency."

All work on this item is paused. **Zero source-code changes were made** for Item 2 in any session so far. Only investigation documents in `/app/memory/change_requests/CR-2026-05-30-001-…/`.

---

## 2. What's NOT parked

| Status | What |
|---|---|
| ✅ Shipped | **Item 1** (config-driven OTP skip) — implemented, runtime-tested, QA-handover complete. Lives in production preview at `https://deploy-docs-6.preview.emergentagent.com`. New `skipOtp*` admin toggles work. |
| ⏸ Parked | **Item 2** (table scan → walk-in fallback) — this document |
| ⏸ Parked | **Item 3** (room scan → walk-in) — shares root causes with Item 2; same parking |
| 📝 Parked & registered | **URL tampering CR (sub-CR)** — owner raised during Item 2 investigation; brainstormed in conversation; not registered as a separate CR file. Should be revived together with Item 2 (they share fix surface — F4 from the fix investigation). |

---

## 3. Investigation artefacts produced (read-only)

All in `/app/memory/change_requests/CR-2026-05-30-001-config-mandatory-fields-and-scan-misrouting/`:

| Doc | Size | Status |
|---|---|---|
| `CR.md` | small | Original owner registration of all 3 items |
| `INVESTIGATION_AND_GAPS.md` | medium | First-pass gap analysis covering all 3 items |
| `ITEM2_DEEP_DIVE.md` | large | 8 production-only triggers ranked. Established the iOS/Android/multi-tab mechanisms but found their combined frequency (~1-2%) couldn't fully explain reported 10% rate. |
| `ITEM2_PRODUCTION_RATE_INVESTIGATION.md` | large | **Key finding doc.** Identified the systemic bug: `ReviewOrder.jsx:982-985` ignores `CartContext.editOrder.tableId`. Combined with sessionStorage loss on mobile (~10–25% of sessions), produces the observed ~10% failure rate. |
| `ITEM2_FIX_INVESTIGATION.md` | large | **Final investigation.** Exact file:line targets for fixes F1–F6. Includes 716 carve-out audit. Effort estimate (~31 LOC for the MVP). |

These documents are sufficient to resume work without re-investigating. A new agent picking this up should read them in this order: `CR.md` → `INVESTIGATION_AND_GAPS.md` (Item 2 section only) → `ITEM2_PRODUCTION_RATE_INVESTIGATION.md` → `ITEM2_FIX_INVESTIGATION.md`.

---

## 4. Single-paragraph state of knowledge (what we know)

The reported ~1-in-10 to ~1-in-15 production failure rate of "WC / walk-in misrouting after a table scan" is overwhelmingly caused by **`ReviewOrder.jsx:982-985` ignoring the `editOrder.tableId` value that the Edit Order flow correctly captures into CartContext** (`getEditOrderPayload` is defined but never called anywhere — pure dead code). On top of that systemic bug, sessionStorage is lost in roughly 10–25% of mobile browser sessions (iOS Safari memory eviction, Android Chrome tab discarding, opening from notifications/share links in a new tab, PWA mode) — and when sessionStorage is lost, `finalTableId` falls through to `'0'`, which POS interprets as walk-in. This is platform-agnostic (Android and iOS both affected; Android possibly more so due to lower-RAM device prevalence in the user base). Re-scanning the SAME table QR is generally safe; the failures concentrate on the Edit Order path and on customers who return to a `/<rid>` URL with no QR params after their tab has been discarded.

---

## 5. Recommended fix bundle (NOT executed)

Documented in detail in `ITEM2_FIX_INVESTIGATION.md`. Brief summary:

| Fix | What | LOC | Coverage |
|---|---|---|---|
| **F1** | `ReviewOrder.jsx` falls back to `editOrder.tableId` from CartContext | 6 | ~50–60% of failures |
| **F2** | `useScannedTable` merges sessionStorage instead of overwriting | 8 | ~5–10% |
| **F3** | sessionStorage → localStorage (TTL 4h) via small helper | 25 | All tab-discard cases |
| **F4** | Defensive guard: abort place-order if `finalTableId='0'` for dine-in/room | 10 | Last-resort + URL tampering policy |
| **F5** | `checkTableStatus` no longer fails open | 15 | ~3–5% |
| **F6** | Diagnostic log on every placeOrder | 30 | Evidence for future reports |

**Recommended MVP: F1 + F3 only** (~31 LOC, 1 new helper file). Expected to drop the failure rate from ~10% → <0.5%. No backend changes, no DB migration, no 716 carve-out touched.

---

## 6. Hard constraints (still apply when work resumes)

- **Restaurant 716 carve-outs** in `OrderSuccess.jsx` (L320, L360) and `ReviewOrder.jsx` (L828, L837, L937-941, L988-994, L1290-1295) **MUST stay untouched.** All proposed fixes were specifically designed to honour this.
- Backend (`backend/server.py`) **untouched** by any fix except F6 (optional diagnostic endpoint).
- Item 1 surface (`otpPolicy.js`, `crmSkipOtpRetry.js`, `crmService.js` retryAfterMs, `LandingPage.jsx` OTP gate, `AdminVisibilityPage.jsx`, `AdminConfigContext.jsx`) **must not regress** — none of F1-F6 overlap with Item 1's edit surface.
- POS-side coordination **NOT required** for F1-F5. F6 (diagnostic log) optionally adds a backend endpoint.

---

## 7. What's needed to resume

| # | Input | Why |
|---|---|---|
| 1 | One real failing `order_id` + restaurant_id + the order-details API response for that order | Confirms client-side vs POS-side; disambiguates F1's edit-order path from rarer triggers |
| 2 | The original (legitimate) dine-in `order_id` for the same table for the SAME customer (if findable in POS) | Lets us see the difference between the correctly-placed order and the WC duplicate |
| 3 | Approximate device-mix breakdown of affected customers (iOS / Android / low-RAM vs high-RAM) | Confirms platform-agnostic vs device-specific |
| 4 | Owner's final answer on the 5 questions in `ITEM2_FIX_INVESTIGATION.md §10` (PR scope, helper vs inline, editOrder exposure, TTL value, 716 confirmation) | Needed before any code |
| 5 | Authorisation to call `integration_playbook_expert_v2` — not strictly needed here (no auth/CRM change), but flagged for completeness if F6's backend endpoint is built |

---

## 8. Resume checklist (for the future agent)

When the owner says "resume Item 2":

- [ ] Read this parking doc end-to-end
- [ ] Read `ITEM2_FIX_INVESTIGATION.md` end-to-end
- [ ] Confirm the 5 questions in §10 of that doc have been answered by the owner
- [ ] Confirm Item 1 is still working in production (the 6 `skipOtp*` toggles in `Admin → Visibility → Skip OTP / Password Setup`)
- [ ] Run `git log --oneline -20` to see what's changed since 2026-05-30 (this document's date)
- [ ] Verify the 716 carve-out lines still exist exactly where this doc references them — code drift is possible
- [ ] Verify `getEditOrderPayload` is still unused: `grep -rnE "getEditOrderPayload" /app/frontend/src/ | grep -v "CartContext.js"` should still return zero (if a previous agent already wired it up, F1 may be partially complete)
- [ ] Verify `ReviewOrder.jsx:982-985` still has the `'0'` fallback expression
- [ ] Plan + implement (recommended: F1 + F3 only, MVP)
- [ ] Run testing agent with the scenarios in `ITEM2_FIX_INVESTIGATION.md §10` (TBD — testing agent guidance to be added when resuming)
- [ ] Update `/app/memory/PRD.md` and finish summary

---

## 9. Owner-side waiting bucket (so we don't forget)

Things the owner said but did not yet decide on:

| Topic | What owner said | Owner action |
|---|---|---|
| URL tampering restriction | "we want a way through to restrict Dine-In (fallback). if its not following how can we do brainstorming only, we should restrict this user if flag is off" | Brainstormed in conversation (`Dine-In` vs `Walk-In` differentiation, defence layers L1-L6). Owner did not register as a CR. Recommended: revive alongside Item 2 — fix surface is shared (F4). |
| Items 2 + 3 failing order datapoint | Not provided yet | Owner to extract from production POS dashboard |
| 716 in Item 1 | Confirmed IN scope | Already shipped; no further action |
| 716 in Item 2/3 | Confirmed OUT of scope (carve-out preserved) | Hard constraint pinned in §6 |

---

## 10. One-line summary

> **Item 2 investigation is complete and fully documented. Implementation is paused at the owner's discretion ("too heavy"). No code was changed. When ready, F1+F3 deliver the bulk of the value at ~31 LOC. All resume materials are in this CR folder.**
