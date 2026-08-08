// =============================================================================
// Hisaab Agent - Conversational Finance & Reporting (REAL data)
// =============================================================================
// Every figure below comes from the platform services via the act-as-user
// gateway client — the same numbers the app's own Reports section shows.
// House rules:
//   • No gateway client (JWT_SECRET unset) → honest "reports unavailable".
//   • Permission denied → say so; never downgrade to invented numbers.
//   • Service failure → say so. Fiction is worse than "not available".
// =============================================================================

import {
  IntentClassification,
  ConversationState,
} from '../types';
import { GatewayClient, GatewayError } from '../services/gateway-client';
import { SecureLogger } from '../middleware/pii-masking';

const logger = new SecureLogger('HisaabAgent');

const REPORTS_UNAVAILABLE =
  '📊 Reports abhi available nahi hain.\n\n' +
  'Accounting service se connection configure nahi hai — galat numbers dene se behtar hai ki main ' +
  'kuch na bataun. Filhaal app ke Reports section mein sahi hisaab dekh sakte hain.';

function inr(n: number): string {
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

/** Local-day boundaries as ISO strings (server-local time, like the app). */
function dayRange(d: Date = new Date()): { start: string; end: string } {
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

function monthRange(d: Date = new Date()): { start: string; end: string } {
  const start = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

interface ListEnvelopeRow { [key: string]: unknown }

export class HisaabAgent {
  // ─── Generate Report ───────────────────────────────────────────────────────
  async generateReport(
    intent: IntentClassification,
    context: ConversationState,
    interactiveId?: string,
    gateway?: GatewayClient,
  ): Promise<string> {
    const query = intent.rawText.toLowerCase();

    if (!gateway) {
      return REPORTS_UNAVAILABLE;
    }

    try {
      // 1. Interactive button ids are unambiguous — route on them first.
      if (interactiveId === 'daily_summary') {
        return await this.generateDailySummary(gateway);
      }
      if (interactiveId === 'outstanding') {
        return await this.generateOutstandingReport(intent, gateway);
      }

      // 2. Classified intent next — it already disambiguated the wording.
      if (intent.intent === 'OUTSTANDING_QUERY') {
        return await this.generateOutstandingReport(intent, gateway);
      }
      if (intent.intent === 'GST_QUERY') {
        return await this.generateGSTReport(gateway);
      }

      // 3. Keyword routing (REPORT_REQUEST and anything else). Daily-summary
      //    wording is checked before outstanding so "aaj ka hisaab" reaches the
      //    daily branch.
      if (this.isDailySummary(query)) {
        return await this.generateDailySummary(gateway);
      }
      if (this.isOutstandingQuery(query)) {
        return await this.generateOutstandingReport(intent, gateway);
      }
      if (this.isGSTQuery(query)) {
        return await this.generateGSTReport(gateway);
      }
      if (this.isStockQuery(query)) {
        return await this.generateStockReport(intent, gateway);
      }
      if (this.isProfitQuery(query)) {
        return await this.generateProfitReport(gateway);
      }
      if (this.isCashQuery(query)) {
        return await this.generateCashReport(gateway);
      }

      // No fabricated "helpful template" fallback: say what IS answerable.
      return (
        'Main ye reports bata sakta hoon:\n\n' +
        '• "Aaj ka hisaab" — daily summary\n' +
        '• "Ram ka baaki" — party outstanding\n' +
        '• "GST kitna hai" — is mahine ka GST\n' +
        '• "Stock kitna hai" — inventory\n' +
        '• "Profit kitna hua" — is mahine ka P&L\n\n' +
        'Kaunsa report chahiye?'
      );
    } catch (error) {
      return this.failureReply(error);
    }
  }

  private failureReply(error: unknown): string {
    if (error instanceof GatewayError) {
      if (error.status === 403) {
        return '🔒 Is report ke liye aapke paas permission nahi hai. Business owner se baat karein.';
      }
      logger.warn(`Report fetch failed: ${error.status} ${error.message}`);
      return '❌ Report abhi nahi mil paayi — accounting service se problem aayi. Thodi der mein try karein ya app ka Reports section dekhein.';
    }
    logger.error('Report generation failed', error);
    return '❌ Report generate karne mein problem aayi. App ka Reports section use karein.';
  }

  // ─── Daily Summary (sales/purchases/expenses/payments lists) ───────────────
  private async generateDailySummary(gw: GatewayClient): Promise<string> {
    const { start, end } = dayRange();
    const params = { startDate: start, endDate: end, limit: 500 };

    const [sales, purchases, expenses, payments] = await Promise.all([
      gw.get<ListEnvelopeRow[]>('/api/v1/sales', params),
      gw.get<ListEnvelopeRow[]>('/api/v1/purchases', params),
      gw.get<ListEnvelopeRow[]>('/api/v1/expenses', params),
      gw.get<ListEnvelopeRow[]>('/api/v1/billing/payments', params),
    ]);

    const sum = (rows: ListEnvelopeRow[] | undefined, key: string) =>
      (rows || []).reduce((s, r) => s + Number(r[key] || 0), 0);

    const salesRows = sales.data || [];
    const purchaseRows = purchases.data || [];
    const expenseRows = expenses.data || [];
    const paymentRows = payments.data || [];

    // listPayments returns transformed rows with a computed `type: 'IN'|'OUT'`.
    const paymentsIn = paymentRows.filter(p => p.type === 'IN');
    const paymentsOut = paymentRows.filter(p => p.type === 'OUT');

    const totalSales = sum(salesRows, 'total_amount');
    const totalPurchases = sum(purchaseRows, 'total_amount');
    const totalExpenses = sum(expenseRows, 'amount');
    const totalIn = sum(paymentsIn, 'amount');
    const totalOut = sum(paymentsOut, 'amount');

    const today = new Date().toLocaleDateString('hi-IN', { day: 'numeric', month: 'long', year: 'numeric' });

    if (
      salesRows.length + purchaseRows.length + expenseRows.length + paymentRows.length === 0
    ) {
      return `📊 *Aaj ka Hisaab (${today}):*\n\nAaj koi entry nahi hui hai.`;
    }

    return (
      `📊 *Aaj ka Hisaab (${today}):*\n\n` +
      `📈 *Bikri (Sales):* ${inr(totalSales)} (${salesRows.length} entries)\n` +
      `📉 *Kharidi (Purchase):* ${inr(totalPurchases)} (${purchaseRows.length} entries)\n` +
      `💸 *Kharcha (Expense):* ${inr(totalExpenses)} (${expenseRows.length} entries)\n` +
      `💰 *Payment Mila:* ${inr(totalIn)} (${paymentsIn.length})\n` +
      `💰 *Payment Diya:* ${inr(totalOut)} (${paymentsOut.length})`
    );
  }

  // ─── Outstanding Report ────────────────────────────────────────────────────
  private async generateOutstandingReport(
    intent: IntentClassification,
    gw: GatewayClient,
  ): Promise<string> {
    const partyName = intent.entities.find(e => e.type === 'PARTY_NAME')?.value;

    if (partyName) {
      // Party-specific: resolve by name, then read balance + open bills.
      const { data: parties } = await gw.get<Array<{ id: string; name: string; balance: number | string }>>(
        '/api/v1/profile/parties',
        { search: partyName },
      );
      const list = parties || [];
      if (list.length === 0) {
        return `"${partyName}" naam ki koi party nahi mili.`;
      }
      const exact = list.find(p => p.name.toLowerCase() === partyName.toLowerCase());
      const party = exact || list[0];
      const others = list.filter(p => p.id !== party.id);

      // Sign convention: negative balance = receivable (they owe us),
      // positive = payable (we owe them).
      const balance = Number(party.balance);
      let header: string;
      if (balance < 0) header = `💰 Lena hai (receivable): ${inr(Math.abs(balance))}`;
      else if (balance > 0) header = `💰 Dena hai (payable): ${inr(balance)}`;
      else header = `💰 Hisaab barabar hai (₹0)`;

      let billsBlock = '';
      try {
        const type = balance < 0 ? 'IN' : 'OUT';
        const { data: bills } = await gw.get<Array<{ ref: string; date: string; balance: number }>>(
          `/api/v1/billing/outstanding/${party.id}`,
          { type },
        );
        const open = (bills || []).slice(0, 5);
        if (open.length > 0) {
          billsBlock =
            `\n📋 Pending bills:\n` +
            open
              .map(b => {
                const d = new Date(b.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
                return `   • ${b.ref} (${d}) — ${inr(Number(b.balance))}`;
              })
              .join('\n');
        }
      } catch (error) {
        // Bills list is optional detail; the balance above is already real.
        logger.warn(`Outstanding bills fetch failed: ${(error as Error).message}`);
      }

      return (
        `📊 *${party.name} ka Hisaab:*\n\n${header}${billsBlock}` +
        (others.length > 0
          ? `\n\n(Isi naam se ${others.length} aur party hai: ${others.slice(0, 3).map(p => p.name).join(', ')})`
          : '')
      );
    }

    // Overall outstanding
    const { data } = await gw.get<{
      parties: Array<{ name: string; balance: number | string }>;
      totalReceivable: number;
      totalPayable: number;
    }>('/api/v1/ledger/outstanding');

    const receivables = (data.parties || []).filter(p => Number(p.balance) < 0);
    const payables = (data.parties || []).filter(p => Number(p.balance) > 0);

    return (
      `📊 *Overall Outstanding:*\n\n` +
      `*Baaki Lena (Receivables):*\n` +
      `💰 Total: ${inr(Number(data.totalReceivable || 0))}\n` +
      `👥 Parties: ${receivables.length}\n\n` +
      `*Baaki Dena (Payables):*\n` +
      `💰 Total: ${inr(Number(data.totalPayable || 0))}\n` +
      `👥 Parties: ${payables.length}\n\n` +
      `Kisi specific party ka hisaab poochhein (jaise: "Ram ka baaki").`
    );
  }

  // ─── GST Report (computed from this month's real entries) ──────────────────
  private async generateGSTReport(gw: GatewayClient): Promise<string> {
    const { start, end } = monthRange();
    const params = { startDate: start, endDate: end, limit: 500 };

    const [sales, purchases] = await Promise.all([
      gw.get<ListEnvelopeRow[]>('/api/v1/sales', params),
      gw.get<ListEnvelopeRow[]>('/api/v1/purchases', params),
    ]);

    const sumGst = (rows: ListEnvelopeRow[] | undefined) =>
      (rows || []).reduce((s, r) => s + Number(r['gst_amount'] || 0), 0);

    const outputTax = sumGst(sales.data);
    const inputTax = sumGst(purchases.data);
    const net = outputTax - inputTax;

    const monthLabel = new Date().toLocaleString('hi-IN', { month: 'long', year: 'numeric' });

    return (
      `📊 *GST Summary — ${monthLabel}:*\n\n` +
      `📤 Output Tax (Sales): ${inr(outputTax)}\n` +
      `📥 Input Tax (Purchase): ${inr(inputTax)}\n` +
      `─────────────────\n` +
      `${net >= 0 ? '💳 Net Payable' : '💚 Net Credit'}: ${inr(Math.abs(net))}\n` +
      `─────────────────\n\n` +
      `_Ye is mahine ki entries ke GST amounts ka total hai — exact filing figures ke liye app ka GST report dekhein._`
    );
  }

  // ─── Stock Report ──────────────────────────────────────────────────────────
  private async generateStockReport(
    intent: IntentClassification,
    gw: GatewayClient,
  ): Promise<string> {
    const itemName = intent.entities.find(e => e.type === 'ITEM_NAME')?.value;

    if (itemName) {
      const { data: items } = await gw.get<Array<{
        name: string; unit: string; current_stock: number | string;
        min_stock: number | string; avg_purchase_rate?: number | string;
      }>>('/api/v1/inventory/items', { search: itemName, limit: 5 });

      const list = items || [];
      if (list.length === 0) return `📦 "${itemName}" naam ka item inventory mein nahi mila.`;

      const item = list.find(i => i.name.toLowerCase() === itemName.toLowerCase()) || list[0];
      const stock = Number(item.current_stock);
      const rate = Number(item.avg_purchase_rate || 0);
      let msg =
        `📦 *Stock — ${item.name}:*\n\n` +
        `📊 Current Stock: ${stock} ${item.unit}\n`;
      if (rate > 0) {
        msg += `💰 Avg Rate: ${inr(rate)}/${item.unit}\n` +
          `💰 Stock Value: ${inr(stock * rate)}\n`;
      }
      if (Number(item.min_stock) > 0) {
        msg += `⚠️ Min Level: ${Number(item.min_stock)} ${item.unit}` +
          (stock <= Number(item.min_stock) ? ' — *stock kam hai!*' : '');
      }
      return msg;
    }

    const [{ data: items, meta }, lowStock] = await Promise.all([
      gw.get<Array<{ name: string; current_stock: number | string; avg_purchase_rate?: number | string }>>(
        '/api/v1/inventory/items',
        { limit: 500 },
      ),
      gw.get<Array<{ name: string; current_stock: number | string; min_stock: number | string }>>(
        '/api/v1/inventory/items/low-stock',
      ).catch(() => ({ data: [] as Array<{ name: string; current_stock: number | string; min_stock: number | string }> })),
    ]);

    const list = items || [];
    if (list.length === 0) return '📦 Inventory mein abhi koi item nahi hai.';

    const totalValue = list.reduce(
      (s, i) => s + Number(i.current_stock) * Number(i.avg_purchase_rate || 0),
      0,
    );
    const low = (lowStock.data || []).slice(0, 5);

    let msg =
      `📦 *Stock Summary:*\n\n` +
      `📋 Total Items: ${Number((meta as { total?: number } | undefined)?.total ?? list.length)}\n` +
      `💰 Approx Value: ${inr(totalValue)}\n`;
    if (low.length > 0) {
      msg +=
        `\n⚠️ *Low Stock:*\n` +
        low.map(l => `   • ${l.name}: ${Number(l.current_stock)} (Min: ${Number(l.min_stock)})`).join('\n');
    }
    return msg;
  }

  // ─── Profit Report (ledger P&L) ────────────────────────────────────────────
  private async generateProfitReport(gw: GatewayClient): Promise<string> {
    const { start, end } = monthRange();
    const { data } = await gw.get<{
      sales: number; purchases: number; grossProfit: number;
      expenses: number; otherIncome: number; netProfit: number;
    }>('/api/v1/ledger/profit-loss', { startDate: start, endDate: end });

    const monthLabel = new Date().toLocaleString('hi-IN', { month: 'long', year: 'numeric' });
    const margin = data.sales > 0 ? ((data.netProfit / data.sales) * 100).toFixed(1) : null;

    return (
      `📊 *Profit & Loss — ${monthLabel}:*\n\n` +
      `📈 Sales: ${inr(data.sales)}\n` +
      `📉 Purchases: ${inr(data.purchases)}\n` +
      `➗ Gross Profit: ${inr(data.grossProfit)}\n` +
      `💸 Expenses: ${inr(data.expenses)}\n` +
      (data.otherIncome ? `➕ Other Income: ${inr(data.otherIncome)}\n` : '') +
      `─────────────────\n` +
      `${data.netProfit >= 0 ? '✨ Net Profit' : '🔻 Net Loss'}: ${inr(Math.abs(data.netProfit))}` +
      (margin !== null ? `\n📊 Margin: ${margin}%` : '') +
      `\n─────────────────`
    );
  }

  // ─── Cash & Bank (balance sheet current assets) ────────────────────────────
  private async generateCashReport(gw: GatewayClient): Promise<string> {
    const { data } = await gw.get<{
      assets: { currentAssets: Array<{ name: string; amount: number }> };
    }>('/api/v1/ledger/balance-sheet', { asOnDate: new Date().toISOString() });

    const cashBank = (data.assets?.currentAssets || []).filter(a =>
      /cash|bank/i.test(a.name),
    );

    if (cashBank.length === 0) {
      return '💰 Cash/Bank ka alag account ledger mein nahi mila. App ke Reports → Balance Sheet mein poora detail dekhein.';
    }

    const total = cashBank.reduce((s, a) => s + Number(a.amount), 0);
    return (
      `💰 *Cash & Bank Position:*\n\n` +
      cashBank.map(a => `   ${a.name}: ${inr(Number(a.amount))}`).join('\n') +
      `\n─────────────────\n` +
      `💰 *Total: ${inr(total)}*`
    );
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
