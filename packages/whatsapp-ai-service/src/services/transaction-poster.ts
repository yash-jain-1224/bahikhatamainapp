// =============================================================================
// Transaction Poster - Executes Approved Drafts Against the Real Ledger
// =============================================================================
// The Lekha agent composes a draft + confirmation message; NOTHING is written
// until the user approves. This service is the only place an approved draft
// becomes a real entry — through the platform services (ADR-1), acting as the
// mapped user (ADR-2), so RBAC, tenancy, audit and ledger invariants all apply.
//
// House rule: never claim success unless the service returned success. Every
// failure path tells the user the truth about what happened and what to do.
// =============================================================================

import { GatewayClient, GatewayError } from './gateway-client';
import { SecureLogger } from '../middleware/pii-masking';
import { TransactionEntry, TransactionItem, PaymentMode } from '../types';

const logger = new SecureLogger('TransactionPoster');

export interface PostResult {
  posted: boolean;
  /** Human reference of the created record (payment id, purchase number, …). */
  reference?: string;
  /** Honest Hinglish message describing exactly what happened. */
  userMessage: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Our conversational payment modes → the platform's PaymentMode enum. */
function toPlatformPaymentMode(mode?: PaymentMode): string {
  switch (mode) {
    case 'upi': return 'UPI';
    case 'neft':
    case 'rtgs':
    case 'imps': return 'BANK_TRANSFER';
    case 'cheque': return 'CHEQUE';
    case 'card': return 'CARD';
    case 'cash': return 'CASH';
    default: return 'MIXED';
  }
}

/** DD/MM/YYYY (agent format) → full ISO-8601; anything else → now. */
function toIsoDate(date?: string): string {
  if (date) {
    const m = date.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) {
      const d = new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 12, 0, 0));
      if (!isNaN(d.getTime())) return d.toISOString();
    }
    const parsed = new Date(date);
    if (!isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return new Date().toISOString();
}

function inr(n: number): string {
  return `₹${n.toLocaleString('en-IN')}`;
}

function failureMessage(error: unknown, action: string): string {
  if (error instanceof GatewayError) {
    if (error.status === 403) {
      return `❌ ${action} post nahi hui — aapke paas iski permission nahi hai. Business owner se baat karein.`;
    }
    if (error.status === 503) {
      return `❌ ${action} post nahi hui — accounting service abhi available nahi hai. Thodi der mein try karein ya app use karein.`;
    }
    // Validation / not-found / conflict: surface the service's own message.
    return `❌ ${action} post nahi hui: ${error.message}\n\nKripya app se entry karein ya details check karke dubara bhejein.`;
  }
  return `❌ ${action} post nahi hui — technical problem aayi. App se entry kar sakte hain.`;
}

// ─── Poster ──────────────────────────────────────────────────────────────────

export class TransactionPoster {
  constructor(private readonly gw: GatewayClient) {}

  async post(draft: Partial<TransactionEntry>): Promise<PostResult> {
    try {
      switch (draft.type) {
        case 'payment_out':
        case 'payment_in':
          return await this.postPayment(draft);
        case 'purchase':
          return await this.postPurchase(draft);
        case 'sale':
          return await this.postSale(draft);
        case 'expense':
          return await this.postExpense(draft);
        case 'stock_adjustment':
          return await this.postStockAdjustment(draft);
        case 'party_create':
          return await this.postParty(draft);
        case 'item_create':
          return await this.postItem(draft);
        default:
          return {
            posted: false,
            userMessage: 'Ye entry type WhatsApp se abhi post nahi ho sakta. Kripya app use karein.',
          };
      }
    } catch (error) {
      logger.error(`Posting failed for type=${draft.type}`, error);
      return { posted: false, userMessage: failureMessage(error, 'Entry') };
    }
  }

  // ─── Payments (billing-service quick payment) ─────────────────────────────

