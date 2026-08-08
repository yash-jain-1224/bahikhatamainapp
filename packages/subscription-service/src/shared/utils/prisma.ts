import { PrismaClient } from '@prisma/client';

let prisma: PrismaClient;

declare global {
  var __prisma: PrismaClient | undefined;
}

export function getPrismaClient(): PrismaClient {
  if (!prisma) {
    // Limit connection pool to 5 per service (13 services × 5 = 65, well within PG default of 100)
    const datasourceUrl = process.env.DATABASE_URL
      ? `${process.env.DATABASE_URL}${process.env.DATABASE_URL.includes('?') ? '&' : '?'}connection_limit=5&pool_timeout=10`
      : undefined;

    if (process.env.NODE_ENV === 'production') {
      prisma = new PrismaClient({
        log: ['error', 'warn'],
        datasourceUrl,
      });
    } else {
      // In development, reuse client across hot reloads
      if (!global.__prisma) {
        global.__prisma = new PrismaClient({
          log: ['error', 'warn'],
          datasourceUrl,
        });
      }
      prisma = global.__prisma;
    }
  }
  return prisma;
}

export { PrismaClient };
