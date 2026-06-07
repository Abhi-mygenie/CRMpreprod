"""
CR-015 T7 — Audit all whatsapp_template_variable_map docs for unknown var_keys.

READ-ONLY. No DB writes.

Checks:
1. Map-mode values against VARIABLES_BY_KEY (unknown = flagged)
2. Text-mode values against suspicious heuristic (same as T6 server-side)

Usage:
    python scripts/cr015_audit_unknown_var_keys.py
"""
import asyncio
import os
import sys
from pathlib import Path

from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent.parent
load_dotenv(ROOT_DIR / ".env")
sys.path.insert(0, str(ROOT_DIR))

from core.whatsapp_variables import VARIABLES_BY_KEY


SUSPICIOUS_TOKENS = ("missing", "todo", "tbd", "n/a", "none", "placeholder", "test")


async def main():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]

    docs = await db.whatsapp_template_variable_map.find({}, {"_id": 0}).to_list(500)

    print(f"Scanning {len(docs)} template variable map document(s)...\n")

    unknown_map_issues = []
    suspicious_text_issues = []

    for doc in docs:
        user_id = doc.get("user_id", "?")
        template_id = doc.get("template_id", "?")
        mappings = doc.get("mappings", {})
        modes = doc.get("modes", {})

        for placeholder, value in mappings.items():
            mode = modes.get(placeholder, "map")

            if mode == "coupon_pick":
                continue

            if mode == "text":
                val_lower = (value or "").lower().strip()
                is_suspicious = (
                    any(token in val_lower for token in SUSPICIOUS_TOKENS)
                    or (value or "").strip() != (value or "")
                )
                if is_suspicious:
                    suspicious_text_issues.append({
                        "user_id": user_id,
                        "template_id": template_id,
                        "placeholder": placeholder,
                        "value": value,
                        "mode": "text",
                    })
                continue

            # mode == "map" (default)
            clean_key = (value or "").strip()
            if clean_key in ("", "none"):
                continue
            if clean_key not in VARIABLES_BY_KEY:
                unknown_map_issues.append({
                    "user_id": user_id,
                    "template_id": template_id,
                    "placeholder": placeholder,
                    "value": value,
                    "mode": "map",
                })

    # Report
    print("=" * 60)
    print("CR-015 T7 Audit — Variable Mapping Health Report")
    print("=" * 60)

    print(f"\nDocuments scanned: {len(docs)}")
    print(f"Unknown map-mode var_keys: {len(unknown_map_issues)}")
    print(f"Suspicious text-mode values: {len(suspicious_text_issues)}")

    if unknown_map_issues:
        print("\n--- UNKNOWN MAP-MODE VAR_KEYS ---")
        for issue in unknown_map_issues:
            print(f"  [{issue['user_id']}] template {issue['template_id']} "
                  f"{issue['placeholder']} = '{issue['value']}'")

    if suspicious_text_issues:
        print("\n--- SUSPICIOUS TEXT-MODE VALUES ---")
        for issue in suspicious_text_issues:
            print(f"  [{issue['user_id']}] template {issue['template_id']} "
                  f"{issue['placeholder']} = '{issue['value']}'")

    if not unknown_map_issues and not suspicious_text_issues:
        print("\nAll clear. No issues found.")

    total = len(unknown_map_issues) + len(suspicious_text_issues)
    print(f"\nTotal issues: {total}")

    client.close()
    return total


if __name__ == "__main__":
    issues = asyncio.run(main())
    sys.exit(0 if issues == 0 else 1)
