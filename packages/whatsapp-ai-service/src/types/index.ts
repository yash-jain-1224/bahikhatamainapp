// =============================================================================
// BahiKhata WhatsApp AI - Core Type Definitions
// =============================================================================

// ─── WhatsApp Message Types ──────────────────────────────────────────────────

export interface WhatsAppWebhookPayload {
  object: string;
  entry: WhatsAppEntry[];
}

export interface WhatsAppEntry {
  id: string;
  changes: WhatsAppChange[];
}

export interface WhatsAppChange {
  value: {
    messaging_product: string;
    metadata: {
      display_phone_number: string;
      phone_number_id: string;
    };
    contacts?: WhatsAppContact[];
    messages?: WhatsAppMessage[];
    statuses?: WhatsAppStatus[];
  };
  field: string;
}

export interface WhatsAppContact {
  profile: { name: string };
  wa_id: string;
}

export interface WhatsAppMessage {
  from: string;
  id: string;
  timestamp: string;
  type: 'text' | 'image' | 'document' | 'audio' | 'video' | 'location' | 'interactive' | 'button';
  text?: { body: string };
  image?: WhatsAppMedia;
  document?: WhatsAppMedia & { filename?: string };
  audio?: WhatsAppMedia;
  video?: WhatsAppMedia;
  interactive?: {
    type: string;
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string; description?: string };
  };
  button?: { text: string; payload: string };
  context?: { from: string; id: string };
}

export interface WhatsAppMedia {
  id: string;
  mime_type: string;
  sha256?: string;
  caption?: string;
}

export interface WhatsAppStatus {
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
  recipient_id: string;
}

// ─── Agent Types ─────────────────────────────────────────────────────────────

export type IntentType =
  | 'PURCHASE_ENTRY'
  | 'SALES_ENTRY'
  | 'EXPENSE_ENTRY'
  | 'VENDOR_PAYMENT'
  | 'CUSTOMER_RECEIPT'
  | 'STOCK_UPDATE'
  | 'OUTSTANDING_QUERY'
  | 'GST_QUERY'
  | 'REPORT_REQUEST'
  | 'PARTY_CREATE'
  | 'ITEM_CREATE'
  | 'CORRECTION'
  | 'APPROVAL_RESPONSE'
  | 'GREETING'
  | 'HELP'
  | 'UNKNOWN';

export type LanguageType = 'hindi' | 'english' | 'hinglish';

export interface IntentClassification {
  intent: IntentType;
  confidence: number;
  language: LanguageType;
  entities: ExtractedEntity[];
  rawText: string;
  normalizedText: string;
}

export interface ExtractedEntity {
  type: EntityType;
  value: string;
  normalizedValue?: string;
  confidence: number;
  position?: { start: number; end: number };
}

export type EntityType =
  | 'PARTY_NAME'
  | 'AMOUNT'
  | 'DATE'
  | 'ITEM_NAME'
  | 'QUANTITY'
  | 'RATE'
  | 'BILL_NUMBER'
  | 'GSTIN'
  | 'UPI_REF'
  | 'PAYMENT_MODE'
  | 'GODOWN'
  | 'UNIT'
  | 'HSN_CODE'
  | 'PHONE_NUMBER';

// ─── Document Processing ─────────────────────────────────────────────────────

export interface DocumentExtractionResult {
  documentType: DocumentType;
  confidence: number;
  extractedData: {
    partyName?: string;
    billNumber?: string;
    date?: string;
    gstin?: string;
    hsnCodes?: string[];
    taxBreakdown?: TaxBreakdown;
    totalAmount?: number;
    lineItems?: LineItem[];
    paymentTerms?: string;
    bankDetails?: BankDetails;
    upiReference?: string;
    paymentStatus?: string;
  };
  rawOcrText: string;
  blobUrl: string;
}

export type DocumentType =
  | 'PURCHASE_BILL'
  | 'SALES_INVOICE'
  | 'UPI_SCREENSHOT'
  | 'BANK_RECEIPT'
  | 'EXPENSE_RECEIPT'
  | 'DELIVERY_CHALLAN'
  | 'CREDIT_NOTE'
  | 'DEBIT_NOTE'
  | 'GST_DOCUMENT'
  | 'UNKNOWN';

export interface TaxBreakdown {
  cgst?: number;
  sgst?: number;
  igst?: number;
  cess?: number;
  totalTax: number;
  taxRate: number;
  isInterstate: boolean;
}

export interface LineItem {
  description: string;
  quantity?: number;
  unit?: string;
  rate?: number;
  amount: number;
  hsnCode?: string;
  gstRate?: number;
}

export interface BankDetails {
  accountNumber?: string;
  ifscCode?: string;
  bankName?: string;
  branch?: string;
  upiId?: string;
}

// ─── Entity Resolution ───────────────────────────────────────────────────────

