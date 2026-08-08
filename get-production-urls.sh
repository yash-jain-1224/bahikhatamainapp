#!/bin/bash

set -e

SERVICES=(
  "auth-service"
  "business-service"
  "profile-service"
  "ledger-service"
  "sales-service"
  "purchase-service"
  "expense-service"
  "inventory-service"
  "billing-service"
  "subscription-service"
  "notification-service"
  "admin-service"
  "referral-service"
)

echo "Getting production URLs for all backend services..."
echo ""

# Save URLs to file
echo "# Backend Service Production URLs" > BACKEND-URLS-CURRENT.md
echo "" >> BACKEND-URLS-CURRENT.md
echo "Generated on: $(date)" >> BACKEND-URLS-CURRENT.md
echo "" >> BACKEND-URLS-CURRENT.md

for service in "${SERVICES[@]}"; do
  echo "Checking $service..."
  cd "packages/$service"
  
  # Get the latest production deployment URL
  LATEST_URL=$(vercel ls --yes 2>/dev/null | grep "Production" | head -1 | awk '{print $7}')
  
  if [ -n "$LATEST_URL" ]; then
    echo "✓ $service: $LATEST_URL"
    echo "- $service: $LATEST_URL" >> ../../BACKEND-URLS-CURRENT.md
    
    # Test the health endpoint
    echo "  Testing health endpoint..."
    HEALTH_CHECK=$(curl -s "$LATEST_URL/health" 2>&1 || echo "FAILED")
    if [[ "$HEALTH_CHECK" == *"\"status\":"* ]]; then
      echo "  ✓ Health check passed"
    else
      echo "  ✗ Health check failed: $HEALTH_CHECK"
    fi
  else
    echo "✗ Could not find deployment for $service"
  fi
  
  cd ../..
  echo ""
done

echo "URLs saved to BACKEND-URLS-CURRENT.md"
