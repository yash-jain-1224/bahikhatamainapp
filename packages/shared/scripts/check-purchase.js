const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
async function main() {
  const purchase = await p.purchase.findFirst({ where: { purchase_number: 'PUR-AA2F-MPY2B7VF-72FK' }, select: { id:true, subtotal:true, gst_amount:true, discount:true, round_off:true, direct_expense:true, indirect_expense:true, cutter_cost:true, total_amount:true, paid_amount:true, balance_amount:true } });
  console.log('Purchase:', JSON.stringify(purchase, null, 2));
  const partyAmount = Number(purchase.subtotal) + Number(purchase.gst_amount) - Number(purchase.discount) + Number(purchase.round_off);
  console.log('Party Amount (subtotal+gst-discount+roundoff):', partyAmount);
  console.log('Total Amount (includes expenses/cutter):', Number(purchase.total_amount));
}
main().catch(console.error).finally(() => p.$disconnect());
