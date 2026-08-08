import { v4 as uuidv4 } from 'uuid';
import { DEFAULT_PAGE, DEFAULT_LIMIT, MAX_LIMIT } from '../constants';
import { PaginationParams } from '../types';

/**
 * Generate a unique ID
 */
export function generateId(): string {
  return uuidv4();
}

/**
 * Generate a unique reference number
 */
export function generateReferenceNumber(prefix: string, businessId: string): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  const bizShort = businessId.substring(0, 4).toUpperCase();
  return `${prefix}-${bizShort}-${timestamp}-${random}`;
}

/**
 * Parse pagination parameters
 */
export function parsePagination(query: Record<string, unknown>): PaginationParams {
  return {
    page: Math.max(1, Number(query.page) || DEFAULT_PAGE),
    limit: Math.min(MAX_LIMIT, Math.max(1, Number(query.limit) || DEFAULT_LIMIT)),
    sortBy: (query.sortBy as string) || 'created_at',
    sortOrder: (query.sortOrder as 'asc' | 'desc') || 'desc',
  };
}

/**
 * Calculate pagination offset
 */
export function getPaginationOffset(page: number, limit: number): number {
  return (page - 1) * limit;
}

/**
 * Build paginated response metadata
 */
export function buildPaginationMeta(total: number, page: number, limit: number) {
  const totalPages = Math.ceil(total / limit);
  return {
    total,
    page,
    limit,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}

/**
 * Generate OTP
 */
export function generateOTP(length: number = 6): string {
  const digits = '0123456789';
  let otp = '';
  for (let i = 0; i < length; i++) {
    otp += digits[Math.floor(Math.random() * 10)];
  }
  return otp;
}

/**
 * Calculate financial dates
 */
export function getFinancialYearDates(startMonth: number = 4): { start: Date; end: Date } {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const start = currentMonth >= startMonth
    ? new Date(currentYear, startMonth - 1, 1)
    : new Date(currentYear - 1, startMonth - 1, 1);

  const end = currentMonth >= startMonth
    ? new Date(currentYear + 1, startMonth - 1, 0)
    : new Date(currentYear, startMonth - 1, 0);

  return { start, end };
}

/**
 * Sanitize string input
 */
export function sanitize(input: string): string {
  return input
    .replace(/[<>]/g, '')
    .replace(/&/g, '&amp;')
    .trim();
}

/**
 * Mask phone number
 */
export function maskPhone(phone: string): string {
  if (phone.length < 4) return '****';
  return `${'*'.repeat(phone.length - 4)}${phone.slice(-4)}`;
}

/**
 * Sleep utility for retry logic
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
