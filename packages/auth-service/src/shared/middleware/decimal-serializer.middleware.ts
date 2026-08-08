import type { Request, Response, NextFunction } from 'express';
import { Decimal } from '@prisma/client/runtime/library';

/**
 * Recursively converts Prisma Decimal objects (and decimal strings) to JS numbers
 * so that API responses always return numeric values, not strings.
 */
function serializeDecimals(value: unknown): unknown {
  if (value === null || value === undefined) return value;

  // Prisma Decimal instance → JS number
  if (value instanceof Decimal) return Number(value);

  // Date objects must pass through untouched (JSON.stringify handles them as ISO strings)
  if (value instanceof Date) return value;

  if (Array.isArray(value)) return value.map(serializeDecimals);

  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = serializeDecimals(v);
    }
    return result;
  }

  return value;
}

/**
 * Express middleware that patches res.json to serialize Prisma Decimals as numbers.
 */
export function decimalSerializerMiddleware(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  const originalJson = res.json.bind(res);
  res.json = function (body: unknown) {
    return originalJson(serializeDecimals(body));
  };
  next();
}
