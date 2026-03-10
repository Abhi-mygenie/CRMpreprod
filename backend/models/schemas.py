from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional

# Auth Models
class UserBase(BaseModel):
    email: EmailStr
    restaurant_name: str
    phone: str

class UserCreate(UserBase):
    password: str

class UserLogin(BaseModel):
    email: str
    password: str

class UserResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    email: str
    restaurant_name: str
    phone: str
    pos_id: str = ""
    pos_name: str = ""
    created_at: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
    is_demo: bool = False

# Customer Models
class CustomerBase(BaseModel):
    # Basic Information
    name: str
    phone: str
    country_code: str = "+91"
    email: Optional[str] = None
    gender: Optional[str] = None  # male, female, other, prefer_not_to_say
    dob: Optional[str] = None
    anniversary: Optional[str] = None
    preferred_language: Optional[str] = None  # en, hi, etc.
    customer_type: str = "normal"  # normal, corporate
    segment_tags: Optional[List[str]] = None  # Array of segment IDs
    
    # Contact & Marketing Permissions
    whatsapp_opt_in: bool = False
    whatsapp_opt_in_date: Optional[str] = None
    promo_whatsapp_allowed: bool = True
    promo_sms_allowed: bool = True
    email_marketing_allowed: bool = True
    call_allowed: bool = True
    is_blocked: bool = False
    
    # Loyalty Information
    referral_code: Optional[str] = None
    referred_by: Optional[str] = None  # customer_id who referred
    membership_id: Optional[str] = None
    membership_expiry: Optional[str] = None
    
    # Behavior & Preferences
    favorite_category: Optional[str] = None
    preferred_payment_mode: Optional[str] = None  # cash, card, upi
    
    # Customer Source & Journey
    lead_source: Optional[str] = None  # Walk-in, Swiggy, Zomato, Instagram, Referral, Airbnb
    campaign_source: Optional[str] = None  # UTM tracking
    last_interaction_date: Optional[str] = None
    assigned_salesperson: Optional[str] = None  # staff_id reference
    
    # WhatsApp CRM Tracking
    last_whatsapp_sent: Optional[str] = None  # datetime
    last_whatsapp_response: Optional[str] = None  # datetime
    last_campaign_clicked: Optional[str] = None  # campaign_id
    last_coupon_used: Optional[str] = None  # coupon_id
    automation_status_tag: Optional[str] = None  # automation rule status
    
    # Corporate Information
    gst_name: Optional[str] = None
    gst_number: Optional[str] = None
    billing_address: Optional[str] = None
    credit_limit: Optional[float] = None
    payment_terms: Optional[str] = None  # Net 30, Net 60, etc.
    
    # Address
    address: Optional[str] = None
    address_line_2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    country: Optional[str] = None
    delivery_instructions: Optional[str] = None
    map_location: Optional[dict] = None  # {lat, lng}
    
    # Preferences
    allergies: Optional[List[str]] = None
    favorites: Optional[List[str]] = None
    
    # Dining Preferences
    preferred_dining_type: Optional[str] = None  # Dine-In, Takeaway, Delivery
    preferred_time_slot: Optional[str] = None
    favorite_table: Optional[str] = None
    avg_party_size: Optional[int] = None
    diet_preference: Optional[str] = None  # Veg, Non-Veg, Vegan, Jain, Eggetarian
    spice_level: Optional[str] = None  # Mild, Medium, Spicy, Extra Spicy
    cuisine_preference: Optional[str] = None
    
    # Special Occasions
    kids_birthday: Optional[List[str]] = None  # Array of dates
    spouse_name: Optional[str] = None
    festival_preference: Optional[List[str]] = None  # Diwali, Eid, Christmas, etc.
    special_dates: Optional[List[dict]] = None  # [{date, label}]
    
    # Feedback & Flags
    last_rating: Optional[int] = None  # 1-5 stars
    nps_score: Optional[int] = None  # -100 to 100
    complaint_flag: bool = False
    vip_flag: bool = False
    blacklist_flag: bool = False
    
    # AI/Advanced (MyGenie CRM Differentiator)
    predicted_next_visit: Optional[str] = None  # datetime
    churn_risk_score: Optional[int] = None  # 0-100
    recommended_offer_type: Optional[str] = None  # Discount, Freebie, Points
    price_sensitivity_score: Optional[str] = None  # Low, Medium, High
    
    # Custom Fields
    custom_field_1: Optional[str] = None
    custom_field_2: Optional[str] = None
    custom_field_3: Optional[str] = None
    
    # Notes
    notes: Optional[str] = None

