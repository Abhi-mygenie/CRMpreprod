#!/bin/bash
# Ensure .env file exists for frontend

ENV_FILE="/app/frontend/.env"
ENV_EXAMPLE="/app/frontend/.env.example"

# Check if .env exists
if [ ! -f "$ENV_FILE" ]; then
    echo "⚠️  .env file missing! Creating from .env.example..."
    
    if [ -f "$ENV_EXAMPLE" ]; then
        cp "$ENV_EXAMPLE" "$ENV_FILE"
        echo "✅ Created .env from .env.example"
    else
        # Fallback: create with default value
        echo "REACT_APP_BACKEND_URL=https://crm-preview-19.preview.emergentagent.com" > "$ENV_FILE"
        echo "✅ Created .env with default backend URL"
    fi
else
    echo "✅ .env file exists"
fi

# Verify the content
if grep -q "REACT_APP_BACKEND_URL" "$ENV_FILE"; then
    echo "✅ REACT_APP_BACKEND_URL is configured"
else
    echo "⚠️  REACT_APP_BACKEND_URL missing, adding it..."
    echo "REACT_APP_BACKEND_URL=https://crm-preview-19.preview.emergentagent.com" >> "$ENV_FILE"
fi

exit 0
