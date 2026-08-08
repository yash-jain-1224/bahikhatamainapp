// =============================================================================
// Lekha Agent - Transaction Processing (Create/Post Entries)
// =============================================================================

import {
  IntentClassification,
  EntityResolutionResult,
  DocumentExtractionResult,
  ConversationState,
  TransactionEntry,
  TransactionItem,
  PaymentMode,
} from '../types';
import { v4 as uuidv4 } from 'uuid';

interface LekhaResult {
  transactionId?: string;
  confirmationMessage: string;
  transaction?: Partial<TransactionEntry>;
  posted: boolean;
}

export class LekhaAgent {
  // ─── Process Transaction ───────────────────────────────────────────────────
  async processTransaction(
    intent: IntentClassification,
    entityResolution?: EntityResolutionResult,
    documentData?: DocumentExtractionResult,
    context?: ConversationState
  ): Promise<LekhaResult> {
    switch (intent.intent) {
      case 'PURCHASE_ENTRY':
        return this.createPurchaseEntry(intent, entityResolution, documentData, context);
      case 'SALES_ENTRY':
        return this.createSalesEntry(intent, entityResolution, documentData, context);
      case 'VENDOR_PAYMENT':
        return this.createPaymentOut(intent, entityResolution, documentData, context);
      case 'CUSTOMER_RECEIPT':
        return this.createPaymentIn(intent, entityResolution, documentData, context);
      case 'EXPENSE_ENTRY':
        return this.createExpenseEntry(intent, documentData, context);
      case 'STOCK_UPDATE':
        return this.createStockEntry(intent, context);
      case 'PARTY_CREATE':
        return this.createParty(intent, context);
      case 'ITEM_CREATE':
        return this.createItem(intent, context);
      default:
        return {
          confirmationMessage: 'Ye operation abhi support nahi hai.',
          posted: false,
        };
    }
  }

  // ─── Purchase Entry ────────────────────────────────────────────────────────
  private async createPurchaseEntry(
    intent: IntentClassification,
    entityResolution?: EntityResolutionResult,
    documentData?: DocumentExtractionResult,
    context?: ConversationState
  ): Promise<LekhaResult> {
    const partyName = entityResolution?.selectedMatch?.name
      || intent.entities.find(e => e.type === 'PARTY_NAME')?.value
      || 'Unknown';
    
    const amount = this.extractAmount(intent, documentData);
    const date = this.extractDate(intent, documentData);
    const billNumber = intent.entities.find(e => e.type === 'BILL_NUMBER')?.value
      || documentData?.extractedData.billNumber || '';
    
    const items = this.extractItems(intent, documentData);
    const gst = documentData?.extractedData.taxBreakdown;

    const transactionId = uuidv4();

    // Format confirmation message
    let message = `📋 *Purchase Entry Tayaar Hai:*\n\n`;
    message += `👤 Party: ${partyName}\n`;
    message += `📅 Date: ${date}\n`;
    
    if (items.length > 0) {
      message += `📦 Items:\n`;
      items.forEach(item => {
        message += `   • ${item.name} — ${item.quantity} ${item.unit} @ ₹${item.rate}\n`;
      });
    }
    
    if (billNumber) message += `🧾 Bill: ${billNumber}\n`;
    if (gst && gst.totalTax > 0) {
      message += `💰 Subtotal: ₹${(amount - gst.totalTax).toLocaleString('en-IN')}\n`;
      message += `📊 GST: ₹${gst.totalTax.toLocaleString('en-IN')}`;
      if (gst.isInterstate) {
        message += ` (IGST ${gst.taxRate}%)\n`;
      } else {
        message += ` (CGST+SGST ${gst.taxRate}%)\n`;
      }
    }
    message += `💰 Total: ₹${amount.toLocaleString('en-IN')}\n`;
    message += `\nPost kar doon?`;

    return {
      transactionId,
      confirmationMessage: message,
      transaction: {
        id: transactionId,
        tenantId: context?.tenantId,
        type: 'purchase',
        partyId: entityResolution?.selectedMatch?.id,
        partyName,
        amount,
        items,
        date,
        billNumber,
        gst,
        status: 'pending_approval',
        approvalRequired: amount > (context?.preferences.approvalThreshold || 50000),
        sourceMessageId: '',
        createdAt: new Date().toISOString(),
      },
      posted: false,
    };
  }

  // ─── Sales Entry ───────────────────────────────────────────────────────────
  private async createSalesEntry(
    intent: IntentClassification,
    entityResolution?: EntityResolutionResult,
    documentData?: DocumentExtractionResult,
    context?: ConversationState
  ): Promise<LekhaResult> {
    const partyName = entityResolution?.selectedMatch?.name
      || intent.entities.find(e => e.type === 'PARTY_NAME')?.value
      || 'Unknown';
    
    const amount = this.extractAmount(intent, documentData);
    const date = this.extractDate(intent, documentData);
    const items = this.extractItems(intent, documentData);

    const transactionId = uuidv4();

    let message = `📋 *Sales Entry Tayaar Hai:*\n\n`;
    message += `👤 Customer: ${partyName}\n`;
    message += `📅 Date: ${date}\n`;
    
    if (items.length > 0) {
      message += `📦 Items:\n`;
      items.forEach(item => {
        message += `   • ${item.name} — ${item.quantity} ${item.unit} @ ₹${item.rate}\n`;
      });
    }
    
    message += `💰 Total: ₹${amount.toLocaleString('en-IN')}\n`;
    message += `\nPost kar doon?`;

    return {
      transactionId,
      confirmationMessage: message,
      posted: false,
    };
  }

