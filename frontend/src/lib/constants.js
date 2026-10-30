const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const COUNTRY_CODES = [
    { code: "+91", country: "India", flag: "\u{1F1EE}\u{1F1F3}" },
    { code: "+1", country: "USA", flag: "\u{1F1FA}\u{1F1F8}" },
    { code: "+44", country: "UK", flag: "\u{1F1EC}\u{1F1E7}" },
    { code: "+971", country: "UAE", flag: "\u{1F1E6}\u{1F1EA}" },
    { code: "+65", country: "Singapore", flag: "\u{1F1F8}\u{1F1EC}" },
    { code: "+61", country: "Australia", flag: "\u{1F1E6}\u{1F1FA}" },
    { code: "+81", country: "Japan", flag: "\u{1F1EF}\u{1F1F5}" },
    { code: "+86", country: "China", flag: "\u{1F1E8}\u{1F1F3}" },
];

const COMMON_ALLERGIES = [
    "Gluten", "Dairy", "Eggs", "Peanuts", "Tree Nuts", 
    "Soy", "Fish", "Shellfish", "Sesame", "Mustard"
];

const CUSTOM_FIELD_1_OPTIONS = [
    "Dine-in", "Takeaway", "Delivery", "Corporate", "Event", "Other"
];

const GENDER_OPTIONS = [
    { value: "male", label: "Male" },
    { value: "female", label: "Female" },
    { value: "other", label: "Other" },
    { value: "prefer_not_to_say", label: "Prefer not to say" }
];

const LANGUAGE_OPTIONS = [
    { value: "en", label: "English" },
    { value: "hi", label: "Hindi" },
    { value: "ta", label: "Tamil" },
    { value: "te", label: "Telugu" },
    { value: "mr", label: "Marathi" },
    { value: "bn", label: "Bengali" },
    { value: "gu", label: "Gujarati" },
    { value: "kn", label: "Kannada" },
    { value: "ml", label: "Malayalam" },
    { value: "pa", label: "Punjabi" }
];

const LEAD_SOURCE_OPTIONS = [
    "Walk-in", "Swiggy", "Zomato", "Instagram", "Facebook",
    "Google", "Referral", "Airbnb", "WhatsApp", "Phone Call", "Other"
];

const PAYMENT_TERMS_OPTIONS = [
    { value: "immediate", label: "Immediate" },
    { value: "net_7", label: "Net 7 Days" },
    { value: "net_15", label: "Net 15 Days" },
    { value: "net_30", label: "Net 30 Days" },
    { value: "net_60", label: "Net 60 Days" }
];

const DINING_TYPE_OPTIONS = ["Dine-In", "Takeaway", "Delivery"];

const TIME_SLOT_OPTIONS = [
    { value: "breakfast", label: "Breakfast (8-11 AM)" },
    { value: "lunch", label: "Lunch (12-3 PM)" },
    { value: "evening", label: "Evening (4-7 PM)" },
    { value: "dinner", label: "Dinner (7-11 PM)" },
    { value: "late_night", label: "Late Night (11 PM+)" }
];

const DIET_OPTIONS = [
    { value: "veg", label: "Vegetarian" },
    { value: "non_veg", label: "Non-Vegetarian" },
    { value: "vegan", label: "Vegan" },
    { value: "jain", label: "Jain" },
    { value: "eggetarian", label: "Eggetarian" }
];

const SPICE_LEVELS = [
    { value: "mild", label: "Mild", icon: "\u{1F336}\u{FE0F}" },
    { value: "medium", label: "Medium", icon: "\u{1F336}\u{FE0F}\u{1F336}\u{FE0F}" },
    { value: "spicy", label: "Spicy", icon: "\u{1F336}\u{FE0F}\u{1F336}\u{FE0F}\u{1F336}\u{FE0F}" },
    { value: "extra_spicy", label: "Extra Spicy", icon: "\u{1F336}\u{FE0F}\u{1F336}\u{FE0F}\u{1F336}\u{FE0F}\u{1F336}\u{FE0F}" }
];

const FESTIVAL_OPTIONS = [
    "Diwali", "Holi", "Eid", "Christmas", "New Year", 
    "Navratri", "Durga Puja", "Ganesh Chaturthi", "Onam", "Pongal"
];

export {
    BACKEND_URL, API,
    COUNTRY_CODES, COMMON_ALLERGIES, CUSTOM_FIELD_1_OPTIONS,
    GENDER_OPTIONS, LANGUAGE_OPTIONS, LEAD_SOURCE_OPTIONS,
    PAYMENT_TERMS_OPTIONS, DINING_TYPE_OPTIONS, TIME_SLOT_OPTIONS,
    DIET_OPTIONS, SPICE_LEVELS, FESTIVAL_OPTIONS
};
