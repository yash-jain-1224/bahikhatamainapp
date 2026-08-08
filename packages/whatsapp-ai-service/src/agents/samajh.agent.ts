// =============================================================================
// Samajh Agent - Intent Understanding (Hindi/English/Hinglish)
// =============================================================================

import {
  IntentClassification,
  IntentType,
  LanguageType,
  ExtractedEntity,
  EntityType,
  ConversationState,
  DocumentExtractionResult,
} from '../types';
import { AzureOpenAIService } from '../services/azure-openai.service';

export class SamajhAgent {
  private openai: AzureOpenAIService;

  constructor() {
    this.openai = new AzureOpenAIService();
  }

  // ─── Classify Intent ───────────────────────────────────────────────────────
  async classify(text: string, context: ConversationState): Promise<IntentClassification> {
    // First try rule-based classification for speed
    const ruleBasedResult = this.ruleBasedClassify(text);
    if (ruleBasedResult && ruleBasedResult.confidence >= 0.85) {
      return ruleBasedResult;
    }

    // Fall back to AI classification
    return this.aiClassify(text, context);
  }

  // ─── Rule-Based Classification (Fast Path) ────────────────────────────────
  private ruleBasedClassify(text: string): IntentClassification | null {
    const normalized = text.toLowerCase().trim();
    const entities = this.extractEntitiesRuleBased(text);
    const language = this.detectLanguage(text);

    // Greeting patterns (check first)
    const greetingPatterns = [
      /^(?:hi|hello|hey|namaste|namaskar|ram\s*ram|jai\s*shree)/i,
      /^(?:good\s*morning|good\s*evening|suprabhat|shubh)/i,
    ];
    if (greetingPatterns.some(p => p.test(normalized))) {
      return { intent: 'GREETING', confidence: 0.95, language, entities, rawText: text, normalizedText: normalized };
    }

    // Help patterns
    const helpPatterns = [
      /^(?:help|madad|sahayata|kaise)/i,
      /(?:kya\s*kar\s*sakte|features|commands)/i,
    ];
    if (helpPatterns.some(p => p.test(normalized))) {
      return { intent: 'HELP', confidence: 0.95, language, entities, rawText: text, normalizedText: normalized };
    }

    // Report patterns (check BEFORE sales since "aaj ki bikri" is a report query)
    const reportPatterns = [
      /(?:aaj|kal|is\s*hafte|is\s*mahine)\s*(?:ki|ka)\s*(?:bikri|kharidi|hisaab|report|summary)/i,
      /(?:kitni|kitna)\s*(?:bikri|kharidi|kamai|munafa)/i,
      /(?:bikri|kharidi|sales|purchase)\s*(?:kitni|kitna|report)/i,
      /(?:daily|weekly|monthly)\s*(?:report|summary|sales)/i,
      /(?:profit|loss|p&l|cash\s*flow)/i,
      /(?:stock|inventory)\s*(?:report|kitna|kya)/i,
    ];
    if (reportPatterns.some(p => p.test(normalized))) {
      return { intent: 'REPORT_REQUEST', confidence: 0.90, language, entities, rawText: text, normalizedText: normalized };
    }

    // Outstanding Query patterns
    const outstandingPatterns = [
      /(?:kitna|kya)\s*(?:baaki|baki|udhar|pending|outstanding)/i,
      /(?:ka|ki)\s*(?:hisaab|hisab|ledger|balance)/i,
      /(?:baaki|baki|udhar)\s*(?:kitna|kya|hai)/i,
    ];
    if (outstandingPatterns.some(p => p.test(normalized))) {
      return { intent: 'OUTSTANDING_QUERY', confidence: 0.90, language, entities, rawText: text, normalizedText: normalized };
    }

    // GST patterns
    const gstPatterns = [
      /(?:gst|tax)\s*(?:kitna|report|return|filing|bharna)/i,
      /(?:igst|cgst|sgst|cess)/i,
    ];
    if (gstPatterns.some(p => p.test(normalized))) {
      return { intent: 'GST_QUERY', confidence: 0.92, language, entities, rawText: text, normalizedText: normalized };
    }

    // Purchase patterns
    const purchasePatterns = [
      /(?:maal|bill|kharidi|purchase|kharid)\s*(?:aay[ai]|hua|ki|kiya)/i,
      /(?:bag|peti|box|carton)\s*(?:aay[ai]|liye|kharide)/i,
      /(?:invoice|bill)\s*(?:no|number|#)/i,
    ];
    if (purchasePatterns.some(p => p.test(normalized))) {
      return { intent: 'PURCHASE_ENTRY', confidence: 0.92, language, entities, rawText: text, normalizedText: normalized };
    }

    // Sales patterns
    const salesPatterns = [
      /(?:bikri|bech|sale|sold|invoice\s*ban[ai])/i,
      /(?:bech\s*diy[ai]|bik\s*gay[ai])/i,
      /(?:customer|grahak)\s*(?:ko|ne)\s*(?:diya|bheja)/i,
    ];
    if (salesPatterns.some(p => p.test(normalized))) {
      return { intent: 'SALES_ENTRY', confidence: 0.92, language, entities, rawText: text, normalizedText: normalized };
    }

    // Vendor Payment patterns
    const paymentOutPatterns = [
      /(?:payment|paisa|paise)\s*(?:diy[ae]|bhej[ae]|kiy[ae])/i,
      /(?:ko)\s*\d+\s*(?:diy[ae]|bhej[ae])/i,
      /(?:transfer|upi|neft|rtgs|imps)\s*(?:kiy[ae]|kar[ae])/i,
      /\w+\s*ko\s*\d+/i, // "Ram ko 15000"
    ];
    if (paymentOutPatterns.some(p => p.test(normalized))) {
      return { intent: 'VENDOR_PAYMENT', confidence: 0.88, language, entities, rawText: text, normalizedText: normalized };
    }

    // Payment Received patterns
    const paymentInPatterns = [
      /(?:payment|paisa|paise)\s*(?:aay[ae]|mil[ae]|receive)/i,
      /(?:se)\s*\d+\s*(?:aay[ae]|mil[ae])/i,
      /(?:jama|credit)\s*(?:hua|hui)/i,
    ];
    if (paymentInPatterns.some(p => p.test(normalized))) {
      return { intent: 'CUSTOMER_RECEIPT', confidence: 0.88, language, entities, rawText: text, normalizedText: normalized };
    }

    // Expense patterns
    const expensePatterns = [
      /(?:kharcha|expense|kharch)\s*(?:hua|kiya|ki)/i,
      /(?:petrol|diesel|chai|khana|courier|freight|kiraya|rent|bijli)/i,
    ];
    if (expensePatterns.some(p => p.test(normalized))) {
      return { intent: 'EXPENSE_ENTRY', confidence: 0.88, language, entities, rawText: text, normalizedText: normalized };
    }

    // Party create patterns
    const partyCreatePatterns = [
      /(?:nay[ai]|new)\s*(?:party|vendor|supplier|customer|grahak)\s*(?:add|banao|create)/i,
      /(?:party|vendor|customer)\s*(?:add|banao|create)\s*(?:karo|kar|karein)/i,
    ];
    if (partyCreatePatterns.some(p => p.test(normalized))) {
      return { intent: 'PARTY_CREATE', confidence: 0.90, language, entities, rawText: text, normalizedText: normalized };
    }

    return null; // Can't classify with rules
  }

  // ─── AI Classification (GPT-4o) ───────────────────────────────────────────
  private async aiClassify(text: string, context: ConversationState): Promise<IntentClassification> {
    const systemPrompt = `You are an intent classification system for BahiKhata - an Indian accounting WhatsApp bot.
Classify the user's message into one of these intents:
- PURCHASE_ENTRY: Recording purchase/buying of goods
- SALES_ENTRY: Recording sale of goods
- EXPENSE_ENTRY: Recording business expenses
- VENDOR_PAYMENT: Payment made to vendor/supplier
- CUSTOMER_RECEIPT: Payment received from customer
- STOCK_UPDATE: Inventory/stock related updates
- OUTSTANDING_QUERY: Asking about pending amounts
- GST_QUERY: GST/tax related queries
- REPORT_REQUEST: Asking for financial reports
- PARTY_CREATE: Adding new vendor/customer
- ITEM_CREATE: Adding new inventory item
- CORRECTION: Correcting a previous entry
- APPROVAL_RESPONSE: Responding to an approval request
- GREETING: Greeting message
- HELP: Asking for help
- UNKNOWN: Cannot determine intent

Also extract entities: PARTY_NAME, AMOUNT, DATE, ITEM_NAME, QUANTITY, RATE, BILL_NUMBER, GSTIN, UPI_REF, PAYMENT_MODE

Context:
- Last vendor: ${context.context.lastVendor || 'none'}
- Last transaction: ${context.context.lastTransaction || 'none'}
- Language preference: ${context.preferences.language}

IMPORTANT: Understand Hindi, English, and Hinglish (code-mixed) equally well.
Indian number formats: "15 hazaar" = 15000, "2.5 lakh" = 250000, "15K" = 15000

Respond in JSON format:
{
  "intent": "INTENT_TYPE",
  "confidence": 0.0-1.0,
  "language": "hindi|english|hinglish",
  "entities": [{"type": "ENTITY_TYPE", "value": "raw", "normalizedValue": "normalized"}]
}`;

    try {
      const response = await this.openai.chatCompletion([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text },
      ], { responseFormat: 'json' });

      const parsed = JSON.parse(response);
      return {
        intent: parsed.intent as IntentType,
        confidence: parsed.confidence || 0.7,
        language: parsed.language as LanguageType || 'hinglish',
        entities: (parsed.entities || []).map((e: any) => ({
          type: e.type as EntityType,
          value: e.value,
          normalizedValue: e.normalizedValue,
          confidence: e.confidence || 0.8,
        })),
        rawText: text,
        normalizedText: text.toLowerCase().trim(),
      };
    } catch (error) {
      console.error('AI classification error:', error);
      // Fallback
      return {
        intent: 'UNKNOWN',
        confidence: 0.3,
        language: this.detectLanguage(text),
        entities: this.extractEntitiesRuleBased(text),
        rawText: text,
        normalizedText: text.toLowerCase().trim(),
      };
    }
  }

