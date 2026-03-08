from fastapi import APIRouter, HTTPException, Depends
from typing import List
from datetime import datetime, timezone
import uuid
import asyncio

from core.database import db
from core.auth import get_current_user
from core.whatsapp import trigger_whatsapp_event, trigger_points_earned_event
from models.schemas import WalletTransaction, WalletTransactionCreate

router = APIRouter(prefix="/wallet", tags=["Wallet"])

@router.post("/transaction", response_model=WalletTransaction)
async def create_wallet_transaction(tx_data: WalletTransactionCreate, user: dict = Depends(get_current_user)):
    customer = await db.customers.find_one({"id": tx_data.customer_id, "user_id": user["id"]})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    current_balance = customer.get("wallet_balance", 0.0)
    
    if tx_data.transaction_type == "debit":
        if current_balance < tx_data.amount:
            raise HTTPException(status_code=400, detail="Insufficient wallet balance")
        new_balance = current_balance - tx_data.amount
    else:
        new_balance = current_balance + tx_data.amount
    
    await db.customers.update_one(
        {"id": tx_data.customer_id},
        {"$set": {"wallet_balance": new_balance}}
    )
    
    tx_id = str(uuid.uuid4())
    tx_doc = {
        "id": tx_id,
        "user_id": user["id"],
        "customer_id": tx_data.customer_id,
        "amount": tx_data.amount,
        "transaction_type": tx_data.transaction_type,
        "description": tx_data.description,
        "payment_method": tx_data.payment_method,
        "balance_after": new_balance,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.wallet_transactions.insert_one(tx_doc)
    
    # Update customer for trigger
    updated_customer = {**customer, "wallet_balance": new_balance}
    
    # Fire WhatsApp triggers
    if tx_data.transaction_type == "credit":
        # wallet_credit trigger
        asyncio.create_task(trigger_whatsapp_event(
            db, user["id"], "wallet_credit", updated_customer,
            {"amount": tx_data.amount, "wallet_balance": new_balance}
        ))
        # Also fires points_earned
        asyncio.create_task(trigger_points_earned_event(
            db, user["id"], updated_customer, 0, "wallet_credit", customer.get("total_points", 0)
        ))
    else:
        # wallet_debit trigger
        asyncio.create_task(trigger_whatsapp_event(
            db, user["id"], "wallet_debit", updated_customer,
            {"amount": tx_data.amount, "wallet_balance": new_balance}
        ))
        # Also fires points_earned
        asyncio.create_task(trigger_points_earned_event(
            db, user["id"], updated_customer, 0, "wallet_debit", customer.get("total_points", 0)
        ))
    
    return WalletTransaction(**tx_doc)

@router.get("/transactions/{customer_id}", response_model=List[WalletTransaction])
async def get_wallet_transactions(customer_id: str, limit: int = 50, user: dict = Depends(get_current_user)):
    transactions = await db.wallet_transactions.find(
        {"customer_id": customer_id, "user_id": user["id"]},
        {"_id": 0}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    return [WalletTransaction(**t) for t in transactions]

@router.get("/balance/{customer_id}")
async def get_wallet_balance(customer_id: str, user: dict = Depends(get_current_user)):
    customer = await db.customers.find_one({"id": customer_id, "user_id": user["id"]}, {"_id": 0})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    return {"balance": customer.get("wallet_balance", 0.0)}
