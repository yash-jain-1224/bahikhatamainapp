// =============================================================================
// Hisaab Agent - Conversational Finance & Reporting
// =============================================================================

import {
  IntentClassification,
  ConversationState,
} from '../types';
import { AzureOpenAIService } from '../services/azure-openai.service';

/**
 * Every generate*Report method below returns hardcoded figures where a database
 * query belongs — ₹25,000 outstanding for whatever party you name, three
 * invented bill numbers, ₹3,45,000 receivables, and a GST summary with made-up
 * CGST/SGST/IGST for the current month. Each carries a "TODO: Query database".
 *
 * That output is delivered to a business owner over WhatsApp as *their own
 * books*. Someone could reconcile a party or file a GST return against numbers
 * this service invented. Saying "not ready" is strictly better than answering
 * confidently with fiction, so the dispatcher refuses unless mock output is
 * explicitly opted into.
 *
 * TODO (feature): point these at the real ledger/GST endpoints. As with
 * user-resolution, that needs a database client this service does not yet have.
 */
const REPORTS_UNAVAILABLE =
  '📊 Reports abhi available nahi hain.\n\n' +
  'Yeh feature अभी setup ho raha hai — galat numbers dene se behtar hai ki main ' +
  'kuch na bataun. Filhaal app ke Reports section mein sahi hisaab dekh sakte hain.';

export class HisaabAgent {
  private openai: AzureOpenAIService;

  constructor() {
    this.openai = new AzureOpenAIService();
  }

  // ─── Generate Report ───────────────────────────────────────────────────────
  async generateReport(
    intent: IntentClassification,
    context: ConversationState,
    interactiveId?: string
  ): Promise<string> {
    const query = intent.rawText.toLowerCase();

    // See REPORTS_UNAVAILABLE above — the report bodies are placeholders, so
    // this is a single auditable gate rather than six edited method bodies.
    if (process.env.WHATSAPP_AI_ALLOW_INSECURE_DEV !== 'true') {
      return REPORTS_UNAVAILABLE;
    }

    // 1. Interactive button ids are unambiguous — route on them first.
    //    ('Aaj ka Hisaab' → daily_summary, 'Baaki Hisaab' → outstanding; both
    //    titles contain "hisaab", so text matching alone always fell into the
    //    outstanding branch.)
    if (interactiveId === 'daily_summary') {
      return this.generateDailySummary(context);
    }
    if (interactiveId === 'outstanding') {
      return this.generateOutstandingReport(intent, context);
    }

    // 2. Classified intent next — it already disambiguated the wording.
    if (intent.intent === 'OUTSTANDING_QUERY') {
      return this.generateOutstandingReport(intent, context);
    }
    if (intent.intent === 'GST_QUERY') {
      return this.generateGSTReport(context);
    }

    // 3. Keyword routing (REPORT_REQUEST and anything else). Daily-summary
    //    wording is checked before outstanding so "aaj ka hisaab" reaches the
    //    daily branch.
    if (this.isDailySummary(query)) {
      return this.generateDailySummary(context);
    }
    if (this.isOutstandingQuery(query)) {
      return this.generateOutstandingReport(intent, context);
    }
    if (this.isGSTQuery(query)) {
      return this.generateGSTReport(context);
    }
    if (this.isStockQuery(query)) {
      return this.generateStockReport(intent, context);
    }
    if (this.isProfitQuery(query)) {
      return this.generateProfitReport(context);
    }
    if (this.isCashQuery(query)) {
      return this.generateCashReport(context);
    }

    // AI-powered natural language query
    return this.handleNaturalLanguageQuery(intent, context);
  }

