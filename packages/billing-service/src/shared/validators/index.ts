import { z } from 'zod';

// =============================================================================
// Zod Validators - Bahi Khata Pro
// =============================================================================

// Auth
export const phoneSchema = z.string().regex(/^[6-9]\d{9}$/, 'Invalid Indian phone number');

// ── Empty-string tolerant helpers ────────────────────────────────────────────
// `.optional()` accepts `undefined`, not `''`. HTML form state initialises text
// inputs to `''` and sends the whole object, so an untouched optional field
// arrives as an empty string and fails its regex. That is what made Business
// Settings' Save return "Validation failed" for every business created without
// a phone number — and clearing any such field bricked Save the same way.
// These helpers normalise `''` to `undefined` first.
//
// Declared here, above their first use: they were originally defined further
// down the file and so could not be used by the business schemas.
const emptyToUndefined = (val: unknown) =>
  typeof val === 'string' && val.trim() === '' ? undefined : val;

const optionalString = z.preprocess(emptyToUndefined, z.string().optional());

const optionalEmail = z.preprocess(emptyToUndefined, z.string().email().optional());

const optionalStringMax = (max: number) =>
  z.preprocess(emptyToUndefined, z.string().max(max).optional());

const optionalPattern = (re: RegExp, message: string) =>
  z.preprocess(emptyToUndefined, z.string().regex(re, message).optional());

const optionalPhone = z.preprocess(emptyToUndefined, phoneSchema.optional());

export const sendOtpSchema = z.object({
  phone: phoneSchema,
});

export const verifyOtpSchema = z.object({
  phone: phoneSchema,
  otp: z.string().length(6, 'OTP must be 6 digits'),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export const loginWithEmailSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  phone: phoneSchema,  // phone is now mandatory for registration
});

// Business
export const createBusinessSchema = z.object({
  name: z.string().min(2).max(100),
  type: z.enum(['TRADING', 'MANUFACTURING', 'WHOLESALE', 'RETAIL', 'MANDI', 'DISTRIBUTOR', 'OTHER']).optional(),
  gstNumber: optionalPattern(
    /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/,
    'Invalid GSTIN',
  ),
  panNumber: optionalPattern(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, 'Invalid PAN'),
  address: optionalStringMax(500),
  city: optionalStringMax(100),
  state: optionalStringMax(100),
  pincode: optionalPattern(/^[1-9][0-9]{5}$/, 'Invalid pincode'),
  phone: optionalPhone,
  email: optionalEmail,
});

// `isActive` is not part of createBusinessSchema (you don't create a business
// deactivated), so `.partial()` alone stripped it and Deactivate/Activate was a
// silent no-op on every path.
export const updateBusinessSchema = createBusinessSchema.partial().extend({
  isActive: z.boolean().optional(),
  // The Preferences card collects these and the Business model has columns for
  // them, but they were absent from the schema — so zod stripped them and the
  // card reset to its hard-coded defaults on every load while Save reported
  // success. logoUrl likewise: updateBusiness writes it but nothing declared it.
  invoicePrefix: optionalStringMax(10),
  purchasePrefix: optionalStringMax(10),
  financialYearStart: z.coerce.number().int().min(1).max(12).optional(),
  logoUrl: optionalString,
});

// Shop
export const createShopSchema = z.object({
  name: z.string().min(2).max(100),
  address: z.string().max(500).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  pincode: z.string().regex(/^[1-9][0-9]{5}$/).optional(),
  phone: phoneSchema.optional(),
  gstNumber: z.string().optional(),
});

// Party
const partyContactSchema = z.object({
  name: z.string().min(1).max(100),
  phone: z.string().optional(),
  email: optionalEmail,
  tags: z.array(z.string()).optional(),
  notes: optionalString,
});

const partyBankAccountSchema = z.object({
  bankName: z.string().min(1).max(100),
  accountNumber: z.string().min(1).max(50),
  ifscCode: z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Invalid IFSC code'),
  branch: optionalString,
  isPrimary: z.boolean().optional(),
});

