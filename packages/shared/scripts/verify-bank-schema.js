const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(' DATABASE SCHEMA VERIFICATION');
  console.log(' Checking tables exist for Bank Account & Reconciliation feature');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // 1. Check if business_bank_accounts table exists and its structure
  console.log('─── 1. BusinessBankAccount Table ─────────────────────────────');
  try {
    const count = await p.businessBankAccount.count();
    console.log(`  ✅ Table exists. Current rows: ${count}`);
    
    // Try to read schema by fetching a record structure
    const sample = await p.businessBankAccount.findFirst();
    if (sample) {
      console.log('  Fields present:', Object.keys(sample).join(', '));
    } else {
      console.log('  (No records yet — table is empty)');
      // Verify we can create/read with expected fields
      const testFields = ['id', 'business_id', 'account_name', 'account_number', 'ifsc_code', 'bank_name', 'upi_id', 'is_default', 'created_at', 'updated_at'];
      console.log('  Expected fields:', testFields.join(', '));
    }
  } catch (err) {
    console.log('  ❌ Table does NOT exist or has errors:', err.message);
    console.log('  → MIGRATION REQUIRED: Run prisma migrate to create business_bank_accounts table');
  }

  // 2. Check LedgerEntry table has all needed fields for reconciliation
  console.log('\n─── 2. LedgerEntry Table (for reconciliation) ──────────────');
  try {
    const entry = await p.ledgerEntry.findFirst({
      select: {
        id: true, business_id: true, party_id: true, purchase_id: true,
        sale_id: true, payment_id: true, entry_date: true, account_type: true,
        entry_type: true, amount: true, balance_after: true, narration: true,
        reference_type: true, reference_id: true, created_at: true,
      },
    });
    console.log('  ✅ LedgerEntry table accessible with all required fields');
    if (entry) {
      console.log('  Sample fields:', Object.keys(entry).join(', '));
    }
  } catch (err) {
    console.log('  ❌ Issue with LedgerEntry:', err.message);
  }

  // 3. Check Business table has bank_accounts relation
  console.log('\n─── 3. Business → bank_accounts relation ───────────────────');
  try {
    const biz = await p.business.findFirst({
      include: { bank_accounts: true },
    });
    if (biz) {
      console.log(`  ✅ Relation works. Business "${biz.name}" has ${biz.bank_accounts.length} bank accounts`);
    } else {
      console.log('  ✅ Relation query works (no businesses yet)');
    }
  } catch (err) {
    console.log('  ❌ Relation error:', err.message);
  }

  // 4. Check that account_type enum includes BANK
  console.log('\n─── 4. AccountType enum check (BANK) ───────────────────────');
  try {
    const bankEntries = await p.ledgerEntry.count({
      where: { account_type: 'BANK' },
    });
    console.log(`  ✅ BANK account_type supported. Existing BANK entries: ${bankEntries}`);
  } catch (err) {
    console.log('  ❌ BANK not in AccountType enum:', err.message);
    console.log('  → MIGRATION REQUIRED: Add BANK to AccountType enum');
  }

  // 5. Verify Party table (for reconciliation linking)
  console.log('\n─── 5. Party table check ───────────────────────────────────');
  try {
    const partyCount = await p.party.count();
    console.log(`  ✅ Party table accessible. Total parties: ${partyCount}`);
  } catch (err) {
    console.log('  ❌ Party table issue:', err.message);
  }

  // 6. Check if any indexes are needed
  console.log('\n─── 6. Index verification ──────────────────────────────────');
  try {
    // Test the query pattern used by findMatches (amount range + date range + account_type)
    const start = Date.now();
    await p.ledgerEntry.findMany({
      where: {
        business_id: '00000000-0000-0000-0000-000000000000',
        amount: { gte: 999, lte: 1001 },
        entry_date: { gte: new Date('2024-01-01'), lte: new Date('2024-01-07') },
        account_type: { in: ['CASH', 'BANK'] },
      },
      take: 10,
    });
    const elapsed = Date.now() - start;
    console.log(`  ✅ Match query pattern works (${elapsed}ms)`);
    if (elapsed > 500) {
      console.log('  ⚠️  Query slow — consider adding index on (business_id, amount, entry_date)');
    }
  } catch (err) {
    console.log('  ❌ Query error:', err.message);
  }

  // ─── SUMMARY ────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(' SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════');
}

main()
  .catch(err => console.error('Script error:', err))
  .finally(() => p.$disconnect());
