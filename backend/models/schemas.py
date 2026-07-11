from pydantic import BaseModel, Field, ConfigDict, EmailStr, AliasChoices, field_validator
from typing import List, Optional
import re as _re
import uuid
from datetime import datetime, timezone

# CR-036 Batch B.1 — Additive fields on existing collections:
#   custom_templates: header_handle (str|None), send_media_url (str|None),
#                     send_media_filename (str|None), header_media_mime (str|None),
#                     needs_media_reupload (bool, default False)
#   whatsapp_message_logs: status_note (str|None) — e.g. "media_missing"

# CR-001C-C V3-A — shared validators for time-window fields.
_HHMM_RE = _re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


def _v3a_validate_valid_days(value):
    if value is None:
        return None
    if not isinstance(value, list):
        raise ValueError("valid_days must be a list of ISO weekday ints [0..6]")
    if len(value) == 0:
        return None
    cleaned: list[int] = []
    for v in value:
        try:
            iv = int(v)
        except (TypeError, ValueError):
            raise ValueError(f"valid_days entry not int: {v!r}")
        if iv < 0 or iv > 6:
            raise ValueError(f"valid_days entry out of range [0..6]: {iv}")
        if iv not in cleaned:
            cleaned.append(iv)
    return sorted(cleaned)


def _v3a_validate_hhmm(value):
    if value is None:
        return None
    if not isinstance(value, str) or not _HHMM_RE.match(value):
        raise ValueError(f"Time must be HH:MM 24h; got {value!r}")
    return value


def _v3a_validate_timezone(value):
    if value is None:
        return None
    try:
        from zoneinfo import ZoneInfo  # stdlib 3.9+
        ZoneInfo(str(value))
    except Exception as exc:
        raise ValueError(f"Invalid IANA timezone {value!r}: {exc}")
    return str(value)


def _v3a_validate_offer_type(value):
    if value is None:
        return None
    # CR-001C-C V3-B: `buy_x_get_y` aliases `bxg`; both accepted.
    # CR-001C-C V3-C: `every_nth` / `every_nth_item` alias `nth_item`.
    allowed = {
        "simple", "bogo", "bxg", "buy_x_get_y",
        "nth_item", "every_nth", "every_nth_item",
        "free_item", "combo",
    }
    sv = str(value).strip().lower()
    if sv not in allowed:
        raise ValueError(f"Unsupported offer_type {value!r}; allowed: {sorted(allowed)}")
    # Normalize to canonical storage values.
    if sv == "buy_x_get_y":
        return "bxg"
    if sv in {"every_nth", "every_nth_item"}:
        return "nth_item"
    return sv


# CR-001C-C V3-B — validators for BOGO/BXG fields.
def _v3b_validate_get_discount_type(value):
    if value is None:
        return None
    allowed = {"free", "percentage", "flat"}
    sv = str(value).strip().lower()
    if sv not in allowed:
        raise ValueError(
            f"Unsupported get_discount_type {value!r}; allowed: {sorted(allowed)}"
        )
    return sv


def _v3b_validate_pos_int_ge_one(value, field_name="quantity"):
    if value is None:
        return None
    try:
        iv = int(value)
    except (TypeError, ValueError):
        raise ValueError(f"{field_name} must be an integer ≥ 1")
    if iv < 1:
        raise ValueError(f"{field_name} must be ≥ 1")
    return iv


# CR-001C-C V3-C — Every-Nth validator: nth_item_number must be int ≥ 2.
def _v3c_validate_nth_int(value):
    if value is None:
        return None
    try:
        iv = int(value)
    except (TypeError, ValueError):
        raise ValueError("nth_item_number must be an integer ≥ 2")
    if iv < 2:
        raise ValueError("nth_item_number must be ≥ 2 (Nth=1 is meaningless)")
    return iv


# Address Models
class CustomerAddressCreate(BaseModel):
    address_type: str = "Home"  # Home, Office, Other
    address: str
    house: Optional[str] = None
    floor: Optional[str] = None
    road: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    country: Optional[str] = "India"
    latitude: Optional[str] = None
    longitude: Optional[str] = None
    contact_person_name: Optional[str] = None
    contact_person_number: Optional[str] = None
    dial_code: Optional[str] = None
    zone_id: Optional[str] = None
    delivery_instructions: Optional[str] = None
    is_default: bool = False
    pos_address_id: Optional[str] = None


