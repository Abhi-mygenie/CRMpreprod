# CR-077 — Implementation Plan
## Configurable Lifecycle & Intelligence Thresholds (Per-Tenant)

**Date**: 2026-08-05  
**Role**: Planning Agent — Implementation Plan  
**Source**: CR_077_IMPACT_ANALYSIS.md · CR_077_CONFIGURABLE_THRESHOLDS_INTAKE.md  
**Risk**: MEDIUM (F4 VIP write path only; all others LOW)  
**Execution order**: E-A → E-B → E-C → E-D → E-E → E-F → E-G → E-H → E-I

---

## Owner Decisions (Locked)

| Q | Answer |
|---|---|
| Q1 | LoyaltySettingsPage — new section |
| Q2 | Per-tenant daily limit, default = 1000 |
| Q3 | YES — VIP auto-promotion toggle (defaults OFF) |
| Q4 | Simple — one `high_spender_threshold` only |
| Q5 | Single phase; defaults = current hardcoded values |

---

## 9 Edits — Edit-by-Edit

---

### E-A · `backend/models/schemas.py`

**Location 1**: After `tier_platinum_min: int = 5000` (line 1033), before `custom_field_1_label`  
**What**: Add 11 new fields to `LoyaltySettings`

```python
    # ── CR-077 · Block A: Lifecycle Stage Boundaries ────────────────────
    at_risk_days_start: int = 31       # last_visit > N-1 days = At Risk begins (was 30)
    at_risk_days_end: int = 60         # last_visit > N days = Dormant begins (was 60)
    dormant_days_end: int = 90         # last_visit > N days = Churned begins (was 90)
    new_customer_max_visits: int = 1   # visits <= N = "New" not "Active" (was 1)
    # ── CR-077 · Block B: Campaign Daily Limit ──────────────────────────
    campaign_daily_limit: int = 1000   # max WhatsApp sends per day (was hardcoded 1000)
    # ── CR-077 · Block C: Customer Value Band Thresholds ────────────────
    vip_score_min: int = 80            # composite score >= N = VIP band (was 80)
    high_score_min: int = 60           # composite >= N = High band (was 60)
    medium_score_min: int = 35         # composite >= N = Medium band (was 35)
    # ── CR-077 · Block D: VIP Auto-Promotion ────────────────────────────
    vip_auto_promote_enabled: bool = False  # auto-set vip_flag on qualifying customers
    vip_auto_score_threshold: int = 80      # score >= N triggers auto-promotion
    # ── CR-077 · Block E: Audience Threshold ────────────────────────────
    high_spender_threshold: int = 5000      # total_spent >= N = "High Spender" chip
```

**Location 2**: After `tier_platinum_min: Optional[int] = None` (line 1084) in `LoyaltySettingsUpdate`  
**What**: Add 11 matching Optional fields

```python
    # CR-077 — Lifecycle & Intelligence Settings
    at_risk_days_start: Optional[int] = None
    at_risk_days_end: Optional[int] = None
    dormant_days_end: Optional[int] = None
    new_customer_max_visits: Optional[int] = None
    campaign_daily_limit: Optional[int] = None
    vip_score_min: Optional[int] = None
    high_score_min: Optional[int] = None
    medium_score_min: Optional[int] = None
    vip_auto_promote_enabled: Optional[bool] = None
    vip_auto_score_threshold: Optional[int] = None
    high_spender_threshold: Optional[int] = None
```

**Verify**: `GET /api/loyalty/settings` returns all 11 new fields with defaults

---

### E-B · `backend/routers/analytics.py`

**4 sub-edits — no existing behavior changes when defaults are used**

**E-B.1** — Replace `get_stage_cutoffs()` (lines 481–488):

