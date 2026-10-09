# Phase 3C — Before/After Proof (run against live config docs, read-only)

> Date (UTC): 2026-05-31 · Method: deterministic simulation of backend merge + FE merge + apply-time
> fallbacks (`color || DEFAULT_THEME`, `font || 'Poppins'`, `if(borderRadius)`), using the **5 real
> `customer_app_config` docs** from live `mygenie` (read-only) + a synthetic no-doc restaurant.

## Setup
- OLD backend no-doc defaults: 85 keys. NEW canonical `DEFAULT_APP_CONFIG`: 98 keys (font→Poppins, +13 FE keys).
- BEFORE model: backend returns `OLD` (no doc) or **raw doc**; FE merges `{**FE_DEFAULT_CONFIG, **backend}`.
- AFTER model: backend returns `{**NEW, **doc}`; FE merges `{**FE_DEFAULT_CONFIG, **backend}`.

## Result (effective rendered values)
| Restaurant | Delta |
|---|---|
| NO-DOC (synthetic) | `fontHeading/fontBody`: **Montserrat → Poppins** (intended, owner-approved) |
| doc:364 | NO CHANGE |
| doc:618 | NO CHANGE |
| doc:698 | NO CHANGE |
| doc:478 | NO CHANGE |
| **doc:716** | **`borderRadius`: (unset/CSS-default) → rounded**  ⚠️ unexpected |

## Why 716 changes (root cause)
- `716`'s config doc does **not** set `borderRadius`.
- TODAY: backend returns the raw 716 doc (no `borderRadius`) → FE default is `null` → apply code `if(config.borderRadius)` is false → **corners stay at CSS default (sharp).**
- AFTER merge-complete: 716 inherits the canonical `borderRadius` → if canonical = `"rounded"` (the OLD backend no-doc value), 716 would render **rounded**.
- This is a **pre-existing inconsistency**: no-doc restaurants default to `"rounded"`, but doc-without-borderRadius restaurants (716) effectively get **unset**. A single canonical value cannot preserve **both**.

## The decision (one value)
- **Option A — canonical `borderRadius = "rounded"`:** preserves no-doc restaurants + 364/618/698/478; **716 changes** unset → rounded (aligns 716 to the platform-standard look; 716 is already under de-hardcoding review).
- **Option B — canonical `borderRadius = null`:** preserves 716; **no-doc restaurants change** rounded → unset (unknown how many live no-doc restaurants).

Everything else is proven **zero-change** for the 4 configured restaurants, and the only font change is the approved Montserrat→Poppins on no-doc restaurants.

## Status
**DECISION: Option A — canonical `borderRadius = "rounded"`** (owner-approved 2026-05-31). Preserves no-doc restaurants + 364/618/698/478. **716 changes square → rounded** unless 716 is reconfigured (see advisory below). All other canonical values finalized and zero-change.

## 716 advisory (how to keep 716's current look, if desired)
- **Only** 716's corner-roundness changes (square → rounded). Font (Poppins), colours, and every show/hide toggle stay **identical**.
- If 716 should keep its current **square** look: set 716's **Corner style = Sharp** in the **Admin → Branding** panel (one setting, no code). Then visually confirm it matches today (the current "unset" state renders the base-CSS corners, which is effectively square/minimal).
- If rounded corners on 716 are acceptable (consistent with the other restaurants): **do nothing**.
