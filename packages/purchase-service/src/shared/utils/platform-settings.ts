import { getPrismaClient } from './prisma';
import { createLogger } from './logger';

const logger = createLogger('platform-settings');

/**
 * Platform settings, stored by the admin console as feature flags with a null
 * business_id and a `PLATFORM_` prefix.
 *
 * These were write-only for their whole existence: the Settings screen saved
 * twelve of them and reported success, but nothing anywhere read them back.
 * Toggling Maintenance Mode did not block anyone; turning off User Registration
 * did not stop signups. This module is the read side.
 *
 * Values are cached briefly. Every authenticated request may consult these, and
 * settings change perhaps a few times a year — a per-request query across 13
 * services would be a lot of load for data that is almost always identical. The
 * trade is that a change takes up to CACHE_TTL_MS to take effect everywhere.
 */
const CACHE_TTL_MS = 30_000;

export interface PlatformSettings {
  maintenanceMode: boolean;
  registrationEnabled: boolean;
  maxBusinessesPerUser: number;
  maxUsersPerBusiness: number;
  otpExpiryMinutes: number;
  sessionTimeoutMinutes: number;
  emailNotifications: boolean;
  smsNotifications: boolean;
  autoBackupEnabled: boolean;
  backupFrequencyHours: number;
  appName: string;
  supportEmail: string;
  [key: string]: unknown;
}

/**
 * Used when a setting has never been saved, and when the lookup fails.
 *
 * Deliberately permissive: if the settings read breaks, the platform must keep
 * working. Defaulting maintenanceMode to true on a failed query would take the
 * whole product down precisely when the database is already unhappy.
 */
export const PLATFORM_SETTING_DEFAULTS: PlatformSettings = {
  maintenanceMode: false,
  registrationEnabled: true,
  maxBusinessesPerUser: 5,
  maxUsersPerBusiness: 10,
  otpExpiryMinutes: 5,
  sessionTimeoutMinutes: 60,
  emailNotifications: true,
  smsNotifications: true,
  autoBackupEnabled: true,
  backupFrequencyHours: 24,
  appName: 'Bahi Khata Pro',
  supportEmail: 'support@bahikhata.pro',
};

let cache: { at: number; values: PlatformSettings } | null = null;

/** Unwraps the `{ value: X }` envelope the admin console writes scalars into. */
function unwrap(config: unknown, isEnabled: boolean): unknown {
  if (config && typeof config === 'object' && !Array.isArray(config)) {
    const obj = config as Record<string, unknown>;
    if (Object.keys(obj).length === 1 && 'value' in obj) return obj.value;
    return obj;
  }
  return isEnabled;
}

export async function getPlatformSettings(): Promise<PlatformSettings> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.values;

  try {
    const prisma = getPrismaClient();
    const flags = await prisma.featureFlag.findMany({
      where: { business_id: null, feature: { startsWith: 'PLATFORM_' } },
    });

    const values: PlatformSettings = { ...PLATFORM_SETTING_DEFAULTS };
    for (const flag of flags) {
      const key = flag.feature.replace('PLATFORM_', '');
      const raw = unwrap(flag.config, flag.is_enabled);
      if (raw === undefined || raw === null) continue;

      // Coerce to the type of the default so a value stored as a string still
      // behaves — a sessionTimeoutMinutes of "90" must not become NaN.
      const fallback = (PLATFORM_SETTING_DEFAULTS as Record<string, unknown>)[key];
      if (typeof fallback === 'boolean') {
        values[key] = typeof raw === 'boolean' ? raw : raw === 'true';
      } else if (typeof fallback === 'number') {
        const n = Number(raw);
        if (Number.isFinite(n)) values[key] = n;
      } else {
        values[key] = raw;
      }
    }

    cache = { at: Date.now(), values };
    return values;
  } catch (error) {
    // Never let a settings lookup take down the request it is attached to.
    logger.warn('Platform settings lookup failed; using defaults', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ...PLATFORM_SETTING_DEFAULTS };
  }
}

export async function getPlatformSetting<K extends keyof PlatformSettings>(
  key: K,
): Promise<PlatformSettings[K]> {
  const settings = await getPlatformSettings();
  return settings[key];
}

/** Call after a write so the change is visible without waiting out the TTL. */
export function clearPlatformSettingsCache(): void {
  cache = null;
}