```python
def get_stage_cutoffs(settings: dict = None) -> dict:  # CR-077: settings param
    """Get date cutoffs for lifecycle stages. Reads per-tenant config from settings."""
    s = settings or {}
    now = datetime.now(timezone.utc)
    active_days  = s.get("at_risk_days_start", 31) - 1   # default 30
    risk_end     = s.get("at_risk_days_end", 60)           # default 60
    dormant_end  = s.get("dormant_days_end", 90)           # default 90
    new_max_v    = s.get("new_customer_max_visits", 1)     # default 1
    return {
        "thirty_days_ago":  (now - timedelta(days=active_days)).isoformat(),
        "sixty_days_ago":   (now - timedelta(days=risk_end)).isoformat(),
        "ninety_days_ago":  (now - timedelta(days=dormant_end)).isoformat(),
        "new_max_visits":   new_max_v,   # CR-077: added key
    }
```

**E-B.2** — Replace `classify_customer_stage()` line 507:
```python
# Before:   if total_visits <= 1:
# After:
if total_visits <= cutoffs.get("new_max_visits", 1):   # CR-077
```

**E-B.3** — `get_customer_lifecycle_summary()`: fetch settings before calling `get_stage_cutoffs()` (line 534):
```python
# Before:  cutoffs = get_stage_cutoffs()
# After:
settings_doc = await db.loyalty_settings.find_one({"user_id": user_id}, {"_id": 0}) or {}  # CR-077
cutoffs = get_stage_cutoffs(settings_doc)
```

Also update the MongoDB aggregation pipeline hardcoded `1` values (lines 547, 558):
```python
# Line 547 — "New": 1 visit condition
{"$lte": [{"$ifNull": ["$total_visits", 0]}, cutoffs["new_max_visits"]]}
# Line 558 — "Active": 2+ visits condition
{"$gte": [{"$ifNull": ["$total_visits", 0]}, cutoffs["new_max_visits"] + 1]}
```

**E-B.4** — `get_lifecycle_customers()`: fetch settings before calling `get_stage_cutoffs()` (line 761):
```python
settings_doc = await db.loyalty_settings.find_one({"user_id": user_id}, {"_id": 0}) or {}  # CR-077
cutoffs = get_stage_cutoffs(settings_doc)
```

Also update stage query conditions using `cutoffs` instead of hardcoded `1`:
```python
# Line 767: if stage == "new":
query["total_visits"] = {"$lte": cutoffs["new_max_visits"]}
# Line 770: elif stage == "active":
query["total_visits"] = {"$gte": cutoffs["new_max_visits"] + 1}
```

**Verify**: Default tenant → stage counts identical to before. Changed `dormant_days_end=60` tenant → churned count increases.

---

### E-C · `backend/routers/campaigns.py`

**E-C.1** — Remove line 29: `DAILY_LIMIT = 1000`

**E-C.2** — Replace `get_daily_limit()` (lines 271–273):
```python
@router.get("/daily-limit")
async def get_daily_limit(user: dict = Depends(get_current_user)):
    settings_doc = await db.loyalty_settings.find_one(   # CR-077
        {"user_id": user["id"]}, {"_id": 0, "campaign_daily_limit": 1}
    ) or {}
    limit = settings_doc.get("campaign_daily_limit", 1000)
    used = await _get_daily_send_count(user["id"])
    return {"limit": limit, "used": used, "remaining": max(limit - used, 0)}
```

**E-C.3** — Replace daily limit check in `send_campaign()` (lines 609–615):
```python
# Before:
#   if used_today + target_count > DAILY_LIMIT:
#       remaining = max(DAILY_LIMIT - used_today, 0)
#       raise HTTPException(429, f"Daily limit exceeded. {remaining} of {DAILY_LIMIT} remaining today, ...")

# After:
settings_doc = await db.loyalty_settings.find_one(   # CR-077
    {"user_id": user["id"]}, {"_id": 0, "campaign_daily_limit": 1}
) or {}
daily_limit = settings_doc.get("campaign_daily_limit", 1000)
if used_today + target_count > daily_limit:
    remaining = max(daily_limit - used_today, 0)
    raise HTTPException(
        429,
        f"Daily limit exceeded. {remaining} of {daily_limit} remaining today, need {target_count}.",
    )
```

**Verify**: `GET /daily-limit` returns 1000 for default tenant. Change to 500 via Settings → returns 500.

---

### E-D · `backend/core/customer_intelligence.py`