  private async postPayment(draft: Partial<TransactionEntry>): Promise<PostResult> {
    if (!draft.partyId) {
      return {
        posted: false,
        userMessage: '❌ Payment post nahi hui — party select nahi hui thi. Party ka naam dubara bhejein.',
      };
    }
    if (!draft.amount || draft.amount <= 0) {
      return { posted: false, userMessage: '❌ Payment post nahi hui — amount samajh nahi aaya. Amount ke saath dubara bhejein.' };
    }

    // Quick-payment contract (billing-service): snake_case party_id, `type`,
    // and NO referenceType key (its presence routes to the structured path).
    const { data } = await this.gw.post<{ id: string; amount: number }>('/api/v1/billing/payments', {
      type: draft.type === 'payment_in' ? 'IN' : 'OUT',
      party_id: draft.partyId,
      amount: draft.amount,
      mode: toPlatformPaymentMode(draft.paymentMode),
      date: toIsoDate(draft.date),
      reference: draft.reference || undefined,
      notes: draft.notes || 'WhatsApp AI entry',
    });

    const direction = draft.type === 'payment_in' ? 'mila' : 'diya';
    return {
      posted: true,
      reference: data.id,
      userMessage:
        `✅ Payment entry post ho gayi!\n\n` +
        `👤 ${draft.partyName || 'Party'}\n` +
        `💰 ${inr(draft.amount)} ${direction}\n` +
        `🧾 ID: ${data.id.slice(0, 8)}`,
    };
  }

  // ─── Purchases ────────────────────────────────────────────────────────────

  private async postPurchase(draft: Partial<TransactionEntry>): Promise<PostResult> {
    if (!draft.partyId) {
      return { posted: false, userMessage: '❌ Purchase post nahi hui — supplier party select nahi hui. Party ka naam dubara bhejein.' };
    }
    const items = draft.items || [];
    if (items.length === 0) {
      return { posted: false, userMessage: '❌ Purchase post nahi hui — items nahi mile. Item, quantity aur rate ke saath bhejein (jaise: "50 bag cement @ 380").' };
    }

    const { resolved, missing, invalid } = await this.resolveItems(items);
    if (missing.length > 0) {
      return {
        posted: false,
        userMessage:
          `❌ Purchase post nahi hui — ye item inventory mein nahi mile:\n` +
          missing.map(n => `   • ${n}`).join('\n') +
          `\n\nPehle "naya item ${missing[0]} add karo" bhejein, ya app se entry karein.`,
      };
    }
    if (invalid.length > 0) {
      return {
        posted: false,
        userMessage:
          `❌ Purchase post nahi hui — in items ka quantity/rate missing hai:\n` +
          invalid.map(n => `   • ${n}`).join('\n') +
          `\n\nJaise: "50 bag cement @ 380 Ram se liya"`,
      };
    }

    const gstAmount = draft.gst?.totalTax || 0;
    const { data } = await this.gw.post<{ purchase_number: string; total_amount: number }>('/api/v1/purchases', {
      partyId: draft.partyId,
      purchaseDate: toIsoDate(draft.date),
      billNumber: draft.billNumber || undefined,
      items: resolved.map(r => ({
        itemId: r.itemId,
        quantity: r.quantity,
        rate: r.rate,
        unit: r.unit || undefined,
      })),
      ...(gstAmount > 0 ? { gstMode: 'AMOUNT', gstAmount } : {}),
    });

    return {
      posted: true,
      reference: data.purchase_number,
      userMessage:
        `✅ Purchase entry post ho gayi!\n\n` +
        `👤 ${draft.partyName || 'Party'}\n` +
        `💰 Total: ${inr(Number(data.total_amount))}\n` +
        `🧾 ${data.purchase_number}`,
    };
  }

  // ─── Sales (lot-based, FIFO allocation) ───────────────────────────────────

