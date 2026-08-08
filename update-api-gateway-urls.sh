#!/bin/bash

# Updates API Gateway environment variables with current backend service URLs
# Uses stable alias domains where available

echo "Setting API Gateway environment variables..."
echo ""

cd packages/api-gateway || exit 1

# Service URL mappings (env var name : URL)
# Using STABLE alias domains (these don't change on each deploy)
declare -a ENV_VARS=(
  "AUTH_SERVICE_URL:https://auth-service-mauve.vercel.app"
  "BUSINESS_SERVICE_URL:https://business-service-phi.vercel.app"
  "PROFILE_SERVICE_URL:https://profile-service-two.vercel.app"
  "LEDGER_SERVICE_URL:https://ledger-service-pi.vercel.app"
  "SALES_SERVICE_URL:https://sales-service-three.vercel.app"
  "PURCHASE_SERVICE_URL:https://purchase-service-amber.vercel.app"
  "EXPENSE_SERVICE_URL:https://expense-service-one.vercel.app"
  "INVENTORY_SERVICE_URL:https://inventory-service-nine.vercel.app"
  "BILLING_SERVICE_URL:https://billing-service-eight.vercel.app"
  "SUBSCRIPTION_SERVICE_URL:https://subscription-service-azure-iota.vercel.app"
  "NOTIFICATION_SERVICE_URL:https://notification-service-wheat.vercel.app"
  "ADMIN_SERVICE_URL:https://admin-service-sage.vercel.app"
  "REFERRAL_SERVICE_URL:https://referral-service-alpha.vercel.app"
)

for entry in "${ENV_VARS[@]}"; do
  var_name="${entry%%:*}"
  var_value="${entry#*:}"
  
  echo "Setting $var_name..."
  
  # Remove existing var (ignore errors), then add new value for production
  vercel env rm "$var_name" production --yes > /dev/null 2>&1 || true
  echo "$var_value" | vercel env add "$var_name" production > /dev/null 2>&1
  
  echo "  ✓ $var_name = $var_value"
done

echo ""
echo "Environment variables set! Redeploying API Gateway..."
echo ""

vercel --prod --yes 2>&1 | tail -10

cd ../..
echo ""
echo "Done! API Gateway updated with new service URLs."