**What**: Add `settings: dict = None` to `compute_customer_value()` + use configurable thresholds.  
Also fix hidden dependency: `absolute_factor` uses hardcoded `90.0` → use `dormant_days_end`.

**E-D.1** — Change function signature (line 134):
```python
async def compute_customer_value(
    db, user_id: str, customer_id: str, customer: dict,
    settings: dict = None   # CR-077: per-tenant band thresholds
) -> Optional[dict]:
```

**E-D.2** — Replace hardcoded band thresholds (line 185):
```python
# Before:
# band = "vip" if composite >= 80 else "high" if composite >= 60 else "medium" if composite >= 35 else "low"

# After (CR-077):
_s = settings or {}
_vip_min = _s.get("vip_score_min", 80)
_hi_min  = _s.get("high_score_min", 60)
_med_min = _s.get("medium_score_min", 35)
band = ("vip" if composite >= _vip_min else
        "high" if composite >= _hi_min else
        "medium" if composite >= _med_min else "low")
```

**E-D.3** — Fix hidden dependency in `_compute_churn_risk()`: replace hardcoded `90.0` (line 236):
```python
# Before:   absolute_factor = min(days_since_last / 90.0, 1.0)
# After (CR-077 + hidden dependency fix from impact analysis):
_dormant_end = (settings or {}).get("dormant_days_end", 90)
absolute_factor = min(days_since_last / float(_dormant_end), 1.0)
```

Note: `_compute_churn_risk()` does not take settings yet. Add `settings=None` param to it,
and pass it from `compute_customer_value()` where `_compute_churn_risk()` is called.

**Verify**: `vip_score_min=70` → customer with score 75 returns band="vip" (was "high" with default 80)

---

### E-E · `backend/routers/suggestions.py`

**What**: Fetch loyalty_settings and pass to `compute_customer_value()` (line 122)

```python
# Before line 113 (before the gather tasks):
settings_doc = await db.loyalty_settings.find_one(   # CR-077
    {"user_id": user_id}, {"_id": 0}
) or {}

# Line 122 — pass settings:
# Before:  tasks.append(compute_customer_value(db, user_id, customer_id, customer))
# After:
tasks.append(compute_customer_value(db, user_id, customer_id, customer, settings_doc))
```

**Verify**: POS customer-intelligence response returns `customer_value.band` same as before for default settings

---

### E-F · `backend/core/loyalty_jobs.py`

**What**: Add `run_vip_auto_promote()` function at end of file (after `run_inactive_customer_reminders()`)

```python
# ── CR-077 · Block D: VIP Auto-Promotion ────────────────────────────────
async def run_vip_auto_promote(user_id: str, settings: dict) -> dict:
    """Daily batch: auto-set vip_flag=True on customers whose spend+recency score
    meets the configured threshold. Gated by vip_auto_promote_enabled toggle.
    Uses simplified 2-factor score (stored fields only, no per-customer DB queries).
    """
    if not settings.get("vip_auto_promote_enabled", False):
        return {"promoted": 0, "evaluated": 0, "skipped_toggle_off": True}

    threshold = settings.get("vip_auto_score_threshold", 80)
    dormant_end = settings.get("dormant_days_end", 90)

    # All customers with 2+ visits (scoring undefined for <= 1 visit)
    customers = await db.customers.find(
        {"user_id": user_id, "total_visits": {"$gte": 2}},
        {"_id": 0, "id": 1, "total_spent": 1, "last_visit": 1, "vip_flag": 1}
    ).to_list(None)

    if not customers:
        return {"promoted": 0, "evaluated": 0}

    # Restaurant max_spend for normalization
    agg = await db.customers.aggregate([
        {"$match": {"user_id": user_id}},
        {"$group": {"_id": None, "max_spend": {"$max": {"$ifNull": ["$total_spent", 0]}}}}
    ]).to_list(1)
    max_spend = max(float((agg[0].get("max_spend") or 1) if agg else 1), 1.0)

    now = datetime.now(timezone.utc)
    promotions = []

    for c in customers:
        total_spent = float(c.get("total_spent") or 0)
        lv_str = c.get("last_visit")
        days_since = float(dormant_end)  # default to max if no visit
        if lv_str:
            try:
                lv = datetime.fromisoformat(lv_str.replace("Z", "+00:00"))
                if not lv.tzinfo:
                    lv = lv.replace(tzinfo=timezone.utc)
                days_since = max(float((now - lv).days), 0.0)
            except Exception:
                pass

        spend_score   = min((total_spent / max_spend) * 100.0, 100.0)
        recency_score = max(0.0, 100.0 - (days_since / 180.0) * 100.0)
        composite     = round(0.6 * spend_score + 0.4 * recency_score, 1)

        if composite >= threshold and not bool(c.get("vip_flag", False)):
            promotions.append(c["id"])

    if promotions:
        await db.customers.update_many(
            {"user_id": user_id, "id": {"$in": promotions}},
            {"$set": {
                "vip_flag": True,
                "vip_auto_promoted_at": now.isoformat()  # CR-077: audit trail
            }}
        )
        logger.info(f"CR-077 VIP auto-promote: {len(promotions)} customers promoted for {user_id}")

    return {"promoted": len(promotions), "evaluated": len(customers)}
```