  private async postSale(draft: Partial<TransactionEntry>): Promise<PostResult> {
    if (!draft.partyId) {
      return { posted: false, userMessage: '❌ Sale post nahi hui — customer party select nahi hui. Party ka naam dubara bhejein.' };
    }
    const items = draft.items || [];
    if (items.length === 0) {
      return { posted: false, userMessage: '❌ Sale post nahi hui — items nahi mile. Item, quantity aur rate ke saath bhejein.' };
    }

    const { resolved, missing, invalid } = await this.resolveItems(items);
    if (missing.length > 0) {
      return {
        posted: false,
        userMessage:
          `❌ Sale post nahi hui — ye item inventory mein nahi mile:\n` +
          missing.map(n => `   • ${n}`).join('\n'),
      };
    }
    if (invalid.length > 0) {
      return {
        posted: false,
        userMessage:
          `❌ Sale post nahi hui — quantity/rate missing hai:\n` + invalid.map(n => `   • ${n}`).join('\n'),
      };
    }

    // FIFO lot allocation: oldest sellable lots first (sales are lot-based;
    // the create API requires explicit lot picks).
    const saleLots: Array<{ lotId: string; itemId: string; quantitySold: number; rate: number }> = [];
    for (const r of resolved) {
      const { data: lots } = await this.gw.get<Array<{
        id: string; item_id: string; available_qty: number | string; status: string; created_at: string;
      }>>('/api/v1/sales/lots/all', { itemId: r.itemId, limit: 500 });

      const sellable = (lots || [])
        .filter(l => ['AVAILABLE', 'PARTIAL'].includes(l.status) && Number(l.available_qty) > 0)
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

      let remaining = r.quantity;
      for (const lot of sellable) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, Number(lot.available_qty));
        saleLots.push({ lotId: lot.id, itemId: r.itemId, quantitySold: take, rate: r.rate });
        remaining -= take;
      }
      if (remaining > 0) {
        const available = sellable.reduce((s, l) => s + Number(l.available_qty), 0);
        return {
          posted: false,
          userMessage:
            `❌ Sale post nahi hui — "${r.name}" ka stock kam hai.\n` +
            `📦 Available: ${available} | Chahiye: ${r.quantity}`,
        };
      }
    }

    const gstAmount = draft.gst?.totalTax || 0;
    const { data } = await this.gw.post<{ sale_number: string; total_amount: number }>('/api/v1/sales', {
      partyId: draft.partyId,
      saleDate: toIsoDate(draft.date),
      saleLots,
      ...(gstAmount > 0 ? { gstMode: 'AMOUNT', gstAmount } : {}),
    });

    return {
      posted: true,
      reference: data.sale_number,
      userMessage:
        `✅ Sales entry post ho gayi!\n\n` +
        `👤 ${draft.partyName || 'Customer'}\n` +
        `💰 Total: ${inr(Number(data.total_amount))}\n` +
        `🧾 ${data.sale_number}`,
    };
  }

  // ─── Expenses ─────────────────────────────────────────────────────────────

  private async postExpense(draft: Partial<TransactionEntry>): Promise<PostResult> {
    if (!draft.amount || draft.amount <= 0) {
      return { posted: false, userMessage: '❌ Kharcha post nahi hua — amount samajh nahi aaya.' };
    }

    const { data: types } = await this.gw.get<Array<{ id: string; name: string; category?: string }>>(
      '/api/v1/profile/expense-types',
    );
    if (!types || types.length === 0) {
      return {
        posted: false,
        userMessage: '❌ Kharcha post nahi hua — koi expense type setup nahi hai. Pehle app ke Settings mein expense types banayein.',
      };
    }

    const wanted = (draft.notes || '').toLowerCase();
    const match =
      types.find(t => wanted && t.name.toLowerCase() === wanted) ||
      types.find(t => wanted && (wanted.includes(t.name.toLowerCase()) || t.name.toLowerCase().includes(wanted))) ||
      types.find(t => /general|other|misc/i.test(t.name));

    if (!match) {
      return {
        posted: false,
        userMessage:
          `❌ Kharcha post nahi hua — expense type match nahi hui.\n\nAvailable types:\n` +
          types.slice(0, 8).map(t => `   • ${t.name}`).join('\n') +
          `\n\nType ke naam ke saath dubara bhejein.`,
      };
    }

    const { data } = await this.gw.post<{ id: string }>('/api/v1/expenses', {
      expenseTypeId: match.id,
      expenseCategory: 'INDIRECT',
      amount: draft.amount,
      expenseDate: toIsoDate(draft.date),
      paymentMode: toPlatformPaymentMode(draft.paymentMode),
      isPaid: true,
      notes: draft.notes || 'WhatsApp AI entry',
    });

    return {
      posted: true,
      reference: data.id,
      userMessage:
        `✅ Kharcha post ho gaya!\n\n` +
        `📂 ${match.name}\n` +
        `💰 ${inr(draft.amount)}`,
    };
  }

  // ─── Stock Adjustment ─────────────────────────────────────────────────────

  private async postStockAdjustment(draft: Partial<TransactionEntry>): Promise<PostResult> {
    const item = draft.items?.[0];
    if (!item || !item.name || item.quantity <= 0) {
      return { posted: false, userMessage: '❌ Stock update nahi hua — item ya quantity samajh nahi aayi.' };
    }

    const { resolved, missing } = await this.resolveItems([item], { requireRate: false });
    if (missing.length > 0) {
      return {
        posted: false,
        userMessage: `❌ Stock update nahi hua — "${item.name}" inventory mein nahi mila. Pehle "naya item ${item.name} add karo" bhejein.`,
      };
    }

    const { data } = await this.gw.post<{ item: { name: string; current_stock: number | string } }>(
      '/api/v1/inventory/adjust',
      {
        itemId: resolved[0].itemId,
        quantity: item.quantity,
        type: 'ADD',
        reason: 'WhatsApp AI stock update',
        notes: draft.notes || undefined,
      },
    );

    return {
      posted: true,
      userMessage:
        `✅ Stock update ho gaya!\n\n` +
        `📦 ${data.item.name}: +${item.quantity} ${item.unit || ''}\n` +
        `📊 Ab total: ${Number(data.item.current_stock)}`,
    };
  }

  // ─── Master Data ──────────────────────────────────────────────────────────

  private async postParty(draft: Partial<TransactionEntry>): Promise<PostResult> {
    if (!draft.partyName) {
      return { posted: false, userMessage: '❌ Party add nahi hui — naam nahi mila.' };
    }
    // Party create requires a valid Indian mobile (server-validated).
    if (!draft.partyPhone || !/^[6-9]\d{9}$/.test(draft.partyPhone)) {
      return {
        posted: false,
        userMessage:
          `❌ Party add nahi hui — phone number chahiye.\n\n` +
          `Aise bhejein: "naya party ${draft.partyName} add karo phone 98xxxxxxxx"`,
      };
    }

    const { data } = await this.gw.post<{ id: string; name: string }>('/api/v1/profile/parties', {
      name: draft.partyName,
      phone: draft.partyPhone,
      type: 'BOTH',
      ...(draft.gstin ? { gstNumber: draft.gstin } : {}),
    });

    return {
      posted: true,
      reference: data.id,
      userMessage: `✅ Party add ho gayi!\n\n👤 ${data.name}\n📱 ${draft.partyPhone}`,
    };
  }

  private async postItem(draft: Partial<TransactionEntry>): Promise<PostResult> {
    const item = draft.items?.[0];
    if (!item?.name) {
      return { posted: false, userMessage: '❌ Item add nahi hua — naam nahi mila.' };
    }

    const { data } = await this.gw.post<{ id: string; name: string; unit: string }>('/api/v1/inventory/items', {
      name: item.name,
      unit: item.unit || 'KG',
      ...(item.hsnCode ? { hsnCode: item.hsnCode } : {}),
      ...(item.gstRate ? { gstRate: item.gstRate } : {}),
    });

    return {
      posted: true,
      reference: data.id,
      userMessage: `✅ Item add ho gaya!\n\n📦 ${data.name} (${data.unit})`,
    };
  }

  // ─── Item Resolution ──────────────────────────────────────────────────────

  /**
   * Resolve free-text item names to inventory item ids via the inventory
   * search API. A name resolves when the search returns an exact
   * (case-insensitive) match, or exactly one result.
   */
  private async resolveItems(
    items: TransactionItem[],
    opts: { requireRate?: boolean } = { requireRate: true },
  ): Promise<{
    resolved: Array<TransactionItem & { itemId: string }>;
    missing: string[];
    invalid: string[];
  }> {
    const resolved: Array<TransactionItem & { itemId: string }> = [];
    const missing: string[] = [];
    const invalid: string[] = [];

    for (const item of items) {
      if (item.quantity <= 0 || (opts.requireRate !== false && item.rate <= 0)) {
        invalid.push(item.name);
        continue;
      }
      if (item.itemId) {
        resolved.push({ ...item, itemId: item.itemId });
        continue;
      }

      const { data: hits } = await this.gw.get<Array<{ id: string; name: string; unit: string }>>(
        '/api/v1/inventory/items',
        { search: item.name, limit: 5 },
      );
      const list = hits || [];
      const exact = list.find(h => h.name.toLowerCase() === item.name.toLowerCase());
      const chosen = exact || (list.length === 1 ? list[0] : undefined);

      if (chosen) {
        resolved.push({ ...item, itemId: chosen.id, unit: item.unit || chosen.unit });
      } else {
        missing.push(item.name);
      }
    }

    return { resolved, missing, invalid };
  }
}
