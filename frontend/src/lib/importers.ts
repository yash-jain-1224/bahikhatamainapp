// =============================================================================
// CSV bulk import
// =============================================================================
//
// These run against the SAME create endpoints the normal UI uses, deliberately.
// Writing six dedicated bulk endpoints would mean re-implementing party balance
// updates, ledger side-effects and stock movements a second time, and any drift
// between the two paths is invisible until the books are wrong. Importing
// through the real endpoints is slower but cannot diverge.
//
// Two of the six modules in the CSV templates cannot be imported against the
// current API, and they report that instead of pretending to succeed:
//
//   sales    — createSaleSchema requires saleLots[].lotId. Sales are lot-based,
//              the template has no lot column, and the sale form makes lot
//              choice a manual decision. Auto-picking lots (FIFO or otherwise)
//              is an inventory-costing policy, not a mapping detail.
//   payments — createPaymentSchema requires referenceType + referenceId, and the
//              bulk variant requires allocations against existing PURCHASE/SALE
//              rows. There is no "standalone payment against a party" endpoint,
//              and auto-allocating an imported amount across outstanding bills
//              is an accounting decision.
//
// Both need a product decision (or a new endpoint) before they can be honest.

import { profileApi, inventoryApi, purchaseApi, ledgerApi, expenseApi } from './api';

export type ImportModule =
  | 'parties' | 'inventory' | 'purchases' | 'sales' | 'payments' | 'ledger' | 'expenses';

export interface ParsedRow { [key: string]: string }

export interface RowError { row: number; message: string }

export interface ImportOutcome {
  imported: number;
  failed: number;
  errors: RowError[];
}

/** Modules the current API genuinely cannot accept, with the reason shown to the user. */
export const UNSUPPORTED_MODULES: Partial<Record<ImportModule, string>> = {
  sales:
    'Sales are lot-based: each sale must reference specific inventory lots, and the import template has no lot column. Create sales from the Sales page so lots can be chosen.',
  payments:
    'Payments must be allocated against a specific purchase or sale. The template has no bill reference, so imported payments could not be applied to the right transaction. Record them from the party or bill screen.',
};

/** Message from an axios error, falling back sensibly. */
function errMessage(e: any): string {
  const data = e?.response?.data;
  if (data?.errors?.length) {
    const first = data.errors[0];
    const path = Array.isArray(first?.path) ? first.path.join('.') : first?.path;
    return `${data.message || 'Validation failed'}${path ? ` (${path})` : ''}: ${first?.message || ''}`.trim();
  }
  return data?.message || e?.message || 'Unknown error';
}

function num(v: string | undefined): number | undefined {
  if (v === undefined || v === null || String(v).trim() === '') return undefined;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : undefined;
}

/** CSV dates are plain YYYY-MM-DD; the schemas want a full ISO datetime. */
function isoDate(v: string | undefined): string | undefined {
  if (!v || !v.trim()) return undefined;
  const d = new Date(v.trim());
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

function normKey(s: string): string {
  return String(s || '').trim().toLowerCase();
}

/** name -> id, built once per import so N rows do not cause N lookups. */
async function buildPartyMap(): Promise<Map<string, string>> {
  const res = await profileApi.parties({ limit: 5000 });
  const list = res.data?.data?.parties || res.data?.data || res.data?.parties || [];
  const map = new Map<string, string>();
  for (const p of list) if (p?.name && p?.id) map.set(normKey(p.name), p.id);
  return map;
}

async function buildItemMap(): Promise<Map<string, string>> {
  const res = await inventoryApi.listItems({ limit: 5000 });
  const list = res.data?.data?.items || res.data?.data || res.data?.items || [];
  const map = new Map<string, string>();
  for (const i of list) if (i?.name && i?.id) map.set(normKey(i.name), i.id);
  return map;
}

async function buildCategoryMap(): Promise<Map<string, string>> {
  try {
    const res = await inventoryApi.categories();
    const list = res.data?.data?.categories || res.data?.data || [];
    const map = new Map<string, string>();
    for (const c of list) if (c?.name && c?.id) map.set(normKey(c.name), c.id);
    return map;
  } catch {
    return new Map();
  }
}

type Progress = (done: number, total: number) => void;

async function importParties(rows: ParsedRow[], onProgress: Progress): Promise<ImportOutcome> {
  const errors: RowError[] = [];
  let imported = 0;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    try {
      const type = (r.type || '').trim().toUpperCase();
      await profileApi.createParty({
        name: r.name?.trim(),
        phone: (r.phone || '').replace(/\D/g, ''),
        ...(r.email?.trim() ? { email: r.email.trim() } : {}),
        ...(['SUPPLIER', 'CUSTOMER', 'BOTH'].includes(type) ? { type } : {}),
        ...(num(r.opening_balance) !== undefined ? { openingBalance: num(r.opening_balance) } : {}),
      });
      imported++;
    } catch (e) {
      errors.push({ row: i + 2, message: errMessage(e) }); // +2: header row + 1-indexed
    }
    onProgress(i + 1, rows.length);
  }
  return { imported, failed: errors.length, errors };
}

