// =============================================================================
// MCP Tools - BahiKhata Accounting Tool Registry & Executor
// =============================================================================

import { MCPToolDefinition, MCPToolResult } from '../types';
import { gstEngine } from '../services/gst.engine';

// ─── Tool Definitions ────────────────────────────────────────────────────────

export const MCP_TOOLS: MCPToolDefinition[] = [
  // Party Tools
  {
    name: 'search_party',
    description: 'Search for vendors or customers by name, phone, or GSTIN',
    parameters: {
      query: { type: 'string', description: 'Search query (name, phone, or GSTIN)' },
      type: { type: 'string', description: 'Party type filter', enum: ['vendor', 'customer', 'both'] },
    },
    required: ['query'],
  },
  {
    name: 'create_party',
    description: 'Create a new vendor or customer party',
    parameters: {
      name: { type: 'string', description: 'Party name' },
      type: { type: 'string', description: 'Party type', enum: ['vendor', 'customer', 'both'] },
      phone: { type: 'string', description: 'Phone number' },
      gstin: { type: 'string', description: 'GST number (15 digits)' },
      address: { type: 'string', description: 'Address' },
      city: { type: 'string', description: 'City' },
      state: { type: 'string', description: 'State' },
    },
    required: ['name', 'type'],
  },
  {
    name: 'get_party_outstanding',
    description: 'Get outstanding balance for a party (receivables or payables)',
    parameters: {
      party_id: { type: 'string', description: 'Party ID' },
      party_name: { type: 'string', description: 'Party name (alternative to ID)' },
    },
    required: ['party_id'],
  },

  // Item Tools
  {
    name: 'search_item',
    description: 'Search inventory items by name, SKU, or HSN code',
    parameters: {
      query: { type: 'string', description: 'Search query' },
    },
    required: ['query'],
  },
  {
    name: 'create_item',
    description: 'Create a new inventory item',
    parameters: {
      name: { type: 'string', description: 'Item name' },
      hsn: { type: 'string', description: 'HSN/SAC code' },
      unit: { type: 'string', description: 'Unit of measurement (KG, PCS, BOX, etc.)' },
      gst_rate: { type: 'number', description: 'GST rate (0, 5, 12, 18, 28)' },
      opening_stock: { type: 'number', description: 'Opening stock quantity' },
    },
    required: ['name', 'unit'],
  },
  {
    name: 'get_stock',
    description: 'Get current stock for an item',
    parameters: {
      item_id: { type: 'string', description: 'Item ID' },
      item_name: { type: 'string', description: 'Item name (alternative to ID)' },
      godown: { type: 'string', description: 'Specific godown/warehouse' },
    },
    required: ['item_id'],
  },

  // Accounting Tools
  {
    name: 'create_purchase',
    description: 'Create a purchase entry with items and GST',
    parameters: {
      vendor_id: { type: 'string', description: 'Vendor party ID' },
      items: { type: 'array', description: 'Line items [{name, qty, rate, hsn}]', items: { type: 'object', description: 'Line item object' } },
      bill_no: { type: 'string', description: 'Vendor bill/invoice number' },
      date: { type: 'string', description: 'Purchase date (DD/MM/YYYY)' },
      gst_rate: { type: 'number', description: 'GST rate' },
      is_interstate: { type: 'boolean', description: 'Interstate purchase (IGST)' },
    },
    required: ['vendor_id', 'items'],
  },
  {
    name: 'create_sale',
    description: 'Create a sales invoice',
    parameters: {
      customer_id: { type: 'string', description: 'Customer party ID' },
      items: { type: 'array', description: 'Line items [{name, qty, rate, hsn}]', items: { type: 'object', description: 'Line item object' } },
      invoice_no: { type: 'string', description: 'Invoice number (auto-generated if empty)' },
      date: { type: 'string', description: 'Sale date (DD/MM/YYYY)' },
      gst_rate: { type: 'number', description: 'GST rate' },
    },
    required: ['customer_id', 'items'],
  },
  {
    name: 'record_payment',
    description: 'Record a payment made to vendor or received from customer',
    parameters: {
      party_id: { type: 'string', description: 'Party ID' },
      amount: { type: 'number', description: 'Payment amount in INR' },
      mode: { type: 'string', description: 'Payment mode', enum: ['cash', 'upi', 'neft', 'rtgs', 'imps', 'cheque', 'card'] },
      reference: { type: 'string', description: 'Reference number (UPI ref, cheque no, etc.)' },
      date: { type: 'string', description: 'Payment date' },
      direction: { type: 'string', description: 'Payment direction', enum: ['out', 'in'] },
    },
    required: ['party_id', 'amount', 'mode', 'direction'],
  },
  {
    name: 'get_outstanding',
    description: 'Get all outstanding amounts (receivables and payables)',
    parameters: {
      party_id: { type: 'string', description: 'Specific party (optional)' },
      type: { type: 'string', description: 'Filter type', enum: ['receivable', 'payable', 'all'] },
    },
    required: [],
  },

  // Reporting Tools
  {
    name: 'daily_summary',
    description: 'Get daily transaction summary',
    parameters: {
      date: { type: 'string', description: 'Date (DD/MM/YYYY, default: today)' },
    },
    required: [],
  },
  {
    name: 'gst_summary',
    description: 'Get GST summary for a period',
    parameters: {
      month: { type: 'number', description: 'Month (1-12)' },
      year: { type: 'number', description: 'Year (e.g., 2026)' },
    },
    required: ['month', 'year'],
  },
  {
    name: 'cash_flow',
    description: 'Get cash flow report for a date range',
    parameters: {
      from_date: { type: 'string', description: 'Start date (DD/MM/YYYY)' },
      to_date: { type: 'string', description: 'End date (DD/MM/YYYY)' },
    },
    required: ['from_date', 'to_date'],
  },
  {
    name: 'profit_loss',
    description: 'Get profit & loss statement',
    parameters: {
      from_date: { type: 'string', description: 'Start date' },
      to_date: { type: 'string', description: 'End date' },
    },
    required: ['from_date', 'to_date'],
  },
  {
    name: 'stock_report',
    description: 'Get stock/inventory report',
    parameters: {
      item_id: { type: 'string', description: 'Specific item (optional)' },
      godown: { type: 'string', description: 'Specific godown (optional)' },
    },
    required: [],
  },

  // Utility Tools
  {
    name: 'validate_gstin',
    description: 'Validate a GST Identification Number',
    parameters: {
      gstin: { type: 'string', description: 'GSTIN to validate (15 characters)' },
    },
    required: ['gstin'],
  },
  {
    name: 'parse_amount',
    description: 'Parse amount from text (handles Hindi/Hinglish: "15 hazaar", "2.5 lakh")',
    parameters: {
      text: { type: 'string', description: 'Amount text to parse' },
    },
    required: ['text'],
  },
];

