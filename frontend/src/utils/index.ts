import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number | string | null | undefined): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(amount) || 0);
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '—';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return '—';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    PAID: 'text-emerald-400 bg-emerald-400/10',
    ACTIVE: 'text-emerald-400 bg-emerald-400/10',
    AVAILABLE: 'text-emerald-400 bg-emerald-400/10',
    PARTIAL: 'text-amber-400 bg-amber-400/10',
    UNPAID: 'text-red-400 bg-red-400/10',
    CREDIT: 'text-blue-400 bg-blue-400/10',
    CANCELLED: 'text-gray-400 bg-gray-400/10',
    SOLD_OUT: 'text-purple-400 bg-purple-400/10',
    TRIAL: 'text-cyan-400 bg-cyan-400/10',
    EXPIRED: 'text-gray-500 bg-gray-500/10',
    PENDING: 'text-amber-400 bg-amber-400/10',
  };
  return colors[status] || 'text-gray-400 bg-gray-400/10';
}

export function truncate(str: string, length: number = 30): string {
  return str.length > length ? str.substring(0, length) + '...' : str;
}