  // ─── Payment Out (Vendor Payment) ─────────────────────────────────────────
  private async createPaymentOut(
    intent: IntentClassification,
    entityResolution?: EntityResolutionResult,
    documentData?: DocumentExtractionResult,
    context?: ConversationState
  ): Promise<LekhaResult> {
    const partyName = entityResolution?.selectedMatch?.name
      || intent.entities.find(e => e.type === 'PARTY_NAME')?.value
      || 'Unknown';
    
    const amount = this.extractAmount(intent, documentData);
    const date = this.extractDate(intent, documentData);
    const paymentMode = this.extractPaymentMode(intent, documentData);
    const reference = intent.entities.find(e => e.type === 'UPI_REF')?.value
      || documentData?.extractedData.upiReference || '';

    const transactionId = uuidv4();

    let message = `💸 *Payment Entry Tayaar Hai:*\n\n`;
    message += `👤 Party: ${partyName}\n`;
    message += `💰 Amount: ₹${amount.toLocaleString('en-IN')}\n`;
    message += `📅 Date: ${date}\n`;
    message += `💳 Mode: ${paymentMode.toUpperCase()}\n`;
    if (reference) message += `🔗 Ref: ${reference}\n`;
    message += `\nPost kar doon?`;

    return {
      transactionId,
      confirmationMessage: message,
      transaction: {
        id: transactionId,
        tenantId: context?.tenantId,
        type: 'payment_out',
        partyId: entityResolution?.selectedMatch?.id,
        partyName,
        amount,
        date,
        paymentMode,
        reference,
        status: 'pending_approval',
        approvalRequired: amount > (context?.preferences.approvalThreshold || 50000),
        sourceMessageId: '',
        createdAt: new Date().toISOString(),
      },
      posted: false,
    };
  }

  // ─── Payment In (Customer Receipt) ─────────────────────────────────────────
  private async createPaymentIn(
    intent: IntentClassification,
    entityResolution?: EntityResolutionResult,
    documentData?: DocumentExtractionResult,
    context?: ConversationState
  ): Promise<LekhaResult> {
    const partyName = entityResolution?.selectedMatch?.name
      || intent.entities.find(e => e.type === 'PARTY_NAME')?.value
      || 'Unknown';
    
    const amount = this.extractAmount(intent, documentData);
    const paymentMode = this.extractPaymentMode(intent, documentData);

    const transactionId = uuidv4();

    let message = `💰 *Receipt Entry Tayaar Hai:*\n\n`;
    message += `👤 Customer: ${partyName}\n`;
    message += `💰 Amount: ₹${amount.toLocaleString('en-IN')} received\n`;
    message += `💳 Mode: ${paymentMode.toUpperCase()}\n`;
    message += `\nPost kar doon?`;

    return {
      transactionId,
      confirmationMessage: message,
      posted: false,
    };
  }

  // ─── Expense Entry ─────────────────────────────────────────────────────────
  private async createExpenseEntry(
    intent: IntentClassification,
    documentData?: DocumentExtractionResult,
    context?: ConversationState
  ): Promise<LekhaResult> {
    const amount = this.extractAmount(intent, documentData);
    const date = this.extractDate(intent, documentData);
    
    // Auto-categorize from user's mappings
    const rawText = intent.rawText.toLowerCase();
    let category = 'General Expense';
    
    if (context?.preferences.autoMappings) {
      for (const [keyword, mappedCategory] of Object.entries(context.preferences.autoMappings)) {
        if (rawText.includes(keyword.toLowerCase())) {
          category = mappedCategory;
          break;
        }
      }
    }

    const transactionId = uuidv4();

    let message = `📝 *Expense Entry Tayaar Hai:*\n\n`;
    message += `📂 Category: ${category}\n`;
    message += `💰 Amount: ₹${amount.toLocaleString('en-IN')}\n`;
    message += `📅 Date: ${date}\n`;
    message += `\nPost kar doon?`;

    return {
      transactionId,
      confirmationMessage: message,
      posted: false,
    };
  }

  // ─── Stock Entry ───────────────────────────────────────────────────────────
  private async createStockEntry(
    intent: IntentClassification,
    _context?: ConversationState
  ): Promise<LekhaResult> {
    const itemName = intent.entities.find(e => e.type === 'ITEM_NAME')?.value || 'Unknown Item';
    const quantity = intent.entities.find(e => e.type === 'QUANTITY')?.value || '0';
    const unit = intent.entities.find(e => e.type === 'UNIT')?.value || 'units';

    let message = `📦 *Stock Update Tayaar Hai:*\n\n`;
    message += `📋 Item: ${itemName}\n`;
    message += `📊 Quantity: ${quantity} ${unit}\n`;
    message += `\nUpdate kar doon?`;

    return {
      confirmationMessage: message,
      posted: false,
    };
  }