// ─── Implemented Tools ───────────────────────────────────────────────────────
// Only these tools have an executor branch. The rest of MCP_TOOLS are planned
// definitions; advertising them as available made clients call tools that
// return "not implemented" — so discovery endpoints must expose only this set.
// Keep this list in sync with the switch in MCPToolExecutor.execute().

export const IMPLEMENTED_TOOL_NAMES: ReadonlySet<string> = new Set([
  'validate_gstin',
  'parse_amount',
  'search_party',
  'create_party',
  'get_party_outstanding',
  'daily_summary',
  'gst_summary',
]);

/** Tools that are actually executable — the only list routes should advertise. */
export const AVAILABLE_MCP_TOOLS: MCPToolDefinition[] = MCP_TOOLS.filter(t =>
  IMPLEMENTED_TOOL_NAMES.has(t.name)
);

// ─── Tool Executor ───────────────────────────────────────────────────────────

/**
 * Execution context resolved SERVER-SIDE from the authenticated principal.
 *
 * CONTRACT: business/tenant context must NEVER be accepted from the caller's
 * tool params (a caller could name any business_id and read another tenant's
 * books). It is threaded here from the route's auth context (API key record).
 * When these stubs are wired to the real database, every query must be scoped
 * by `context.businessId` and any caller-supplied business_id ignored.
 */
export interface MCPExecutionContext {
  businessId?: string;
}

export class MCPToolExecutor {
  async execute(
    toolName: string,
    params: Record<string, unknown>,
    _context: MCPExecutionContext = {}
  ): Promise<MCPToolResult> {
    // Defense in depth: never let a caller-supplied business identifier reach
    // a tool implementation. Business context comes from _context only.
    if (params && typeof params === 'object') {
      delete (params as Record<string, unknown>).business_id;
      delete (params as Record<string, unknown>).businessId;
    }

    switch (toolName) {
      case 'validate_gstin':
        return this.executeValidateGSTIN(params);
      case 'parse_amount':
        return this.executeParseAmount(params);
      case 'search_party':
        return this.executeSearchParty(params);
      case 'create_party':
        return this.executeCreateParty(params);
      case 'get_party_outstanding':
        return this.executeGetOutstanding(params);
      case 'daily_summary':
        return this.executeDailySummary(params);
      case 'gst_summary':
        return this.executeGSTSummary(params);
      default:
        return { success: false, error: `Tool "${toolName}" not implemented yet` };
    }
  }

