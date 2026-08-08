/**
 * Verification script: Check that existing DB data is consistent
 * with the updated party-facing amount logic.
 *
 * Party-facing amount = subtotal + gst_amount - discount + round_off
 * (Excludes: direct_expense, indirect_expense, cutter_cost)
 *
 * Run: npx ts-node scripts/verify-party-data.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(' PARTY DATA VERIFICATION REPORT');
  console.log(' Checking DB data against party-facing amount logic');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // ─── 1. CHECK PURCHASES ─────────────────────────────────────────────────
  console.log('─── PURCHASES ───────────────────────────────────────────────');
  const purchases = await prisma.purchase.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true, purchase_number: true, party_id: true,
      subtotal: true, direct_expense: true, indirect_expense: true,
      cutter_cost: true, gst_amount: true, discount: true, round_off: true,
      total_amount: true, paid_amount: true, balance_amount: true,
      payment_status: true,
    },
  });

  let purchaseIssues = 0;
  for (const p of purchases) {
    const subtotal = Number(p.subtotal);
    const directExp = Number(p.direct_expense);
    const indirectExp = Number(p.indirect_expense);
    const cutterCost = Number(p.cutter_cost);
    const gst = Number(p.gst_amount);
    const discount = Number(p.discount);
    const roundOff = Number(p.round_off);
    const totalAmount = Number(p.total_amount);
    const paidAmount = Number(p.paid_amount);
    const balanceAmount = Number(p.balance_amount);

    const expectedTotal = subtotal + directExp + indirectExp + cutterCost + gst - discount + roundOff;
    const partyAmount = subtotal + gst - discount + roundOff;
    const expectedPartyBalance = Math.max(0, partyAmount - paidAmount);

    // Check total_amount is correct
    if (Math.abs(expectedTotal - totalAmount) > 0.01) {
      console.log(`  ⚠️  ${p.purchase_number}: total_amount mismatch. Expected=${expectedTotal}, Got=${totalAmount}`);
      purchaseIssues++;
    }

    // Check balance_amount (this is total-based, not party-based – stored on the purchase record)
    const expectedBalance = expectedTotal - paidAmount;
    if (Math.abs(expectedBalance - balanceAmount) > 0.01) {
      console.log(`  ⚠️  ${p.purchase_number}: balance_amount mismatch. Expected=${expectedBalance.toFixed(2)}, Got=${balanceAmount}`);
      purchaseIssues++;
    }
  }
  console.log(`  Total purchases checked: ${purchases.length}`);
  console.log(`  Issues found: ${purchaseIssues}\n`);

  // ─── 2. CHECK SALES ─────────────────────────────────────────────────────
  console.log('─── SALES ───────────────────────────────────────────────────');
  const sales = await prisma.sale.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true, sale_number: true, party_id: true,
      subtotal: true, direct_expense: true, indirect_expense: true,
      gst_amount: true, discount: true, round_off: true,
      total_amount: true, paid_amount: true, balance_amount: true,
      payment_status: true,
    },
  });

  let saleIssues = 0;
  for (const s of sales) {
    const subtotal = Number(s.subtotal);
    const directExp = Number(s.direct_expense);
    const indirectExp = Number(s.indirect_expense);
    const gst = Number(s.gst_amount);
    const discount = Number(s.discount);
    const roundOff = Number(s.round_off);
    const totalAmount = Number(s.total_amount);
    const paidAmount = Number(s.paid_amount);
    const balanceAmount = Number(s.balance_amount);

    const expectedTotal = subtotal + directExp + indirectExp + gst - discount + roundOff;
    const partyAmount = subtotal + gst - discount + roundOff;

    // Check total_amount is correct
    if (Math.abs(expectedTotal - totalAmount) > 0.01) {
      console.log(`  ⚠️  ${s.sale_number}: total_amount mismatch. Expected=${expectedTotal.toFixed(2)}, Got=${totalAmount}`);
      saleIssues++;
    }

    // Check balance_amount
    const expectedBalance = expectedTotal - paidAmount;
    if (Math.abs(expectedBalance - balanceAmount) > 0.01) {
      console.log(`  ⚠️  ${s.sale_number}: balance_amount mismatch. Expected=${expectedBalance.toFixed(2)}, Got=${balanceAmount}`);
      saleIssues++;
    }
  }
  console.log(`  Total sales checked: ${sales.length}`);
  console.log(`  Issues found: ${saleIssues}\n`);

  // ─── 3. CHECK LEDGER ENTRIES ────────────────────────────────────────────
  console.log('─── LEDGER ENTRIES (Party-facing amount check) ───────────────');

  // For PURCHASES: PARTY_PAYABLE ledger entries should match party-facing amount
  const purchaseLedgerEntries = await prisma.ledgerEntry.findMany({
    where: {
      reference_type: 'purchase',
      account_type: 'PARTY_PAYABLE',
      entry_type: 'CREDIT',
    },
    select: { id: true, purchase_id: true, amount: true },
  });

  let ledgerPurchaseIssues = 0;
  for (const le of purchaseLedgerEntries) {
    if (!le.purchase_id) continue;
    const purchase = purchases.find(p => p.id === le.purchase_id);
    if (!purchase) continue;

    const partyAmount = Number(purchase.subtotal) + Number(purchase.gst_amount)
      - Number(purchase.discount) + Number(purchase.round_off);
    const ledgerAmount = Number(le.amount);

    if (Math.abs(partyAmount - ledgerAmount) > 0.01) {
      console.log(`  ⚠️  Purchase ledger entry ${le.id}: Expected partyAmount=${partyAmount.toFixed(2)}, Got ledger=${ledgerAmount}`);
      ledgerPurchaseIssues++;
    }
  }
  console.log(`  Purchase PARTY_PAYABLE entries checked: ${purchaseLedgerEntries.length}`);
  console.log(`  Issues (ledger ≠ partyAmount): ${ledgerPurchaseIssues}`);

  // For SALES: PARTY_RECEIVABLE ledger entries should match party-facing amount
  const saleLedgerEntries = await prisma.ledgerEntry.findMany({
    where: {
      reference_type: 'sale',
      account_type: 'PARTY_RECEIVABLE',
      entry_type: 'DEBIT',
    },
    select: { id: true, sale_id: true, amount: true },
  });

  let ledgerSaleIssues = 0;
  for (const le of saleLedgerEntries) {
    if (!le.sale_id) continue;
    const sale = sales.find(s => s.id === le.sale_id);
    if (!sale) continue;

    const partyAmount = Number(sale.subtotal) + Number(sale.gst_amount)
      - Number(sale.discount) + Number(sale.round_off);
    const ledgerAmount = Number(le.amount);

    if (Math.abs(partyAmount - ledgerAmount) > 0.01) {
      console.log(`  ⚠️  Sale ledger entry ${le.id}: Expected partyAmount=${partyAmount.toFixed(2)}, Got ledger=${ledgerAmount}`);
      ledgerSaleIssues++;
    }
  }
  console.log(`  Sale PARTY_RECEIVABLE entries checked: ${saleLedgerEntries.length}`);
  console.log(`  Issues (ledger ≠ partyAmount): ${ledgerSaleIssues}\n`);

  // ─── 4. CHECK PARTY BALANCES ────────────────────────────────────────────
  console.log('─── PARTY BALANCES (Derived vs Stored) ──────────────────────');

  const parties = await prisma.party.findMany({
    where: { is_active: true },
    select: { id: true, name: true, balance: true, opening_balance: true, type: true },
  });

  let partyBalanceIssues = 0;
  for (const party of parties) {
    // Derive expected balance:
    // + opening_balance
    // + SUM(purchase party-facing unpaid) for SUPPLIER/BOTH
    // - SUM(sale party-facing unpaid) for CUSTOMER/BOTH
    // + manual adjustments

    const openingBalance = Number(party.opening_balance);

    // Get all purchases for this party
    const partyPurchases = purchases.filter(p => p.party_id === party.id);
    let purchasePayable = 0;
    for (const p of partyPurchases) {
      const partyAmt = Number(p.subtotal) + Number(p.gst_amount) - Number(p.discount) + Number(p.round_off);
      const paid = Number(p.paid_amount);
      purchasePayable += Math.max(0, partyAmt - paid);
    }

    // Get all sales for this party
    const partySales = sales.filter(s => s.party_id === party.id);
    let saleReceivable = 0;
    for (const s of partySales) {
      const partyAmt = Number(s.subtotal) + Number(s.gst_amount) - Number(s.discount) + Number(s.round_off);
      const paid = Number(s.paid_amount);
      saleReceivable += Math.max(0, partyAmt - paid);
    }

    // Get standalone payments (not linked to a specific purchase/sale)
    const standalonePayments = await prisma.payment.findMany({
      where: {
        OR: [
          { payer_party_id: party.id },
          { payee_party_id: party.id },
        ],
        reference_type: { notIn: ['PURCHASE', 'SALE'] },
      },
      select: { amount: true, payer_party_id: true, payee_party_id: true },
    });

    let paymentAdjustment = 0;
    for (const pmt of standalonePayments) {
      if (pmt.payer_party_id === party.id) {
        // They paid us
        paymentAdjustment -= Number(pmt.amount);
      } else {
        // We paid them
        paymentAdjustment += Number(pmt.amount);
      }
    }

    // Expected: positive = we owe them (payable), negative = they owe us (receivable)
    const expectedBalance = openingBalance + purchasePayable - saleReceivable + paymentAdjustment;
    const storedBalance = Number(party.balance);

    if (Math.abs(expectedBalance - storedBalance) > 0.01 && (partyPurchases.length > 0 || partySales.length > 0)) {
      console.log(`  ⚠️  ${party.name} (${party.type}): Stored=${storedBalance.toFixed(2)}, Derived=${expectedBalance.toFixed(2)}, Diff=${(storedBalance - expectedBalance).toFixed(2)}`);
      console.log(`       Opening=${openingBalance}, PurchasePayable=${purchasePayable.toFixed(2)}, SaleReceivable=${saleReceivable.toFixed(2)}, PaymentAdj=${paymentAdjustment.toFixed(2)}`);
      partyBalanceIssues++;
    }
  }
  console.log(`  Total parties checked: ${parties.length}`);
  console.log(`  Balance mismatches: ${partyBalanceIssues}\n`);

  // ─── 5. SUMMARY ────────────────────────────────────────────────────────
  console.log('═══════════════════════════════════════════════════════════════');
  const totalIssues = purchaseIssues + saleIssues + ledgerPurchaseIssues + ledgerSaleIssues + partyBalanceIssues;
  if (totalIssues === 0) {
    console.log(' ✅ ALL DATA IS CONSISTENT with the updated schema!');
    console.log('    No modifications required.');
  } else {
    console.log(` ⚠️  TOTAL ISSUES FOUND: ${totalIssues}`);
    console.log('    Breakdown:');
    console.log(`      Purchase record issues: ${purchaseIssues}`);
    console.log(`      Sale record issues: ${saleIssues}`);
    console.log(`      Purchase ledger entry issues: ${ledgerPurchaseIssues}`);
    console.log(`      Sale ledger entry issues: ${ledgerSaleIssues}`);
    console.log(`      Party balance mismatches: ${partyBalanceIssues}`);
    console.log('\n    Run the fix script below if corrections are needed.');
  }
  console.log('═══════════════════════════════════════════════════════════════');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
