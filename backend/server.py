from contextlib import asynccontextmanager
from fastapi import FastAPI, APIRouter
from starlette.middleware.cors import CORSMiddleware
from datetime import datetime, timezone
import os
import logging

from core.database import db, close_db_connection
from core.scheduler import start_scheduler, stop_scheduler
from core.pos_request_logger import (
    POSRequestLoggingMiddleware,
    load_config as _load_pos_log_config,
    ensure_pos_request_logs_indexes,
)
from core.coupon import ensure_coupon_indexes  # CR-001C-C V1
from routers import auth, customers, points, wallet, coupons, feedback, whatsapp, pos, pos_reports, migration, analytics, scan, menu, suggestions, invoices, campaigns

# Load CR-002 POS request logging config once at module load (env-driven).
POS_LOG_CONFIG = _load_pos_log_config()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    start_scheduler()
    # Create indexes (wrapped — read-only Atlas users skip gracefully)
    try:
        await db.order_items.create_index("customer_id")
        await db.order_items.create_index("item_name")
        await db.order_items.create_index("order_id")
        await db.orders.create_index([("user_id", 1), ("customer_id", 1)], name="idx_user_customer")
        await db.orders.create_index([("user_id", 1), ("created_at", -1)], name="idx_user_created")
        await db.order_items.create_index([("user_id", 1), ("customer_id", 1)], name="idx_oi_user_customer")
    except Exception as e:
        logging.getLogger(__name__).warning(f"Index creation skipped (insufficient permissions): {e}")
    try:
        await db.migration_sync_logs.create_index(
            [("user_id", 1), ("sync_type", 1), ("started_at", -1)],
            name="user_synctype_started_idx",
        )
    except Exception:
        pass
    try:
        await ensure_coupon_indexes(db)
    except Exception as e:
        logging.getLogger(__name__).warning(f"Coupon indexes skipped: {e}")
    try:
        await db.whatsapp_message_logs.create_index(
            [("user_id", 1), ("created_at", -1)], name="idx_wml_user_created"
        )
        await db.whatsapp_message_logs.create_index(
            [("user_id", 1), ("status", 1)], name="idx_wml_user_status"
        )
        await db.whatsapp_message_logs.create_index(
            "message_id", sparse=True, name="idx_wml_message_id"
        )
        await db.whatsapp_message_logs.create_index(
            [("user_id", 1), ("idempotency_key", 1)],
            unique=True,
            partialFilterExpression={"idempotency_key": {"$exists": True, "$type": "string"}},
            name="idx_wml_user_idem",
        )
        await db.whatsapp_callback_logs.create_index(
            [("received_at", -1)], name="idx_wcl_received"
        )
        await db.whatsapp_callback_logs.create_index(
            "logid", sparse=True, name="idx_wcl_logid"
        )
    except Exception as e:
        logging.getLogger(__name__).warning(f"WhatsApp log indexes skipped: {e}")
    # CR-043-A: composite index for tag-filter queries on customers list
    try:
        await db.customers.create_index(
            [("user_id", 1), ("tags", 1)], name="idx_customers_user_tags"
        )
    except Exception as e:
        logging.getLogger(__name__).warning(f"CR-043-A customers.tags index skipped: {e}")
    # CR-078: single-field user_id index on customers (improves all /pos/reports/* pipelines)
    try:
        await db.customers.create_index("user_id", name="idx_customers_user_id")
    except Exception as e:
        logging.getLogger(__name__).warning(f"CR-078 customers.user_id index skipped: {e}")
    # CR-002: create indexes for pos_request_logs only when logging is enabled
    if POS_LOG_CONFIG["enabled"]:
        await ensure_pos_request_logs_indexes(db, POS_LOG_CONFIG["ttl_days"])
        logging.getLogger(__name__).warning(
            "POS request logging is ENABLED (prefix=%s ttl_days=%s sample=%s capture_resp=%s)",
            POS_LOG_CONFIG["path_prefix"],
            POS_LOG_CONFIG["ttl_days"],
            POS_LOG_CONFIG["sample_rate"],
            POS_LOG_CONFIG["capture_response_body"],
        )
    # CR-014: Invoice collection indexes (safe — skip if already exists)
    try:
        await db.invoices.create_index("token", unique=True)
        await db.invoices.create_index([("user_id", 1), ("restaurant_order_id", 1)])
    except Exception:
        pass  # Indexes already exist

    # CR-024: Campaign collection indexes
    try:
        await db.campaigns.create_index([("user_id", 1), ("created_at", -1)], name="idx_campaigns_user_created")
        await db.campaign_runs.create_index([("user_id", 1), ("started_at", -1)], name="idx_runs_user_started")
        await db.campaign_runs.create_index([("campaign_id", 1), ("started_at", -1)], name="idx_runs_campaign_started")
        # CR-024 Phase 3: compound index for scheduler "find due rows" query
        await db.campaigns.create_index(
            [("status", 1), ("next_run_at", 1)],
            name="idx_campaigns_status_next_run",
            sparse=True,
        )
    except Exception:
        pass

    # CR-072: customer_documents indexes (document capture)
    try:
        await db.customer_documents.create_index(
            [("user_id", 1), ("customer_id", 1), ("doc_type", 1), ("uploaded_at", -1)],
            name="idx_custdocs_user_cust_type_date",
        )
        await db.customer_documents.create_index(
            "customer_id", name="idx_custdocs_customer",
        )
    except Exception:
        pass

    # CR-030: webhook_logs indexes for idempotency and audit queries
    try:
        await db.webhook_logs.create_index(
            [("user_id", 1), ("webhook_id", 1)],
            unique=True,
            name="idx_webhook_logs_user_webhook_id",
        )
        await db.webhook_logs.create_index(
            [("user_id", 1), ("created_at", -1)],
            name="idx_webhook_logs_user_created",
        )
    except Exception:
        pass

    # CR-024 Phase 3: backfill next_run_at for any pre-existing scheduled/recurring rows
    try:
        from core.campaign_jobs import backfill_next_run_at
        await backfill_next_run_at()
    except Exception as e:
        logging.getLogger(__name__).warning(f"backfill_next_run_at failed: {e}")

    yield
    # Shutdown
    stop_scheduler()
    await close_db_connection()