async function importInventory(rows: ParsedRow[], onProgress: Progress): Promise<ImportOutcome> {
  const errors: RowError[] = [];
  let imported = 0;
  const categories = await buildCategoryMap();

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    try {
      const categoryId = categories.get(normKey(r.category));
      await inventoryApi.createItem({
        name: r.name?.trim(),
        ...(r.sku?.trim() ? { sku: r.sku.trim() } : {}),
        ...(r.unit?.trim() ? { unit: r.unit.trim() } : {}),
        ...(num(r.min_stock) !== undefined ? { minStock: num(r.min_stock) } : {}),
        ...(num(r.current_stock) !== undefined ? { openingStock: num(r.current_stock) } : {}),
        ...(categoryId ? { categoryId } : {}),
      });
      imported++;
    } catch (e) {
      errors.push({ row: i + 2, message: errMessage(e) });
    }
    onProgress(i + 1, rows.length);
  }
  return { imported, failed: errors.length, errors };
}

async function importLedger(rows: ParsedRow[], onProgress: Progress): Promise<ImportOutcome> {
  const errors: RowError[] = [];
  let imported = 0;
  const parties = await buildPartyMap();

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    try {
      const entryType = (r.entry_type || '').trim().toUpperCase();
      if (entryType !== 'DEBIT' && entryType !== 'CREDIT') {
        throw new Error(`entry_type must be DEBIT or CREDIT (got "${r.entry_type}")`);
      }
      const amount = num(r.amount);
      if (amount === undefined) throw new Error(`amount is not a number ("${r.amount}")`);

      const partyId = r.party_name?.trim() ? parties.get(normKey(r.party_name)) : undefined;
      if (r.party_name?.trim() && !partyId) {
        throw new Error(`No party named "${r.party_name}" — create it or import parties first`);
      }

      await ledgerApi.createEntry({
        accountType: (r.account_type || '').trim().toUpperCase(),
        entryType,
        amount,
        ...(r.narration?.trim() ? { narration: r.narration.trim() } : {}),
        ...(isoDate(r.date) ? { entryDate: isoDate(r.date) } : {}),
        ...(partyId ? { partyId } : {}),
      });
      imported++;
    } catch (e) {
      errors.push({ row: i + 2, message: errMessage(e) });
    }
    onProgress(i + 1, rows.length);
  }
  return { imported, failed: errors.length, errors };
}

/**
 * Purchases are one-row-per-item in the template, but a purchase is a document
 * with an items[] array. Rows sharing a date + party + gadi number are treated
 * as line items of the same purchase — otherwise a 3-item delivery would import
 * as three separate purchases with three separate ledger entries.
 */
