// =============================================================================
// Prisma Client Singleton
// =============================================================================
// Lazy so that importing this module never throws at boot (webhook.routes.ts
// builds its services at module scope — a constructor throw there kills the
// whole service before a single request is handled, health checks included).
// getPrisma() returns null when DATABASE_URL is not configured; callers must
// treat that as "resolution unavailable" and fail closed.
// =============================================================================

import type { PrismaClient } from '@prisma/client';
import { config } from '../config';

let client: PrismaClient | null = null;
let initFailed = false;

export function getPrisma(): PrismaClient | null {
  if (client) return client;
  if (initFailed || !config.database.url) return null;

  try {
    // Deferred require: @prisma/client throws on import when the client has
    // not been generated. That must degrade to "DB unavailable", not crash.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { PrismaClient: PC } = require('@prisma/client') as typeof import('@prisma/client');
    client = new PC();
    return client;
  } catch (error) {
    initFailed = true;
    console.error('Prisma client unavailable:', (error as Error).message);
    return null;
  }
}

export async function disconnectPrisma(): Promise<void> {
  if (client) {
    await client.$disconnect();
    client = null;
  }
}
