# CR-002 — WhatsApp Automation Trigger Flow — Analysis

> **Status:** `analysis_not_started`
> **Sprint:** CRM 1.0
> **Priority:** P1
> **Depends On:** CR-001

## Objective
Fix WhatsApp automation after POS order ingestion so that configured events trigger messages correctly.

## Sections To Be Filled

### 1. Current Trigger Flow Trace
_Trace the call chain from `pos_order_webhook` → `trigger_whatsapp_event` → AuthKey.io send._

### 2. `automation_rules` vs `whatsapp_event_template_map` Audit
_Document the mismatch: 10 rows in automation_rules, 0 rows in whatsapp_event_template_map. Determine which table the active code uses and which the UI writes to._

### 3. Template Variable Mapping Audit
_Check `whatsapp_template_variable_map` — are mappings correct? Are body_values built correctly?_

### 4. AuthKey Configuration Audit
_Check `users.authkey_api_key` presence for active restaurants._

### 5. Message Logging Audit
_Verify `whatsapp_message_logs` entries are created with correct status tracking._

### 6. CRM UI Audit
_Check Templates page, Message Status page — do they read/write the correct collections?_

### 7. Identified Issues
_List all issues found during analysis._

### 8. Recommendations
_Proposed fixes, ordered by priority._

---

**WARNING:** Do not use this placeholder as implementation approval. Analysis must be completed and reviewed before planning begins.