  // ─── Outstanding Report ────────────────────────────────────────────────────
  private async generateOutstandingReport(
    intent: IntentClassification,
    context: ConversationState
  ): Promise<string> {
    const partyName = intent.entities.find(e => e.type === 'PARTY_NAME')?.value;

    if (partyName) {
      // Specific party outstanding
      // TODO: Query database
      return `📊 *${partyName} ka Hisaab:*\n\n` +
        `💰 Total Baaki: ₹25,000\n` +
        `📋 Pending Bills: 3\n\n` +
        `1. Bill #RT-450 (2 Jul) — ₹19,000\n` +
        `2. Bill #RT-445 (28 Jun) — ₹4,000\n` +
        `3. Bill #RT-440 (25 Jun) — ₹2,000\n\n` +
        `Kya payment record karna hai?`;
    }

    // All outstanding
    return `📊 *Overall Outstanding:*\n\n` +
      `*Baaki Lena (Receivables):*\n` +
      `💰 Total: ₹3,45,000\n` +
      `👥 Parties: 12\n` +
      `⚠️ Overdue: ₹1,20,000 (5 parties)\n\n` +
      `*Baaki Dena (Payables):*\n` +
      `💰 Total: ₹2,10,000\n` +
      `👥 Parties: 8\n` +
      `⚠️ Overdue: ₹45,000 (2 parties)\n\n` +
      `Kisi specific party ka hisaab chahiye?`;
  }

  // ─── GST Report ────────────────────────────────────────────────────────────
  private async generateGSTReport(context: ConversationState): Promise<string> {
    const now = new Date();
    const month = now.toLocaleString('hi-IN', { month: 'long' });

    return `📊 *GST Summary — ${month} 2026:*\n\n` +
      `*Output Tax (Sales):*\n` +
      `   CGST: ₹12,500\n` +
      `   SGST: ₹12,500\n` +
      `   IGST: ₹8,000\n\n` +
      `*Input Tax (Purchase):*\n` +
      `   CGST: ₹9,200\n` +
      `   SGST: ₹9,200\n` +
      `   IGST: ₹5,500\n\n` +
      `*Net Payable:*\n` +
      `   CGST: ₹3,300\n` +
      `   SGST: ₹3,300\n` +
      `   IGST: ₹2,500\n` +
      `   *Total: ₹9,100*\n\n` +
      `📅 Due Date: 20 Jul 2026\n` +
      `⏰ Days Left: 17`;
  }

  // ─── Daily Summary ─────────────────────────────────────────────────────────
  private async generateDailySummary(context: ConversationState): Promise<string> {
    const today = new Date().toLocaleDateString('hi-IN', {
      day: 'numeric', month: 'long', year: 'numeric'
    });

    return `📊 *Aaj ka Hisaab (${today}):*\n\n` +
      `📈 *Bikri (Sales):* ₹1,25,000 (8 entries)\n` +
      `📉 *Kharidi (Purchase):* ₹85,000 (5 entries)\n` +
      `💸 *Kharcha (Expense):* ₹3,500 (3 entries)\n` +
      `💰 *Payment Diya:* ₹50,000 (2 entries)\n` +
      `💰 *Payment Mila:* ₹75,000 (4 entries)\n\n` +
      `─────────────────\n` +
      `✨ *Net Cash Flow:* +₹61,500\n` +
      `─────────────────\n\n` +
      `📌 *Pending:*\n` +
      `• 2 bills approval baaki\n` +
      `• 1 payment reminder aaj`;
  }

  // ─── Stock Report ──────────────────────────────────────────────────────────
  private async generateStockReport(
    intent: IntentClassification,
    _context: ConversationState
  ): Promise<string> {
    const itemName = intent.entities.find(e => e.type === 'ITEM_NAME')?.value;

    if (itemName) {
      return `📦 *Stock Report — ${itemName}:*\n\n` +
        `📊 Current Stock: 150 Bags\n` +
        `📈 Last Purchase: 50 Bags (2 Jul)\n` +
        `📉 Last Sale: 20 Bags (3 Jul)\n` +
        `💰 Avg Rate: ₹380/Bag\n` +
        `💰 Stock Value: ₹57,000\n` +
        `⚠️ Min Stock Level: 50 Bags`;
    }

    return `📦 *Stock Summary:*\n\n` +
      `📋 Total Items: 45\n` +
      `💰 Total Value: ₹12,50,000\n\n` +
      `⚠️ *Low Stock Alert:*\n` +
      `• Cement (ACC): 30 Bags (Min: 50)\n` +
      `• TMT Bar 12mm: 5 Bundle (Min: 10)\n` +
      `• Paint (Asian): 8 Bucket (Min: 15)\n\n` +
      `Kisi specific item ka detail chahiye?`;
  }

