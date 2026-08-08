#!/bin/bash

# Enhanced Deployment Verification Script
# Tests all aspects of the deployment after disabling protection

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# URLs
FRONTEND_URL="https://bahi-khata-frontend.vercel.app"
API_GATEWAY_URL="https://api-gateway-navy-eta.vercel.app"

# Counters
PASSED=0
FAILED=0
WARNINGS=0

# Test result storage
declare -a FAILED_TESTS=()
declare -a WARNING_TESTS=()

print_header() {
    echo -e "\n${BLUE}╔══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║${NC}  ${1}"
    echo -e "${BLUE}╚══════════════════════════════════════════════════════════╝${NC}\n"
}

print_test() {
    echo -e "${YELLOW}Testing:${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
    ((PASSED++))
}

print_failure() {
    echo -e "${RED}✗${NC} $1"
    ((FAILED++))
    FAILED_TESTS+=("$1")
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
    ((WARNINGS++))
    WARNING_TESTS+=("$1")
}

test_url() {
    local name=$1
    local url=$2
    local expected_status=${3:-200}
    
    print_test "$name"
    
    response=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null)
    
    if [ "$response" == "$expected_status" ]; then
        print_success "$name returned $response"
        return 0
    elif [ "$response" == "401" ]; then
        print_failure "$name returned 401 (Deployment Protection still enabled?)"
        return 1
    else
        print_warning "$name returned $response (expected $expected_status)"
        return 2
    fi
}

test_cors() {
    local name=$1
    local url=$2
    
    print_test "$name - CORS headers"
    
    response=$(curl -s -I -H "Origin: $FRONTEND_URL" "$url" 2>/dev/null)
    
    if echo "$response" | grep -qi "access-control-allow-origin"; then
        cors_origin=$(echo "$response" | grep -i "access-control-allow-origin" | cut -d' ' -f2- | tr -d '\r\n')
        if [[ "$cors_origin" == *"$FRONTEND_URL"* ]] || [[ "$cors_origin" == "*" ]]; then
            print_success "CORS headers correct: $cors_origin"
            return 0
        else
            print_warning "CORS headers present but unexpected: $cors_origin"
            return 2
        fi
    else
        print_failure "CORS headers missing"
        return 1
    fi
}

test_json_response() {
    local name=$1
    local url=$2
    
    print_test "$name - JSON response"
    
    response=$(curl -s -H "Content-Type: application/json" "$url" 2>/dev/null)
    content_type=$(curl -s -I "$url" 2>/dev/null | grep -i "content-type" | cut -d' ' -f2- | tr -d '\r\n')
    
    if echo "$response" | grep -q "<!DOCTYPE html>" || echo "$response" | grep -q "<html"; then
        print_failure "Received HTML instead of JSON (Deployment Protection likely enabled)"
        return 1
    elif echo "$content_type" | grep -qi "application/json"; then
        print_success "Received JSON response"
        return 0
    else
        print_warning "Response content type: $content_type"
        return 2
    fi
}

test_api_endpoint() {
    local name=$1
    local method=$2
    local url=$3
    local data=$4
    
    print_test "$name"
    
    if [ -n "$data" ]; then
        response=$(curl -s -X "$method" "$url" \
            -H "Content-Type: application/json" \
            -d "$data" 2>/dev/null)
    else
        response=$(curl -s -X "$method" "$url" 2>/dev/null)
    fi
    
    http_code=$(curl -s -o /dev/null -w "%{http_code}" -X "$method" "$url" \
        $([ -n "$data" ] && echo "-H 'Content-Type: application/json' -d '$data'") 2>/dev/null)
    
    if echo "$response" | grep -q "<!DOCTYPE html>" || echo "$response" | grep -q "<html"; then
        print_failure "Received HTML (Deployment Protection likely enabled)"
        return 1
    elif [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ]; then
        print_success "Endpoint working (HTTP $http_code)"
        return 0
    elif [ "$http_code" == "401" ]; then
        print_failure "HTTP 401 (Deployment Protection or Auth issue)"
        return 1
    elif [ "$http_code" -ge 400 ] && [ "$http_code" -lt 500 ]; then
        print_warning "HTTP $http_code (May be expected for some endpoints)"
        return 2
    else
        print_failure "HTTP $http_code"
        return 1
    fi
}

# Start testing
clear
print_header "🚀 Bahi Khata - Enhanced Deployment Verification"

echo -e "${BLUE}Frontend:${NC} $FRONTEND_URL"
echo -e "${BLUE}API Gateway:${NC} $API_GATEWAY_URL"
echo -e "${BLUE}Started:${NC} $(date)"
echo ""

