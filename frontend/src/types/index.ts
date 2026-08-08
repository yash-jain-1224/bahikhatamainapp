// ─── Types ────────────────────────────────────────────────
export interface User {
  id: string;
  phone: string;
  name?: string;
  email?: string;
  avatar_url?: string;
  is_active: boolean;
  is_super_admin: boolean;
}

export interface Business {
  id: string;
  name: string;
  type: string;
  gst_number?: string;
  logo_url?: string;
  address?: string;
  city?: string;
  state?: string;
  phone?: string;
  email?: string;
  pincode?: string;
  pan_number?: string;
  is_primary?: boolean;
  is_active: boolean;
  // Preferences the Business model actually stores. Absent from this interface,
  // so the Settings page could not read them back and its Preferences card
  // reset to hard-coded defaults on every load.
  invoice_prefix?: string;
  purchase_prefix?: string;
  financial_year_start?: number;
}

export interface PartyContact {
  id: string;
  party_id: string;
  name: string;
  phone?: string;
  email?: string;
  tags: string[];
  notes?: string;
}

export interface PartyBankAccount {
  id: string;
  party_id: string;
  bank_name: string;
  account_number: string;
  ifsc_code: string;
  branch?: string;
  is_primary: boolean;
}

export interface Party {
  id: string;
  business_id: string;
  name: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  type: 'SUPPLIER' | 'CUSTOMER' | 'BOTH';
  // GST
  gst_registration_type?: 'REGULAR' | 'COMPOSITION' | 'UNREGISTERED' | 'CONSUMER';
  gst_number?: string;
  gst_state?: string;
  pan_number?: string;
  // Address
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  // Credit
  credit_period_days?: number;
  credit_limit?: number;
  // Financials
  balance: number;
  opening_balance?: number;
  is_mine?: boolean;
  is_active: boolean;
  // Relations
  contacts?: PartyContact[];
  bank_accounts?: PartyBankAccount[];
}

export interface InventoryItem {
  id: string;
  name: string;
  sku?: string;
  unit: string;
  current_stock: number;
  min_stock: number;
  category?: Category;
}

export interface Category {
  id: string;
  name: string;
  description?: string;
}

export interface Lot {
  id: string;
  lot_number: string;
  item_id: string;
  initial_qty: number;
  available_qty: number;
  sold_qty: number;
  purchase_rate: number;
  unit?: string;       // lot's own unit (set at purchase time) — most reliable source
  status: string;
  item?: InventoryItem;
}

export interface Purchase {
  id: string;
  purchase_number: string;
  purchase_date: string;
  party: Party;
  gadi_number?: string;
  bill_number?: string;
  subtotal?: number;
  direct_expense?: number;
  indirect_expense?: number;
  cutter_cost?: number;
  gst_mode?: string;
  gst_value?: number;
  gst_amount?: number;
  discount?: number;
  round_off?: number;
  total_amount: number;
  paid_amount: number;
  balance_amount: number;
  payment_status: string;
  notes?: string;
  items: PurchaseItem[];
  /** Lots created by this purchase — the real lot numbers live here, not on items */
  lots?: { id: string; item_id: string; lot_number: string }[];
  expenses?: PurchaseExpense[];
  cutter_transactions?: CutterTransaction[];
  attachments?: Attachment[];
  payments?: PurchasePayment[];
}

export interface PurchaseItem {
  id: string;
  item_id: string;
  item?: InventoryItem;
  quantity: number;
  rate: number;
  amount: number;
  unit: string;
  lot_number?: string;
  notes?: string;
}

export interface PurchaseExpense {
  id: string;
  expense_type_id: string;
  expense_type?: { id: string; name: string };
  expense_category: 'DIRECT' | 'INDIRECT';
  amount: number;
  notes?: string;
}

export interface CutterTransaction {
  id: string;
  cutter_id: string;
  purchase_id?: string;
  cutter?: { id: string; name: string; unit?: string };
  quantity: number;
  rate: number;
  amount: number;
  notes?: string;
  is_paid?: boolean;
  receipt_url?: string;
  created_at?: string;
  purchase?: {
    id: string;
    purchase_number: string;
    purchase_date: string;
    total_amount: number;
    payment_status: string;
    party?: { id: string; name: string };
  };
}

export interface Attachment {
  id: string;
  file_name: string;
  file_url: string;
  file_type: string;
  file_size: number;
  created_at: string;
}

export interface PurchasePayment {
  id: string;
  payment_mode: string;
  amount: number;
  payment_date: string;
  transaction_ref?: string;
  receipt_url?: string;
  notes?: string;
}

