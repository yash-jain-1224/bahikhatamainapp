/**
 * Recompute party.balance from the ledger — repair for the inverted payment
 * writer (billing-service moved balances AWAY from zero on every payment
 * recorded through the Record Payment dialogs; fixed 2026-08-08).
 *
 * Ground truth per party:
 *   balance = opening_balance
 *           + Σ document legs on PARTY_PAYABLE / PARTY_RECEIVABLE
 *               (CREDIT => +amount, DEBIT => -amount)
 *           + Σ manual entries with a party attached
 *               (DEBIT => +amount, CREDIT => -amount — createManualEntry's
 *                convention, which its delete path also reverses)
 *
 * Usage:
 *   node scripts/repair-party-balances.mjs             # dry run — reports drift only
 *   node scripts/repair-party-balances.mjs --apply     # writes corrected balances
 *
 * DATABASE_URL must point at the target database. Run the dry run first and
 * eyeball the drift list; only parties whose stored balance differs by more
 * than 0.005 are touched.
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(repoRoot, 'package.json'));
const { PrismaClient } = require('@prisma/client');

const apply = process.argv.includes('--apply');
const prisma = new PrismaClient();

const rows = await prisma.$queryRaw`
  SELECT p.id, p.business_id, p.name, p.balance::float AS stored,
    (p.opening_balance::float + COALESCE((
      SELECT SUM(CASE WHEN le.reference_type = 'manual'
                 THEN CASE WHEN le.entry_type = 'DEBIT' THEN le.amount ELSE -le.amount END
                 ELSE CASE WHEN le.entry_type = 'CREDIT' THEN le.amount ELSE -le.amount END END)::float
        FROM ledger_entries le
       WHERE le.party_id = p.id
         AND (le.reference_type = 'manual' OR le.account_type IN ('PARTY_PAYABLE', 'PARTY_RECEIVABLE'))
    ), 0)) AS computed
  FROM parties p
`;

const drifted = rows.filter(r => Math.abs(Number(r.stored) - Number(r.computed)) > 0.005);
console.log(`${rows.length} parties checked, ${drifted.length} with drift.`);
for (const r of drifted) {
  console.log(`  ${r.name} (${r.id}): stored ${r.stored} -> computed ${r.computed}`);
}

if (apply && drifted.length) {
  for (const r of drifted) {
    await prisma.party.update({ where: { id: r.id }, data: { balance: r.computed } });
  }
  console.log(`Applied ${drifted.length} corrections.`);
} else if (!apply) {
  console.log('Dry run — re-run with --apply to write corrections.');
}
await prisma.$disconnect();