export const createPartySchema = z.object({
  name: z.string().min(2).max(100),
  phone: phoneSchema,
  whatsapp: z.preprocess(
    (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val),
    z.string().regex(/^[6-9]\d{9}$/, 'Invalid WhatsApp number').optional(),
  ),
  email: optionalEmail,
  type: z.enum(['SUPPLIER', 'CUSTOMER', 'BOTH']).optional(),

  // GST Details
  gstRegistrationType: z.enum(['REGULAR', 'COMPOSITION', 'UNREGISTERED', 'CONSUMER']).optional(),
  gstNumber: optionalString,
  gstState: optionalString,
  panNumber: optionalString,

  // Address
  address: optionalStringMax(500),
  city: optionalStringMax(100),
  state: optionalStringMax(100),
  pincode: optionalString,

  // Opening Balance
  openingBalance: z.number().optional(),

  // Credit
  creditPeriodDays: z.number().int().min(0).max(365).optional(),
  creditLimit: z.number().min(0).optional(),

  // Contacts (owners/workers)
  contacts: z.array(partyContactSchema).optional(),

  // Banking
  bankAccounts: z.array(partyBankAccountSchema).optional(),
});

export const updatePartySchema = createPartySchema.partial();

// Inventory Item
// Standalone expense (expense-service). The routes previously had no validator
// at all, so an empty body reached `new Prisma.Decimal(undefined)` and surfaced
// as a 500 "[DecimalError] Invalid argument: undefined".
export const createExpenseSchema = z.object({
  expenseTypeId: z.string().uuid(),
  expenseCategory: z.enum(['DIRECT', 'INDIRECT']),
  amount: z.number().positive(),
  expenseDate: z.string().optional(),
  paymentMode: z.enum(['CASH', 'BANK_TRANSFER', 'UPI', 'CARD', 'CHEQUE', 'CREDIT', 'MIXED']).optional(),
  isPaid: z.boolean().optional().default(true),
  receiptUrl: z.string().optional(),
  notes: z.string().optional(),
});

export const updateExpenseSchema = createExpenseSchema.partial();

export const createItemSchema = z.object({
  name: z.string().min(1).max(200),
  sku: z.string().max(50).optional(),
  categoryId: z.string().uuid().optional(),
  unit: z.string().default('KG'),
  minStock: z.number().min(0).default(0),
  hsnCode: z.string().optional(),
  gstRate: z.number().min(0).max(100).default(0),
  // The create form collects an opening stock figure. It was absent here, so
  // zod stripped it and every new item was created with current_stock = 0.
  openingStock: z.number().min(0).optional().default(0),
});

// Cutter
export const createCutterSchema = z.object({
  name: z.string().min(2).max(100),
  phone: phoneSchema.optional(),
  ratePerUnit: z.number().nonnegative().optional().default(0),
  unit: z.string().default('KG'),
});

// Purchase
export const purchaseItemSchema = z.object({
  itemId: z.string().uuid(),
  quantity: z.number().positive(),
  rate: z.number().positive(),
  unit: z.string().optional(),
  notes: z.string().optional(),
  lotNumber: z.string().optional(),
});

// isPaid/receiptUrl must be declared or zod silently strips them: an unpaid
// expense/cutter row was stored as PAID (service default) with its receipt
// lost, and no PARTY_PAYABLE ledger entry was ever created for it.
export const purchaseExpenseSchema = z.object({
  expenseTypeId: z.string().uuid(),
  expenseCategory: z.enum(['DIRECT', 'INDIRECT']),
  amount: z.number().positive(),
  isPaid: z.boolean().optional(),
  receiptUrl: z.string().optional(),
  notes: z.string().optional(),
});

export const cutterTransactionSchema = z.object({
  cutterId: z.string().uuid(),
  quantity: z.number().positive(),
  rate: z.number().positive(),
  isPaid: z.boolean().optional(),
  receiptUrl: z.string().optional(),
  notes: z.string().optional(),
});

export const paymentSchema = z.object({
  // Must stay in sync with enum PaymentMode in schema.prisma. CARD was missing
  // here while seven frontend files offered it, so choosing Card failed with
  // "Validation failed" before the request ever reached the database.
  paymentMode: z.enum(['CASH', 'BANK_TRANSFER', 'UPI', 'CARD', 'CHEQUE', 'CREDIT', 'MIXED']),
  amount: z.number().positive(),
  paymentDate: z.string().datetime().optional(),
  transactionRef: z.string().optional(),
  receiptUrl: z.string().url().optional(),
  notes: z.string().optional(),
});

// Payment reminder rows collected by the purchase/sale forms.
// Matches ReminderInput in {purchase,sales}.service.ts.
export const reminderSchema = z.object({
  remindOn: z.string(),
  amount: z.number().nonnegative().optional(),
  note: z.string().optional(),
});

