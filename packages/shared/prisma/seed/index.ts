import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // =========================================================================
  // 1. Create Plans
  // =========================================================================
  const plans = await Promise.all([
    prisma.plan.upsert({
      where: { slug: 'basic' },
      update: {},
      create: {
        id: uuidv4(),
        name: 'Basic',
        slug: 'basic',
        description: 'Perfect for small businesses just getting started',
        price_monthly: 299,
        price_quarterly: 799,
        price_half_yearly: 1499,
        price_yearly: 2699,
        max_businesses: 1,
        max_users: 2,
        max_shops: 1,
        features: {
          purchases: true,
          sales: true,
          inventory: true,
          ledger: true,
          payments: true,
          reports_basic: true,
          reports_advanced: false,
          whatsapp: false,
          api_access: false,
          white_label: false,
          max_parties: 100,
          max_items: 200,
        },
        sort_order: 1,
      },
    }),
    prisma.plan.upsert({
      where: { slug: 'growth' },
      update: {},
      create: {
        id: uuidv4(),
        name: 'Growth',
        slug: 'growth',
        description: 'For growing businesses that need more power',
        price_monthly: 799,
        price_quarterly: 2149,
        price_half_yearly: 3999,
        price_yearly: 7199,
        max_businesses: 3,
        max_users: 10,
        max_shops: 5,
        features: {
          purchases: true,
          sales: true,
          inventory: true,
          ledger: true,
          payments: true,
          reports_basic: true,
          reports_advanced: true,
          whatsapp: true,
          api_access: false,
          white_label: false,
          max_parties: 1000,
          max_items: 2000,
        },
        sort_order: 2,
      },
    }),
    prisma.plan.upsert({
      where: { slug: 'enterprise' },
      update: {},
      create: {
        id: uuidv4(),
        name: 'Enterprise',
        slug: 'enterprise',
        description: 'For large businesses with advanced needs',
        price_monthly: 2499,
        price_quarterly: 6749,
        price_half_yearly: 12499,
        price_yearly: 22499,
        max_businesses: 10,
        max_users: 50,
        max_shops: 20,
        features: {
          purchases: true,
          sales: true,
          inventory: true,
          ledger: true,
          payments: true,
          reports_basic: true,
          reports_advanced: true,
          whatsapp: true,
          api_access: true,
          white_label: true,
          max_parties: -1, // unlimited
          max_items: -1,
        },
        sort_order: 3,
      },
    }),
  ]);
  console.log(`✅ Created ${plans.length} plans`);

  // =========================================================================
  // 2. Create Default Expense Types (template)
  // =========================================================================
  // These will be cloned per business on business creation
  console.log('✅ Default expense types will be created per business');

  // =========================================================================
  // 3. Create Super Admin User
  // =========================================================================
  const superAdmin = await prisma.user.upsert({
    where: { phone: '9999999999' },
    update: {},
    create: {
      id: uuidv4(),
      phone: '9999999999',
      name: 'Super Admin',
      email: 'admin@bahikhata.pro',
      is_super_admin: true,
      is_active: true,
    },
  });
  console.log(`✅ Super admin created: ${superAdmin.phone}`);

  // =========================================================================
  // 4. Create Demo Business
  // =========================================================================
  const demoBusiness = await prisma.business.upsert({
    where: { id: 'demo-business-001' },
    update: {},
    create: {
      id: 'demo-business-001',
      name: 'Demo Mandi Trading Co.',
      type: 'MANDI',
      phone: '9999999999',
      email: 'demo@bahikhata.pro',
      city: 'Delhi',
      state: 'Delhi',
      pincode: '110001',
      invoice_prefix: 'DEM',
      purchase_prefix: 'DEM-P',
    },
  });

  // Link super admin as owner
  await prisma.businessUser.upsert({
    where: {
      user_id_business_id: {
        user_id: superAdmin.id,
        business_id: demoBusiness.id,
      },
    },
    update: {},
    create: {
      id: uuidv4(),
      user_id: superAdmin.id,
      business_id: demoBusiness.id,
      role: 'OWNER',
    },
  });

  // Create default expense types for demo business
  const defaultExpenses = [
    { name: 'Freight', category: 'DIRECT' as const },
    { name: 'Loading', category: 'DIRECT' as const },
    { name: 'Transport', category: 'DIRECT' as const },
    { name: 'Packaging', category: 'DIRECT' as const },
    { name: 'Labour', category: 'INDIRECT' as const },
    { name: 'Polish', category: 'INDIRECT' as const },
    { name: 'Royalties', category: 'INDIRECT' as const },
    { name: 'Commission', category: 'INDIRECT' as const },
    { name: 'Misc', category: 'INDIRECT' as const },
  ];

  for (const expense of defaultExpenses) {
    await prisma.expenseType.upsert({
      where: {
        business_id_name_category: {
          business_id: demoBusiness.id,
          name: expense.name,
          category: expense.category,
        },
      },
      update: {},
      create: {
        id: uuidv4(),
        business_id: demoBusiness.id,
        name: expense.name,
        category: expense.category,
        is_default: true,
      },
    });
  }
  console.log(`✅ Demo business created with default expense types`);

  // Create trial subscription
  const basicPlan = plans[0];
  const trialEnd = new Date();
  trialEnd.setDate(trialEnd.getDate() + 14);

  await prisma.subscription.upsert({
    where: { id: 'demo-subscription-001' },
    update: {},
    create: {
      id: 'demo-subscription-001',
      business_id: demoBusiness.id,
      plan_id: basicPlan.id,
      billing_cycle: 'MONTHLY',
      status: 'TRIAL',
      trial_ends_at: trialEnd,
      current_period_start: new Date(),
      current_period_end: trialEnd,
    },
  });
  console.log(`✅ Trial subscription created`);

  // Create demo parties
  const parties = await Promise.all([
    prisma.party.create({
      data: {
        id: uuidv4(),
        business_id: demoBusiness.id,
        name: 'Ramesh Kumar (Supplier)',
        phone: '9876543210',
        type: 'SUPPLIER',
        city: 'Azadpur',
        state: 'Delhi',
      },
    }),
    prisma.party.create({
      data: {
        id: uuidv4(),
        business_id: demoBusiness.id,
        name: 'Suresh Traders (Customer)',
        phone: '9876543211',
        type: 'CUSTOMER',
        city: 'Chandni Chowk',
        state: 'Delhi',
      },
    }),
    prisma.party.create({
      data: {
        id: uuidv4(),
        business_id: demoBusiness.id,
        name: 'Mahesh & Sons (Both)',
        phone: '9876543212',
        type: 'BOTH',
        city: 'Sadar Bazaar',
        state: 'Delhi',
      },
    }),
  ]);
  console.log(`✅ Created ${parties.length} demo parties`);

  // Create demo inventory items
  const items = await Promise.all([
    prisma.inventoryItem.create({
      data: {
        id: uuidv4(),
        business_id: demoBusiness.id,
        name: 'Apple - Kashmir',
        sku: 'APL-KSH',
        unit: 'KG',
        min_stock: 100,
      },
    }),
    prisma.inventoryItem.create({
      data: {
        id: uuidv4(),
        business_id: demoBusiness.id,
        name: 'Mango - Alphonso',
        sku: 'MNG-ALP',
        unit: 'KG',
        min_stock: 50,
      },
    }),
    prisma.inventoryItem.create({
      data: {
        id: uuidv4(),
        business_id: demoBusiness.id,
        name: 'Potato - Fresh',
        sku: 'POT-FRH',
        unit: 'KG',
        min_stock: 200,
      },
    }),
  ]);
  console.log(`✅ Created ${items.length} demo inventory items`);

  // Create demo cutter
  await prisma.cutter.create({
    data: {
      id: uuidv4(),
      business_id: demoBusiness.id,
      name: 'Raju Cutter',
      phone: '9876543213',
      rate_per_unit: 2.5,
      unit: 'KG',
    },
  });
  console.log(`✅ Created demo cutter`);

  console.log('\n🎉 Database seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