async function importPurchases(rows: ParsedRow[], onProgress: Progress): Promise<ImportOutcome> {
  const errors: RowError[] = [];
  let imported = 0;
  const [parties, items] = await Promise.all([buildPartyMap(), buildItemMap()]);

  const groups = new Map<string, { rowNums: number[]; rows: ParsedRow[] }>();
  rows.forEach((r, idx) => {
    const key = [normKey(r.purchase_date), normKey(r.party_name), normKey(r.gadi_number)].join('||');
    if (!groups.has(key)) groups.set(key, { rowNums: [], rows: [] });
    const g = groups.get(key)!;
    g.rowNums.push(idx + 2);
    g.rows.push(r);
  });

  let done = 0;
  for (const [, g] of groups) {
    const first = g.rows[0];
    const rowLabel = g.rowNums[0];
    try {
      const partyId = parties.get(normKey(first.party_name));
      if (!partyId) {
        throw new Error(`No party named "${first.party_name}" — create it or import parties first`);
      }

      const lineItems = g.rows.map((r, n) => {
        const itemId = items.get(normKey(r.item_name));
        if (!itemId) throw new Error(`Row ${g.rowNums[n]}: no item named "${r.item_name}"`);
        const quantity = num(r.quantity);
        const rate = num(r.rate);
        if (!quantity || quantity <= 0) throw new Error(`Row ${g.rowNums[n]}: quantity must be > 0`);
        if (!rate || rate <= 0) throw new Error(`Row ${g.rowNums[n]}: rate must be > 0`);
        return { itemId, quantity, rate };
      });

      await purchaseApi.create({
        partyId,
        items: lineItems,
        ...(isoDate(first.purchase_date) ? { purchaseDate: isoDate(first.purchase_date) } : {}),
        ...(first.gadi_number?.trim() ? { gadiNumber: first.gadi_number.trim() } : {}),
      });
      imported++;
    } catch (e) {
      errors.push({ row: rowLabel, message: errMessage(e) });
    }
    done += g.rows.length;
    onProgress(done, rows.length);
  }
  return { imported, failed: errors.length, errors };
}


/**
 * Expenses.
 *
 * Goes through the normal create endpoint rather than a bulk one, so imported
 * expenses get exactly the same validation and side effects as ones typed in by
 * hand. `expense_type` is matched by name against the business's configured
 * types — the API takes an id, and asking a spreadsheet to carry uuids is not
 * reasonable.
 */
async function importExpenses(rows: ParsedRow[], onProgress: Progress): Promise<ImportOutcome> {
  const errors: RowError[] = [];
  let imported = 0;

  const typeRes = await profileApi.expenseTypes().catch(() => null);
  const types = new Map<string, string>();
  for (const et of (typeRes?.data?.data ?? []) as Array<{ id: string; name: string }>) {
    types.set(normKey(et.name), et.id);
  }

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    try {
      const typeName = (r.expense_type || '').trim();
      if (!typeName) throw new Error('expense_type is required');
      const expenseTypeId = types.get(normKey(typeName));
      if (!expenseTypeId) {
        throw new Error(`No expense type named "${typeName}" — add it under Profile > Expense Types first`);
      }

      const amount = num(r.amount);
      if (amount === undefined) throw new Error(`amount is not a number ("${r.amount}")`);

      const category = (r.category || 'INDIRECT').trim().toUpperCase();
      if (category !== 'DIRECT' && category !== 'INDIRECT') {
        throw new Error(`category must be DIRECT or INDIRECT (got "${r.category}")`);
      }

      const paidRaw = (r.is_paid ?? '').trim().toLowerCase();
      const isPaid = paidRaw === '' ? true : ['true', 'yes', 'paid', '1'].includes(paidRaw);

      await expenseApi.create({
        expenseTypeId,
        expenseCategory: category,
        amount,
        ...(isoDate(r.date) ? { expenseDate: isoDate(r.date) } : {}),
        ...(r.payment_mode?.trim() ? { paymentMode: r.payment_mode.trim().toUpperCase() } : {}),
        isPaid,
        ...(r.notes?.trim() ? { notes: r.notes.trim() } : {}),
      });
      imported++;
    } catch (e) {
      errors.push({ row: i + 2, message: errMessage(e) });
    }
    onProgress(i + 1, rows.length);
  }
  return { imported, failed: errors.length, errors };
}

export async function runImport(
  module: ImportModule,
  rows: ParsedRow[],
  onProgress: Progress,
): Promise<ImportOutcome> {
  switch (module) {
    case 'parties':   return importParties(rows, onProgress);
    case 'inventory': return importInventory(rows, onProgress);
    case 'ledger':    return importLedger(rows, onProgress);
    case 'purchases': return importPurchases(rows, onProgress);
    case 'expenses':  return importExpenses(rows, onProgress);
    default:
      throw new Error(UNSUPPORTED_MODULES[module] || `Import is not supported for ${module}`);
  }
}
