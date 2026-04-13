"""
Address Utility Functions for Multiple Addresses Feature
"""
import uuid
from datetime import datetime, timezone
from typing import List, Dict, Optional, Any


def generate_address_id() -> str:
    """Generate unique address ID"""
    return f"addr_{uuid.uuid4().hex[:12]}"


def map_pos_address_to_crm(pos_address: Dict[str, Any]) -> Dict[str, Any]:
    """
    Convert POS address format to CRM address format
    
    POS Format:
    {
        "id": 9,
        "address_type": "Home",
        "address": "123 Main St",
        "house": "A-101",
        "floor": "1st",
        "road": "Main Road",
        "city": "Mumbai",
        "pincode": "400001",
        "latitude": "19.0760",
        "longitude": "72.8777",
        "contact_person_name": "John",
        "contact_person_number": "9876543210",
        "dial_code": "+91",
        "zone_id": 6,
        "created_at": "2024-05-08 15:48:18.000000",
        "updated_at": "2024-05-08 15:48:18.000000"
    }
    
    CRM Format:
    {
        "id": "addr_abc123",
        "pos_address_id": 9,
        "is_default": False,
        "address_type": "Home",
        ...
    }
    """
    if not pos_address:
        return None
    
    return {
        "id": generate_address_id(),
        "pos_address_id": pos_address.get("id"),
        "is_default": False,  # Will be set by caller
        "address_type": pos_address.get("address_type") or "Other",
        "address": pos_address.get("address") or "",
        "house": pos_address.get("house"),
        "floor": pos_address.get("floor"),
        "road": pos_address.get("road"),
        "city": pos_address.get("city"),
        "state": None,  # Not in POS data
        "pincode": pos_address.get("pincode") or "",
        "country": "India",
        "latitude": pos_address.get("latitude"),
        "longitude": pos_address.get("longitude"),
        "contact_person_name": pos_address.get("contact_person_name"),
        "contact_person_number": pos_address.get("contact_person_number"),
        "dial_code": pos_address.get("dial_code"),
        "zone_id": pos_address.get("zone_id"),
        "delivery_instructions": None,
        "created_at": pos_address.get("created_at") or datetime.now(timezone.utc).isoformat(),
        "updated_at": pos_address.get("updated_at") or datetime.now(timezone.utc).isoformat()
    }


def map_pos_addresses_to_crm(pos_addresses: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Convert list of POS addresses to CRM format
    First valid address (with actual address content) is marked as default
    """
    if not pos_addresses:
        return []
    
    crm_addresses = []
    default_set = False
    
    for pos_addr in pos_addresses:
        crm_addr = map_pos_address_to_crm(pos_addr)
        if crm_addr:
            # Set first address with actual content as default
            if not default_set and has_valid_address_content(crm_addr):
                crm_addr["is_default"] = True
                default_set = True
            crm_addresses.append(crm_addr)
    
    # If no valid address found, mark first one as default
    if crm_addresses and not default_set:
        crm_addresses[0]["is_default"] = True
    
    return crm_addresses


def has_valid_address_content(address: Dict[str, Any]) -> bool:
    """Check if address has meaningful content"""
    if not address:
        return False
    
    # Check if address has at least address text or pincode
    addr_text = address.get("address") or ""
    pincode = address.get("pincode") or ""
    city = address.get("city") or ""
    
    return bool(addr_text.strip() or pincode.strip() or city.strip())


def get_default_address(addresses: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Get the default address from list"""
    if not addresses:
        return None
    
    for addr in addresses:
        if addr.get("is_default"):
            return addr
    
    # If no default set, return first
    return addresses[0] if addresses else None


def set_default_address(addresses: List[Dict[str, Any]], address_id: str) -> List[Dict[str, Any]]:
    """
    Set specified address as default, unset others
    Returns updated list
    """
    if not addresses:
        return addresses
    
    found = False
    for addr in addresses:
        if addr.get("id") == address_id:
            addr["is_default"] = True
            found = True
        else:
            addr["is_default"] = False
    
    # If address_id not found, keep first as default
    if not found and addresses:
        addresses[0]["is_default"] = True
    
    return addresses


def find_address_by_id(addresses: List[Dict[str, Any]], address_id: str) -> Optional[Dict[str, Any]]:
    """Find address by ID"""
    if not addresses:
        return None
    
    for addr in addresses:
        if addr.get("id") == address_id:
            return addr
    return None


def remove_address_by_id(addresses: List[Dict[str, Any]], address_id: str) -> List[Dict[str, Any]]:
    """
    Remove address by ID
    If removing default, next address becomes default
    """
    if not addresses:
        return addresses
    
    was_default = False
    new_addresses = []
    
    for addr in addresses:
        if addr.get("id") == address_id:
            was_default = addr.get("is_default", False)
        else:
            new_addresses.append(addr)
    
    # If we removed the default, set new default
    if was_default and new_addresses:
        new_addresses[0]["is_default"] = True
    
    return new_addresses


def create_new_address(address_data: Dict[str, Any], is_first: bool = False) -> Dict[str, Any]:
    """
    Create a new address from input data
    """
    now = datetime.now(timezone.utc).isoformat()
    
    return {
        "id": generate_address_id(),
        "pos_address_id": address_data.get("pos_address_id"),
        "is_default": is_first or address_data.get("is_default", False),
        "address_type": address_data.get("address_type") or "Home",
        "address": address_data.get("address") or "",
        "house": address_data.get("house"),
        "floor": address_data.get("floor"),
        "road": address_data.get("road"),
        "city": address_data.get("city"),
        "state": address_data.get("state"),
        "pincode": address_data.get("pincode") or "",
        "country": address_data.get("country") or "India",
        "latitude": address_data.get("latitude"),
        "longitude": address_data.get("longitude"),
        "contact_person_name": address_data.get("contact_person_name"),
        "contact_person_number": address_data.get("contact_person_number"),
        "dial_code": address_data.get("dial_code"),
        "zone_id": address_data.get("zone_id"),
        "delivery_instructions": address_data.get("delivery_instructions"),
        "created_at": now,
        "updated_at": now
    }


def update_address(existing: Dict[str, Any], updates: Dict[str, Any]) -> Dict[str, Any]:
    """
    Update address with new data
    Preserves id, pos_address_id, is_default, created_at
    """
    updated = existing.copy()
    
    # Fields that can be updated
    updatable_fields = [
        "address_type", "address", "house", "floor", "road",
        "city", "state", "pincode", "country",
        "latitude", "longitude",
        "contact_person_name", "contact_person_number", "dial_code",
        "zone_id", "delivery_instructions"
    ]
    
    for field in updatable_fields:
        if field in updates:
            updated[field] = updates[field]
    
    updated["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    return updated


def validate_address(address: Dict[str, Any]) -> tuple[bool, str]:
    """
    Validate address data
    Returns (is_valid, error_message)
    """
    if not address:
        return False, "Address data is required"
    
    # At least one of these should have value
    if not (address.get("address") or address.get("city") or address.get("pincode")):
        return False, "At least address, city, or pincode is required"
    
    return True, ""
