/**
 * Grant (or revoke) super-admin on a user — production currently has ZERO
 * super admins, so nothing under /admin is reachable until one is set.
 *
 * Usage:
 *   node scripts/set-super-admin.mjs --email owner@example.com            # dry run
 *   node scripts/set-super-admin.mjs --email owner@example.com --apply    # grant
 *   node scripts/set-super-admin.mjs --email owner@example.com --revoke --apply
 *   node scripts/set-super-admin.mjs --list                               # show current super admins
 *
 * DATABASE_URL must point at the target database. Dry run first.
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(repoRoot, 'package.json'));
const { PrismaClient } = require('@prisma/client');

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const revoke = args.includes('--revoke');
const list = args.includes('--list');
const emailIdx = args.indexOf('--email');
const email = emailIdx !== -1 ? args[emailIdx + 1] : null;

const prisma = new PrismaClient();

const admins = await prisma.user.findMany({
  where: { is_super_admin: true },
  select: { id: true, email: true, name: true, is_active: true },
});
console.log(`Current super admins: ${admins.length}`);
for (const a of admins) console.log(`  ${a.email}  (${a.name}, active=${a.is_active})`);

if (list) {
  await prisma.$disconnect();
  process.exit(0);
}

if (!email) {
  console.error('\nMissing --email <address> (or use --list). No changes made.');
  await prisma.$disconnect();
  process.exit(1);
}

const user = await prisma.user.findFirst({
  where: { email },
  select: { id: true, email: true, name: true, is_active: true, is_super_admin: true },
});
if (!user) {
  console.error(`\nNo user with email ${email}. No changes made.`);
  await prisma.$disconnect();
  process.exit(1);
}

const target = !revoke;
console.log(`\nTarget: ${user.email} (${user.name}, active=${user.is_active}, is_super_admin=${user.is_super_admin})`);

if (user.is_super_admin === target) {
  console.log(`Already is_super_admin=${target}. Nothing to do.`);
} else if (revoke && admins.length <= 1 && user.is_super_admin) {
  console.error('Refusing to revoke the last super admin.');
} else if (!apply) {
  console.log(`DRY RUN — would set is_super_admin=${target}. Re-run with --apply to write.`);
} else {
  await prisma.user.update({ where: { id: user.id }, data: { is_super_admin: target } });
  console.log(`APPLIED — ${user.email} is_super_admin=${target}.`);
}

await prisma.$disconnect();