Add `import logging` if not present. Add `logger = logging.getLogger(__name__)` if not present.

**Verify**: `vip_auto_promote_enabled=False` → `promoted=0, skipped_toggle_off=True`

---

### E-G · `backend/core/scheduler.py`

**What**: Import `run_vip_auto_promote` and add call in `daily_loyalty_jobs()` loop

**E-G.1** — Add to imports (after existing loyalty_jobs imports, ~line 14–19):
```python
from core.loyalty_jobs import (
    run_birthday_bonus,
    run_anniversary_bonus,
    run_expiry_reminders,
    run_points_expiry,
    run_coupon_expiry_reminders,
    run_inactive_customer_reminders,
    run_vip_auto_promote,    # CR-077
)
```

**E-G.2** — Add to `daily_loyalty_jobs()` summary dict (after `"inactive_customer_reminders"` key, ~line 59):
```python
"vip_auto_promote": {"promoted": 0, "evaluated": 0},   # CR-077
```

**E-G.3** — Add call in the per-user loop (after `inactive` call at line 89–90):
```python
# CR-077: VIP auto-promotion (gated by settings toggle)
vip = await run_vip_auto_promote(user_id, settings)
summary["vip_auto_promote"]["promoted"] += vip.get("promoted", 0)
summary["vip_auto_promote"]["evaluated"] += vip.get("evaluated", 0)
```

**Verify**: Daily cron log shows `"vip_auto_promote": {"promoted": 0, "evaluated": N}` for default (toggle off)

---

### E-H · `backend/routers/cron.py`

**What**: Import + call `run_vip_auto_promote` in manual trigger endpoint

**E-H.1** — Add to imports (line 11–12):
```python
from core.loyalty_jobs import (
    run_birthday_bonus, run_anniversary_bonus, run_expiry_reminders,
    run_points_expiry,
    run_vip_auto_promote,    # CR-077
)
```

**E-H.2** — Add call in `trigger_all_jobs()` (after `expiry` call, ~line 54):
```python
vip = await run_vip_auto_promote(user["id"], settings)   # CR-077
```

**E-H.3** — Add to return dict (line 56):
```python
"vip_auto_promote": vip,   # CR-077
```

**Verify**: `POST /api/cron/trigger-all-jobs` returns `"vip_auto_promote": {"promoted": 0, ...}`

---

### E-I · `frontend/src/pages/LoyaltySettingsPage.jsx`

**What**: New "Lifecycle & Engagement" section + save handler updates  
**Risk**: LOW — additive only; existing sections not modified

**E-I.1** — Add 10 new fields to `intFields` array (line 64–70):
```js
const intFields = [
    "min_order_value", "min_redemption_points", "points_expiry_months",
    "expiry_reminder_days", "tier_silver_min", "tier_gold_min", "tier_platinum_min",
    "first_visit_bonus_points", "birthday_bonus_points", "birthday_bonus_days_before",
    "birthday_bonus_days_after", "anniversary_bonus_points", "anniversary_bonus_days_before",
    "anniversary_bonus_days_after", "feedback_bonus_points",
    // CR-077: Lifecycle & Intelligence
    "at_risk_days_start", "at_risk_days_end", "dormant_days_end",
    "new_customer_max_visits", "campaign_daily_limit",
    "vip_score_min", "high_score_min", "medium_score_min",
    "vip_auto_score_threshold", "high_spender_threshold",
];
```