/**
 * GST / round-off / reminder fields shared by the purchase and sale create
 * schemas.
 *
 * These were MISSING from both create schemas even though the forms send them
 * and both services fully implement them (gst_mode/gst_value/gst_amount,
 * round_off, paymentReminder rows, and the totals + party-balance maths).
 * Because z.object() strips undeclared keys, every one of them was silently
 * dropped on create: a sale entered as ₹100,000 + 18% GST was stored as
 * ₹100,000 with gst_mode NULL and no reminder rows, and the detail page then
 * showed a lower total than the form did. The PATCH path has no validator,
 * which is why editing the same record afterwards appeared to work.
 */
const gstAndAdjustmentFields = {
  gstMode: z.enum(['NONE', 'PERCENT', 'AMOUNT']).optional(),
  gstValue: z.number().nonnegative().optional(),
  gstAmount: z.number().nonnegative().optional(),
  roundOff: z.number().optional(), // may be negative
  reminders: z.array(reminderSchema).optional().default([]),
};

export const createPurchaseSchema = z.object({
  ...gstAndAdjustmentFields,
  discount: z.number().min(0).optional().default(0),
  shopId: z.string().uuid().optional(),
  partyId: z.string().uuid(),
  gadiNumber: z.string().max(20).optional(),
  billNumber: z.string().max(50).optional(),
  purchaseDate: z.string().datetime().optional(),
  items: z.array(purchaseItemSchema).min(1, 'At least one item is required'),
  expenses: z.array(purchaseExpenseSchema).optional().default([]),
  cutterTransactions: z.array(cutterTransactionSchema).optional().default([]),
  payments: z.array(paymentSchema).optional().default([]),
  notes: z.string().optional(),
});

// Sale (lot-based)
export const saleLotSchema = z.object({
  lotId: z.string().uuid(),
  itemId: z.string().uuid(),
  quantitySold: z.number().positive(),
  rate: z.number().positive(),
});

export const saleExpenseSchema = z.object({
  expenseTypeId: z.string().uuid(),
  expenseCategory: z.enum(['DIRECT', 'INDIRECT']),
  amount: z.number().positive(),
  notes: z.string().optional(),
});

export const createSaleSchema = z.object({
  // See gstAndAdjustmentFields above — these were stripped on create.
  ...gstAndAdjustmentFields,
  shopId: z.string().uuid().optional(),
  partyId: z.string().uuid(),
  saleDate: z.string().datetime().optional(),
  saleLots: z.array(saleLotSchema).min(1, 'At least one lot is required'),
  expenses: z.array(saleExpenseSchema).optional().default([]),
  payments: z.array(paymentSchema).optional().default([]),
  discount: z.number().min(0).optional().default(0),
  notes: z.string().optional(),
});

// Subscription
export const createSubscriptionSchema = z.object({
  planId: z.string().uuid(),
  billingCycle: z.enum(['MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY']),
});

// Pagination
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

// Date filter
export const dateFilterSchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

// User Profile
export const updateProfileSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  // optionalEmail, not z.string().email().optional(): an untouched email input
  // posts "" and a bare .email() rejects it, so every user without an email
  // address got 400 on Save with no way to succeed. The party and business
  // schemas already use this helper — the profile schema was the odd one out.
  email: optionalEmail,
  address: z.string().max(500).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  pincode: z.string().optional(),
});

// Expense Type
export const createExpenseTypeSchema = z.object({
  name: z.string().min(2).max(100),
  category: z.enum(['DIRECT', 'INDIRECT']),
});

// Payment (standalone)
export const createPaymentSchema = z.object({
  referenceType: z.enum(['PURCHASE', 'SALE', 'EXPENSE', 'ADJUSTMENT']),
  referenceId: z.string().uuid(),
  payerPartyId: z.string().uuid().optional(),
  payeePartyId: z.string().uuid().optional(),
  // Must stay in sync with enum PaymentMode in schema.prisma. CARD was missing
  // here while seven frontend files offered it, so choosing Card failed with
  // "Validation failed" before the request ever reached the database.
  paymentMode: z.enum(['CASH', 'BANK_TRANSFER', 'UPI', 'CARD', 'CHEQUE', 'CREDIT', 'MIXED']),
  amount: z.number().positive(),
  paymentDate: z.string().datetime().optional(),
  transactionRef: z.string().optional(),
  notes: z.string().optional(),
});

// Category
export const createCategorySchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(500).optional(),
  parentId: z.string().uuid().optional(),
});

// Invite User
export const inviteUserSchema = z.object({
  phone: phoneSchema,
  role: z.enum(['MANAGER', 'ACCOUNTANT', 'STAFF']),
});
