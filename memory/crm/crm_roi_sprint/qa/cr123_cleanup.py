"""CR-123 test-data cleanup — preprod r689 only. Run AFTER owner smoke.
Deletes CR123-* test orders for the Alok Test customer and restores the pre-test snapshot."""
import json
import os
import sys

from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv("/app/backend/.env")
db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]

USER_ID = "pos_0001_restaurant_689"
CUSTOMER_ID = "5a7e2ff3-3e26-47d2-81b8-b54a9a02d3ae"
SNAP = os.path.join(os.path.dirname(__file__), "cr123_pretest_snapshot.json")

if db.users.find_one({"id": USER_ID}, {"_id": 0, "id": 1}) is None:
    sys.exit("r689 user not found — wrong DB?")

orders = list(db.orders.find({"user_id": USER_ID, "pos_order_id": {"$regex": r"^CR123-"}}, {"_id": 0, "id": 1, "pos_order_id": 1}))
ids = [o["id"] for o in orders]
pos_ids = [o["pos_order_id"] for o in orders]
print(f"found {len(orders)} CR123 orders: {pos_ids}")
if "--apply" not in sys.argv:
    sys.exit("dry run — pass --apply to delete")

r = {}
r["orders"] = db.orders.delete_many({"user_id": USER_ID, "id": {"$in": ids}}).deleted_count
r["order_items"] = db.order_items.delete_many({"user_id": USER_ID, "order_id": {"$in": ids}}).deleted_count
r["points_transactions"] = db.points_transactions.delete_many({"user_id": USER_ID, "customer_id": CUSTOMER_ID, "order_id": {"$in": ids}}).deleted_count
for coll in ("loyalty_redemptions", "loyalty_transactions"):
    r[coll] = db[coll].delete_many({"user_id": USER_ID, "customer_id": CUSTOMER_ID, "order_id": {"$in": pos_ids + ids}}).deleted_count
snap = json.load(open(SNAP))
db.customers.update_one({"id": CUSTOMER_ID, "user_id": USER_ID}, {"$set": {
    "total_points": snap["total_points"], "tier": snap["tier"],
    "total_visits": snap["total_visits"], "total_spent": snap["total_spent"],
    "total_points_earned": snap.get("total_points_earned", 0), "total_points_redeemed": 0,
}})
print("deleted:", r, "| customer restored to", snap)
