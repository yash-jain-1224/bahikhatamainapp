export function formatCurrency(
  amount: number | string | null | undefined,
): string {
  const num = Number(amount) || 0;
  // Format in Indian numbering system (e.g., ₹1,23,456)
  const formatted = num.toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return `₹${formatted}`;
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '—';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '—';
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  return `${d.getDate().toString().padStart(2, '0')} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatDateTime(
  date: string | Date | null | undefined,
): string {
  if (!date) return '—';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '—';
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  const hours = d.getHours().toString().padStart(2, '0');
  const minutes = d.getMinutes().toString().padStart(2, '0');
  return `${d.getDate().toString().padStart(2, '0')} ${months[d.getMonth()]} ${d.getFullYear()}, ${hours}:${minutes}`;
}

export function getStatusColor(status: string): {
  text: string;
  bg: string;
} {
  const colors: Record<string, { text: string; bg: string }> = {
    PAID: { text: '#34D399', bg: 'rgba(16, 185, 129, 0.15)' },
    ACTIVE: { text: '#34D399', bg: 'rgba(16, 185, 129, 0.15)' },
    AVAILABLE: { text: '#34D399', bg: 'rgba(16, 185, 129, 0.15)' },
    PARTIAL: { text: '#FBBF24', bg: 'rgba(245, 158, 11, 0.15)' },
    UNPAID: { text: '#F87171', bg: 'rgba(239, 68, 68, 0.15)' },
    CREDIT: { text: '#60A5FA', bg: 'rgba(59, 130, 246, 0.15)' },
    CANCELLED: { text: '#9CA3AF', bg: 'rgba(156, 163, 175, 0.15)' },
    SOLD_OUT: { text: '#A78BFA', bg: 'rgba(139, 92, 246, 0.15)' },
    TRIAL: { text: '#22D3EE', bg: 'rgba(34, 211, 238, 0.15)' },
    EXPIRED: { text: '#6B7280', bg: 'rgba(107, 114, 128, 0.15)' },
    PENDING: { text: '#FBBF24', bg: 'rgba(245, 158, 11, 0.15)' },
  };
  return colors[status] || { text: '#9CA3AF', bg: 'rgba(156, 163, 175, 0.15)' };
}

export function truncate(str: string, length: number = 30): string {
  return str.length > length ? str.substring(0, length) + '...' : str;
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n.charAt(0))
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

// Re-export utilities
export * from './export';
export * from './import';