**E-I.2** — Insert new section after "Tier Thresholds" card (after line 269, before `<h2>Bonus Features</h2>`):
```jsx
<h2 className="text-lg font-semibold text-[#1A1A1A] mb-3 mt-6 font-['Montserrat']">
    Lifecycle & Engagement
</h2>
<Card className="rounded-xl border-0 shadow-sm mb-4" data-testid="lifecycle-settings-card">
    <CardContent className="p-4 space-y-4">
        <p className="text-xs text-[#52525B]">
            Defines when customers move between lifecycle stages (New → Active → At Risk → Dormant → Churned).
            Defaults match industry standard. Changes take effect on next page load.
        </p>

        {/* Lifecycle boundaries */}
        <div>
            <p className="font-semibold text-sm mb-2">Stage Boundaries (days inactive)</p>
            <div className="grid grid-cols-3 gap-3">
                <div>
                    <Label className="form-label text-xs">At Risk starts (days)</Label>
                    <Input type="number" min="1" max="180"
                           value={displayNumber(settings.at_risk_days_start ?? 31)}
                           onChange={onNumberChange(setSettings, "at_risk_days_start", parseInt)}
                           className="h-10 rounded-lg text-sm"
                           data-testid="at-risk-days-start-input" />
                    <p className="text-[10px] text-gray-400 mt-1">Default: 31</p>
                </div>
                <div>
                    <Label className="form-label text-xs">Dormant starts (days)</Label>
                    <Input type="number" min="1" max="365"
                           value={displayNumber(settings.at_risk_days_end ?? 60)}
                           onChange={onNumberChange(setSettings, "at_risk_days_end", parseInt)}
                           className="h-10 rounded-lg text-sm"
                           data-testid="at-risk-days-end-input" />
                    <p className="text-[10px] text-gray-400 mt-1">Default: 60</p>
                </div>
                <div>
                    <Label className="form-label text-xs">Churned starts (days)</Label>
                    <Input type="number" min="1" max="730"
                           value={displayNumber(settings.dormant_days_end ?? 90)}
                           onChange={onNumberChange(setSettings, "dormant_days_end", parseInt)}
                           className="h-10 rounded-lg text-sm"
                           data-testid="dormant-days-end-input" />
                    <p className="text-[10px] text-gray-400 mt-1">Default: 90</p>
                </div>
            </div>
        </div>

        {/* Campaign daily limit */}
        <div>
            <Label className="form-label">Daily WhatsApp Campaign Limit</Label>
            <Input type="number" min="100" max="50000"
                   value={displayNumber(settings.campaign_daily_limit ?? 1000)}
                   onChange={onNumberChange(setSettings, "campaign_daily_limit", parseInt)}
                   className="h-12 rounded-xl"
                   data-testid="campaign-daily-limit-input" />
            <p className="text-xs text-[#52525B] mt-1">Max WhatsApp messages per day via manual send. Default: 1,000.</p>
        </div>

        {/* High spender threshold */}
        <div>
            <Label className="form-label">High Spender Threshold (₹)</Label>
            <Input type="number" min="100"
                   value={displayNumber(settings.high_spender_threshold ?? 5000)}
                   onChange={onNumberChange(setSettings, "high_spender_threshold", parseInt)}
                   className="h-12 rounded-xl"
                   data-testid="high-spender-threshold-input" />
            <p className="text-xs text-[#52525B] mt-1">Total spend ≥ this = "High Spender" audience chip. Default: ₹5,000.</p>
        </div>

        {/* VIP auto-promotion */}
        <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-3">
                <div>
                    <p className="font-semibold text-[#1A1A1A]">VIP Auto-Promotion</p>
                    <p className="text-xs text-[#52525B]">
                        Automatically mark customers as VIP based on spend + recency score (runs nightly)
                    </p>
                </div>
                <Switch
                    checked={settings.vip_auto_promote_enabled ?? false}
                    onCheckedChange={(checked) => setSettings({...settings, vip_auto_promote_enabled: checked})}
                    data-testid="vip-auto-promote-toggle" />
            </div>
            {settings.vip_auto_promote_enabled && (
                <div>
                    <Label className="form-label text-xs">VIP Score Threshold (0–100)</Label>
                    <Input type="number" min="50" max="100"
                           value={displayNumber(settings.vip_auto_score_threshold ?? 80)}
                           onChange={onNumberChange(setSettings, "vip_auto_score_threshold", parseInt)}
                           className="h-10 rounded-lg text-sm"
                           data-testid="vip-auto-score-input" />
                    <p className="text-[10px] text-gray-400 mt-1">
                        Customers with composite score ≥ this will be auto-flagged as VIP. Default: 80.
                    </p>
                </div>
            )}
        </div>
    </CardContent>
</Card>
```

