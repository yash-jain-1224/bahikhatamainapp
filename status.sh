#!/bin/bash

# Quick Status Check - Visual Dashboard
# Run this anytime to see the current deployment status

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

# URLs
FRONTEND_URL="https://bahi-khata-frontend.vercel.app"
API_GATEWAY_URL="https://api-gateway-navy-eta.vercel.app"

clear

# Header
echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║                                                              ║${NC}"
echo -e "${CYAN}║              ${MAGENTA}🚀 BAHI KHATA DEPLOYMENT STATUS 🚀${CYAN}             ║${NC}"
echo -e "${CYAN}║                                                              ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Function to check status
check_status() {
    local url=$1
    local code=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null)
    
    if [ "$code" == "200" ]; then
        echo -e "${GREEN}●${NC} ONLINE"
    elif [ "$code" == "401" ]; then
        echo -e "${RED}●${NC} PROTECTED"
    else
        echo -e "${YELLOW}●${NC} UNKNOWN ($code)"
    fi
}

check_protection() {
    local url=$1
    local response=$(curl -s "$url" 2>/dev/null)
    
    if echo "$response" | grep -q "<!DOCTYPE html>" || echo "$response" | grep -q "Vercel"; then
        echo -e "${RED}🔒 ENABLED${NC}"
        return 1
    else
        echo -e "${GREEN}✓ DISABLED${NC}"
        return 0
    fi
}

# Frontend Status
echo -e "${BLUE}┌─ FRONTEND ────────────────────────────────────────────────┐${NC}"
echo -e "${BLUE}│${NC} URL:    $FRONTEND_URL"
echo -e "${BLUE}│${NC} Status: $(check_status "$FRONTEND_URL")"
echo -e "${BLUE}└───────────────────────────────────────────────────────────┘${NC}"
echo ""

# API Gateway Status
echo -e "${BLUE}┌─ API GATEWAY ─────────────────────────────────────────────┐${NC}"
echo -e "${BLUE}│${NC} URL:    $API_GATEWAY_URL"
echo -e "${BLUE}│${NC} Status: $(check_status "$API_GATEWAY_URL/api/v1/health")"

# Check CORS
cors=$(curl -s -I -H "Origin: $FRONTEND_URL" "$API_GATEWAY_URL/api/v1/health" 2>/dev/null | grep -i "access-control-allow-origin")
if [ -n "$cors" ]; then
    echo -e "${BLUE}│${NC} CORS:   ${GREEN}✓ Configured${NC}"
else
    echo -e "${BLUE}│${NC} CORS:   ${RED}✗ Missing${NC}"
fi

echo -e "${BLUE}└───────────────────────────────────────────────────────────┘${NC}"
echo ""

# Deployment Protection Status
echo -e "${BLUE}┌─ DEPLOYMENT PROTECTION ───────────────────────────────────┐${NC}"
protection_status=$(check_protection "$API_GATEWAY_URL/api/v1/health")
echo -e "${BLUE}│${NC} Status: $protection_status"
echo -e "${BLUE}└───────────────────────────────────────────────────────────┘${NC}"
echo ""

# Backend Services
echo -e "${BLUE}┌─ BACKEND SERVICES ────────────────────────────────────────┐${NC}"

services=(
    "auth-service:Auth Service"
    "profile-service:Profile Service"
    "business-service:Business Service"
    "ledger-service:Ledger Service"
    "sales-service:Sales Service"
    "purchase-service:Purchase Service"
    "expense-service:Expense Service"
    "inventory-service:Inventory Service"
    "billing-service:Billing Service"
    "subscription-service:Subscription Service"
    "notification-service:Notification Service"
    "admin-service:Admin Service"
    "referral-service:Referral Service"
)

for service in "${services[@]}"; do
    IFS=':' read -r service_name display_name <<< "$service"
    status=$(check_status "$API_GATEWAY_URL/api/v1/${service_name}/health")
    printf "${BLUE}│${NC} %-30s %s\n" "$display_name" "$status"
done

echo -e "${BLUE}└───────────────────────────────────────────────────────────┘${NC}"
echo ""

# Quick Actions
echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║                      QUICK ACTIONS                           ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

if echo "$protection_status" | grep -q "ENABLED"; then
    echo -e "${YELLOW}⚠️  Deployment Protection is ENABLED${NC}"
    echo ""
    echo -e "${CYAN}Next Steps:${NC}"
    echo -e "  1. Open each service in the Vercel dashboard: ${BLUE}https://vercel.com/dashboard${NC}"
    echo -e "  2. Settings → Deployment Protection → disable for each service"
    echo -e "  3. ${BLUE}./verify-deployment.sh${NC}     - Run full verification"
    echo ""
else
    echo -e "${GREEN}✓ Deployment Protection is DISABLED${NC}"
    echo ""
    echo -e "${CYAN}Available Commands:${NC}"
    echo -e "  • ${BLUE}./verify-deployment.sh${NC}     - Run full test suite"
    echo -e "  • ${BLUE}./test-deployment.sh${NC}       - Quick API tests"
    echo -e "  • ${BLUE}open $FRONTEND_URL${NC}"
    echo -e "                                - Open frontend in browser"
    echo ""
    echo -e "${GREEN}✨ Your app is ready to use!${NC}"
    echo ""
fi

# Footer
echo -e "${CYAN}Last checked: $(date)${NC}"
echo ""
