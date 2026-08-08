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
  is_primary?: boolean;
  is_active: boolean;
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
  gst_registration_type?: 'REGULAR' | 'COMPOSITION' | 'UNREGISTERED' | 'CONSUMER';
  gst_number?: string;
  gst_state?: string;
  pan_number?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  credit_period_days?: number;
  credit_limit?: number;
  balance: number;
  opening_balance?: number;
  is_mine?: boolean;
  is_active: boolean;
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
  unit?: string;
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
  total_amount: number;
  paid_amount: number;
  balance_amount: number;
  payment_status: string;
  notes?: string;
  items: PurchaseItem[];
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

export interface BillEntry {
  id: string;
  type: 'PURCHASE' | 'SALE' | 'PAYMENT' | 'RECEIPT' | 'OPENING';
  date: string;
  reference: string;
  narration: string;
  amount: number;
  paid_amount?: number;
  bill_balance?: number;
  running_balance: number;
  source_id?: string;
}

export interface Cutter {
  id: string;
  name: string;
  phone?: string;
  rate_per_unit?: number;
  unit?: string;
  is_active?: boolean;
  _count?: { transactions: number };
  transactions?: CutterTransaction[];
}

export interface ExpenseType {
  id: string;
  name: string;
  category?: string;
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
  attachments?: Attachment[];
}

export interface LedgerEntry {
  id: string;
  entry_date: string;
  account_type: string;
  entry_type: 'DEBIT' | 'CREDIT';
  amount: number;
  narration?: string;
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
}

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

// ─── Navigation Types ─────────────────────────────────
export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
  BusinessCreate: undefined;
  BusinessList: undefined;
};

export type AuthStackParamList = {
  Login: undefined;
};

export type MainTabParamList = {
  DashboardTab: undefined;
  PurchasesTab: undefined;
  SalesTab: undefined;
  InventoryTab: undefined;
  MoreTab: undefined;
};

export type DashboardStackParamList = {
  Dashboard: undefined;
  Notifications: undefined;
};

export type PurchaseStackParamList = {
  PurchaseList: undefined;
  PurchaseCreate: undefined;
  PurchaseDetail: { id: string };
  PurchaseEdit: { id: string };
};

export type SaleStackParamList = {
  SaleList: undefined;
  SaleCreate: undefined;
  SaleDetail: { id: string };
  SaleEdit: { id: string };
};

export type InventoryStackParamList = {
  InventoryList: undefined;
  InventoryCreate: undefined;
  InventoryEdit: { id: string };
  InventoryDetail: { id: string };
  StockAdjust: undefined;
};

export type MoreStackParamList = {
  MoreMenu: undefined;
  Ledger: undefined;
  PartyLedger: { partyId: string };
  Payments: undefined;
  RecordPayment: { type?: 'IN' | 'OUT'; partyId?: string; partyName?: string };
  Parties: undefined;
  PartyDetail: { partyId: string };
  PartyCreate: undefined;
  PartyEdit: { partyId: string };
  CutterDetail: { cutterId: string };
  Reports: undefined;
  DayBookReport: undefined;
  TrialBalanceReport: undefined;
  ProfitLossReport: undefined;
  BalanceSheetReport: undefined;
  OutstandingReport: undefined;
  Profile: undefined;
  Subscription: undefined;
  BusinessSettings: { id: string };
  Referrals: undefined;
  Help: undefined;
};