# Create the main app
app = FastAPI(title="DinePoints - Loyalty & CRM", lifespan=lifespan)

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Include all routers
api_router.include_router(auth.router)
api_router.include_router(customers.router)
api_router.include_router(customers.qr_router)
api_router.include_router(customers.segments_router)
api_router.include_router(points.router)
api_router.include_router(points.loyalty_router)
api_router.include_router(wallet.router)
api_router.include_router(coupons.router)
api_router.include_router(feedback.router)
api_router.include_router(feedback.analytics_router)
api_router.include_router(whatsapp.router)
api_router.include_router(pos.router)
api_router.include_router(pos.messaging_router)
api_router.include_router(pos_reports.router)  # CR-078
api_router.include_router(migration.router)
api_router.include_router(analytics.router)
api_router.include_router(scan.router)
api_router.include_router(menu.router)
api_router.include_router(suggestions.router)
api_router.include_router(invoices.router)
api_router.include_router(campaigns.router)

# Root routes
@api_router.get("/")
async def root():
    return {"message": "DinePoints API - Loyalty & CRM for Restaurants"}

@api_router.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.now(timezone.utc).isoformat()}

# Scheduler admin routes
from routers import cron
api_router.include_router(cron.router)

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ['CORS_ORIGINS'].split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# CR-002 — POS request logging middleware.
# Added AFTER CORS in code, so per Starlette's LIFO order it runs INSIDE CORS at
# runtime (CORS still handles preflights first). The middleware is a fast no-op
# when POS_REQUEST_LOGGING_ENABLED=false (default).
app.add_middleware(
    POSRequestLoggingMiddleware,
    db=db,
    config=POS_LOG_CONFIG,
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)
