# CR — Config-Driven Mandatory Fields + Table/Room Scan Order Misrouting

| Field | Value |
|---|---|
| CR ID | CR-2026-05-30-001 |
| Registered at (UTC) | 2026-05-30 07:35 UTC |
| Registered by | E1 (on behalf of user) |
| Status | **IMPLEMENTED — Item 1 (skipOtp + mandatory fields) shipped. Items 2 & 3 (table/room misrouting root cause) parked by design — CR-2026-05-30-002 deployed as policy workaround.** |
| Action requested in this session | Register only. No other action. |
| Hard constraint (applies to entire CR) | **Restaurant `716` must NOT be disturbed by any change planned/implemented under this CR. All planning and changes must treat `716` as-is.** |

---

## Items

### 1. Make customer **name** and **phone number** mandatory/non-mandatory via configuration; auto-skip OTP when non-mandatory

- Whether customer name and customer phone number are mandatory at order/checkout time must be controlled by **configuration** (not hardcoded).
- When configured as **non-mandatory**, the **OTP route must not appear** — the flow should **auto-skip** OTP entirely.
- When configured as **mandatory**, current OTP behaviour stays.

> Note (not yet validated): the per-restaurant `customer_app_config` collection already has `mandatoryCustomerName` and `mandatoryCustomerPhone` flags. To be confirmed during the (later) investigation phase whether these are the right knobs or if new keys are needed.

---

### 2. Table scan flow — sometimes creates a **new table** instead of attaching the order to the existing table

- When a user is sitting at a table and scans the table QR, the order is occasionally being created against a brand-new table rather than the table the QR was actually scanned for.
- Intermittent. Reproduction conditions, frequency, and affected restaurants to be captured during investigation.

---

### 3. Room scan flow — sometimes the order is created as **walk-in** instead of attached to the room

- Same class of bug as #2, but for room-mode restaurants/hotels.
- Order scanned from a room QR is occasionally created as a walk-in order rather than a room-attached order.
- Intermittent. Repro details to be captured during investigation.

---

## Out-of-scope for this CR (explicit)

- **Restaurant `716`** — must remain untouched in all planning, code changes, and rollouts under this CR.

## Next step (not in this session)

- Investigation phase: reproduce items 2 & 3, audit the table/room QR → order-creation path in `server.py` + frontend scan flow, and trace the current usage of `mandatoryCustomerName` / `mandatoryCustomerPhone` flags and the OTP gate.
- No action taken yet — awaiting user go-ahead.