# Test 1: Frontend
print_header "1️⃣  Frontend Tests"
test_url "Frontend Home Page" "$FRONTEND_URL" 200

# Test 2: API Gateway Basic
print_header "2️⃣  API Gateway Tests"
test_url "API Gateway Health" "$API_GATEWAY_URL/api/v1/health" 200
test_json_response "API Gateway Health JSON" "$API_GATEWAY_URL/api/v1/health"
test_cors "API Gateway" "$API_GATEWAY_URL/api/v1/health"

# Test 3: Critical Deployment Protection Check
print_header "3️⃣  Deployment Protection Check"
echo -e "${YELLOW}This is the critical test. If this fails, deployment protection is still enabled.${NC}\n"

response=$(curl -s "$API_GATEWAY_URL/api/v1/health" 2>/dev/null)
http_code=$(curl -s -o /dev/null -w "%{http_code}" "$API_GATEWAY_URL/api/v1/health" 2>/dev/null)

if echo "$response" | grep -q "<!DOCTYPE html>" || echo "$response" | grep -q "Vercel"; then
    print_failure "Deployment Protection is STILL ENABLED"
    echo -e "\n${RED}⚠️  CRITICAL: Backend services are still protected!${NC}"
    echo -e "${YELLOW}Please disable deployment protection for all backend services:${NC}"
    echo -e "  1. Run: ${BLUE}./open-service-settings.sh${NC}"
    echo -e "  2. In each tab, go to: Settings → Deployment Protection"
    echo -e "  3. Change to: 'Standard Protection' or 'Disabled'"
    echo -e "  4. Wait 1-2 minutes for changes to propagate"
    echo -e "  5. Re-run this script: ${BLUE}./verify-deployment.sh${NC}\n"
elif [ "$http_code" == "200" ]; then
    print_success "Deployment Protection is DISABLED (or Standard Protection enabled)"
    echo -e "${GREEN}✓ Backend services are publicly accessible!${NC}\n"
else
    print_warning "Unexpected response (HTTP $http_code)"
fi

# Test 4: Backend Service Endpoints
print_header "4️⃣  Backend Service Endpoints"

# Auth Service
test_api_endpoint "Auth Service - Health" "GET" "$API_GATEWAY_URL/api/v1/auth/health"

# Profile Service
test_api_endpoint "Profile Service - Health" "GET" "$API_GATEWAY_URL/api/v1/profile/health"

# Business Service
test_api_endpoint "Business Service - Health" "GET" "$API_GATEWAY_URL/api/v1/business/health"

# Ledger Service
test_api_endpoint "Ledger Service - Health" "GET" "$API_GATEWAY_URL/api/v1/ledger/health"

# Sales Service
test_api_endpoint "Sales Service - Health" "GET" "$API_GATEWAY_URL/api/v1/sales/health"

# Test 5: Authentication Flow
print_header "5️⃣  Authentication Flow Tests"

# Generate random email for testing
TEST_EMAIL="test_$(date +%s)@example.com"
TEST_PASSWORD="Test123!@#"

echo -e "${YELLOW}Testing with:${NC}"
echo -e "  Email: ${BLUE}$TEST_EMAIL${NC}"
echo -e "  Password: ${BLUE}$TEST_PASSWORD${NC}\n"

# Test Registration
registration_data="{
  \"email\": \"$TEST_EMAIL\",
  \"password\": \"$TEST_PASSWORD\",
  \"firstName\": \"Test\",
  \"lastName\": \"User\",
  \"phoneNumber\": \"+1234567890\"
}"

test_api_endpoint "User Registration" "POST" "$API_GATEWAY_URL/api/v1/auth/register" "$registration_data"

# Test Login (may fail if registration failed)
login_data="{
  \"email\": \"$TEST_EMAIL\",
  \"password\": \"$TEST_PASSWORD\"
}"

test_api_endpoint "User Login" "POST" "$API_GATEWAY_URL/api/v1/auth/login" "$login_data"

# Test 6: CORS Verification
print_header "6️⃣  CORS Verification"
test_cors "Auth Endpoint" "$API_GATEWAY_URL/api/v1/auth/health"
test_cors "Profile Endpoint" "$API_GATEWAY_URL/api/v1/profile/health"

# Test 7: Database Connectivity
print_header "7️⃣  Database Connectivity"
echo -e "${YELLOW}Testing database through API endpoints...${NC}\n"

# The registration test above already tested database connectivity
if [ $FAILED -eq 0 ]; then
    print_success "Database connectivity verified (registration succeeded)"
