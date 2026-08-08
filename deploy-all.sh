#!/bin/bash

# Quick deployment script - Creates Azure DB and deploys to Vercel
# This is a convenience script that runs both deployments in sequence

set -e

echo "======================================"
echo "Bahi Khata - Full Deployment"
echo "======================================"
echo ""
echo "This script will:"
echo "1. Create a PostgreSQL database on Azure (Basic tier - minimum cost)"
echo "2. Deploy frontend and backend to Vercel"
echo ""
read -p "Continue? (y/n) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Deployment cancelled."
    exit 0
fi

# Step 1: Deploy Azure Database
echo ""
echo "======================================"
echo "Step 1: Deploying Azure Database"
echo "======================================"
cd infra/scripts
./deploy-azure-dev-db.sh
cd ../..

echo ""
echo "⏸️  Press Enter after you've saved the connection string..."
read -p ""

# Step 2: Deploy to Vercel
echo ""
echo "======================================"
echo "Step 2: Deploying to Vercel"
echo "======================================"
echo ""
echo "Please ensure you've:"
echo "1. Saved the DATABASE_URL connection string"
echo "2. Have Vercel CLI installed (npm i -g vercel)"
echo ""
read -p "Continue with Vercel deployment? (y/n) " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    ./vercel-deploy.sh
else
    echo "Vercel deployment skipped."
    echo "You can run it later with: ./vercel-deploy.sh"
fi

echo ""
echo "======================================"
echo "Deployment Complete!"
echo "======================================"
echo ""
echo "Next Steps:"
echo "1. Add DATABASE_URL to Vercel environment variables"
echo "   Run: vercel env add DATABASE_URL"
echo "2. Add other required environment variables"
echo "3. Run database migrations"
echo "4. Test your deployments"
echo ""
echo "See DEPLOYMENT.md for detailed instructions"
echo ""
