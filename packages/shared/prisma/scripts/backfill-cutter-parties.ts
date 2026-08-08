/**
 * Backfill: link every existing Cutter to a Party (type=CUTTER).
 *
 * Cutters created before the unification migration have no `party_id`.
 * This script:
 *   1. Creates a Party row (type=CUTTER) for each unlinked Cutter
 *      using the cutter's name / phone / business_id.
 *   2. Sets the cutter's party_id to the new party.
 *
 * Usage:
 *   DATABASE_URL=... npx ts-node packages/shared/prisma/scripts/backfill-cutter-parties.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const cutters = await prisma.cutter.findMany({
    where: { party_id: null },
    select: { id: true, business_id: true, name: true, phone: true },
  });

  console.log(`Found ${cutters.length} cutters to link.`);

  let linked = 0;
  for (const c of cutters) {
    await prisma.$transaction(async (tx) => {
      const party = await tx.party.create({
        data: {
          business_id: c.business_id,
          name: c.name,
          phone: c.phone,
          type: 'CUTTER' as any,
        },
      });
      await tx.cutter.update({
        where: { id: c.id },
        data: { party_id: party.id },
      });
      linked++;
    });
  }

  console.log(`Linked ${linked} cutters to unified Parties.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