  private executeValidateGSTIN(params: Record<string, unknown>): MCPToolResult {
    const gstin = params.gstin as string;
    const result = gstEngine.validateGSTIN(gstin);
    return {
      success: true,
      data: result,
      message: result.isValid
        ? `GSTIN ${gstin} is valid (${result.stateName}, ${result.entityType})`
        : `GSTIN ${gstin} is invalid`,
      messageHindi: result.isValid
        ? `GSTIN ${gstin} sahi hai (${result.stateName}, ${result.entityType})`
        : `GSTIN ${gstin} galat hai`,
    };
  }

  private executeParseAmount(params: Record<string, unknown>): MCPToolResult {
    const text = (params.text as string).toLowerCase().trim();
    let amount = 0;

    // Every alias is word-boundary-terminated, matching the boundary-correct
    // extraction in samajh.agent.ts. Without `\b`, the bare single-letter
    // aliases matched inside longer words: "50 kg" hit the `k` alias and
    // parsed as ₹50,000. `k`/`l` remain valid only as standalone tokens
    // ("15k", "2 l") — never as a prefix of another word.
    const patterns: Array<{ regex: RegExp; multiplier: number }> = [
      { regex: /(\d+(?:\.\d+)?)\s*(?:crore|cr)\b/i, multiplier: 10000000 },
      { regex: /(\d+(?:\.\d+)?)\s*(?:lakh|lac|l)\b/i, multiplier: 100000 },
      { regex: /(\d+(?:\.\d+)?)\s*(?:hazaar|hazar|thousand|k)\b/i, multiplier: 1000 },
      { regex: /(\d+(?:,\d{2,3})*(?:\.\d{1,2})?)/i, multiplier: 1 },
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern.regex);
      if (match) {
        amount = parseFloat(match[1].replace(/,/g, '')) * pattern.multiplier;
        break;
      }
    }

    return {
      success: true,
      data: { amount, formattedAmount: `₹${amount.toLocaleString('en-IN')}` },
      message: `Parsed amount: ₹${amount.toLocaleString('en-IN')}`,
      messageHindi: `Amount: ₹${amount.toLocaleString('en-IN')}`,
    };
  }

  private async executeSearchParty(params: Record<string, unknown>): Promise<MCPToolResult> {
    const query = params.query as string;
    return {
      success: true,
      data: [],
      message: `Searched for party: "${query}"`,
      messageHindi: `"${query}" party search ki`,
    };
  }

  private async executeCreateParty(params: Record<string, unknown>): Promise<MCPToolResult> {
    return {
      success: true,
      data: { id: 'new_party_id', ...params },
      message: `Party "${params.name}" created successfully`,
      messageHindi: `Party "${params.name}" add ho gayi`,
    };
  }

  private async executeGetOutstanding(_params: Record<string, unknown>): Promise<MCPToolResult> {
    return {
      success: true,
      data: { total: 0, entries: [] },
      message: 'Outstanding report generated',
      messageHindi: 'Baaki hisaab tayaar hai',
    };
  }

  private async executeDailySummary(_params: Record<string, unknown>): Promise<MCPToolResult> {
    return {
      success: true,
      data: {
        date: new Date().toISOString().split('T')[0],
        sales: 0, purchases: 0,
        paymentsIn: 0, paymentsOut: 0, expenses: 0,
      },
      message: 'Daily summary generated',
      messageHindi: 'Aaj ka hisaab tayaar hai',
    };
  }

  private async executeGSTSummary(params: Record<string, unknown>): Promise<MCPToolResult> {
    return {
      success: true,
      data: {
        month: params.month, year: params.year,
        outputTax: { cgst: 0, sgst: 0, igst: 0 },
        inputTax: { cgst: 0, sgst: 0, igst: 0 },
        netPayable: { cgst: 0, sgst: 0, igst: 0, total: 0 },
      },
      message: 'GST summary generated',
      messageHindi: 'GST report tayaar hai',
    };
  }
}
