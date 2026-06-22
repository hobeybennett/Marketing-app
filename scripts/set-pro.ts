import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: npx tsx scripts/set-pro.ts <email>');
    process.exit(1);
  }

  const user = await prisma.user.update({
    where: { email },
    data: { subscriptionStatus: 'active' },
    select: { email: true, subscriptionStatus: true },
  });

  console.log(`✓ ${user.email} → subscriptionStatus: ${user.subscriptionStatus}`);
}

main().finally(() => prisma.$disconnect());
