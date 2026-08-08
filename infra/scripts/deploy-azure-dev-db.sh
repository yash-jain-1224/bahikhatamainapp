#!/bin/bash

# Deploy Azure Dev Database to Bhai-Khata-RG
# This script deploys a PostgreSQL Single Server (Basic tier) for minimum cost

set -e

RESOURCE_GROUP="Bahi-Khata-RG"
LOCATION="centralindia"
DEPLOYMENT_NAME="bahikhata-dev-db-$(date +%Y%m%d-%H%M%S)"
BICEP_FILE="../azure/dev-db.bicep"

echo "======================================"
echo "Deploying Dev Database to Azure"
echo "======================================"
echo "Resource Group: $RESOURCE_GROUP"
echo "Location: $LOCATION"
echo "Deployment: $DEPLOYMENT_NAME"
echo ""

# Check if resource group exists
if ! az group show --name "$RESOURCE_GROUP" &> /dev/null; then
    echo "Creating resource group: $RESOURCE_GROUP"
    az group create --name "$RESOURCE_GROUP" --location "$LOCATION"
else
    echo "Resource group $RESOURCE_GROUP already exists"
fi

# Prompt for PostgreSQL admin password
echo ""
echo "Enter PostgreSQL admin password (will be hidden):"
read -s PG_ADMIN_PASSWORD
echo ""

# Validate password
if [ -z "$PG_ADMIN_PASSWORD" ]; then
    echo "Error: Password cannot be empty"
    exit 1
fi

echo "Starting deployment..."
echo ""

# Deploy the Bicep template
DEPLOYMENT_OUTPUT=$(az deployment group create \
  --resource-group "$RESOURCE_GROUP" \
  --name "$DEPLOYMENT_NAME" \
  --template-file "$BICEP_FILE" \
  --parameters environment=dev \
               location="$LOCATION" \
               projectName=bahikhata \
               pgAdminUser=bahikhataadmin \
               pgAdminPassword="$PG_ADMIN_PASSWORD" \
  --output json)

# Extract outputs
PG_HOST=$(echo "$DEPLOYMENT_OUTPUT" | jq -r '.properties.outputs.pgHost.value')
PG_NAME=$(echo "$DEPLOYMENT_OUTPUT" | jq -r '.properties.outputs.pgName.value')
PG_DATABASE=$(echo "$DEPLOYMENT_OUTPUT" | jq -r '.properties.outputs.pgDatabaseName.value')
PG_USER=$(echo "$DEPLOYMENT_OUTPUT" | jq -r '.properties.outputs.pgAdminUser.value')
CONNECTION_STRING=$(echo "$DEPLOYMENT_OUTPUT" | jq -r '.properties.outputs.connectionString.value')

echo ""
echo "======================================"
echo "Deployment Successful!"
echo "======================================"
echo ""
echo "PostgreSQL Server Details:"
echo "-------------------------"
echo "Server Name: $PG_NAME"
echo "Host: $PG_HOST"
echo "Database: $PG_DATABASE"
echo "Admin User: $PG_USER"
echo ""
echo "Connection String:"
echo "$CONNECTION_STRING"
echo ""
echo "======================================"
echo "Next Steps:"
echo "======================================"
echo "1. Save the connection string securely"
echo "2. Update Vercel environment variables with DATABASE_URL"
echo "3. Run database migrations"
echo ""
echo "To set Vercel environment variable:"
echo "vercel env add DATABASE_URL"
echo ""
echo "Cost Information:"
echo "- Basic tier B_Gen5_1: ~\$5-10/month"
echo "- 5 GB storage included"
echo "- 7 days backup retention"
echo ""
