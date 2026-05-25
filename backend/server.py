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
from routers import auth, customers, points, wallet, coupons, feedback, whatsapp, pos, migration, analytics, scan, menu

# Load CR-002 POS request logging config once at module load (env-driven).
POS_LOG_CONFIG = _load_pos_log_config()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    start_scheduler()
    # Create indexes for order_items collection (AI query performance)
    await db.order_items.create_index("customer_id")
    await db.order_items.create_index("item_name")
    await db.order_items.create_index("order_id")
    # CR-001B-fix Phase 2A F9: persistent migration_sync_logs collection
    # Composite index for "latest log per user per sync_type" lookups (status endpoint fallback)
    await db.migration_sync_logs.create_index(
        [("user_id", 1), ("sync_type", 1), ("started_at", -1)],
        name="user_synctype_started_idx",
    )
    # CR-001C-C V1: ensure coupon_usage idempotency + scan indexes exist.
    await ensure_coupon_indexes(db)
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
api_router.include_router(migration.router)
api_router.include_router(analytics.router)
api_router.include_router(scan.router)
api_router.include_router(menu.router)

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
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
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
