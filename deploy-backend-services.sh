#!/bin/bash

# Deploy All Backend Services to Vercel
# This script removes workspace dependencies, adds .npmrc, and deploys each service

set -e

echo "======================================"
echo "Backend Services Deployment"
echo "======================================"
echo ""

# Array of services to deploy
SERVICES=(
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

# Color codes
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Store deployment URLs
declare -a DEPLOYMENT_URLS

echo "Found ${#SERVICES[@]} services to deploy"
echo ""

for service in "${SERVICES[@]}"; do
    SERVICE_PATH="packages/$service"
    
    if [ ! -d "$SERVICE_PATH" ]; then
        echo -e "${YELLOW}⚠️  Warning: $service directory not found, skipping...${NC}"
        continue
    fi
    
    echo "======================================"
    echo "Processing: $service"
    echo "======================================"
    
    cd "$SERVICE_PATH"
    
    # Step 1: Add .npmrc if it doesn't exist
    if [ ! -f ".npmrc" ]; then
        echo "📝 Creating .npmrc..."
        cat > .npmrc << EOF
legacy-peer-deps=true
engine-strict=false
EOF
        echo -e "${GREEN}✓${NC} .npmrc created"
    else
        echo -e "${GREEN}✓${NC} .npmrc already exists"
    fi
    
    # Step 2: Remove workspace dependency from package.json
    if [ -f "package.json" ]; then
        if grep -q "@bahi-khata/shared" package.json; then
            echo "🔧 Removing workspace dependency..."
            # Create backup
            cp package.json package.json.bak
            # Remove the workspace dependency line
            sed -i.tmp '/"@bahi-khata\/shared":/d' package.json
            rm -f package.json.tmp
            echo -e "${GREEN}✓${NC} Workspace dependency removed"
        else
            echo -e "${GREEN}✓${NC} No workspace dependency to remove"
        fi
    fi
    
    # Step 2.5: Fix tsconfig.json to be self-contained
    if [ -f "tsconfig.json" ]; then
        if grep -q '"extends"' tsconfig.json; then
            echo "🔧 Fixing tsconfig.json..."
            # Create backup
            cp tsconfig.json tsconfig.json.bak
            # Create self-contained tsconfig
            cat > tsconfig.json << 'TSEOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "moduleResolution": "node"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
TSEOF
            echo -e "${GREEN}✓${NC} tsconfig.json fixed"
        else
            echo -e "${GREEN}✓${NC} tsconfig.json is already self-contained"
        fi
    fi
    
    # Step 3: Check if vercel.json exists
    if [ ! -f "vercel.json" ]; then
        echo "⚠️  No vercel.json found for $service"
        echo "Creating basic vercel.json..."
        cat > vercel.json << EOF
{
  "version": 2,
  "builds": [
    {
      "src": "src/index.ts",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "src/index.ts"
    }
  ]
}
EOF
        echo -e "${GREEN}✓${NC} vercel.json created"
    fi
    
    # Step 4: Deploy to Vercel
    echo "🚀 Deploying $service to Vercel..."
    if vercel --prod --yes > /tmp/vercel-deploy-$service.log 2>&1; then
        # Extract URL from log
        URL=$(grep -o 'https://[^ ]*vercel\.app' /tmp/vercel-deploy-$service.log | head -1)
        DEPLOYMENT_URLS+=("$service: $URL")
        echo -e "${GREEN}✓${NC} $service deployed successfully!"
        echo "   URL: $URL"
    else
        echo -e "${RED}✗${NC} Failed to deploy $service"
        echo "   Check log: /tmp/vercel-deploy-$service.log"
    fi
    
    # Return to root
    cd ../..
    echo ""
done

echo "======================================"
echo "Deployment Complete!"
echo "======================================"
echo ""
echo "Deployed Services:"
echo "-------------------"
for url in "${DEPLOYMENT_URLS[@]}"; do
    echo -e "${GREEN}✓${NC} $url"
done
echo ""

# Save URLs to file
echo "# Backend Service Deployment URLs" > BACKEND-URLS.md
echo "" >> BACKEND-URLS.md
echo "Generated on: $(date)" >> BACKEND-URLS.md
echo "" >> BACKEND-URLS.md
for url in "${DEPLOYMENT_URLS[@]}"; do
    echo "- $url" >> BACKEND-URLS.md
done

echo "📝 Deployment URLs saved to BACKEND-URLS.md"
echo ""
echo "Next Steps:"
echo "1. Update frontend environment variables with API Gateway URL"
echo "2. Configure database connection strings in Vercel"
echo "3. Run database migrations"
echo "4. Test all endpoints"
echo ""
