# CR-009 — WhatsApp Settings Credential Visibility Toggle (Discovery)

**CR:** CR-009 WhatsApp Settings Credential Visibility Toggle
**Sprint:** ROI Measurement Sprint
**Date:** 2026-05-27
**Status:** `cr009_discovery_complete`

---

## 1. Problem

The WhatsApp → Settings page (`/settings`) renders **AuthKey API Key** and
**Meta Access Token** as `type="password"` (masked dots). Owners regularly
need to:

- Verify the value they just pasted before saving
- Read back a previously-saved credential to copy it elsewhere (POS provisioning, support ticket)
- Confirm they pasted the right token vs the wrong environment

Without a reveal toggle, owners must clear the field and re-paste from
their password manager every time — friction that has been raised in
field feedback (owner: Mayur, R689 Kunafa Mahal).

---

## 2. UI Mapping (verified)

| Sidebar item | Route | Component file | Confirmed by user screenshot 2026-05-27 |
|---|---|---|---|
| WhatsApp → **Settings** | `/settings` | `/app/frontend/src/pages/SettingsPage.jsx` | ✅ Single source page in scope |

Other WhatsApp screens (Templates / Automation / Segments) render
different credential surfaces and are explicitly **out of scope** for
this CR.

---

## 3. Scope (locked with owner)

| Item | Decision |
|---|---|
| Eye toggle on `AuthKey API Key` | ✅ In scope |
| Eye toggle on `Meta Access Token` | ✅ In scope |
| Eye toggle on `Brand Number` | ❌ Out of scope (not sensitive — phone number) |
| Eye toggle on `Meta WABA ID` | ❌ Out of scope (not sensitive — account ID) |
| Touch `WhatsAppAutomationContent.jsx` (Templates/Automation page) | ❌ Out of scope (separate page, separate CR if needed later) |
| Backend changes | ❌ None — backend already returns plaintext credentials to authenticated user |
| `package.json` / new dependencies | ❌ None — `Eye`/`EyeOff` icons already in `lucide-react` (existing dep) |
| DB / env / deploy / migration | ❌ None |

---

## 4. Solution Pattern

Standard "password reveal" pattern, matching the precedent already used
on the Login page password input:

- Each masked field is wrapped in `<div className="relative">`
- An absolutely-positioned `<button>` with `Eye` (when masked) / `EyeOff` (when revealed) icon sits at `right-3 top-1/2 -translate-y-1/2`
- Local React state per field (`showAuthKey`, `showMetaToken`) toggles the input `type` between `"password"` and `"text"`
- Default state on mount: masked (security-first)
- `type="button"` on toggle prevents accidental form submission
- `aria-label` updates dynamically for screen readers
- `pr-12` padding on input so typed text never overlaps the icon

---

## 5. Security Posture

| Concern | Assessment |
|---|---|
| Are credentials newly exposed by this change? | **No.** Backend `/api/whatsapp/api-key` GET already returns the raw value to any authenticated user (cf. `routers/whatsapp.py:270-283`). The value is visible in DevTools → Network → Response of every page load that hits this endpoint. The reveal toggle merely makes the same value visible in the input box. |
| Could a shoulder-surfer read the token? | The toggle is an **explicit user action** with a clear visible state (eye icon flipped). Default is masked. This matches industry standard (1Password, Bitwarden, Stripe Dashboard, Meta Business Manager itself). |
| Does this change DB storage? | **No.** DB still stores the value as before (no encryption layer added or removed by this CR — that would be a separate, larger CR). |

**Net:** UX improvement with zero security regression.

---

## 6. Out of Scope (Explicitly Deferred)

- DB-side encryption-at-rest for credentials (`authkey_api_key`, `meta_access_token`) — separate CR if owner wants it.
- "Copy to clipboard" button next to the eye toggle — could be a follow-up nice-to-have.
- Visibility toggle on the legacy `WhatsAppAutomationContent.jsx` shared component — separate small CR if parity is desired.
- Field-level reveal logging / audit trail.
- Time-bound auto-re-mask (e.g. reveal for 10s then re-mask).

---

## 7. Risk Register

| Risk | Level | Mitigation |
|---|---|---|
| Visual layout shift / icon overlap with long tokens | LOW | `pr-12` ensures right-side padding accounts for the 16px icon + 12px inset. Verified visually after implementation. |
| Accessibility regression | NONE | `aria-label` added (net a11y improvement); `<button type="button">` is keyboard-focusable and Enter-activatable. |
| Browser autofill / password manager interaction | NONE | `password ⇄ text` type toggling is the canonical pattern recognised by every major PM; no AutoFill API contract change. |
| Test-id collisions | NONE | 2 new unique test-ids added (`toggle-authkey-visibility-btn`, `toggle-meta-token-visibility-btn`); existing test-ids preserved. |
| Cross-page side-effects | NONE | Change is scoped to one file with local state only. No exports / context / global state touched. |
| CR-008 (sessionStorage MyGenie token) interaction | NONE | Completely unrelated feature. CR-009 only modifies a settings form; no auth flow change. |

---

## 8. Acceptance Criteria

1. Default state on page load: both `AuthKey API Key` and `Meta Access Token` fields render as masked (`type="password"`), with an `Eye` icon visible on the right of each input.
2. Clicking the eye icon next to `AuthKey API Key`:
   - Toggles `type` to `"text"` — value visible
   - Icon flips to `EyeOff`
   - Click again → re-masks
3. Clicking the eye icon next to `Meta Access Token` behaves identically and **independently** from the AuthKey toggle.
4. `Brand Number` and `Meta WABA ID` are unchanged — no eye, plaintext as before.
5. Save WhatsApp Settings button still works; outgoing payload unchanged.
6. No console errors. No lint warnings. No layout shift.

---

## 9. Files Touched

| Path | Action | Type |
|---|---|---|
| `/app/frontend/src/pages/SettingsPage.jsx` | Modify | Product code (frontend only) |

Memory docs (this discovery + implementation report + register row + README row) are doc-only and do not affect runtime behaviour.

---

## 10. Strict Boundaries Honoured

- `/app/memory/crm/crm_1_0/` untouched
- `/app/memory/final/` not created/touched
- No backend / DB / env / deploy / migration / new dependencies
- POS contract untouched
- Coupon engine untouched
- Other CRs in sprint untouched

---

## 11. Next Phase

Implementation runs immediately after this discovery (single small frontend
edit, low risk, owner-confirmed scope). Implementation report:
`../implementation/CR_009_WHATSAPP_SETTINGS_CREDENTIAL_VISIBILITY_TOGGLE_IMPLEMENTATION_REPORT.md`