  // ─── Enrich with Document Data ─────────────────────────────────────────────
  enrichWithDocumentData(
    intent: IntentClassification,
    docData: DocumentExtractionResult
  ): IntentClassification {
    const enrichedEntities = [...intent.entities];

    if (docData.extractedData.partyName) {
      enrichedEntities.push({
        type: 'PARTY_NAME',
        value: docData.extractedData.partyName,
        confidence: docData.confidence,
      });
    }
    if (docData.extractedData.totalAmount) {
      enrichedEntities.push({
        type: 'AMOUNT',
        value: docData.extractedData.totalAmount.toString(),
        normalizedValue: docData.extractedData.totalAmount.toString(),
        confidence: docData.confidence,
      });
    }
    if (docData.extractedData.billNumber) {
      enrichedEntities.push({
        type: 'BILL_NUMBER',
        value: docData.extractedData.billNumber,
        confidence: docData.confidence,
      });
    }
    if (docData.extractedData.date) {
      enrichedEntities.push({
        type: 'DATE',
        value: docData.extractedData.date,
        confidence: docData.confidence,
      });
    }
    if (docData.extractedData.gstin) {
      enrichedEntities.push({
        type: 'GSTIN',
        value: docData.extractedData.gstin,
        confidence: docData.confidence,
      });
    }

    // Update intent based on document type
    let updatedIntent = intent.intent;
    if (intent.intent === 'UNKNOWN' || intent.confidence < 0.7) {
      switch (docData.documentType) {
        case 'PURCHASE_BILL': updatedIntent = 'PURCHASE_ENTRY'; break;
        case 'SALES_INVOICE': updatedIntent = 'SALES_ENTRY'; break;
        case 'UPI_SCREENSHOT': updatedIntent = 'VENDOR_PAYMENT'; break;
        case 'BANK_RECEIPT': updatedIntent = 'VENDOR_PAYMENT'; break;
        case 'EXPENSE_RECEIPT': updatedIntent = 'EXPENSE_ENTRY'; break;
      }
    }

    return {
      ...intent,
      intent: updatedIntent,
      entities: enrichedEntities,
      confidence: Math.max(intent.confidence, docData.confidence * 0.9),
    };
  }

