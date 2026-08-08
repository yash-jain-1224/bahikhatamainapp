#!/bin/bash

# Deploy all services to Vercel
# This script deploys frontend and backend services to Vercel

set -e

echo "======================================"
echo "Deploying to Vercel"
echo "======================================"
echo ""

# Check if vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "Error: Vercel CLI is not installed"
    echo "Install it with: npm i -g vercel"
    exit 1
fi

# Check if user is logged in to Vercel
if ! vercel whoami &> /dev/null; then
    echo "You need to login to Vercel first"
    vercel login
fi

echo "1. Deploying Frontend..."
echo "------------------------"
cd frontend
vercel --prod
cd ..
echo ""

echo "2. Deploying Backend Services..."
echo "--------------------------------"
# Deploy each backend service
SERVICES=(
    "api-gateway"
    "auth-service"
    "business-service"
    "ledger-service"
    "sales-service"
    "purchase-service"
    "expense-service"
    "inventory-service"
    "profile-service"
    "notification-service"
    "billing-service"
    "subscription-service"
    "referral-service"
    "admin-service"
)

for service in "${SERVICES[@]}"; do
    if [ -d "packages/$service" ]; then
        echo "Deploying $service..."
        cd "packages/$service"
        if [ -f "vercel.json" ]; then
            vercel --prod
        else
            echo "⚠️  Warning: vercel.json not found for $service, skipping..."
        fi
        cd ../..
        echo ""
    fi
done

echo "======================================"
echo "Deployment Complete!"
echo "======================================"
echo ""
echo "Next Steps:"
echo "1. Configure environment variables in Vercel dashboard"
echo "2. Set DATABASE_URL from Azure deployment"
echo "3. Test the deployments"
echo ""
