#!/bin/bash
set +e
cd /app/backend
export REACT_APP_BACKEND_URL=https://preprod-crm-app-1.preview.emergentagent.com
export CRM_TEST_OWNER_PASSWORD='Qplazm@10'

clear_buckets() {
  python -c "from pymongo import MongoClient; from dotenv import dotenv_values; e=dotenv_values('/app/backend/.env'); c=MongoClient(e['MONGO_URL']); c[e['DB_NAME']].scan_lookup_attempts.delete_many({}); print('cleared'); c.close()"
}

for f in test_cr089_skip_otp.py test_cr098.py test_cr084_cr097.py test_cr093_lookup.py test_cr085a_normalization.py test_phone_normalize.py; do
  echo "===== $f ====="
  clear_buckets
  python -m pytest tests/$f -q -n 1 --junitxml=/app/test_reports/pytest/iter8_${f%.py}.xml 2>&1 | tail -25
  echo "===== END $f ====="
done
