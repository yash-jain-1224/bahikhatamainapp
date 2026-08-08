/**
 * Fix script: Correct historical ledger entries and party balances
 * to use party-facing amounts instead of total amounts.
 *
 * Issues found:
 * - 2 purchase PARTY_PAYABLE ledger entries still have total_amount (includes expenses/cutter)
 * - 2 party balances are based on old total_amount logic
 *
 * Run: node_modules/.bin/ts-node --compiler-options '{"module":"commonjs"}' packages/shared/scripts/fix-party-data.ts
 */

import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(' FIX: Correcting ledger entries & party balances');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // ─── 1. Fix purchase PARTY_PAYABLE ledger entries ──────────────────────
  console.log('─── Fixing Purchase Ledger Entries ──────────────────────────');

  const purchaseLedgerEntries = await prisma.ledgerEntry.findMany({
    where: {
      reference_type: 'purchase',
      account_type: 'PARTY_PAYABLE',
      entry_type: 'CREDIT',
    },
    include: {
      purchase: {
        select: {
          id: true, purchase_number: true,
          subtotal: true, gst_amount: true, discount: true, round_off: true,
          total_amount: true, direct_expense: true, indirect_expense: true, cutter_cost: true,
        },
      },
    },
  });

  let ledgerFixes = 0;
  for (const le of purchaseLedgerEntries) {
    if (!le.purchase) continue;

    const partyAmount = Number(le.purchase.subtotal) + Number(le.purchase.gst_amount)
      - Number(le.purchase.discount) + Number(le.purchase.round_off);
    const currentAmount = Number(le.amount);

    if (Math.abs(partyAmount - currentAmount) > 0.01) {
      console.log(`  Fixing ${le.purchase.purchase_number}: ${currentAmount} → ${partyAmount.toFixed(2)}`);
      await prisma.ledgerEntry.update({
        where: { id: le.id },
        data: { amount: new Prisma.Decimal(partyAmount) },
      });
      ledgerFixes++;
    }
  }
  console.log(`  Ledger entries fixed: ${ledgerFixes}\n`);

  // ─── 2. Fix sale PARTY_RECEIVABLE ledger entries (just in case) ────────
  console.log('─── Checking Sale Ledger Entries ────────────────────────────');

  const saleLedgerEntries = await prisma.ledgerEntry.findMany({
    where: {
      reference_type: 'sale',
      account_type: 'PARTY_RECEIVABLE',
      entry_type: 'DEBIT',
    },
    include: {
      sale: {
        select: {
          id: true, sale_number: true,
          subtotal: true, gst_amount: true, discount: true, round_off: true,
          total_amount: true, direct_expense: true, indirect_expense: true,
        },
      },
    },
  });

  let saleLedgerFixes = 0;
  for (const le of saleLedgerEntries) {
    if (!le.sale) continue;

    const partyAmount = Number(le.sale.subtotal) + Number(le.sale.gst_amount)
      - Number(le.sale.discount) + Number(le.sale.round_off);
    const currentAmount = Number(le.amount);

    if (Math.abs(partyAmount - currentAmount) > 0.01) {
      console.log(`  Fixing ${le.sale.sale_number}: ${currentAmount} → ${partyAmount.toFixed(2)}`);
      await prisma.ledgerEntry.update({
        where: { id: le.id },
        data: { amount: new Prisma.Decimal(partyAmount) },
      });
      saleLedgerFixes++;
    }
  }
  console.log(`  Sale ledger entries fixed: ${saleLedgerFixes}\n`);

  // Also fix SALES account entries (the credit side of the double-entry)
  const salesAccountEntries = await prisma.ledgerEntry.findMany({
    where: {
      reference_type: 'sale',
      account_type: 'SALES',
      entry_type: 'CREDIT',
    },
    include: {
      sale: {
        select: {
          id: true, sale_number: true,
          subtotal: true, gst_amount: true, discount: true, round_off: true,
          total_amount: true, direct_expense: true, indirect_expense: true,
        },
      },
    },
  });

  let salesAccountFixes = 0;
  for (const le of salesAccountEntries) {
    if (!le.sale) continue;
    const partyAmount = Number(le.sale.subtotal) + Number(le.sale.gst_amount)
      - Number(le.sale.discount) + Number(le.sale.round_off);
    const currentAmount = Number(le.amount);
    if (Math.abs(partyAmount - currentAmount) > 0.01) {
      console.log(`  Fixing SALES entry for ${le.sale.sale_number}: ${currentAmount} → ${partyAmount.toFixed(2)}`);
      await prisma.ledgerEntry.update({
        where: { id: le.id },
        data: { amount: new Prisma.Decimal(partyAmount) },
      });
      salesAccountFixes++;
    }
  }
  if (salesAccountFixes > 0) console.log(`  SALES account entries fixed: ${salesAccountFixes}\n`);

  // ─── 3. Recalculate and fix party balances ─────────────────────────────
  console.log('─── Fixing Party Balances ───────────────────────────────────');

  const parties = await prisma.party.findMany({
    where: { is_active: true },
    select: { id: true, name: true, balance: true, opening_balance: true, type: true },
  });

  const purchases = await prisma.purchase.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true, party_id: true,
      subtotal: true, gst_amount: true, discount: true, round_off: true,
      paid_amount: true,
    },
  });

  const sales = await prisma.sale.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true, party_id: true,
      subtotal: true, gst_amount: true, discount: true, round_off: true,
      paid_amount: true,
    },
  });

  let partyFixes = 0;
  for (const party of parties) {
    const openingBalance = Number(party.opening_balance);

    // Calculate purchase payable (party-facing)
    const partyPurchases = purchases.filter(p => p.party_id === party.id);
    let purchasePayable = 0;
    for (const p of partyPurchases) {
      const partyAmt = Number(p.subtotal) + Number(p.gst_amount) - Number(p.discount) + Number(p.round_off);
      const paid = Number(p.paid_amount);
      purchasePayable += Math.max(0, partyAmt - paid);
    }

    // Calculate sale receivable (party-facing)
    const partySales = sales.filter(s => s.party_id === party.id);
    let saleReceivable = 0;
    for (const s of partySales) {
      const partyAmt = Number(s.subtotal) + Number(s.gst_amount) - Number(s.discount) + Number(s.round_off);
      const paid = Number(s.paid_amount);
      saleReceivable += Math.max(0, partyAmt - paid);
    }

    // Get standalone payments
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
        paymentAdjustment -= Number(pmt.amount);
      } else {
        paymentAdjustment += Number(pmt.amount);
      }
    }

    const expectedBalance = openingBalance + purchasePayable - saleReceivable + paymentAdjustment;
    const storedBalance = Number(party.balance);

    if (Math.abs(expectedBalance - storedBalance) > 0.01) {
      console.log(`  Fixing ${party.name}: ${storedBalance.toFixed(2)} → ${expectedBalance.toFixed(2)}`);
      await prisma.party.update({
        where: { id: party.id },
        data: { balance: new Prisma.Decimal(expectedBalance) },
      });
      partyFixes++;
    }
  }
  console.log(`  Party balances fixed: ${partyFixes}\n`);

  // ─── DONE ──────────────────────────────────────────────────────────────
  console.log('═══════════════════════════════════════════════════════════════');
  const totalFixes = ledgerFixes + saleLedgerFixes + salesAccountFixes + partyFixes;
  if (totalFixes === 0) {
    console.log(' ✅ No fixes needed — data is already consistent!');
  } else {
    console.log(` ✅ Fixed ${totalFixes} records. Data is now consistent.`);
  }
  console.log('═══════════════════════════════════════════════════════════════');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
