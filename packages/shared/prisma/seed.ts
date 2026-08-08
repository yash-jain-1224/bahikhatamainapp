import path from 'path';
import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';

// Load DATABASE_URL from the first .env that exists.
// Repo root .env wins; fall back to packages/shared/.env.
//
// `override: true` is essential and was missing. dotenv never overwrites a
// variable that is already in process.env, and the Prisma CLI loads
// packages/shared/.env *before* it spawns this script — so the root .env was
// always ignored and `npm run db:seed` silently seeded whatever
// packages/shared/.env pointed at (the shared Azure DB), regardless of local
// configuration.
//
// Note we cannot honour a pre-existing process.env.DATABASE_URL as "explicit
// intent", because by this point it is indistinguishable from the value the
// Prisma CLI just loaded out of packages/shared/.env. Use SEED_DATABASE_URL to
// target a specific database deliberately.
config({ path: path.resolve(__dirname, '../.env'), override: true });
config({ path: path.resolve(__dirname, '../../../.env'), override: true });

if (process.env.SEED_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.SEED_DATABASE_URL;
}

// Make the target unambiguous — seeding the wrong database is otherwise silent.
console.log(
  `🎯 Seeding: ${String(process.env.DATABASE_URL || '(unset)').replace(/\/\/[^@]*@/, '//***@')}`,
);

const prisma = new PrismaClient();

/**
 * Seed the database with essential data that must always be present.
 * Safe to run multiple times (idempotent — uses upsert).
 */
// ── Plan catalogue (Free + paid tiers) ───────────────────
// Prices are in INR. Quarterly/half-yearly/yearly include progressive discounts.
const PLANS = [
  {
    name: 'Free',
    slug: 'free',
    description: 'Get started for free — basic ledger, purchases & sales',
    price_monthly: 0,
    price_quarterly: 0,
    price_half_yearly: 0,
    price_yearly: 0,
    max_businesses: 1,
    max_users: 1,
    max_shops: 1,
    sort_order: 0,
    features: {
      ledger: true,
      purchase: true,
      purchases: true,
      sales: true,
      inventory: false,
      reports_basic: false,
      reports_advanced: false,
      import_export: false,
      multi_user: false,
      whatsapp: false,
      payments: true,
      api_access: false,
      white_label: false,
    },
  },
  {
    name: 'Basic',
    slug: 'basic',
    description: 'For growing shops — adds inventory & basic reports',
    price_monthly: 199,
    price_quarterly: 537, // ~10% off
    price_half_yearly: 1014, // ~15% off
    price_yearly: 1910, // ~20% off
    max_businesses: 1,
    max_users: 3,
    max_shops: 2,
    sort_order: 1,
    features: {
      ledger: true,
      purchase: true,
      purchases: true,
      sales: true,
      inventory: true,
      reports_basic: true,
      reports_advanced: false,
      import_export: true,
      multi_user: true,
      whatsapp: false,
      payments: true,
      api_access: false,
      white_label: false,
    },
  },
  {
    name: 'Pro',
    slug: 'pro',
    description: 'For established businesses — advanced reports & WhatsApp',
    price_monthly: 499,
    price_quarterly: 1347, // ~10% off
    price_half_yearly: 2544, // ~15% off
    price_yearly: 4790, // ~20% off
    max_businesses: 3,
    max_users: 10,
    max_shops: 5,
    sort_order: 2,
    features: {
      ledger: true,
      purchase: true,
      purchases: true,
      sales: true,
      inventory: true,
      reports_basic: true,
      reports_advanced: true,
      import_export: true,
      multi_user: true,
      whatsapp: true,
      payments: true,
      api_access: false,
      white_label: false,
    },
  },
  {
    name: 'Business',
    slug: 'business',
    description: 'For larger teams — unlimited scale, API access & white-label',
    price_monthly: 999,
    price_quarterly: 2697, // ~10% off
    price_half_yearly: 5094, // ~15% off
    price_yearly: 9590, // ~20% off
    max_businesses: 10,
    max_users: 50,
    max_shops: 25,
    sort_order: 3,
    features: {
      ledger: true,
      purchase: true,
      purchases: true,
      sales: true,
      inventory: true,
      reports_basic: true,
      reports_advanced: true,
      import_export: true,
      multi_user: true,
      whatsapp: true,
      payments: true,
      api_access: true,
      white_label: true,
    },
  },
] as const;

async function main() {
  console.log('🌱 Seeding database...');

  // ── Upsert all plans (idempotent) ──────────────────────
  for (const plan of PLANS) {
    const { slug, ...rest } = plan;
    const data = { ...rest, slug, is_active: true };
    const result = await prisma.plan.upsert({
      where: { slug },
      update: data,
      create: data,
    });
    console.log(`  ✅ ${result.name} plan: ${result.id} (slug: ${result.slug})`);
  }

  // Make sure existing plans have correct sort_order so Free appears first
  const allPlans = await prisma.plan.findMany({ orderBy: { sort_order: 'asc' } });
  let order = 0;
  for (const plan of allPlans) {
    if (plan.slug === 'free') {
      await prisma.plan.update({ where: { id: plan.id }, data: { sort_order: 0 } });
    } else {
      order += 1;
      await prisma.plan.update({ where: { id: plan.id }, data: { sort_order: order } });
    }
  }

  console.log(`  ✅ Sort order updated for ${allPlans.length} plans`);

  // NOTE: We no longer auto-assign the free plan to businesses without subscriptions.
  // Users must explicitly pick a plan after creating their business.
  // Existing businesses without a subscription will be prompted in the UI.

  console.log('🌱 Seeding complete!');
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    prisma.$disconnect();
    process.exit(1);
  });