class CustomerCreate(CustomerBase):
    pass

class CustomerUpdate(BaseModel):
    # Basic Information
    name: Optional[str] = None
    phone: Optional[str] = None
    country_code: Optional[str] = None
    email: Optional[str] = None
    gender: Optional[str] = None
    dob: Optional[str] = None
    anniversary: Optional[str] = None
    preferred_language: Optional[str] = None
    customer_type: Optional[str] = None
    segment_tags: Optional[List[str]] = None
    
    # Contact & Marketing Permissions
    whatsapp_opt_in: Optional[bool] = None
    whatsapp_opt_in_date: Optional[str] = None
    promo_whatsapp_allowed: Optional[bool] = None
    promo_sms_allowed: Optional[bool] = None
    email_marketing_allowed: Optional[bool] = None
    call_allowed: Optional[bool] = None
    is_blocked: Optional[bool] = None
    
    # Loyalty Information
    referral_code: Optional[str] = None
    referred_by: Optional[str] = None
    membership_id: Optional[str] = None
    membership_expiry: Optional[str] = None
    
    # Behavior & Preferences
    favorite_category: Optional[str] = None
    preferred_payment_mode: Optional[str] = None
    
    # Customer Source & Journey
    lead_source: Optional[str] = None
    campaign_source: Optional[str] = None
    last_interaction_date: Optional[str] = None
    assigned_salesperson: Optional[str] = None
    
    # WhatsApp CRM Tracking
    last_whatsapp_sent: Optional[str] = None
    last_whatsapp_response: Optional[str] = None
    last_campaign_clicked: Optional[str] = None
    last_coupon_used: Optional[str] = None
    automation_status_tag: Optional[str] = None
    
    # Corporate Information
    gst_name: Optional[str] = None
    gst_number: Optional[str] = None
    billing_address: Optional[str] = None
    credit_limit: Optional[float] = None
    payment_terms: Optional[str] = None
    
    # Address
    address: Optional[str] = None
    address_line_2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    country: Optional[str] = None
    delivery_instructions: Optional[str] = None
    map_location: Optional[dict] = None
    
    # Preferences
    allergies: Optional[List[str]] = None
    favorites: Optional[List[str]] = None
    
    # Dining Preferences
    preferred_dining_type: Optional[str] = None
    preferred_time_slot: Optional[str] = None
    favorite_table: Optional[str] = None
    avg_party_size: Optional[int] = None
    diet_preference: Optional[str] = None
    spice_level: Optional[str] = None
    cuisine_preference: Optional[str] = None
    
    # Special Occasions
    kids_birthday: Optional[List[str]] = None
    spouse_name: Optional[str] = None
    festival_preference: Optional[List[str]] = None
    special_dates: Optional[List[dict]] = None
    
    # Feedback & Flags
    last_rating: Optional[int] = None
    nps_score: Optional[int] = None
    complaint_flag: Optional[bool] = None
    vip_flag: Optional[bool] = None
    blacklist_flag: Optional[bool] = None
    
    # AI/Advanced
    predicted_next_visit: Optional[str] = None
    churn_risk_score: Optional[int] = None
    recommended_offer_type: Optional[str] = None
    price_sensitivity_score: Optional[str] = None
    
    # Custom Fields
    custom_field_1: Optional[str] = None
    custom_field_2: Optional[str] = None
    custom_field_3: Optional[str] = None
    
    # Notes
    notes: Optional[str] = None

