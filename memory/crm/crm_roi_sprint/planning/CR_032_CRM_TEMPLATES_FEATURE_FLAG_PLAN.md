# CR-032 — Impact Analysis + Implementation Plan: CRM Templates Feature Flag

> **Type**: Feature (per-tenant toggle)
> **Date**: 2026-07-01
> **Risk**: LOW
> **Files changed**: 5 (2 backend, 3 frontend)
> **Hotspot files touched**: 0

---

## What It Does

Adds a per-tenant boolean flag `features.crm_templates_enabled` (default: `true`).
When set to `false` by the owner:
- Templates nav item disappears from sidebar
- `/templates` and `/template-builder` routes redirect to `/dashboard`
- Optional: backend returns 403 on authkey-templates API (Q1 answer: Yes)
- Campaign Wizard template picker is NOT gated (Q2 answer: No — keep it simple)

---

## Current State

| Layer | Current behaviour |
|---|---|
| DB (`users` collection) | No `features` field exists at all — `{features: undefined}` for all users |
| Backend `/auth/me` | `UserResponse` model has no `features` field |
| Backend `PUT /auth/profile` | `allowed` set does not include `features` |
| Frontend `AuthContext` | Stores `user` object — no `features` read |
| Sidebar (`ResponsiveLayout.jsx`) | Always renders Templates link (line 36 desktop, line 82 mobile) |
| App.js routes | `/templates` and `/template-builder` always accessible |
| SettingsPage | No feature-flag toggle UI |

---

## Impact Analysis

### Backend — 2 files

#### 1. `models/schemas.py`
- **Add** `FeaturesSchema` sub-model:
  ```python
  class FeaturesSchema(BaseModel):
      crm_templates_enabled: bool = True
  ```
- **Add** to `UserResponse`:
  ```python
  features: FeaturesSchema = Field(default_factory=FeaturesSchema)
  ```
- **Risk**: ZERO — `extra="ignore"` already on model, default `True` means existing users unaffected

#### 2. `routers/auth.py`
- **Edit 1** — `get_me()` (line 159): pass `features` from DB doc into `UserResponse`:
  ```python
  features=FeaturesSchema(**(user.get("features") or {}))
  ```
- **Edit 2** — `update_profile()` allowed set (line 205): Add `features` handling with validation:
  ```python
  if "features" in updates and isinstance(updates["features"], dict):
      existing_f = user.get("features") or {}
      allowed_f_keys = {"crm_templates_enabled"}
      merged_f = {**existing_f, **{k: v for k, v in updates["features"].items() if k in allowed_f_keys}}
      filtered["features"] = merged_f
  ```
- **Risk**: LOW — additive. The `allowed` whitelist keeps the gate.

#### 3. `routers/whatsapp.py` — `get_authkey_templates()` (Q1: Yes, add 403 guard)
- **Add** at top of function:
  ```python
  if not (user.get("features") or {}).get("crm_templates_enabled", True):
      raise HTTPException(status_code=403, detail="CRM Templates feature is disabled for this account")
  ```
- **Risk**: ZERO — only hits if owner explicitly disabled. Default `True` = no change for anyone.

---

### Frontend — 3 files

#### 1. `contexts/AuthContext.jsx`
- **No code change needed** — `user` object is stored as-is from the `/auth/me` response. Once backend returns `features`, it's already in `user`. Consumers just read `user?.features?.crm_templates_enabled`.
- **Risk**: ZERO

#### 2. `components/ResponsiveLayout.jsx`
- **Desktop nav** (line 36): Conditionally render Templates item
- **Mobile nav** (line 82): Same conditional
  ```jsx
  const { user } = useAuth();
  const templatesEnabled = user?.features?.crm_templates_enabled !== false;
  // Then wrap Templates <NavItem> with: {templatesEnabled && <NavItem .../>}
  ```
- **Risk**: LOW — only hides nav link. Route still accessible directly via URL (handled by App.js guard below).

#### 3. `App.js`
- Wrap `/templates` and `/template-builder` routes with an extra guard:
  ```jsx
  <Route path="/templates" element={
      <ProtectedRoute>
          <FeatureRoute feature="crm_templates_enabled">
              <TemplatesPage />
          </FeatureRoute>
      </ProtectedRoute>
  } />
  ```
  Where `FeatureRoute` is a tiny inline component that redirects to `/dashboard` if feature is off.
- **Risk**: LOW — additive wrapper, no change to existing routes logic.

#### 4. `pages/SettingsPage.jsx`
- **Add** a new "Features" section with a Switch toggle for CRM Templates:
  ```jsx
  <Switch
      checked={crmTemplatesEnabled}
      onCheckedChange={(v) => handleToggleFeature("crm_templates_enabled", v)}
  />
  ```
  `handleToggleFeature` calls `api.put("/auth/profile", { features: { crm_templates_enabled: v } })`
  then updates AuthContext user.
- **Risk**: LOW — new section appended to existing SettingsPage, no existing code touched.

---

## Files Summary

| File | Type of change | Lines affected (est.) |
|---|---|---|
| `backend/models/schemas.py` | Add FeaturesSchema + field to UserResponse | +8 lines |
| `backend/routers/auth.py` | get_me + update_profile | +10 lines |
| `backend/routers/whatsapp.py` | 403 guard in get_authkey_templates | +4 lines |
| `frontend/components/ResponsiveLayout.jsx` | Conditional nav items | +4 lines |
| `frontend/App.js` | FeatureRoute guard | +15 lines |
| `frontend/pages/SettingsPage.jsx` | Feature toggle UI section | +30 lines |

**Total: ~71 lines across 6 files. Zero hotspot files touched.**

---

## Open Q1–Q4 Decisions (Recommended Defaults Adopted)

| Q | Question | Decision |
|---|---|---|
| Q1 | Add 403 guard on API when flag is off? | **YES** — included above |
| Q2 | Also gate Campaign Wizard template picker? | **NO** — scope creep, keep simple |
| Q3 | Audit log when flag is flipped? | **NO** — overkill for MVP |
| Q4 | Toggle label in Settings | **"CRM Template Builder"** with subtext "Allow creating and managing WhatsApp templates" |

---

## DB Migration

**None required.** `FeaturesSchema` defaults `crm_templates_enabled=True`. Existing users with no `features` field in DB get `True` by default — no behaviour change.

---

## Verification Matrix

| # | Check | How to verify |
|---|---|---|
| V1 | Default: Templates visible for all existing tenants | Login → sidebar shows Templates ✅ |
| V2 | Disable via Settings toggle → Templates nav disappears | Toggle off → save → sidebar refreshes ✅ |
| V3 | Direct URL `/templates` redirects to `/dashboard` when disabled | Navigate manually ✅ |
| V4 | API 403 on authkey-templates when disabled | `curl GET /api/whatsapp/authkey-templates` with flag-off user → 403 ✅ |
| V5 | Re-enable → Templates nav reappears | Toggle on → save ✅ |
| V6 | Existing users unaffected (no DB migration) | Login as any existing user → Templates visible ✅ |

---

## Planning Output

```
Planning complete: CR-032
Stage: Impact Analysis + Implementation Plan
Risk: LOW
Files WILL change: 6 files (2 backend, 3 frontend + App.js)
Files WILL NOT touch: hotspot files, CampaignsPage, WhatsAppAutomationContent
DB migration: NONE
Owner decisions: ALL locked (Q1-Q4 answered with recommended defaults)
Estimated effort: ~2 hrs
Next: IMPLEMENTATION on owner approval
```

---

*End of CR-032 Impact Analysis + Plan*