  // ─── Language Detection ────────────────────────────────────────────────────
  private detectLanguage(text: string): LanguageType {
    const hindiPattern = /[\u0900-\u097F]/;
    const englishPattern = /^[a-zA-Z0-9\s.,!?'"()-]+$/;

    if (hindiPattern.test(text)) {
      return englishPattern.test(text.replace(/[\u0900-\u097F]+/g, '').trim())
        ? 'hinglish' : 'hindi';
    }

    // Check for romanized Hindi words
    const hindiWords = ['hai', 'ka', 'ki', 'ko', 'mein', 'se', 'ne', 'par', 'ke', 'aur',
      'karo', 'diya', 'liya', 'aaya', 'gaya', 'kya', 'kitna', 'baaki', 'paisa'];
    const words = text.toLowerCase().split(/\s+/);
    const hindiWordCount = words.filter(w => hindiWords.includes(w)).length;

    if (hindiWordCount > words.length * 0.3) {
      return 'hinglish';
    }

    return 'english';
  }

  // ─── Rule-Based Entity Extraction ──────────────────────────────────────────
  private extractEntitiesRuleBased(text: string): ExtractedEntity[] {
    const entities: ExtractedEntity[] = [];

    // Amount extraction (Indian formats)
    const amountPatterns = [
      /₹\s*([\d,]+(?:\.\d{1,2})?)/g,
      /(?:rs\.?|rupees?|inr)\s*([\d,]+(?:\.\d{1,2})?)/gi,
      /(\d+(?:,\d{2,3})*(?:\.\d{1,2})?)\s*(?:rupees?|rs)/gi,
      /(\d+)\s*(?:hazaar|hazar|thousand|k)\b/gi,
      /(\d+(?:\.\d+)?)\s*(?:lakh|lac|L)\b/gi,
      /(\d+(?:\.\d+)?)\s*(?:crore|cr)\b/gi,
    ];

    // Multiple patterns can hit the same text span ("rs 2 lakh" matches both
    // the rs-prefix pattern as "rs 2" and the lakh pattern as "2 lakh"), and
    // consumers `.find()` the first AMOUNT entity — so a naive push-per-hit
    // produced an unmultiplied ₹2 ahead of the correct ₹2,00,000. Collect all
    // candidates with spans, derive the multiplier from the text FOLLOWING the
    // number (not just this pattern's own match), then collapse overlapping
    // spans keeping the widest / highest-value candidate.
    const multiplierTail = /^\s*(hazaar|hazar|thousand|lakh|lac|crore|cr|k|l)\b/i;
    const amountCandidates: ExtractedEntity[] = [];

    for (const pattern of amountPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const value = match[1].replace(/,/g, '');
        let normalized = parseFloat(value);
        const start = match.index;
        let end = match.index + match[0].length;

        // Position right after the captured number, then look for a
        // multiplier word regardless of what this pattern itself consumed.
        const numberEnd = start + match[0].indexOf(match[1]) + match[1].length;
        const tailMatch = multiplierTail.exec(text.slice(numberEnd));
        const multiplierWord = tailMatch ? tailMatch[1] : undefined;
        if (tailMatch) {
          end = Math.max(end, numberEnd + tailMatch[0].length);
        }

        if (multiplierWord) {
          if (/^(?:hazaar|hazar|thousand|k)$/i.test(multiplierWord)) {
            normalized *= 1000;
          } else if (/^(?:lakh|lac|l)$/i.test(multiplierWord)) {
            normalized *= 100000;
          } else if (/^(?:crore|cr)$/i.test(multiplierWord)) {
            normalized *= 10000000;
          }
        }

        amountCandidates.push({
          type: 'AMOUNT',
          value: text.slice(start, end),
          normalizedValue: normalized.toString(),
          confidence: 0.9,
          position: { start, end },
        });
      }
    }

    // Collapse overlapping AMOUNT candidates: keep the widest span; on equal
    // width keep the higher normalized value (the multiplied reading).
    const collapsedAmounts: ExtractedEntity[] = [];
    for (const cand of amountCandidates.sort((a, b) => a.position!.start - b.position!.start)) {
      const overlapIndex = collapsedAmounts.findIndex(
        e => e.position!.start < cand.position!.end && cand.position!.start < e.position!.end
      );
      if (overlapIndex === -1) {
        collapsedAmounts.push(cand);
        continue;
      }
      const existing = collapsedAmounts[overlapIndex];
      const candWidth = cand.position!.end - cand.position!.start;
      const existWidth = existing.position!.end - existing.position!.start;
      const candValue = parseFloat(cand.normalizedValue || '0');
      const existValue = parseFloat(existing.normalizedValue || '0');
      if (candWidth > existWidth || (candWidth === existWidth && candValue > existValue)) {
        collapsedAmounts[overlapIndex] = cand;
      }
    }
    entities.push(...collapsedAmounts);

    // GSTIN extraction
    const gstinPattern = /\b([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z])\b/g;
    let gstMatch;
    while ((gstMatch = gstinPattern.exec(text)) !== null) {
      entities.push({
        type: 'GSTIN',
        value: gstMatch[1],
        confidence: 0.95,
        position: { start: gstMatch.index, end: gstMatch.index + gstMatch[0].length },
      });
    }

    // Date extraction (DD/MM/YYYY, DD-MM-YYYY)
    const datePatterns = [
      /(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/g,
      /(?:kal|parso|aaj|yesterday|today|tomorrow)/gi,
    ];
    for (const pattern of datePatterns) {
      let dateMatch;
      while ((dateMatch = pattern.exec(text)) !== null) {
        entities.push({
          type: 'DATE',
          value: dateMatch[0],
          confidence: 0.85,
          position: { start: dateMatch.index, end: dateMatch.index + dateMatch[0].length },
        });
      }
    }

    // UPI Reference
    const upiPattern = /(?:upi\s*(?:ref|id|txn)?[:\s]*|ref\s*(?:no|#)?[:\s]*)(\d{10,12})/gi;
    let upiMatch;
    while ((upiMatch = upiPattern.exec(text)) !== null) {
      entities.push({
        type: 'UPI_REF',
        value: upiMatch[1],
        confidence: 0.9,
      });
    }

    // Quantity + Unit
    const qtyPattern = /(\d+(?:\.\d+)?)\s*(bag|peti|box|kg|quintal|ton|piece|pc|dozen|litre|ltr|mtr|meter|feet|ft)/gi;
    let qtyMatch;
    while ((qtyMatch = qtyPattern.exec(text)) !== null) {
      entities.push({
        type: 'QUANTITY',
        value: qtyMatch[1],
        normalizedValue: qtyMatch[1],
        confidence: 0.9,
      });
      entities.push({
        type: 'UNIT',
        value: qtyMatch[2],
        confidence: 0.9,
      });
    }

    // Payment mode
    const paymentModes: Record<string, string> = {
      'upi': 'upi', 'phonepe': 'upi', 'gpay': 'upi', 'paytm': 'upi', 'bhim': 'upi',
      'cash': 'cash', 'naqad': 'cash', 'nakad': 'cash',
      'neft': 'neft', 'rtgs': 'rtgs', 'imps': 'imps',
      'cheque': 'cheque', 'check': 'cheque',
      'card': 'card', 'credit card': 'card', 'debit card': 'card',
    };

    for (const [keyword, mode] of Object.entries(paymentModes)) {
      if (text.toLowerCase().includes(keyword)) {
        entities.push({
          type: 'PAYMENT_MODE',
          value: keyword,
          normalizedValue: mode,
          confidence: 0.9,
        });
        break;
      }
    }

    return entities;
  }
}
