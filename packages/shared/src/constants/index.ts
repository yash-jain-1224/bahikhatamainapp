// =============================================================================
// Constants - Bahi Khata Pro
// =============================================================================

export const APP_NAME = 'Bahi Khata Pro';
export const APP_VERSION = '1.0.0';

// JWT
export const ACCESS_TOKEN_EXPIRY = '15m';
export const REFRESH_TOKEN_EXPIRY = '7d';
export const OTP_EXPIRY_SECONDS = 300; // 5 minutes
export const OTP_LENGTH = 6;

// Rate Limiting — infrastructure-level recommended for 100K+ concurrent users
// The application no longer ships with in-memory rate limiting because:
//   • MemoryStore is per-process and doesn't share state across replicas
//   • Per-IP limits hit legitimate users behind shared NAT / CGNAT / CDN
// Use Nginx limit_req, Cloudflare Rate Limiting, AWS WAF, or a Redis-backed
// store (rate-limit-redis) in production instead.
//
// The constants below are kept for reference / Redis-backed limiters.
export const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 min sliding window
export const RATE_LIMIT_MAX = 1000; // per user/IP per minute (Redis-backed)
export const OTP_RATE_LIMIT_MAX = 10; // per phone per 15 min (enforced in Redis)

// Pagination
export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 500;

// File Upload
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
export const ALLOWED_FILE_TYPES = [
  'image/jpeg', 'image/png', 'image/webp',
  'application/pdf',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

// Subscription
export const TRIAL_DAYS = 14;
export const PLANS = {
  BASIC: 'basic',
  GROWTH: 'growth',
  ENTERPRISE: 'enterprise',
} as const;

export const BILLING_CYCLES = {
  MONTHLY: 'MONTHLY',
  QUARTERLY: 'QUARTERLY',
  HALF_YEARLY: 'HALF_YEARLY',
  YEARLY: 'YEARLY',
} as const;

// Roles and Permissions
export const ROLES = {
  OWNER: 'OWNER',
  MANAGER: 'MANAGER',
  ACCOUNTANT: 'ACCOUNTANT',
  STAFF: 'STAFF',
} as const;

export const ROLE_PERMISSIONS: Record<string, string[]> = {
  OWNER: [
    'PURCHASE_CREATE', 'PURCHASE_EDIT', 'PURCHASE_DELETE', 'PURCHASE_VIEW',
    'SALE_CREATE', 'SALE_EDIT', 'SALE_DELETE', 'SALE_VIEW',
    'INVENTORY_VIEW', 'INVENTORY_EDIT',
    'LEDGER_VIEW', 'LEDGER_EDIT',
    'PAYMENT_CREATE', 'PAYMENT_VIEW',
    'SUBSCRIPTION_MANAGE',
    'USER_INVITE', 'USER_MANAGE',
    'BUSINESS_EDIT',
    'REPORT_VIEW',
    'ADMIN_ACCESS',
  ],
  MANAGER: [
    'PURCHASE_CREATE', 'PURCHASE_EDIT', 'PURCHASE_VIEW',
    'SALE_CREATE', 'SALE_EDIT', 'SALE_VIEW',
    'INVENTORY_VIEW', 'INVENTORY_EDIT',
    'LEDGER_VIEW',
    'PAYMENT_CREATE', 'PAYMENT_VIEW',
    'USER_INVITE',
    'REPORT_VIEW',
  ],
  ACCOUNTANT: [
    'PURCHASE_VIEW',
    'SALE_VIEW',
    'INVENTORY_VIEW',
    'LEDGER_VIEW', 'LEDGER_EDIT',
    'PAYMENT_CREATE', 'PAYMENT_VIEW',
    'REPORT_VIEW',
  ],
  STAFF: [
    'PURCHASE_CREATE', 'PURCHASE_VIEW',
    'SALE_CREATE', 'SALE_VIEW',
    'INVENTORY_VIEW',
    'PAYMENT_VIEW',
  ],
};

// Redis Keys
export const REDIS_KEYS = {
  OTP: (phone: string) => `otp:${phone}`,
  OTP_ATTEMPTS: (phone: string) => `otp_attempts:${phone}`,
  SESSION: (userId: string) => `session:${userId}`,
  BUSINESS_CACHE: (businessId: string) => `business:${businessId}`,
  DASHBOARD_CACHE: (businessId: string) => `dashboard:${businessId}`,
  RATE_LIMIT: (key: string) => `rate_limit:${key}`,
  SUBSCRIPTION: (businessId: string) => `subscription:${businessId}`,
} as const;

// Service Ports
export const SERVICE_PORTS = {
  API_GATEWAY: 3000,
  AUTH_SERVICE: 3001,
  BUSINESS_SERVICE: 3002,
  PURCHASE_SERVICE: 3003,
  SALES_SERVICE: 3004,
  INVENTORY_SERVICE: 3005,
  LEDGER_SERVICE: 3006,
  SUBSCRIPTION_SERVICE: 3007,
  BILLING_SERVICE: 3008,
  NOTIFICATION_SERVICE: 3009,
  ADMIN_SERVICE: 3010,
  PROFILE_SERVICE: 3011,
  REFERRAL_SERVICE: 3012,
} as const;

// Account Types for Ledger
export const ACCOUNT_TYPES = {
  INVENTORY: 'INVENTORY',
  PARTY_PAYABLE: 'PARTY_PAYABLE',
  PARTY_RECEIVABLE: 'PARTY_RECEIVABLE',
  CASH: 'CASH',
  BANK: 'BANK',
  SALES: 'SALES',
  PURCHASE: 'PURCHASE',
  EXPENSE: 'EXPENSE',
  INCOME: 'INCOME',
} as const;