**Verify**: Settings page shows new section → change `campaign_daily_limit` → Save → `GET /api/loyalty/settings` returns new value

---

## Files WILL Change

| File | Edit | Risk |
|---|---|---|
| `backend/models/schemas.py` | E-A: 11 new fields on LoyaltySettings + Update | LOW |
| `backend/routers/analytics.py` | E-B: configurable cutoffs + 2 endpoint fetches | LOW |
| `backend/routers/campaigns.py` | E-C: per-tenant daily limit at 2 call sites | LOW |
| `backend/core/customer_intelligence.py` | E-D: configurable bands + hidden dependency fix | LOW |
| `backend/routers/suggestions.py` | E-E: pass settings to compute_customer_value | LOW |
| `backend/core/loyalty_jobs.py` | E-F: new run_vip_auto_promote() | MEDIUM |
| `backend/core/scheduler.py` | E-G: add VIP job to daily loop | MEDIUM |
| `backend/routers/cron.py` | E-H: add VIP job to manual trigger | LOW |
| `frontend/src/pages/LoyaltySettingsPage.jsx` | E-I: new section + intFields update | LOW |

## Files WILL NOT Change

`core/coupon.py` · `core/loyalty.py` · `routers/pos.py` · `routers/auth.py` ·  
`core/whatsapp.py` · `routers/whatsapp.py` · `routers/customers.py` (CRUD) ·  
`core/campaign_jobs.py` · `AudiencesPage.jsx` · `CustomersPage.jsx` · `SegmentsPage.jsx`

---

## Verification Matrix

| # | Test | Expected |
|---|---|---|
| V1 | GET /loyalty/settings — default tenant | Returns all 11 new fields with defaults |
| V2 | No settings change — lifecycle summary counts | Identical to before implementation |
| V3 | Change `dormant_days_end=60` → get lifecycle summary | Churned count increases, dormant decreases |
| V4 | Change `campaign_daily_limit=500` → GET /daily-limit | Returns `{"limit": 500, ...}` |
| V5 | Try sending 600-customer campaign when limit=500 | 429 error: "Daily limit exceeded. 500 of 500 remaining" |
| V6 | suggestions.py — default thresholds | customer_value.band same as before |
| V7 | `vip_score_min=70` via settings | Customer with score 75 returns band="vip" |
| V8 | `vip_auto_promote_enabled=False` — trigger cron | `promoted: 0, skipped_toggle_off: true` |
| V9 | `vip_auto_promote_enabled=True, threshold=80` — trigger | High-spend customers get `vip_flag=true` |
| V10 | LoyaltySettingsPage — save all new fields | Round-trip: save → fetch → values preserved |
| V11 | All existing loyalty tests | PASS — no regression |

---

## Execution Order Note

Implement E-A first (schema). All subsequent edits depend on the schema fields existing.  
E-F, E-G, E-H (VIP auto-promote) can be implemented last — lower risk, isolated to cron path.  
CR-076 E-A (lifecycle filter in helpers.py) automatically benefits from CR-077 because it reads  
from `loyalty_settings` at query time — no additional coordination needed.
