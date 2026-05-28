#!/usr/bin/env bash
# =============================================================================
# CR-001A — On-host verification script
# =============================================================================
# Run this on the crm.mygenie.online host AFTER you deploy + restart the
# backend. It tells you, in <2 seconds, whether the running uvicorn worker is
# actually executing the new pos.py with the alias fix.
#
# Usage:   sudo bash cr_001a_check.sh /path/to/app
#
#   (Replace /path/to/app with wherever the codebase lives on prod —
#    same dir that contains backend/routers/pos.py)
# =============================================================================
set -u

APP_DIR="${1:-/app}"
POS_FILE="$APP_DIR/backend/routers/pos.py"
EXIT=0

bold() { printf "\e[1m%s\e[0m\n" "$*"; }
ok()   { printf "  \e[32m✅ %s\e[0m\n" "$*"; }
bad()  { printf "  \e[31m❌ %s\e[0m\n" "$*"; EXIT=1; }
warn() { printf "  \e[33m⚠️  %s\e[0m\n" "$*"; }

bold "CR-001A live verification on host $(hostname)"
bold "APP_DIR = $APP_DIR"
echo

# ─── Step 1: file on disk has the fix ────────────────────────────────────────
bold "[1/4] Is the alias fix present in pos.py on disk?"
if [ ! -f "$POS_FILE" ]; then
    bad "pos.py NOT FOUND at $POS_FILE — wrong APP_DIR?"
    exit 2
fi
N=$(grep -c 'AliasChoices("pos_food_id", "item_id")' "$POS_FILE" 2>/dev/null || echo 0)
if [ "$N" -ge 1 ]; then
    ok "pos_food_id alias present in $POS_FILE"
else
    bad "pos_food_id alias NOT present in $POS_FILE  →  code was NOT pulled to this host"
fi

M=$(grep -c 'AliasChoices("order_created_at", "created_at")' "$POS_FILE" 2>/dev/null || echo 0)
if [ "$M" -ge 1 ]; then
    ok "order_created_at alias present"
else
    bad "order_created_at alias NOT present in $POS_FILE"
fi
echo "  pos.py mtime: $(stat -c '%y' "$POS_FILE" 2>/dev/null || stat -f '%Sm' "$POS_FILE")"
echo

# ─── Step 2: which python file is the live uvicorn worker actually using? ────
bold "[2/4] Is the live uvicorn worker process using THIS pos.py?"
# Try to find the worker pid via supervisor first; fall back to pgrep
PIDS=$(pgrep -f "uvicorn.*server:app" 2>/dev/null | head -5)
if [ -z "$PIDS" ]; then
    PIDS=$(pgrep -f "gunicorn.*server:app" 2>/dev/null | head -5)
fi
if [ -z "$PIDS" ]; then
    warn "could not find a uvicorn/gunicorn worker via pgrep — try: ps aux | grep -E 'uvicorn|gunicorn'"
else
    for PID in $PIDS; do
        START=$(ps -o lstart= -p "$PID" 2>/dev/null)
        CWD=$(readlink "/proc/$PID/cwd" 2>/dev/null || echo "?")
        OPEN=$(ls -l "/proc/$PID/cwd" 2>/dev/null | awk '{print $NF}')
        echo "  PID=$PID  started=$START  cwd=$CWD"
        # Compare worker start time vs file mtime
        FILE_EPOCH=$(stat -c '%Y' "$POS_FILE" 2>/dev/null || echo 0)
        PROC_EPOCH=$(date -d "$START" +%s 2>/dev/null || echo 0)
        if [ "$PROC_EPOCH" -gt 0 ] && [ "$FILE_EPOCH" -gt 0 ]; then
            if [ "$PROC_EPOCH" -ge "$FILE_EPOCH" ]; then
                ok "  worker $PID started AT or AFTER pos.py mtime → has loaded the new model ✓"
            else
                bad "  worker $PID started BEFORE pos.py was updated → it is running the OLD model. RESTART REQUIRED."
            fi
        fi
    done
fi
echo

# ─── Step 3: introspect the imported model in a fresh subprocess ─────────────
bold "[3/4] Import the model and inspect its declared aliases"
cd "$APP_DIR/backend" && python3 - <<'PY'
import sys, os
sys.path.insert(0, ".")
try:
    from routers.pos import OrderItem, POSOrderWebhook
except Exception as e:
    print(f"  ❌ failed to import routers.pos: {e}")
    sys.exit(1)

def show(name, model, field):
    f = model.model_fields.get(field)
    if not f:
        print(f"  ❌ {name}.{field} missing in model")
        return False
    va = f.validation_alias
    s = repr(va)
    has_alias = "AliasChoices" in s
    print(f"  {name}.{field}.validation_alias = {s}")
    return has_alias

ok_a = show("OrderItem", OrderItem, "pos_food_id")
ok_b = show("OrderItem", OrderItem, "item_qty")
ok_c = show("OrderItem", OrderItem, "item_price")
ok_d = show("POSOrderWebhook", POSOrderWebhook, "order_created_at")

ok_cfg = OrderItem.model_config.get("populate_by_name") is True
print(f"  OrderItem.model_config.populate_by_name = {OrderItem.model_config.get('populate_by_name')}")

if all([ok_a, ok_b, ok_c, ok_d, ok_cfg]):
    print("  ✅ CR-001A alias contract present in imported model")
else:
    print("  ❌ CR-001A alias contract MISSING in imported model")
    sys.exit(1)
PY
RC=$?
if [ "$RC" -ne 0 ]; then EXIT=1; fi
echo

# ─── Step 4: live HTTP probe (no DB mutation) ────────────────────────────────
bold "[4/4] Live HTTP probe — does the running route accept the realtime alias schema?"
# Send an UNAUTHENTICATED payload with realtime alias keys. Should return 401
# (auth gate) → proves Pydantic accepted the schema. A 422 would mean the
# running process still rejects realtime keys.
RESP=$(curl -s -o /tmp/cr001a_probe.out -w "%{http_code}" \
  -X POST "http://127.0.0.1:8001/api/pos/orders" \
  -H "Content-Type: application/json" \
  -d '{"restaurant_id":"R-PROBE","order_id":"PROBE-CR001A","cust_mobile":"0",
       "order_amount":0,"created_at":"2026-01-01T00:00:00Z",
       "items":[{"item_name":"x","item_id":"1","qty":1,"price":0}]}' 2>/dev/null)
case "$RESP" in
    401) ok "HTTP 401 — route accepted alias schema and rejected at auth (expected) ✓" ;;
    422) bad "HTTP 422 — running process REJECTED alias schema → still on OLD code" ;;
    "")  warn "could not reach backend on 127.0.0.1:8001 — adjust port/host" ;;
    *)   warn "HTTP $RESP — unexpected. body: $(cat /tmp/cr001a_probe.out 2>/dev/null | head -c 300)" ;;
esac
echo

# ─── Verdict ─────────────────────────────────────────────────────────────────
if [ "$EXIT" -eq 0 ]; then
    bold "🎉 ALL CHECKS PASS — CR-001A alias fix is LIVE on this host"
else
    bold "💥 ONE OR MORE CHECKS FAILED — alias fix NOT effective. Restart the backend service and re-run."
fi
exit $EXIT
