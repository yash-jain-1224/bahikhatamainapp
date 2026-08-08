#!/bin/bash

# Bahi Khata - API Endpoint Testing Script
# Tests all deployed services to verify functionality

set -e

echo "🧪 Testing Bahi Khata Deployment"
echo "======================================="
echo ""

# Color codes
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Test results
declare -a PASSED_TESTS
declare -a FAILED_TESTS

# Function to test endpoint
test_endpoint() {
    local name=$1
    local url=$2
    local expected_status=${3:-200}
    
    echo -n "Testing $name... "
    
    http_code=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>&1 || echo "000")
    
    if [ "$http_code" = "$expected_status" ]; then
        echo -e "${GREEN}✓ PASSED${NC} (HTTP $http_code)"
        PASSED_TESTS+=("$name")
        return 0
    else
        echo -e "${RED}✗ FAILED${NC} (HTTP $http_code, expected $expected_status)"
        FAILED_TESTS+=("$name: expected $expected_status, got $http_code")
        return 1
    fi
}

# Function to test JSON response
test_json_endpoint() {
    local name=$1
    local url=$2
    local expected_field=$3
    
    echo -n "Testing $name... "
    
    response=$(curl -s "$url" 2>&1)
    http_code=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>&1 || echo "000")
    
    if [ "$http_code" = "200" ] && echo "$response" | grep -q "$expected_field"; then
        echo -e "${GREEN}✓ PASSED${NC} (HTTP $http_code, contains '$expected_field')"
        PASSED_TESTS+=("$name")
        return 0
    else
        echo -e "${RED}✗ FAILED${NC} (HTTP $http_code or missing '$expected_field')"
        FAILED_TESTS+=("$name")
        return 1
    fi
}

echo "1. Testing Frontend"
echo "-------------------"
test_endpoint "Frontend Homepage" "https://bahi-khata-frontend.vercel.app"
echo ""

echo "2. Testing API Gateway"
echo "----------------------"
test_json_endpoint "API Gateway Health" "https://api-gateway-navy-eta.vercel.app/health" "status"
echo ""

echo "3. Testing Backend Services (via Gateway)"
echo "------------------------------------------"
# Note: These will fail until services are configured with proper environment variables
# and database is accessible. They may show 502 or authentication pages.

test_endpoint "Auth Service (via Gateway)" "https://api-gateway-navy-eta.vercel.app/api/v1/auth/health" "200"
test_endpoint "Business Service (via Gateway)" "https://api-gateway-navy-eta.vercel.app/api/v1/business/health" "200"
test_endpoint "Ledger Service (via Gateway)" "https://api-gateway-navy-eta.vercel.app/api/v1/ledger/health" "200"
test_endpoint "Sales Service (via Gateway)" "https://api-gateway-navy-eta.vercel.app/api/v1/sales/health" "200"
test_endpoint "Purchase Service (via Gateway)" "https://api-gateway-navy-eta.vercel.app/api/v1/purchases/health" "200"
test_endpoint "Inventory Service (via Gateway)" "https://api-gateway-navy-eta.vercel.app/api/v1/inventory/health" "200"

echo ""
echo "4. Testing Direct Service URLs (Deployment Check)"
echo "---------------------------------------------------"
# These will show Vercel auth pages, which is expected for now
test_endpoint "Auth Service Direct" "https://auth-service-fjaolnff4-yashjainconsults-2876s-projects.vercel.app" "200"
test_endpoint "Business Service Direct" "https://business-service-gz8120etu-yashjainconsults-2876s-projects.vercel.app" "200"

echo ""
echo "======================================="
echo "Test Results"
echo "======================================="
echo ""
echo -e "${GREEN}Passed: ${#PASSED_TESTS[@]}${NC}"
for test in "${PASSED_TESTS[@]}"; do
    echo -e "  ${GREEN}✓${NC} $test"
done

echo ""
if [ ${#FAILED_TESTS[@]} -gt 0 ]; then
    echo -e "${RED}Failed: ${#FAILED_TESTS[@]}${NC}"
    for test in "${FAILED_TESTS[@]}"; do
        echo -e "  ${RED}✗${NC} $test"
    done
    echo ""
    echo -e "${YELLOW}Note:${NC} Backend service failures are expected until:"
    echo "  1. Environment variables are fully configured"
    echo "  2. Database schema is deployed"
    echo "  3. Services are redeployed to pick up new env vars"
else
    echo -e "${GREEN}All tests passed! 🎉${NC}"
fi

echo ""
echo "Next Steps:"
echo "-----------"
if [ ${#FAILED_TESTS[@]} -gt 0 ]; then
    echo "1. Ensure all environment variables are set (run: ./setup-env-vars.sh)"
    echo "2. Deploy database schema (cd packages/shared && npx prisma db push)"
    echo "3. Redeploy backend services (./deploy-backend-services.sh)"
    echo "4. Re-run this test script"
else
    echo "✅ All systems operational!"
    echo "1. Configure additional features (Redis, email, SMS, payments)"
    echo "2. Set up monitoring and alerts"
    echo "3. Add custom domain (optional)"
    echo "4. Run integration tests"
fi
echo ""
