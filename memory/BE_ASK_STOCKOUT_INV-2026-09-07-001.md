# FE → BE: Stock-Out Integration Clarifications
**Ref:** INV-2026-09-07-001  
**Date:** 2026-09-07  
**From:** Frontend team  
**To:** Backend / POS API team  

---

## Background

Backend has shipped inventory control on three POS API endpoints.  
Frontend investigation is complete. Before we write a single line of FE code, we need the items below confirmed in writing — because several of these will determine the exact FE branching logic and error-handling paths.

---

## 1. Confirm the HTTP Status Code on Stock-Out

**Endpoint:** `POST /api/v1/customer/order/place` and `POST /api/v1/customer/order/update-customer-order`

The spec document says the backend returns **HTTP 201** for a stock-out failure.  
`201 Created` is a success code. Axios (our HTTP client) does not throw on 201 — meaning the FE catch block is **never reached** and we must detect the error inside the success path.

**Our ask:**  
Please confirm which behaviour is intentional:

| Option | Status on stock-out | Notes |
|--------|---------------------|-------|
| A | `HTTP 201` with `error` + `out_of_stock_items` in body | Current spec. FE must do an in-band check after every order call. |
| B | `HTTP 422` (or `400`) with `error` + `out_of_stock_items` in body | Standard REST. FE catch block handles it naturally. Simpler and safer. |

If **Option A** is intentional and will not change, we will work around it.  
If **Option B** is feasible, we strongly prefer it — it also prevents future FE engineers from accidentally skipping the in-band check.

---

## 2. Confirm the Exact Stock-Out Response Shape

We need the full, canonical JSON for both order endpoints so we can write typed interfaces.

**Assumed shape (please correct if wrong):**

```json
{
  "error": "Not enough stock for ingredient ID 20290",
  "out_of_stock_items": [
    {
      "food_id": "123",
      "food_name": "Burger"
    }
  ]
}
```

**Questions:**
- Is `out_of_stock_items` always present when `error` is set, or can `error` appear without it?
- Is `food_id` always a string, or can it be a number?
- Can multiple items appear in `out_of_stock_items` in a single response?
- Is `order_id` ever present alongside `error` (partial success), or is it always absent on stock-out?
- Is there any other field we should check (e.g. `status`, `success: false`) to distinguish stock-out from other error types?

---

## 3. Confirm the `stock_out` Field on the Product Listing

**Endpoint:** `POST /api/v1/web/restaurant-product?type=all`

**Assumed shape per item (please correct if wrong):**

```json
{
  "id": 123,
  "name": "Burger",
  "price": 250,
  "stock_out": "Y"
}
```

**Questions:**
- Is `stock_out` present on **every** item, or only when stock is actually zero?
- Possible values: only `"Y"` / `"N"`, or can it be `null`, `0`, `1`, `true/false`?
- If an item is not tracked for inventory, what is the value — `"N"` or absent?
- Is `stock_out` updated in real-time, or is it a periodic snapshot (so FE should not rely on it being live)?
- Is `food_stock` (the numeric quantity field also present on items) related to `stock_out`, or are they independent?

---

## 4. Behaviour When a Cart Has Mixed Items (some in stock, some not)

If a customer's cart has 3 items and 1 is out of stock at order placement:

- Does the backend reject the **entire order**, or place the in-stock items and reject only the out-of-stock one?
- The `out_of_stock_items` array — does it list **all** out-of-stock items in the cart, or only the first one found?

This determines whether FE should offer "remove out-of-stock items and retry" or "go back and rebuild your cart."

---

## 5. Behaviour for Edit-Order (update-customer-order)

Same questions as #4, applied to `POST /api/v1/customer/order/update-customer-order`:

- Is the stock-out contract identical to `order/place`?
- Same HTTP status, same response shape, same `out_of_stock_items` structure?

---

## Summary of Asks

| # | Ask | Urgency |
|---|-----|---------|
| 1 | Confirm HTTP 201 vs 4xx for stock-out — or change to 4xx | **High** — determines FE error handling architecture |
| 2 | Confirm exact stock-out JSON shape and field types | **High** — needed for typed interfaces |
| 3 | Confirm `stock_out` field contract on product listing | **High** — needed before building sold-out UI |
| 4 | Confirm partial-cart vs full-reject behaviour | **Medium** — determines retry UX |
| 5 | Confirm update-order has identical contract | **Medium** — parity check |

---

*Once these are confirmed, FE will proceed to Planning and then Implementation with no further BE dependency.*
