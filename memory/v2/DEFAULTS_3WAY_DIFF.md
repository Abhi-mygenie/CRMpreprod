# Appearance Defaults — 3-Way Diff (read-only)

> Date (UTC): 2026-05-31 · Baseline `main @ 4612953` · **Read-only; no code changed.**
> Sources compared:
> - **B** = backend `server.py` `get_app_config()` no-doc defaults — **85 keys**
> - **C** = frontend `RestaurantConfigContext.DEFAULT_CONFIG` (customer app) — **98 keys**
> - **A** = frontend `AdminConfigContext.defaultConfig` (admin panel) — **87 keys**
> - (a hidden 4th indirection: **A** references a `DEFAULT_THEME` constant for colours)
> Total distinct keys across all three: **98**

## Headline
The three lists agree on the **majority** of keys, but **24 keys are missing from at least one list** and **~35 keys are written differently**. Most value differences are **benign representational** (`null` vs `''`, hex vs `DEFAULT_THEME.x`, JSON vs JS literal). **Only a couple are real semantic drift** (notably the **default font**).

Crucially: for a restaurant with **no config doc**, the customer app renders `{...DEFAULT_CONFIG(C), ...backendData(B)}` — so **backend (B) values already override the customer FE (C) values**. ⇒ *Making backend canonical preserves what customers see today.*

---

## A. 24 keys NOT present in all three  (B=backend, C=FE-customer, A=FE-admin)

### Missing from BACKEND (present C+A) — backend must ADD these to be complete
`allowNonQrOrders`, `backgroundImageUrl`, `browseMenuButtonText`, `menuOrder`, `mobileBackgroundImageUrl`,
`skipOtpDineIn`, `skipOtpDineInWithTable`, `skipOtpTakeaway`, `skipOtpWalkIn`, `skipOtpDelivery`, `skipOtpRoomOrders`,
`successMessage`, `successTitle`
> These are the newer CR-001/002 + success-screen + menu-order keys. Backend `get_app_config` never defaulted them (they arrive via the Pydantic model / DB). Under "backend = source of truth," add them with their **current effective default** (skipOtp*/allowNonQrOrders → absent/false; menuOrder → `{}`; text → null).

### Missing from FE-ADMIN (present B+C)
`mandatoryCustomerName`, `mandatoryCustomerPhone`, `otpRequiredDineIn`, `otpRequiredDineInWithTable`,
`otpRequiredRoomOrders`, `otpRequiredTakeaway`, `otpRequiredWalkIn`, `poweredByLogoUrl`, `poweredByText`,
`showAboutUs`, `showPromotions`
> The admin panel's local default omits these; they populate from the backend when the admin loads. Harmless today, but they should exist in the single canonical set.

---

## B. Value differences (35 keys) — classified

### B1. Benign representational (NO behaviour change — just normalise)
- **Empty-text fields** `null` (B,C) vs `''` (A): `aboutUsContent, aboutUsImage, address, contactEmail, facebookUrl, feedbackIntroText, footerText, instagramUrl, logoUrl, mapEmbedUrl, openingHours, phone, tagline, twitterUrl, whatsappNumber, youtubeUrl, backgroundImageUrl, mobileBackgroundImageUrl, successMessage, successTitle` → pick ONE (recommend `null`).
- **Colours** hex (B) vs `null` (C) vs `DEFAULT_THEME.x` (A): `primaryColor, secondaryColor, backgroundColor, textColor, textSecondaryColor, buttonTextColor` → canonical = **backend hex** (what customers already get). Collapse the `DEFAULT_THEME` indirection into it.
- **Same value, different syntax**: `restaurantShifts` (JSON vs JS), `extraInfoItems` (`[]` vs 5 empty strings), `menuOrder` (`{}` vs null), `borderRadius` (`rounded` both, C null), `welcomeMessage` ("Welcome!" both, C null), `payOnlineLabel`/`payAtCounterLabel` ("Pay Online"/"Pay at Counter" in B,C; empty in A).

### B2. REAL semantic drift — DEFAULT FONT (corrected)
`fontHeading` / `fontBody` defaults disagree across **four** places:
- backend `get_app_config` = **Montserrat**
- FE admin `defaultConfig` = **Poppins**
- FE customer **apply-time fallback** `config.fontX || 'Poppins'` (`RestaurantConfigContext.jsx:306,321`) = **Poppins**
- legacy `pages/AdminSettings.jsx` inputs = `'Big Shoulders'` / `'Montserrat'`

**Effective runtime default:**
- restaurant with **no doc** → backend injects Montserrat → renders **Montserrat**
- restaurant **with a doc but no font field** → `|| 'Poppins'` → renders **Poppins**
- ⇒ the **dominant** default is **Poppins**; Montserrat only hits pure no-doc restaurants.

➡️ Recommended canonical = **Poppins** (matches the dominant code fallback + admin panel + owner expectation). Only pure no-doc restaurants currently rendering Montserrat would change — confirm none rely on it before flipping.

**Note:** `fontHeading` = heading font, `fontBody` = **body/content** font. Each brand sets **its own** pair in its Mongo config; the default applies only when a brand hasn't chosen one.

---

## C. Consolidation rule (value-preserving)
1. **Canonical set lives in the backend** (`get_app_config`), made **complete** (add the 13 missing keys).
2. Conflict resolution = **current customer-facing value WINS** → backend hex colours, **Poppins** fonts (dominant runtime default), `null` for empty text, `{}`/`[]` for empty structures.
3. Frontend `DEFAULT_CONFIG` (C) shrinks to a **minimal offline default**; `AdminConfigContext.defaultConfig` (A) + `DEFAULT_THEME` derive from the same canonical source (no second/third copy).
4. **Proof:** snapshot `GET /api/config/<no-doc rid>` + key customer/admin screens **before vs after** → must be identical.

## D. Frozen / excluded from this step
- `menuOrder` ordering/visibility/**timings** behaviour (only its empty `{}` default participates).
- Loyalty/coupon/wallet (deferred, CRM).
- Tenant hardcoding (716/478/pos_id) → Phase 3B.
