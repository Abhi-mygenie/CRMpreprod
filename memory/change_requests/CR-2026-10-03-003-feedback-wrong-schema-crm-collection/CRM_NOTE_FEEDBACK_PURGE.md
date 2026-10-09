# NOTE TO CRM — stray feedback rows (CR-2026-10-03-003, D3=a) — owner sends

Until 2026-10-07 the Customer App backend wrote diner feedback **directly into your `feedback` collection** on the shared `mygenie` DB, bypassing `POST /scan/feedback` and using our own document shape. That write path is now deleted (Customer App CR-2026-10-03-003); all new feedback arrives via `POST /scan/feedback` with the customer token.

**Ask:** please purge or convert the legacy rows. They are identifiable by shape — they have `name`, `email`, `message`, `created_at` and **no** `customer_id` / `customer_phone` / `status`:

```js
db.feedback.find({ customer_id: { $exists: false }, name: { $exists: true } })
```

We will not touch the collection ourselves (ownership board: `feedback` = CRM). Count on 2026-10-03 was small (UAT); please confirm when done so we can close the item.

Related: CR-096 (hybrid no-token intake) — our follow-up CR-2026-10-07-001 is waiting on it.
