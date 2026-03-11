import { PrismaClient, Role } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import { getDatabaseUrlOrThrow } from '../database-url';

const connectionString = getDatabaseUrlOrThrow('prisma-seed');
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const ADMIN_EMAIL = 'admin@documind.com';
const ADMIN_PASSWORD = 'Admin123!';
const ADMIN_NAME = 'DocuMind Admin';

async function main() {
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);

  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {
      passwordHash,
      name: ADMIN_NAME,
      role: Role.ADMIN,
    },
    create: {
      email: ADMIN_EMAIL,
      passwordHash,
      name: ADMIN_NAME,
      role: Role.ADMIN,
    },
  });

  console.log('Admin user ready:', admin.email);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