  // ─── Create Party ──────────────────────────────────────────────────────────
  private async createParty(
    intent: IntentClassification,
    _context?: ConversationState
  ): Promise<LekhaResult> {
    const partyName = intent.entities.find(e => e.type === 'PARTY_NAME')?.value || '';
    const phone = intent.entities.find(e => e.type === 'PHONE_NUMBER')?.value || '';
    const gstin = intent.entities.find(e => e.type === 'GSTIN')?.value || '';

    if (!partyName) {
      return {
        confirmationMessage: 'Naye party ka naam batayein.',
        posted: false,
      };
    }

    let message = `👤 *Nayi Party Add Karein:*\n\n`;
    message += `📋 Name: ${partyName}\n`;
    if (phone) message += `📱 Phone: ${phone}\n`;
    if (gstin) message += `🏛️ GSTIN: ${gstin}\n`;
    message += `\nAdd kar doon?`;

    return {
      confirmationMessage: message,
      posted: false,
    };
  }

  // ─── Create Item ───────────────────────────────────────────────────────────
  private async createItem(
    intent: IntentClassification,
    _context?: ConversationState
  ): Promise<LekhaResult> {
    const itemName = intent.entities.find(e => e.type === 'ITEM_NAME')?.value || '';
    const hsnCode = intent.entities.find(e => e.type === 'HSN_CODE')?.value || '';
    const unit = intent.entities.find(e => e.type === 'UNIT')?.value || 'units';

    if (!itemName) {
      return {
        confirmationMessage: 'Naye item ka naam batayein.',
        posted: false,
      };
    }

    let message = `📦 *Naya Item Add Karein:*\n\n`;
    message += `📋 Name: ${itemName}\n`;
    message += `📏 Unit: ${unit}\n`;
    if (hsnCode) message += `🔢 HSN: ${hsnCode}\n`;
    message += `\nAdd kar doon?`;

    return {
      confirmationMessage: message,
      posted: false,
    };
  }

  // ─── Helper Methods ────────────────────────────────────────────────────────

  private extractAmount(intent: IntentClassification, documentData?: DocumentExtractionResult): number {
    const entityAmount = intent.entities.find(e => e.type === 'AMOUNT');
    if (entityAmount?.normalizedValue) {
      return parseFloat(entityAmount.normalizedValue);
    }
    if (documentData?.extractedData.totalAmount) {
      return documentData.extractedData.totalAmount;
    }
    return 0;
  }

  private extractDate(intent: IntentClassification, documentData?: DocumentExtractionResult): string {
    const dateEntity = intent.entities.find(e => e.type === 'DATE');
    if (dateEntity?.normalizedValue) return dateEntity.normalizedValue;
    if (dateEntity?.value) return dateEntity.value;
    if (documentData?.extractedData.date) return documentData.extractedData.date;
    
    // Default to today
    const today = new Date();
    return `${today.getDate().toString().padStart(2, '0')}/${(today.getMonth() + 1).toString().padStart(2, '0')}/${today.getFullYear()}`;
  }

  private extractPaymentMode(intent: IntentClassification, documentData?: DocumentExtractionResult): PaymentMode {
    const modeEntity = intent.entities.find(e => e.type === 'PAYMENT_MODE');
    if (modeEntity?.normalizedValue) return modeEntity.normalizedValue as PaymentMode;
    
    // If UPI screenshot, it's UPI
    if (documentData?.documentType === 'UPI_SCREENSHOT') return 'upi';
    if (documentData?.extractedData.upiReference) return 'upi';
    
    return 'cash'; // Default
  }

  private extractItems(intent: IntentClassification, documentData?: DocumentExtractionResult): TransactionItem[] {
    // From document
    if (documentData?.extractedData.lineItems && documentData.extractedData.lineItems.length > 0) {
      return documentData.extractedData.lineItems.map(item => ({
        name: item.description,
        quantity: item.quantity || 1,
        unit: item.unit || 'units',
        rate: item.rate || item.amount,
        amount: item.amount,
        hsnCode: item.hsnCode,
        gstRate: item.gstRate,
      }));
    }

    // From entities
    const itemName = intent.entities.find(e => e.type === 'ITEM_NAME')?.value;
    const quantity = parseFloat(intent.entities.find(e => e.type === 'QUANTITY')?.value || '0');
    const rate = parseFloat(intent.entities.find(e => e.type === 'RATE')?.value || '0');
    const unit = intent.entities.find(e => e.type === 'UNIT')?.value || 'units';

    if (itemName && (quantity > 0 || rate > 0)) {
      return [{
        name: itemName,
        quantity: quantity || 1,
        unit,
        rate: rate || 0,
        amount: (quantity || 1) * rate,
      }];
    }

    return [];
  }
}
