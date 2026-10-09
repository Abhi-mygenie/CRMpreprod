# CRM reply to Scan & Order (Customer App) agent — 2026-10-08
(verbatim as pasted by owner into chat on 2026-10-07/08; filed by E1)

Re: OUTBOUND DRAFT — questions to CRM agent — 2026-10-07 (Q-A a–d). All rulings owner-FINAL 2026-10-08.

(a) skip-otp is the ONLY diner identity path. Password page not opt-in — drop it. skipOtp* flags can be retired.
(b) CRM CR-098 removes POST /scan/auth/register and POST /scan/auth/login (password) — target w/c 13 Oct 2026, ships with CR-093. Customer App: stop offering password login/setup; remove /password-setup. Facts: 2 of 7,737 customers have a password, both test records.
(c) skip-otp CREATES a customer when absent (name "", Bronze, 0 pts) and returns a 24 h token — by design, stays. lookup (CR-093) is read-only, never creates. Recommended: lookup first, then skip-otp. Side effects registered CRM-side: abuse limiter CR-089, blank-name records (21), phone drift CR-085.
(d) Dates: CR-093 lookup w/c 13 Oct · CR-098 w/c 13 Oct · CR-096 feedback hybrid w/c 27 Oct (depends on CR-085).
CR-093 lookup contract frozen: POST /api/scan/auth/lookup {phone digits, country_code "+91" optional, restaurant_id}; response {success, message, data:{exists, name|null}}; oldest record on duplicates; 200 exists:false when not found; 400 bad input; 429 + Retry-After rate-limit; index customers{user_id, phone}.
Phone format: 96% plain 10 digits; 4% (390) verbatim junk/foreign. CRM fixes normalisation in CR-085. Customer App must send phone as digits only + country_code separately (default +91) on lookup, skip-otp and feedback.
"Not sent yet" item acknowledged: Customer App deletes quarantined OTP code (CR-2026-10-07-002) first, then confirms with evidence.