/** A row in the bill-by-bill ledger for a party */
export interface BillEntry {
  id: string;
  type: 'PURCHASE' | 'SALE' | 'PAYMENT' | 'RECEIPT' | 'OPENING';
  date: string;
  reference: string;
  narration: string;
  /** Amount of the transaction (positive) */
  amount: number;
  /** Paid/received against this bill so far */
  paid_amount?: number;
  /** Pending balance on this specific bill */
  bill_balance?: number;
  /** Running cumulative balance after this row */
  running_balance: number;
  /** Link to the source document */
  source_id?: string;
}

export interface Cutter {
  id: string;
  name: string;
  phone?: string;
  rate_per_unit?: number;
  unit?: string;
  is_active?: boolean;
  party_id?: string;
  _count?: { transactions: number };
  transactions?: CutterTransaction[];
}

export interface ExpenseType {
  id: string;
  name: string;
  category?: string;
}

export interface Expense {
  id: string;
  business_id: string;
  expense_type_id: string;
  expense_category: 'DIRECT' | 'INDIRECT';
  amount: number;
  expense_date: string;
  payment_mode?: string;
  /** null for sale-linked expenses — SaleExpense has no payment status */
  is_paid: boolean | null;
  receipt_url?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  expense_type?: ExpenseType;
  // Unified view fields
  source: 'standalone' | 'purchase' | 'sale';
  source_id: string;
  source_number?: string;
  party_name?: string;
}

export interface Sale {
  id: string;
  sale_number: string;
  sale_date: string;
  party: Party;
  subtotal?: number;
  direct_expense?: number;
  indirect_expense?: number;
  discount?: number;
  round_off?: number;
  gst_mode?: string;
  gst_value?: number;
  gst_amount?: number;
  total_amount: number;
  paid_amount: number;
  balance_amount: number;
  payment_status: string;
  notes?: string;
  items?: any[];
  sale_lots?: any[];
  payments?: any[];
  attachments?: Array<{
    id: string;
    file_name: string;
    file_url: string;
    file_type: string;
    file_size: number;
    created_at: string;
  }>;
}

export interface LedgerEntry {
  id: string;
  entry_date: string;
  account_type: string;
  entry_type: 'DEBIT' | 'CREDIT';
  amount: number;
  narration?: string;
  reference_type?: string;
  reference_id?: string;
  purchase_id?: string;
  sale_id?: string;
  payment_id?: string;
  party?: Party;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

export interface Plan {
  id: string;
  name: string;
  slug: string;
  description?: string;
  price_monthly: number | string;
  price_quarterly: number | string;
  price_half_yearly: number | string;
  price_yearly: number | string;
  max_businesses: number;
  max_users: number;
  max_shops?: number;
  features?: Record<string, boolean>;
  is_active?: boolean;
  sort_order?: number;
}

export interface Subscription {
  id: string;
  plan: Plan;
  status: string;
  billing_cycle: string;
  current_period_end: string;
  trial_ends_at?: string;
}

export interface TrialInfo {
  expired: boolean;
  endsAt: string | null;
  daysRemaining: number | null;
  planName: string | null;
  maxBusinesses: number;
  // false = the user's businesses have never had a plan (send to plan
  // selection). Optional because older cached bk_trial objects lack it.
  hasSubscription?: boolean;
  // false = a paid subscription (show renewal wording, not "free trial").
  // Optional for backward compat — treat missing as true (trial).
  isTrial?: boolean;
}

export interface DashboardStats {
  purchaseToday: number;
  salesToday: number;
  outstandingReceivable: number;
  outstandingPayable: number;
  lowStockAlerts: number;
  partialPaymentAlerts: number;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  meta?: PaginationMeta;
  errors?: Array<{ field: string; message: string }>;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  loading: boolean;
  trialInfo: TrialInfo | null;
}

export interface BusinessState {
  currentBusiness: Business | null;
  businesses: Business[];
  loading: boolean;
  // True once the list has actually been fetched — redirect decisions that
  // key on an empty list must not fire on the initial (unfetched) state.
  loaded: boolean;
}

// ─── Referral Types ────────────────────────────────────
export interface ReferralEntry {
  id: string;
  referred_name: string;
  referred_phone: string;
  status: 'PENDING' | 'APPLIED' | 'COMPLETED' | 'REWARDED' | 'EXPIRED';
  reward_amount: number;
  redeemable_days: number;
  redeemed_days: number;
  created_at: string;
}

export interface ReferralDashboard {
  isEligible: boolean;
  referralCode: string | null;
  totalReferrals: number;
  successfulReferrals: number;
  pendingReferrals: number;
  totalRewardAmount: number;
  redeemableDays: number;
  referrals: ReferralEntry[];
}

export interface ReferralEligibility {
  canApplyReferral: boolean;
  hasPaidPlan: boolean;
  alreadyAppliedCode: boolean;
}