class CustomerAddressUpdate(BaseModel):
    address_type: Optional[str] = None
    address: Optional[str] = None
    house: Optional[str] = None
    floor: Optional[str] = None
    road: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    country: Optional[str] = None
    latitude: Optional[str] = None
    longitude: Optional[str] = None
    contact_person_name: Optional[str] = None
    contact_person_number: Optional[str] = None
    dial_code: Optional[str] = None
    zone_id: Optional[str] = None
    delivery_instructions: Optional[str] = None
    is_default: Optional[bool] = None
    pos_address_id: Optional[str] = None


class CustomerAddress(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    pos_address_id: Optional[object] = None
    is_default: bool = False
    address_type: str = "Home"
    address: str = ""
    house: Optional[str] = None
    floor: Optional[str] = None
    road: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    country: Optional[str] = "India"
    latitude: Optional[str] = None
    longitude: Optional[str] = None
    contact_person_name: Optional[str] = None
    contact_person_number: Optional[str] = None
    dial_code: Optional[str] = None
    zone_id: Optional[object] = None
    delivery_instructions: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

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
    # CR-014 Phase 1: profile expansion fields (invoice branding + tax)
    gstin: str = ""
    legal_name: str = ""
    state: str = ""
    address_line1: str = ""
    address_line2: str = ""
    city: str = ""
    pincode: str = ""
    fssai_license: str = ""
    pan: str = ""
    vat_number: str = ""
    # CR-014 Phase 2: bill settings sub-document
    bill_settings: Optional[dict] = None
    # CR-036 B.1: Meta WhatsApp credentials (needed for MediaHeaderUpload frontend check)
    meta_waba_id: Optional[str] = None
    meta_access_token: Optional[str] = None
    meta_app_id: Optional[str] = None

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
    pos_config: Optional[dict] = None
    # CR-008: MyGenie session token returned to frontend for header-based propagation.
    mygenie_token: Optional[str] = None

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

    # CR-034: user-defined free-form tags
    tags: List[str] = []

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

    # CR-034: user-defined free-form tags
    tags: Optional[List[str]] = None

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

    # Addresses
    addresses: Optional[List[CustomerAddress]] = None

    # CR-034: user-defined free-form tags
    tags: List[str] = []

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
    balance_after: Optional[float] = None
    created_at: str

# Coupon Models
class CouponCreate(BaseModel):
    code: str
    discount_type: str
    discount_value: float
    start_date: str
    end_date: str
    usage_limit: Optional[int] = None
    per_user_limit: Optional[int] = None  # CR-021 D4: default unlimited (was 1)
    min_order_value: float = 0
    max_discount: Optional[float] = None
    specific_users: Optional[List[str]] = None
    applicable_channels: List[str] = ["delivery", "takeaway", "dine_in"]
    description: Optional[str] = None
    # CR-001C-C V1 additions (forward-only, optional)
    title: Optional[str] = None
    coupon_type: Optional[str] = "order"
    stackable_with_loyalty: bool = False
    # CR-001C-C V2 additions (forward-only, optional)
    discount_scope: Optional[str] = None  # "order" | "item" | "category"
    eligible_food_ids: Optional[List[str]] = None
    eligible_item_ids: Optional[List[str]] = None
    eligible_category_ids: Optional[List[str]] = None
    eligible_category_names: Optional[List[str]] = None
    excluded_item_ids: Optional[List[str]] = None
    excluded_category_ids: Optional[List[str]] = None
    min_item_qty: Optional[int] = None
    max_applicable_qty: Optional[int] = None
    apply_to_cheapest_item: Optional[bool] = False
    apply_to_highest_item: Optional[bool] = False
    # CR-001C-C V3-A additions (forward-only, optional)
    offer_type: Optional[str] = "simple"
    valid_days: Optional[List[int]] = None  # ISO weekday ints [0..6] (Mon=0..Sun=6)
    start_time: Optional[str] = None  # "HH:MM" 24h restaurant local
    end_time: Optional[str] = None    # "HH:MM" 24h restaurant local
    timezone: Optional[str] = None    # IANA tz; ZoneInfo-validated at write time
    # CR-001C-C V3-B additions (forward-only, optional)
    buy_quantity: Optional[int] = None
    get_quantity: Optional[int] = None
    buy_food_ids: Optional[List[str]] = None
    buy_item_ids: Optional[List[str]] = None
    buy_category_ids: Optional[List[str]] = None
    buy_category_names: Optional[List[str]] = None
    get_food_ids: Optional[List[str]] = None
    get_item_ids: Optional[List[str]] = None
    get_category_ids: Optional[List[str]] = None
    get_category_names: Optional[List[str]] = None
    get_discount_type: Optional[str] = None  # "free" / "percentage" / "flat"
    get_discount_value: Optional[float] = None
    max_applications: Optional[int] = None
    allow_repeat: Optional[bool] = True
    same_item_required: Optional[bool] = None
    requires_get_item_in_cart: Optional[bool] = True
    pos_instruction: Optional[str] = None
    # CR-001C-C V3-C additions (forward-only, optional)
    nth_item_number: Optional[int] = None
    nth_discount_type: Optional[str] = None  # "free" / "percentage" / "flat"
    nth_discount_value: Optional[float] = None

    # CR-001C-C V3-A — validators for time-window fields.
    _v_offer_type = field_validator("offer_type")(lambda cls, v: _v3a_validate_offer_type(v))
    _v_valid_days = field_validator("valid_days")(lambda cls, v: _v3a_validate_valid_days(v))
    _v_start_time = field_validator("start_time")(lambda cls, v: _v3a_validate_hhmm(v))
    _v_end_time = field_validator("end_time")(lambda cls, v: _v3a_validate_hhmm(v))
    _v_timezone = field_validator("timezone")(lambda cls, v: _v3a_validate_timezone(v))
    # CR-001C-C V3-B — validators.
    _v_get_discount_type = field_validator("get_discount_type")(
        lambda cls, v: _v3b_validate_get_discount_type(v)
    )
    _v_buy_quantity = field_validator("buy_quantity")(
        lambda cls, v: _v3b_validate_pos_int_ge_one(v, "buy_quantity")
    )
    _v_get_quantity = field_validator("get_quantity")(
        lambda cls, v: _v3b_validate_pos_int_ge_one(v, "get_quantity")
    )
    _v_max_applications = field_validator("max_applications")(
        lambda cls, v: _v3b_validate_pos_int_ge_one(v, "max_applications")
    )
    # CR-001C-C V3-C — validators.
    _v_nth_discount_type = field_validator("nth_discount_type")(
        lambda cls, v: _v3b_validate_get_discount_type(v)
    )
    _v_nth_item_number = field_validator("nth_item_number")(
        lambda cls, v: _v3c_validate_nth_int(v)
    )

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
    # CR-001C-C V1 additions
    title: Optional[str] = None
    coupon_type: Optional[str] = None
    stackable_with_loyalty: Optional[bool] = None
    # CR-001C-C V2 additions (forward-only, optional)
    discount_scope: Optional[str] = None
    eligible_food_ids: Optional[List[str]] = None
    eligible_item_ids: Optional[List[str]] = None
    eligible_category_ids: Optional[List[str]] = None
    eligible_category_names: Optional[List[str]] = None
    excluded_item_ids: Optional[List[str]] = None
    excluded_category_ids: Optional[List[str]] = None
    min_item_qty: Optional[int] = None
    max_applicable_qty: Optional[int] = None
    apply_to_cheapest_item: Optional[bool] = None
    apply_to_highest_item: Optional[bool] = None
    # CR-001C-C V3-A additions (forward-only, optional)
    offer_type: Optional[str] = None
    valid_days: Optional[List[int]] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    timezone: Optional[str] = None
    # CR-001C-C V3-B additions (forward-only, optional)
    buy_quantity: Optional[int] = None
    get_quantity: Optional[int] = None
    buy_food_ids: Optional[List[str]] = None
    buy_item_ids: Optional[List[str]] = None
    buy_category_ids: Optional[List[str]] = None
    buy_category_names: Optional[List[str]] = None
    get_food_ids: Optional[List[str]] = None
    get_item_ids: Optional[List[str]] = None
    get_category_ids: Optional[List[str]] = None
    get_category_names: Optional[List[str]] = None
    get_discount_type: Optional[str] = None
    get_discount_value: Optional[float] = None
    max_applications: Optional[int] = None
    allow_repeat: Optional[bool] = None
    same_item_required: Optional[bool] = None
    requires_get_item_in_cart: Optional[bool] = None
    pos_instruction: Optional[str] = None
    # CR-001C-C V3-C
    nth_item_number: Optional[int] = None
    nth_discount_type: Optional[str] = None
    nth_discount_value: Optional[float] = None

    _v_offer_type = field_validator("offer_type")(lambda cls, v: _v3a_validate_offer_type(v))
    _v_valid_days = field_validator("valid_days")(lambda cls, v: _v3a_validate_valid_days(v))
    _v_start_time = field_validator("start_time")(lambda cls, v: _v3a_validate_hhmm(v))
    _v_end_time = field_validator("end_time")(lambda cls, v: _v3a_validate_hhmm(v))
    _v_timezone = field_validator("timezone")(lambda cls, v: _v3a_validate_timezone(v))
    # CR-001C-C V3-B
    _v_get_discount_type = field_validator("get_discount_type")(
        lambda cls, v: _v3b_validate_get_discount_type(v)
    )
    _v_buy_quantity = field_validator("buy_quantity")(
        lambda cls, v: _v3b_validate_pos_int_ge_one(v, "buy_quantity")
    )
    _v_get_quantity = field_validator("get_quantity")(
        lambda cls, v: _v3b_validate_pos_int_ge_one(v, "get_quantity")
    )
    _v_max_applications = field_validator("max_applications")(
        lambda cls, v: _v3b_validate_pos_int_ge_one(v, "max_applications")
    )
    # CR-001C-C V3-C
    _v_nth_discount_type = field_validator("nth_discount_type")(
        lambda cls, v: _v3b_validate_get_discount_type(v)
    )
    _v_nth_item_number = field_validator("nth_item_number")(
        lambda cls, v: _v3c_validate_nth_int(v)
    )

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
    per_user_limit: Optional[int] = None  # CR-021 D4: default unlimited (was 1)
    min_order_value: float = 0
    max_discount: Optional[float] = None
    specific_users: Optional[List[str]] = None
    applicable_channels: List[str] = ["delivery", "takeaway", "dine_in"]
    description: Optional[str] = None
    is_active: bool = True
    total_used: int = 0
    created_at: str
    # CR-001C-C V1 additions
    title: Optional[str] = None
    coupon_type: Optional[str] = "order"
    stackable_with_loyalty: bool = False
    # CR-001C-C V2 additions (forward-only, optional)
    discount_scope: Optional[str] = None
    eligible_food_ids: Optional[List[str]] = None
    eligible_item_ids: Optional[List[str]] = None
    eligible_category_ids: Optional[List[str]] = None
    eligible_category_names: Optional[List[str]] = None
    excluded_item_ids: Optional[List[str]] = None
    excluded_category_ids: Optional[List[str]] = None
    min_item_qty: Optional[int] = None
    max_applicable_qty: Optional[int] = None
    apply_to_cheapest_item: bool = False
    apply_to_highest_item: bool = False
    # CR-001C-C V3-A additions (forward-only, optional)
    offer_type: Optional[str] = "simple"
    valid_days: Optional[List[int]] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    timezone: Optional[str] = None
    # CR-001C-C V3-B additions (forward-only, optional)
    buy_quantity: Optional[int] = None
    get_quantity: Optional[int] = None
    buy_food_ids: Optional[List[str]] = None
    buy_item_ids: Optional[List[str]] = None
    buy_category_ids: Optional[List[str]] = None
    buy_category_names: Optional[List[str]] = None
    get_food_ids: Optional[List[str]] = None
    get_item_ids: Optional[List[str]] = None
    get_category_ids: Optional[List[str]] = None
    get_category_names: Optional[List[str]] = None
    get_discount_type: Optional[str] = None
    get_discount_value: Optional[float] = None
    max_applications: Optional[int] = None
    allow_repeat: Optional[bool] = None
    same_item_required: Optional[bool] = None
    requires_get_item_in_cart: Optional[bool] = None
    pos_instruction: Optional[str] = None
    # CR-001C-C V3-C
    nth_item_number: Optional[int] = None
    nth_discount_type: Optional[str] = None
    nth_discount_value: Optional[float] = None

class CouponUsage(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    coupon_id: str
    customer_id: str
    order_value: float
    discount_applied: float
    channel: str
    used_at: str
    # CR-001C-C V1 additions (all optional for backward compat with legacy rows)
    user_id: Optional[str] = None
    restaurant_id: Optional[str] = None
    coupon_code: Optional[str] = None
    coupon_title: Optional[str] = None
    coupon_type: Optional[str] = None
    order_id: Optional[str] = None
    pos_order_id: Optional[str] = None
    order_total: Optional[float] = None
    coupon_discount: Optional[float] = None
    crm_computed_discount: Optional[float] = None
    discount_type: Optional[str] = None
    discount_value: Optional[float] = None
    source: Optional[str] = None
    created_at: Optional[str] = None
    # CR-001C-C V2 additions
    discount_scope: Optional[str] = None
    eligible_subtotal: Optional[float] = None
    eligible_food_ids: Optional[List[str]] = None
    eligible_item_ids: Optional[List[str]] = None
    eligible_category_ids: Optional[List[str]] = None
    eligible_category_names: Optional[List[str]] = None
    # CR-001C-C V3-A additions
    offer_type: Optional[str] = None
    time_window_status: Optional[dict] = None
    # CR-001C-C V3-B additions (forward-only, all optional for backward compat)
    buy_quantity: Optional[int] = None
    get_quantity: Optional[int] = None
    applied_applications: Optional[int] = None
    benefit_items: Optional[List[dict]] = None
    buy_match_summary: Optional[List[dict]] = None
    get_match_summary: Optional[List[dict]] = None
    same_item_required: Optional[bool] = None
    get_discount_type: Optional[str] = None
    max_applications: Optional[int] = None
    allow_repeat: Optional[bool] = None
    pos_instruction: Optional[str] = None
    computed_discount: Optional[float] = None
    discount_mismatch: Optional[bool] = None
    # CR-001C-C V3-C additions (forward-only, all optional)
    nth_item_number: Optional[int] = None
    nth_discount_type: Optional[str] = None
    nth_discount_value: Optional[float] = None
    eligible_match_summary: Optional[List[dict]] = None


# CR-001C-C V2: POS cart item line (optional, used by validate/orders)
class POSCartItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    item_id: Optional[str] = Field(
        default=None, validation_alias=AliasChoices("item_id", "itemId")
    )
    food_id: Optional[str] = Field(
        default=None, validation_alias=AliasChoices("food_id", "foodId", "pos_food_id", "item_id")
    )
    category_id: Optional[str] = Field(
        default=None, validation_alias=AliasChoices("category_id", "categoryId", "item_category", "itemCategory")
    )
    category_name: Optional[str] = Field(
        default=None, validation_alias=AliasChoices("category_name", "categoryName")
    )
    item_category: Optional[str] = Field(
        default=None, validation_alias=AliasChoices("item_category", "itemCategory")
    )
    name: Optional[str] = None
    quantity: int = Field(
        default=1, validation_alias=AliasChoices("quantity", "qty", "item_qty")
    )
    unit_price: Optional[float] = Field(
        default=None, validation_alias=AliasChoices("unit_price", "price", "item_price")
    )
    line_total: Optional[float] = Field(
        default=None, validation_alias=AliasChoices("line_total", "lineTotal")
    )


# CR-001C-C V1: POS coupon validate JSON body (+ V2 optional items)
class POSCouponValidateRequest(BaseModel):
    code: str
    customer_id: str
    order_total: float
    channel: str = "pos"
    loyalty_points_used: float = 0.0
    # CR-001C-C V2: optional cart items for item/category-scope coupons.
    items: Optional[List[POSCartItem]] = None
    # CR-001C-C V3-A: optional POS-supplied order time (informational only,
    # echoed back; server clock decides time-window membership).
    order_time: Optional[str] = None

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
    last_counted_at: Optional[str] = None  # CR-024 Phase 4 P4.2
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
    # L4-A (2026-05-25): optional idempotency + order linkage for admin redeem.
    # `redeem_loyalty_points` helper requires both; admin path falls back to
    # deterministic synthetic values when caller omits them.
    idempotency_key: Optional[str] = None
    order_id: Optional[str] = None

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
    min_order_value: float = 0
    bronze_earn_percent: float = 5.0
    silver_earn_percent: float = 7.0
    gold_earn_percent: float = 10.0
    platinum_earn_percent: float = 15.0
    redemption_value: float = 1.0
    # CR-001C-LX Phase LX-A (2026-05-22) — per-tier monetary value of a point
    # (rupees-per-point). Resolution at request time:
    #   per-tier override > restaurant-level `redemption_value` > 0.25 default.
    # No DB migration needed; existing `loyalty_settings` docs use the fallback
    # transparently. See CR_001C_LX_A_IMPLEMENTATION_PLAN.md §5.1.
    bronze_redemption_value: Optional[float] = None
    silver_redemption_value: Optional[float] = None
    gold_redemption_value: Optional[float] = None
    platinum_redemption_value: Optional[float] = None
    min_redemption_points: int = 50
    max_redemption_percent: float = 100.0
    max_redemption_amount: Optional[float] = None
    points_expiry_months: int = 6
    expiry_reminder_days: int = 30
    # CR-001C-L Phase L5 (2026-05-25): `loyalty_clean_slate_recalc` REMOVED.
    # The field was deprecated in LF-MERGE (2026-05-23) when `loyalty_enabled`
    # became the single source of truth for clean-slate recompute. Existing
    # Mongo docs may still carry the field; reader code never references it,
    # so leaving it in storage is harmless and no migration is needed.
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
    # CR-001C-LX Phase LX-A (2026-05-22) — per-tier monetary value overrides.
    bronze_redemption_value: Optional[float] = None
    silver_redemption_value: Optional[float] = None
    gold_redemption_value: Optional[float] = None
    platinum_redemption_value: Optional[float] = None
    min_redemption_points: Optional[int] = None
    max_redemption_percent: Optional[float] = None
    max_redemption_amount: Optional[float] = None
    points_expiry_months: Optional[int] = None
    expiry_reminder_days: Optional[int] = None
    # CR-001C-L Phase L5 (2026-05-25): `loyalty_clean_slate_recalc` REMOVED
    # from the PATCH surface as well. Inbound PATCH bodies carrying the field
    # are silently ignored by Pydantic (`extra="ignore"` model default).
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
    "send_bill",               # Bill sent to customer (every order)
    "tier_upgrade",            # Customer tier upgraded (Bronze→Silver→Gold→Platinum)
    "coupon_earned",           # Customer earned/applied a coupon
    "wallet_credit",           # Wallet credited (top-up)
    "wallet_debit",            # Wallet debited (payment)
    "bonus_points",            # Bonus points awarded manually
    "points_redeemed",         # Points redeemed on order
    "coupon_expiring",         # Coupon about to expire (daily reminder)
    "inactive_customer",       # Customer inactive 30+ days (win-back)
]

# All automation events (combined for backward compatibility)
AUTOMATION_EVENTS = POS_EVENTS + CRM_EVENTS


# ── CR-035: Customer Export / Import models ──────────────────────────────────

class ImportRowError(BaseModel):
    row: int            # 1-based row number from the file
    reason: str         # Human-readable reason e.g. "Missing phone number"


class ImportLog(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    filename: str
    format: str                                 # "csv" or "xlsx"
    total_rows: int
    imported: int                               # rows created
    updated: int                                # rows updated (dup phone)
    failed: int                                 # rows skipped
    errors: List[ImportRowError] = []           # per-row error details (max 50)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ImportPreviewRow(BaseModel):
    row: int
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    tags: Optional[str] = None                  # comma-sep string from file
    status: str                                 # "new" | "update" | "error"
    reason: Optional[str] = None               # populated when status == "error"


class ImportPreviewResponse(BaseModel):
    filename: str
    format: str
    total_rows: int
    new_count: int
    update_count: int
    error_count: int
    preview_rows: List[ImportPreviewRow]        # first 5 rows only
    all_errors: List[ImportRowError]            # all error rows for display

