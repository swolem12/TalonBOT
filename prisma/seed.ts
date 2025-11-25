/**
 * TalonBOT Database Seed
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create default bot settings
  await prisma.botSettings.upsert({
    where: { key: 'welcome_message' },
    update: {},
    create: {
      key: 'welcome_message',
      value: JSON.stringify('Welcome to the group! Use !help to see available commands.'),
    },
  });

  await prisma.botSettings.upsert({
    where: { key: 'auto_mod_enabled' },
    update: {},
    create: {
      key: 'auto_mod_enabled',
      value: JSON.stringify(false),
    },
  });

  await prisma.botSettings.upsert({
    where: { key: 'store_messages' },
    update: {},
    create: {
      key: 'store_messages',
      value: JSON.stringify(true),
    },
  });

  console.log('✅ Database seeded successfully');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
