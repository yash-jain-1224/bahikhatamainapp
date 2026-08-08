// =============================================================================
// Jaanch Agent - Validation (Duplicate Detection, GST, Stock, Amounts)
// =============================================================================

import {
  IntentClassification,
  EntityResolutionResult,
  DocumentExtractionResult,
  ValidationResult,
  ValidationError,
  ValidationWarning,
  DuplicateCheckResult,
  ConversationState,
} from '../types';
import { config } from '../config';

export class JaanchAgent {
  // ─── Main Validation Entry Point ───────────────────────────────────────────
  async validate(
    intent: IntentClassification,
    entityResolution?: EntityResolutionResult,
    documentData?: DocumentExtractionResult,
    context?: ConversationState
  ): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Run all validations
    await Promise.all([
      this.validateAmount(intent, errors, warnings),
      this.validateGSTIN(intent, documentData, errors, warnings),
      this.validateDate(intent, errors, warnings),
      this.validateRequiredFields(intent, errors),
    ]);

    // Duplicate check
    const duplicateCheck = await this.checkDuplicates(intent, documentData, context);
    if (duplicateCheck.isDuplicate) {
      warnings.push({
        code: 'DUPLICATE_ENTRY',
        field: 'transaction',
        message: 'Possible duplicate entry detected',
        messageHindi: 'Ye entry pehle se ho sakti hai',
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      duplicateCheck,
    };
  }

  // ─── Amount Validation ─────────────────────────────────────────────────────
  private async validateAmount(
    intent: IntentClassification,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): Promise<void> {
    const amountEntity = intent.entities.find(e => e.type === 'AMOUNT');
    if (!amountEntity) return;

    const amount = parseFloat(amountEntity.normalizedValue || amountEntity.value);

    if (isNaN(amount) || amount <= 0) {
      errors.push({
        code: 'INVALID_AMOUNT',
        field: 'amount',
        message: 'Invalid amount',
        messageHindi: 'Amount sahi nahi hai',
      });
      return;
    }

    // Large amount warning
    if (amount > 500000) {
      warnings.push({
        code: 'LARGE_AMOUNT',
        field: 'amount',
        message: `Large amount: ₹${amount.toLocaleString('en-IN')}`,
        messageHindi: `Badi amount hai: ₹${amount.toLocaleString('en-IN')}. Confirm karein.`,
      });
    }

    // Round number bias (exactly round amounts are suspicious for expense entries)
    if (intent.intent === 'EXPENSE_ENTRY' && amount > 1000 && amount % 1000 === 0) {
      warnings.push({
        code: 'ROUND_NUMBER',
        field: 'amount',
        message: 'Round number detected - please verify exact amount',
        messageHindi: 'Gol number hai - sahi amount confirm karein',
      });
    }
  }

  // ─── GSTIN Validation ──────────────────────────────────────────────────────
  private async validateGSTIN(
    intent: IntentClassification,
    documentData: DocumentExtractionResult | undefined,
    errors: ValidationError[],
    _warnings: ValidationWarning[]
  ): Promise<void> {
    const gstinEntity = intent.entities.find(e => e.type === 'GSTIN');
    const gstin = gstinEntity?.value || documentData?.extractedData.gstin;

    if (!gstin) return;

    // GSTIN format: [0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}
    const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
    if (!gstinRegex.test(gstin)) {
      errors.push({
        code: 'INVALID_GSTIN',
        field: 'gstin',
        message: `Invalid GSTIN format: ${gstin}`,
        messageHindi: `GSTIN format sahi nahi hai: ${gstin}`,
      });
      return;
    }

    // Validate state code (01-37)
    const stateCode = parseInt(gstin.substring(0, 2));
    if (stateCode < 1 || stateCode > 37) {
      errors.push({
        code: 'INVALID_GSTIN_STATE',
        field: 'gstin',
        message: 'Invalid state code in GSTIN',
        messageHindi: 'GSTIN mein state code galat hai',
      });
    }

    // Validate checksum (Luhn algorithm for GSTIN)
    if (!this.validateGSTINChecksum(gstin)) {
      errors.push({
        code: 'INVALID_GSTIN_CHECKSUM',
        field: 'gstin',
        message: 'GSTIN checksum validation failed',
        messageHindi: 'GSTIN checksum sahi nahi hai',
      });
    }
  }

  // ─── Date Validation ───────────────────────────────────────────────────────
  private async validateDate(
    intent: IntentClassification,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): Promise<void> {
    const dateEntity = intent.entities.find(e => e.type === 'DATE');
    if (!dateEntity) return;

    const resolvedDate = this.resolveDate(dateEntity.value);
    if (!resolvedDate) {
      errors.push({
        code: 'INVALID_DATE',
        field: 'date',
        message: 'Could not parse date',
        messageHindi: 'Date samajh nahi aayi',
      });
      return;
    }

    const now = new Date();
    const diffDays = Math.floor((now.getTime() - resolvedDate.getTime()) / (1000 * 60 * 60 * 24));

    // Future date warning
    if (resolvedDate > now) {
      warnings.push({
        code: 'FUTURE_DATE',
        field: 'date',
        message: 'Date is in the future',
        messageHindi: 'Ye date future ki hai. Sahi hai?',
      });
    }

    // Backdated warning
    if (diffDays > config.rules.maxBackdatedDays) {
      warnings.push({
        code: 'BACKDATED',
        field: 'date',
        message: `Entry is ${diffDays} days old`,
        messageHindi: `Ye ${diffDays} din purani entry hai. Confirm karein.`,
      });
    }
  }

  // ─── Required Fields Validation ────────────────────────────────────────────
  private async validateRequiredFields(
    intent: IntentClassification,
    errors: ValidationError[]
  ): Promise<void> {
    const requiredByIntent: Record<string, string[]> = {
      'PURCHASE_ENTRY': ['PARTY_NAME', 'AMOUNT'],
      'SALES_ENTRY': ['PARTY_NAME', 'AMOUNT'],
      'VENDOR_PAYMENT': ['PARTY_NAME', 'AMOUNT'],
      'CUSTOMER_RECEIPT': ['PARTY_NAME', 'AMOUNT'],
      'EXPENSE_ENTRY': ['AMOUNT'],
    };

    const required = requiredByIntent[intent.intent] || [];
    for (const field of required) {
      const hasEntity = intent.entities.some(e => e.type === field);
      if (!hasEntity) {
        const fieldNames: Record<string, string> = {
          'PARTY_NAME': 'Party ka naam',
          'AMOUNT': 'Amount',
          'DATE': 'Date',
        };
        errors.push({
          code: 'MISSING_FIELD',
          field: field.toLowerCase(),
          message: `Missing required field: ${field}`,
          messageHindi: `${fieldNames[field] || field} nahi mila`,
        });
      }
    }
  }

  // ─── Duplicate Detection ───────────────────────────────────────────────────
  private async checkDuplicates(
    intent: IntentClassification,
    documentData: DocumentExtractionResult | undefined,
    context: ConversationState | undefined
  ): Promise<DuplicateCheckResult> {
    const billNumber = intent.entities.find(e => e.type === 'BILL_NUMBER')?.value
      || documentData?.extractedData.billNumber;
    const amount = parseFloat(
      intent.entities.find(e => e.type === 'AMOUNT')?.normalizedValue || '0'
    );
    const partyName = intent.entities.find(e => e.type === 'PARTY_NAME')?.value;

    // Rule 1: Same bill number + vendor
    if (billNumber && partyName) {
      const isDuplicate = await this.checkBillNumberDuplicate(billNumber, partyName, context?.tenantId);
      if (isDuplicate) {
        return {
          isDuplicate: true,
          confidence: 0.95,
          matchType: 'exact',
          existingEntryDate: 'recent',
        };
      }
    }

    // Rule 2: Similar amount within time window
    if (amount > 0 && partyName) {
      const isDuplicate = await this.checkAmountDuplicate(amount, partyName, context?.tenantId);
      if (isDuplicate) {
        return {
          isDuplicate: true,
          confidence: 0.7,
          matchType: 'semantic',
        };
      }
    }

    // Rule 3: UPI reference number check
    const upiRef = intent.entities.find(e => e.type === 'UPI_REF')?.value;
    if (upiRef) {
      const isDuplicate = await this.checkUPIReferenceDuplicate(upiRef, context?.tenantId);
      if (isDuplicate) {
        return {
          isDuplicate: true,
          confidence: 0.99,
          matchType: 'exact',
        };
      }
    }

    return { isDuplicate: false, confidence: 0, matchType: 'exact' };
  }

  // ─── Duplicate Check Helpers ───────────────────────────────────────────────

  private async checkBillNumberDuplicate(
    billNumber: string,
    _partyName: string,
    _tenantId?: string
  ): Promise<boolean> {
    // TODO: Query database for existing entry with same bill number + vendor
    console.log(`🔍 Checking duplicate: Bill ${billNumber}`);
    return false;
  }

  private async checkAmountDuplicate(
    _amount: number,
    _partyName: string,
    _tenantId?: string
  ): Promise<boolean> {
    // TODO: Check for similar amount (±5%) within 24 hours for same vendor
    return false;
  }

  private async checkUPIReferenceDuplicate(
    _upiRef: string,
    _tenantId?: string
  ): Promise<boolean> {
    // TODO: Check if UPI reference already recorded
    return false;
  }

  // ─── GSTIN Checksum Validation (Luhn for GST) ─────────────────────────────
  private validateGSTINChecksum(gstin: string): boolean {
    const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let sum = 0;
    
    for (let i = 0; i < 14; i++) {
      const charIndex = chars.indexOf(gstin[i]);
      const product = charIndex * ((i % 2 === 0) ? 1 : 2);
      sum += Math.floor(product / 36) + (product % 36);
    }
    
    const checkDigit = (36 - (sum % 36)) % 36;
    return chars[checkDigit] === gstin[14];
  }

  // ─── Date Resolution ───────────────────────────────────────────────────────
  private resolveDate(dateText: string): Date | null {
    const lower = dateText.toLowerCase().trim();
    const now = new Date();

    // Relative dates (Hindi)
    switch (lower) {
      case 'aaj':
      case 'today':
        return now;
      case 'kal':
        // Context dependent - default to yesterday for past transactions
        return new Date(now.getTime() - 24 * 60 * 60 * 1000);
      case 'parso':
        return new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
      case 'yesterday':
        return new Date(now.getTime() - 24 * 60 * 60 * 1000);
      case 'tomorrow':
        return new Date(now.getTime() + 24 * 60 * 60 * 1000);
    }

    // DD/MM/YYYY or DD-MM-YYYY
    const dateMatch = dateText.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
    if (dateMatch) {
      const day = parseInt(dateMatch[1]);
      const month = parseInt(dateMatch[2]) - 1;
      let year = parseInt(dateMatch[3]);
      if (year < 100) year += 2000;
      
      const date = new Date(year, month, day);
      if (!isNaN(date.getTime())) return date;
    }

    return null;
  }
}
