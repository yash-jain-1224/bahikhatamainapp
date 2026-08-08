// =============================================================================
// Shared Types - Bahi Khata Pro
// =============================================================================

export interface JwtPayload {
  userId: string;
  phone: string;
  isSuperAdmin: boolean;
  iat?: number;
  exp?: number;
}

export interface JwtTokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface AuthenticatedRequest {
  user: JwtPayload;
  businessId?: string;
  businessUser?: BusinessUserContext;
}

export interface BusinessUserContext {
  id: string;
  userId: string;
  businessId: string;
  role: string;
  permissions: string[];
}

export interface PaginationParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  errors?: ValidationError[];
}

export interface ValidationError {
  field: string;
  message: string;
}

export interface AuditLogInput {
  businessId?: string;
  userId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  oldData?: Record<string, unknown>;
  newData?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

// Purchase Types
export interface CreatePurchaseInput {
  businessId: string;
  shopId?: string;
  partyId: string;
  gadiNumber?: string;
  billNumber?: string;
  purchaseDate: Date;
  items: PurchaseItemInput[];
  expenses: PurchaseExpenseInput[];
  cutterTransactions: CutterTransactionInput[];
  payments: PaymentInput[];
  notes?: string;
}

export interface PurchaseItemInput {
  itemId: string;
  quantity: number;
  rate: number;
  unit?: string;
  notes?: string;
  lotNumber?: string;
}

export interface PurchaseExpenseInput {
  expenseTypeId: string;
  expenseCategory: 'DIRECT' | 'INDIRECT';
  amount: number;
  notes?: string;
}

export interface CutterTransactionInput {
  cutterId: string;
  quantity: number;
  rate: number;
  notes?: string;
}

export interface PaymentInput {
  paymentMode: string;
  amount: number;
  paymentDate?: Date;
  transactionRef?: string;
  notes?: string;
}

// Sale Types
export interface CreateSaleInput {
  businessId: string;
  shopId?: string;
  partyId: string;
  saleDate: Date;
  saleLots: SaleLotInput[];
  expenses: SaleExpenseInput[];
  payments: PaymentInput[];
  discount?: number;
  notes?: string;
}

export interface SaleLotInput {
  lotId: string;
  itemId: string;
  quantitySold: number;
  rate: number;
}

export interface SaleExpenseInput {
  expenseTypeId: string;
  expenseCategory: 'DIRECT' | 'INDIRECT';
  amount: number;
  notes?: string;
}

// Subscription Types
export interface CreateSubscriptionInput {
  businessId: string;
  planId: string;
  billingCycle: string;
}

// Dashboard Types
export interface BusinessDashboard {
  purchaseToday: number;
  salesToday: number;
  outstandingReceivable: number;
  outstandingPayable: number;
  lowStockAlerts: number;
  partialPaymentAlerts: number;
  recentPurchases: unknown[];
  recentSales: unknown[];
}

export interface LotDashboard {
  lotId: string;
  lotNumber: string;
  itemName: string;
  initialQty: number;
  availableQty: number;
  soldQty: number;
  purchaseRate: number;
  profitPerLot: number;
  history: unknown[];
}

// WhatsApp Types
export interface WhatsAppMessage {
  from: string;
  text: string;
  timestamp: number;
  type: string;
}

export interface WhatsAppWebhookPayload {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messages?: WhatsAppMessage[];
      };
    }>;
  }>;
}