  // ─── Profit Report ─────────────────────────────────────────────────────────
  private async generateProfitReport(_context: ConversationState): Promise<string> {
    return `📊 *Profit & Loss — July 2026:*\n\n` +
      `📈 *Revenue:*\n` +
      `   Sales: ₹15,25,000\n` +
      `   Other Income: ₹12,000\n\n` +
      `📉 *Expenses:*\n` +
      `   Purchases: ₹10,80,000\n` +
      `   Operating: ₹1,25,000\n` +
      `   Salary: ₹85,000\n` +
      `   Other: ₹35,000\n\n` +
      `─────────────────\n` +
      `✨ *Net Profit: ₹2,12,000*\n` +
      `📊 Margin: 13.9%\n` +
      `─────────────────`;
  }

  // ─── Cash Report ───────────────────────────────────────────────────────────
  private async generateCashReport(_context: ConversationState): Promise<string> {
    return `💰 *Cash & Bank Position:*\n\n` +
      `🏦 *Bank Accounts:*\n` +
      `   HDFC Current: ₹4,52,000\n` +
      `   SBI Savings: ₹1,85,000\n\n` +
      `💵 *Cash in Hand:* ₹45,000\n\n` +
      `─────────────────\n` +
      `💰 *Total: ₹6,82,000*\n` +
      `─────────────────\n\n` +
      `📅 *Today's Movement:*\n` +
      `   Inflow: +₹75,000\n` +
      `   Outflow: -₹53,500\n` +
      `   Net: +₹21,500`;
  }

  // ─── Natural Language Query (AI) ───────────────────────────────────────────
  private async handleNaturalLanguageQuery(
    intent: IntentClassification,
    context: ConversationState
  ): Promise<string> {
    try {
      const systemPrompt = `You are BahiKhata's reporting assistant. Generate a business report based on the user's query.
The business is an Indian SMB. Respond in the user's language (${context.preferences.language}).
Use Indian number formatting (₹, lakhs, crores).
Format with WhatsApp markdown (*bold*, _italic_, ~strikethrough~).
Include emoji for better readability.
If you don't have exact data, provide a helpful template showing what data would be available.`;

      const response = await this.openai.chatCompletion([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: intent.rawText },
      ]);

      return response;
    } catch (error) {
      console.error('NL query error:', error);
      return 'Report generate karne mein problem aayi. Thodi der mein try karein.';
    }
  }

  // ─── Query Detection Helpers ───────────────────────────────────────────────

  // NOTE: 'hisaab'/'hisab' appear in BOTH daily-summary and outstanding
  // wording, and 'balance' in both outstanding and cash wording — those
  // overlapping tokens are deliberately excluded here. Ambiguous phrasings are
  // resolved upstream by interactive button id and classified intent.

  private isOutstandingQuery(query: string): boolean {
    return /(?:baaki|baki|outstanding|udhar|pending|ledger)/.test(query);
  }

  private isGSTQuery(query: string): boolean {
    return /(?:gst|tax|igst|cgst|sgst|return|filing)/.test(query);
  }

  private isDailySummary(query: string): boolean {
    return /(?:aaj|today|daily|summary|din)/.test(query);
  }

  private isStockQuery(query: string): boolean {
    return /(?:stock|inventory|maal|godown|warehouse|kitna\s*hai)/.test(query);
  }

  private isProfitQuery(query: string): boolean {
    return /(?:profit|loss|p&l|kamai|munafa|nuksan|margin)/.test(query);
  }

  private isCashQuery(query: string): boolean {
    return /(?:cash|bank|balance|paisa|paise|nakad|naqad)/.test(query);
  }
}