class Customer(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    # System Fields
    id: str
    user_id: str
    created_at: str
    updated_at: Optional[str] = None
    
    # Basic Information
    name: str
    phone: str
    country_code: str = "+91"
    email: Optional[str] = None
    gender: Optional[str] = None
    dob: Optional[str] = None
    anniversary: Optional[str] = None
    preferred_language: Optional[str] = None
    customer_type: str = "normal"
    segment_tags: Optional[List[str]] = None
    
    # Contact & Marketing Permissions
    whatsapp_opt_in: bool = False
    whatsapp_opt_in_date: Optional[str] = None
    promo_whatsapp_allowed: bool = True
    promo_sms_allowed: bool = True
    email_marketing_allowed: bool = True
    call_allowed: bool = True
    is_blocked: bool = False
    
    # Loyalty Information
    total_points: int = 0
    total_points_earned: int = 0
    total_points_redeemed: int = 0
    wallet_balance: float = 0.0
    total_wallet_received: float = 0.0
    total_wallet_used: float = 0.0
    total_coupon_used: int = 0
    tier: str = "Bronze"
    referral_code: Optional[str] = None
    referred_by: Optional[str] = None
    membership_id: Optional[str] = None
    membership_expiry: Optional[str] = None
    
    # Spending & Visit Behavior
    total_visits: int = 0
    total_spent: float = 0.0
    avg_order_value: float = 0.0
    last_visit: Optional[str] = None
    first_visit_date: Optional[str] = None
    favorite_category: Optional[str] = None
    preferred_payment_mode: Optional[str] = None
    
    # Customer Source & Journey
    lead_source: Optional[str] = None
    campaign_source: Optional[str] = None
    last_interaction_date: Optional[str] = None
    assigned_salesperson: Optional[str] = None
    
    # WhatsApp CRM Tracking
    last_whatsapp_sent: Optional[str] = None
    last_whatsapp_response: Optional[str] = None
    last_campaign_clicked: Optional[str] = None
    last_coupon_used: Optional[str] = None
    automation_status_tag: Optional[str] = None
    
    # Corporate Information
    gst_name: Optional[str] = None
    gst_number: Optional[str] = None
    billing_address: Optional[str] = None
    credit_limit: Optional[float] = None
    payment_terms: Optional[str] = None
    
    # Address
    address: Optional[str] = None
    address_line_2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    country: Optional[str] = None
    delivery_instructions: Optional[str] = None
    map_location: Optional[dict] = None
    
    # Preferences
    allergies: Optional[List[str]] = None
    favorites: Optional[List[str]] = None
    
    # Dining Preferences
    preferred_dining_type: Optional[str] = None
    preferred_time_slot: Optional[str] = None
    favorite_table: Optional[str] = None
    avg_party_size: Optional[int] = None
    diet_preference: Optional[str] = None
    spice_level: Optional[str] = None
    cuisine_preference: Optional[str] = None
    
    # Special Occasions
    kids_birthday: Optional[List[str]] = None
    spouse_name: Optional[str] = None
    festival_preference: Optional[List[str]] = None
    special_dates: Optional[List[dict]] = None
    
    # Feedback & Flags
    last_rating: Optional[int] = None
    nps_score: Optional[int] = None
    complaint_flag: bool = False
    vip_flag: bool = False
    blacklist_flag: bool = False
    
    # AI/Advanced (MyGenie CRM Differentiator)
    predicted_next_visit: Optional[str] = None
    churn_risk_score: Optional[int] = None
    recommended_offer_type: Optional[str] = None
    price_sensitivity_score: Optional[str] = None
    
    # Custom Fields
    custom_field_1: Optional[str] = None
    custom_field_2: Optional[str] = None
    custom_field_3: Optional[str] = None
    
    # Notes
    notes: Optional[str] = None
    
    # MyGenie Sync
    pos_customer_id: Optional[int] = None
    mygenie_synced: Optional[bool] = None

# Wallet Transaction Models
class WalletTransactionCreate(BaseModel):
    customer_id: str
    amount: float
    transaction_type: str
    description: str
    payment_method: Optional[str] = None

class WalletTransaction(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    user_id: str
    customer_id: str
    amount: float
    transaction_type: str
    description: str
    payment_method: Optional[str] = None
    balance_after: float
    created_at: str

# Coupon Models
class CouponCreate(BaseModel):
    code: str
    discount_type: str
    discount_value: float
    start_date: str
    end_date: str
    usage_limit: Optional[int] = None
    per_user_limit: int = 1
    min_order_value: float = 0
    max_discount: Optional[float] = None
    specific_users: Optional[List[str]] = None
    applicable_channels: List[str] = ["delivery", "takeaway", "dine_in"]
    description: Optional[str] = None

class CouponUpdate(BaseModel):
    code: Optional[str] = None
    discount_type: Optional[str] = None
    discount_value: Optional[float] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    usage_limit: Optional[int] = None
    per_user_limit: Optional[int] = None
    min_order_value: Optional[float] = None
    max_discount: Optional[float] = None
    specific_users: Optional[List[str]] = None
    applicable_channels: Optional[List[str]] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None

class Coupon(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    user_id: str
    code: str
    discount_type: str
    discount_value: float
    start_date: str
    end_date: str
    usage_limit: Optional[int] = None
    per_user_limit: int = 1
    min_order_value: float = 0
    max_discount: Optional[float] = None
    specific_users: Optional[List[str]] = None
    applicable_channels: List[str] = ["delivery", "takeaway", "dine_in"]
    description: Optional[str] = None
    is_active: bool = True
    total_used: int = 0
    created_at: str

class CouponUsage(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    coupon_id: str
    customer_id: str
    order_value: float
    discount_applied: float
    channel: str
    used_at: str

# Segment Models
class SegmentCreate(BaseModel):
    name: str
    filters: dict
    customer_count: Optional[int] = None  # Accept from frontend

class SegmentUpdate(BaseModel):
    name: Optional[str] = None
    filters: Optional[dict] = None

class Segment(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    user_id: str
    name: str
    filters: dict
    customer_count: int = 0
    created_at: str
    updated_at: str

# Points Transaction Models
class PointsTransactionType(str):
    EARN = "earn"
    REDEEM = "redeem"
    BONUS = "bonus"
    EXPIRED = "expired"

class PointsTransactionCreate(BaseModel):
    customer_id: str
    points: int
    transaction_type: str
    description: str
    bill_amount: Optional[float] = None

class PointsTransaction(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    user_id: str
    customer_id: str
    points: int
    transaction_type: Optional[str] = None  # Also check 'type' field
    type: Optional[str] = None  # Alias for transaction_type
    description: Optional[str] = None  # Also check 'reason' field
    reason: Optional[str] = None  # Alias for description
    bill_amount: Optional[float] = None
    balance_after: Optional[int] = None
    created_at: str
    
    @property
    def tx_type(self) -> str:
        return self.transaction_type or self.type or "unknown"
    
    @property
    def tx_description(self) -> str:
        return self.description or self.reason or ""

# Loyalty Settings Models
class LoyaltySettings(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    user_id: str
    # Master toggles - all disabled by default
    loyalty_enabled: bool = False
    coupon_enabled: bool = False
    wallet_enabled: bool = False
    min_order_value: float = 100.0
    bronze_earn_percent: float = 5.0
    silver_earn_percent: float = 7.0
    gold_earn_percent: float = 10.0
    platinum_earn_percent: float = 15.0
    redemption_value: float = 1.0
    min_redemption_points: int = 50
    max_redemption_percent: float = 50.0
    max_redemption_amount: float = 500.0
    points_expiry_months: int = 6
    expiry_reminder_days: int = 30
    tier_silver_min: int = 500
    tier_gold_min: int = 1500
    tier_platinum_min: int = 5000
    custom_field_1_label: str = "Custom Field 1"
    custom_field_2_label: str = "Custom Field 2"
    custom_field_3_label: str = "Custom Field 3"
    custom_field_1_enabled: bool = False
    custom_field_2_enabled: bool = False
    custom_field_3_enabled: bool = False
    birthday_bonus_enabled: bool = True
    birthday_bonus_points: int = 100
    birthday_bonus_days_before: int = 0
    birthday_bonus_days_after: int = 7
    anniversary_bonus_enabled: bool = True
    anniversary_bonus_points: int = 150
    anniversary_bonus_days_before: int = 0
    anniversary_bonus_days_after: int = 7
    first_visit_bonus_enabled: bool = True
    first_visit_bonus_points: int = 50
    off_peak_bonus_enabled: bool = False
    off_peak_start_time: str = "14:00"
    off_peak_end_time: str = "17:00"
    off_peak_bonus_type: str = "multiplier"
    off_peak_bonus_value: float = 2.0
    feedback_bonus_enabled: bool = True
    feedback_bonus_points: int = 25

class LoyaltySettingsUpdate(BaseModel):
    # Master toggles
    loyalty_enabled: Optional[bool] = None
    coupon_enabled: Optional[bool] = None
    wallet_enabled: Optional[bool] = None
    min_order_value: Optional[float] = None
    bronze_earn_percent: Optional[float] = None
    silver_earn_percent: Optional[float] = None
    gold_earn_percent: Optional[float] = None
    platinum_earn_percent: Optional[float] = None
    redemption_value: Optional[float] = None
    min_redemption_points: Optional[int] = None
    max_redemption_percent: Optional[float] = None
    max_redemption_amount: Optional[float] = None
    points_expiry_months: Optional[int] = None
    expiry_reminder_days: Optional[int] = None
    tier_silver_min: Optional[int] = None
    tier_gold_min: Optional[int] = None
    tier_platinum_min: Optional[int] = None
    custom_field_1_label: Optional[str] = None
    custom_field_2_label: Optional[str] = None
    custom_field_3_label: Optional[str] = None
    custom_field_1_enabled: Optional[bool] = None
    custom_field_2_enabled: Optional[bool] = None
    custom_field_3_enabled: Optional[bool] = None
    birthday_bonus_enabled: Optional[bool] = None
    birthday_bonus_points: Optional[int] = None
    birthday_bonus_days_before: Optional[int] = None
    birthday_bonus_days_after: Optional[int] = None
    anniversary_bonus_enabled: Optional[bool] = None
    anniversary_bonus_points: Optional[int] = None
    anniversary_bonus_days_before: Optional[int] = None
    anniversary_bonus_days_after: Optional[int] = None
    first_visit_bonus_enabled: Optional[bool] = None
    first_visit_bonus_points: Optional[int] = None
    off_peak_bonus_enabled: Optional[bool] = None
    off_peak_start_time: Optional[str] = None
    off_peak_end_time: Optional[str] = None
    off_peak_bonus_type: Optional[str] = None
    off_peak_bonus_value: Optional[float] = None
    feedback_bonus_enabled: Optional[bool] = None
    feedback_bonus_points: Optional[int] = None

# Feedback Models
class FeedbackCreate(BaseModel):
    customer_id: Optional[str] = None
    customer_name: str
    customer_phone: str
    rating: int = Field(..., ge=1, le=5)
    message: Optional[str] = None

class Feedback(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    user_id: str
    customer_id: Optional[str] = None
    customer_name: str
    customer_phone: str
    rating: int
    message: Optional[str] = None
    status: str = "pending"
    created_at: str

# Analytics Models
class DashboardStats(BaseModel):
    # Header Row 1: Loyalty Orders % (Total, 30D, 7D)
    loyalty_orders_percent: float = 0.0
    loyalty_orders_percent_30d: float = 0.0
    loyalty_orders_percent_7d: float = 0.0
    # Header Row 2: Revenue Split (Total, 30D, 7D)
    repeat_revenue_percent: float = 0.0
    new_revenue_percent: float = 0.0
    repeat_revenue_percent_30d: float = 0.0
    new_revenue_percent_30d: float = 0.0
    repeat_revenue_percent_7d: float = 0.0
    new_revenue_percent_7d: float = 0.0
    # Row 1: Customer Health
    total_customers: int
    active_customers_30d: int
    new_customers_7d: int
    # Row 2: Repeat Customers
    repeat_2_plus: int
    repeat_5_plus: int
    repeat_10_plus: int
    # Row 3: Inactive Customers
    inactive_30d: int
    inactive_60d: int
    inactive_90d: int
    # Row 4: Orders
    total_orders: int
    avg_order_value: float
    avg_orders_per_day: float
    # Row 5: Points
    total_points_issued: int
    total_points_redeemed: int
    points_balance: int
    # Row 6: Wallet
    wallet_issued: float
    wallet_used: float
    wallet_balance: float
    # Row 7: Coupons
    total_coupons: int
    coupons_used: int
    discount_availed: float
    # Row 8: Revenue
    total_revenue: float
    revenue_30d: float
    revenue_7d: float
    # Row 9: Top Selling Items
    top_items_30d: list = []
    top_items_7d: list = []
    top_items_all_time: list = []
    # Legacy fields
    avg_rating: float
    total_feedback: int
    # Settings flags for conditional display
    loyalty_enabled: bool = True
    wallet_enabled: bool = False
    coupon_enabled: bool = False

# Messaging Models
class MessageRequest(BaseModel):
    customer_id: str
    message: str
    channel: str = "whatsapp"

# POS Gateway Models
class POSPaymentWebhook(BaseModel):
    customer_phone: str
    bill_amount: float
    channel: str = "dine_in"
    coupon_code: Optional[str] = None
    redeem_points: Optional[int] = None
    bill_id: Optional[str] = None
    metadata: Optional[dict] = None

class POSCustomerLookup(BaseModel):
    phone: str

class POSResponse(BaseModel):
    success: bool
    message: str
    data: Optional[dict] = None

# WhatsApp Template Models
class WhatsAppTemplateCreate(BaseModel):
    name: str
    message: str
    media_type: Optional[str] = None
    media_url: Optional[str] = None
    variables: Optional[List[str]] = None

class WhatsAppTemplateUpdate(BaseModel):
    name: Optional[str] = None
    message: Optional[str] = None
    media_type: Optional[str] = None
    media_url: Optional[str] = None
    variables: Optional[List[str]] = None
    is_active: Optional[bool] = None

class WhatsAppTemplate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    user_id: str
    name: str
    message: Optional[str] = ""
    media_type: Optional[str] = None
    media_url: Optional[str] = None
    variables: Optional[List[str]] = None
    is_active: bool = True
    created_at: str
    updated_at: Optional[str] = None

# Automation Rule Models
class AutomationRuleCreate(BaseModel):
    event_type: str
    template_id: str
    is_enabled: bool = True
    delay_minutes: int = 0
    conditions: Optional[dict] = None

class AutomationRuleUpdate(BaseModel):
    event_type: Optional[str] = None
    template_id: Optional[str] = None
    is_enabled: Optional[bool] = None
    delay_minutes: Optional[int] = None
    conditions: Optional[dict] = None

class AutomationRule(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    user_id: str
    event_type: Optional[str] = None
    template_id: str
    is_enabled: bool = True
    delay_minutes: int = 0
    conditions: Optional[dict] = None
    created_at: str
    updated_at: Optional[str] = None

# Automation Events - POS Events (Order related from Point of Sale)
POS_EVENTS = [
    "new_order_customer",      # New order placed - Customer notification
    "new_order_outlet",        # New order placed - Outlet notification
    "order_confirmed",         # Order confirmed - Customer
    "order_ready_customer",    # Order Ready - Customer
    "item_ready",              # Item Ready - Customer
    "order_served",            # Order Served - Customer
    "item_served",             # Item Served - Customer
    "order_ready_delivery",    # Order Ready - Delivery Boy
    "order_dispatched",        # Order dispatched - Customer
    "send_bill_manual",        # Send Bill - Manual
    "send_bill_auto",          # Send Bill - Auto
]

# Automation Events - CRM Events (Customer Relationship Management)
CRM_EVENTS = [
    "reset_password",          # OTP for forgot password
    "welcome_message",         # Welcome message for new customers
    "birthday",                # Birthday Wish
    "anniversary",             # Anniversary Wish
    "points_earned",           # Points Earned
    "points_expiring",         # Points Expiring Reminder
    "feedback_request",        # Feedback Request
]

# All automation events (combined for backward compatibility)
AUTOMATION_EVENTS = POS_EVENTS + CRM_EVENTS