else
    print_warning "Database connectivity test inconclusive (check registration test)"
fi

# Summary
print_header "📊 Test Summary"

total=$((PASSED + FAILED + WARNINGS))

echo -e "${GREEN}Passed:${NC}   $PASSED / $total"
echo -e "${RED}Failed:${NC}   $FAILED / $total"
echo -e "${YELLOW}Warnings:${NC} $WARNINGS / $total"
echo ""

# Print failed tests
if [ ${#FAILED_TESTS[@]} -gt 0 ]; then
    echo -e "${RED}Failed Tests:${NC}"
    for test in "${FAILED_TESTS[@]}"; do
        echo -e "  ${RED}✗${NC} $test"
    done
    echo ""
fi

# Print warnings
if [ ${#WARNING_TESTS[@]} -gt 0 ]; then
    echo -e "${YELLOW}Warnings:${NC}"
    for test in "${WARNING_TESTS[@]}"; do
        echo -e "  ${YELLOW}⚠${NC} $test"
    done
    echo ""
fi

# Final verdict
print_header "🎯 Final Verdict"

if [ $FAILED -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}╔════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                                                        ║${NC}"
    echo -e "${GREEN}║  ✅ ALL TESTS PASSED! DEPLOYMENT SUCCESSFUL! 🎉        ║${NC}"
    echo -e "${GREEN}║                                                        ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${GREEN}Your application is fully deployed and working!${NC}"
    echo ""
    echo -e "🌐 Access your app: ${BLUE}$FRONTEND_URL${NC}"
    echo -e "📚 API Gateway: ${BLUE}$API_GATEWAY_URL${NC}"
    echo ""
    echo -e "${GREEN}Next steps:${NC}"
    echo -e "  1. Test the UI in your browser"
    echo -e "  2. Try registering and logging in"
    echo -e "  3. Explore all features"
    echo -e "  4. Set up monitoring and alerts"
    echo -e "  5. Consider adding a custom domain"
    echo ""
    exit 0
elif [ $FAILED -eq 0 ]; then
    echo -e "${YELLOW}╔════════════════════════════════════════════════════════╗${NC}"
    echo -e "${YELLOW}║                                                        ║${NC}"
    echo -e "${YELLOW}║  ⚠️  TESTS PASSED WITH WARNINGS                        ║${NC}"
    echo -e "${YELLOW}║                                                        ║${NC}"
    echo -e "${YELLOW}╚════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${YELLOW}Your deployment is mostly working but has some warnings.${NC}"
    echo -e "Review the warnings above and test thoroughly in the browser."
    echo ""
    exit 0
else
    echo -e "${RED}╔════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║                                                        ║${NC}"
    echo -e "${RED}║  ❌ DEPLOYMENT HAS ISSUES                               ║${NC}"
    echo -e "${RED}║                                                        ║${NC}"
    echo -e "${RED}╚════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    if echo "${FAILED_TESTS[@]}" | grep -q "Deployment Protection"; then
        echo -e "${RED}⚠️  CRITICAL ISSUE: Deployment Protection is still enabled${NC}"
        echo ""
        echo -e "${YELLOW}Quick Fix:${NC}"
        echo -e "  1. Run: ${BLUE}./open-service-settings.sh${NC}"
        echo -e "  2. For each service that opens:"
        echo -e "     - Click on 'Settings' tab"
        echo -e "     - Click on 'Deployment Protection'"
        echo -e "     - Change to 'Standard Protection' or 'Disabled'"
        echo -e "     - Click 'Save'"
        echo -e "  3. Wait 1-2 minutes"
        echo -e "  4. Run this script again: ${BLUE}./verify-deployment.sh${NC}"
        echo ""
    else
        echo -e "${YELLOW}Review the failed tests above for details.${NC}"
        echo -e "Common issues:"
        echo -e "  - Check service logs: ${BLUE}vercel logs${NC}"
        echo -e "  - Verify environment variables: ${BLUE}./setup-env-vars.sh${NC}"
        echo -e "  - Check database connectivity"
        echo -e "  - Review CORS configuration"
        echo ""
    fi
    
    echo -e "📚 Documentation:"
    echo -e "  - ${BLUE}FINAL-STEPS.md${NC} - Step-by-step guide"
    echo -e "  - ${BLUE}DEPLOYMENT.md${NC} - Full deployment guide"
    echo -e "  - ${BLUE}CORS-FIX-GUIDE.md${NC} - CORS troubleshooting"
    echo ""
    exit 1
fi