export interface EntityMatch {
  id: string;
  name: string;
  type: 'vendor' | 'customer' | 'both';
  score: number;
  metadata: {
    city?: string;
    gstin?: string;
    phone?: string;
    recentTransactions: number;
    lastTransactionDate?: string;
  };
}

export interface EntityResolutionResult {
  resolved: boolean;
  matches: EntityMatch[];
  selectedMatch?: EntityMatch;
  needsClarification: boolean;
  clarificationMessage?: string;
}

// ─── Validation ──────────────────────────────────────────────────────────────

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  duplicateCheck?: DuplicateCheckResult;
}

export interface ValidationError {
  code: string;
  field: string;
  message: string;
  messageHindi: string;
}

export interface ValidationWarning {
  code: string;
  field: string;
  message: string;
  messageHindi: string;
}

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  confidence: number;
  existingEntryId?: string;
  existingEntryDate?: string;
  matchType: 'exact' | 'semantic' | 'image_hash';
}

// ─── Transaction Types ───────────────────────────────────────────────────────

export interface TransactionEntry {
  id: string;
  tenantId: string;
  type: 'purchase' | 'sale' | 'payment_out' | 'payment_in' | 'expense' | 'stock_adjustment';
  partyId?: string;
  partyName?: string;
  amount: number;
  items?: TransactionItem[];
  date: string;
  billNumber?: string;
  paymentMode?: PaymentMode;
  reference?: string;
  gst?: TaxBreakdown;
  notes?: string;
  status: 'pending_approval' | 'confirmed' | 'posted' | 'cancelled';
  approvalRequired: boolean;
  sourceMessageId: string;
  createdAt: string;
}

export interface TransactionItem {
  itemId?: string;
  name: string;
  quantity: number;
  unit: string;
  rate: number;
  amount: number;
  hsnCode?: string;
  gstRate?: number;
}

export type PaymentMode = 'cash' | 'upi' | 'neft' | 'rtgs' | 'imps' | 'cheque' | 'card' | 'other';

// ─── Conversation & Memory ───────────────────────────────────────────────────

export interface ConversationState {
  userId: string;
  tenantId: string;
  sessionId: string;
  currentIntent?: IntentType;
  pendingTransaction?: Partial<TransactionEntry>;
  pendingClarification?: ClarificationRequest;
  pendingApproval?: ApprovalRequest;
  context: ConversationContext;
  preferences: UserPreferences;
  messageHistory: MessageHistoryItem[];
}

export interface ClarificationRequest {
  type: 'party_selection' | 'amount_confirm' | 'date_confirm' | 'item_confirm' | 'missing_field';
  options?: string[];
  field: string;
  originalMessage: string;
}

export interface ApprovalRequest {
  transactionId: string;
  type: string;
  amount: number;
  description: string;
  expiresAt: string;
}

export interface ConversationContext {
  lastVendor?: string;
  lastCustomer?: string;
  lastTransaction?: string;
  lastAmount?: number;
  lastDate?: string;
  recentParties: string[];
  recentItems: string[];
}

export interface UserPreferences {
  language: LanguageType;
  defaultPaymentMode: PaymentMode;
  approvalThreshold: number;
  autoMappings: Record<string, string>;
  frequentVendors: string[];
  frequentCustomers: string[];
  frequentItems: string[];
  entityMappings: Record<string, string>;
  learningData: LearningEntry[];
}

export interface LearningEntry {
  input: string;
  resolvedTo: string;
  type: 'party' | 'item' | 'category';
  confirmations: number;
  autoApply: boolean; // true after 5 confirmations
}

export interface MessageHistoryItem {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  messageType?: string;
  metadata?: Record<string, unknown>;
}

// ─── MCP Tool Types ──────────────────────────────────────────────────────────

export interface MCPToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, MCPToolParameter>;
  required: string[];
}

export interface MCPToolParameter {
  type: string;
  description: string;
  enum?: string[];
  items?: MCPToolParameter;
}

export interface MCPToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  message?: string;
  messageHindi?: string;
}

// ─── Report Types ────────────────────────────────────────────────────────────

export interface DailySummary {
  date: string;
  totalSales: number;
  totalPurchases: number;
  totalPaymentsIn: number;
  totalPaymentsOut: number;
  totalExpenses: number;
  netCashFlow: number;
  transactionCount: number;
}

export interface GSTReport {
  month: number;
  year: number;
  totalCGST: number;
  totalSGST: number;
  totalIGST: number;
  totalInputTax: number;
  totalOutputTax: number;
  netPayable: number;
}

export interface OutstandingReport {
  partyId: string;
  partyName: string;
  type: 'receivable' | 'payable';
  totalAmount: number;
  overdueAmount: number;
  invoices: OutstandingInvoice[];
}

export interface OutstandingInvoice {
  invoiceNumber: string;
  date: string;
  dueDate?: string;
  amount: number;
  paidAmount: number;
  balanceAmount: number;
  isOverdue: boolean;
  daysOverdue?: number;
}
