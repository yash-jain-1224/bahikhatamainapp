import {
  formatCurrency,
  formatDate,
  formatDateTime,
  getStatusColor,
  truncate,
  getInitials,
} from '@/utils';

describe('formatCurrency', () => {
  it('formats positive numbers with ₹ prefix', () => {
    expect(formatCurrency(1000)).toBe('₹1,000');
  });

  it('formats large Indian numbers correctly', () => {
    expect(formatCurrency(123456)).toBe('₹1,23,456');
  });

  it('returns ₹0 for null', () => {
    expect(formatCurrency(null)).toBe('₹0');
  });

  it('returns ₹0 for undefined', () => {
    expect(formatCurrency(undefined)).toBe('₹0');
  });

  it('handles string numbers', () => {
    expect(formatCurrency('5000')).toBe('₹5,000');
  });

  it('handles decimal values', () => {
    const result = formatCurrency(1234.5);
    expect(result).toContain('₹');
    expect(result).toContain('1,234');
  });

  it('handles zero', () => {
    expect(formatCurrency(0)).toBe('₹0');
  });

  it('handles negative numbers', () => {
    const result = formatCurrency(-500);
    expect(result).toContain('₹');
  });
});

describe('formatDate', () => {
  it('formats a valid date string', () => {
    const result = formatDate('2024-01-15');
    expect(result).toBe('15 Jan 2024');
  });

  it('returns — for null', () => {
    expect(formatDate(null)).toBe('—');
  });

  it('returns — for undefined', () => {
    expect(formatDate(undefined)).toBe('—');
  });

  it('returns — for invalid date', () => {
    expect(formatDate('not-a-date')).toBe('—');
  });

  it('formats all 12 months correctly', () => {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    months.forEach((month, i) => {
      const date = `2024-${String(i + 1).padStart(2, '0')}-01`;
      expect(formatDate(date)).toContain(month);
    });
  });

  it('handles Date objects', () => {
    const result = formatDate(new Date('2024-06-20'));
    expect(result).toContain('Jun');
    expect(result).toContain('2024');
  });
});

describe('formatDateTime', () => {
  it('returns — for null', () => {
    expect(formatDateTime(null)).toBe('—');
  });

  it('includes date and time components', () => {
    const result = formatDateTime('2024-03-15T10:30:00');
    expect(result).toContain('Mar');
    expect(result).toContain('2024');
    expect(result).toContain(':');
  });

  it('pads single-digit hours and minutes', () => {
    const result = formatDateTime('2024-01-01T09:05:00');
    expect(result).toContain('09:05');
  });
});

describe('getStatusColor', () => {
  it('returns green for PAID', () => {
    const colors = getStatusColor('PAID');
    expect(colors.text).toBe('#34D399');
  });

  it('returns red for UNPAID', () => {
    const colors = getStatusColor('UNPAID');
    expect(colors.text).toBe('#F87171');
  });

  it('returns yellow for PARTIAL', () => {
    const colors = getStatusColor('PARTIAL');
    expect(colors.text).toBe('#FBBF24');
  });

  it('returns gray for CANCELLED', () => {
    const colors = getStatusColor('CANCELLED');
    expect(colors.text).toBe('#9CA3AF');
  });

  it('returns default gray for unknown status', () => {
    const colors = getStatusColor('UNKNOWN_STATUS');
    expect(colors.text).toBe('#9CA3AF');
  });

  it('returns both text and bg properties', () => {
    const colors = getStatusColor('PAID');
    expect(colors).toHaveProperty('text');
    expect(colors).toHaveProperty('bg');
  });

  it('handles all defined statuses', () => {
    const statuses = ['PAID','ACTIVE','AVAILABLE','PARTIAL','UNPAID','CREDIT','CANCELLED','SOLD_OUT','TRIAL','EXPIRED','PENDING'];
    statuses.forEach((status) => {
      const colors = getStatusColor(status);
      expect(colors.text).toBeTruthy();
      expect(colors.bg).toBeTruthy();
    });
  });
});

describe('truncate', () => {
  it('truncates strings longer than default 30 chars', () => {
    const long = 'This is a very long string that exceeds limit';
    const result = truncate(long);
    expect(result.length).toBeLessThanOrEqual(33); // 30 + '...'
    expect(result.endsWith('...')).toBe(true);
  });

  it('does not truncate short strings', () => {
    const short = 'Short';
    expect(truncate(short)).toBe('Short');
  });

  it('respects custom length', () => {
    const result = truncate('Hello World', 5);
    expect(result).toBe('Hello...');
  });

  it('handles exactly at limit', () => {
    const str = 'A'.repeat(30);
    expect(truncate(str)).toBe(str);
  });
});

describe('getInitials', () => {
  it('returns initials for two-word name', () => {
    expect(getInitials('John Doe')).toBe('JD');
  });

  it('returns single initial for one-word name', () => {
    expect(getInitials('Alice')).toBe('A');
  });

  it('returns uppercase initials', () => {
    expect(getInitials('rahul kumar')).toBe('RK');
  });

  it('handles three-word names (returns first two)', () => {
    const result = getInitials('Yash Kumar Jain');
    expect(result).toBe('YK');
  });

  it('handles empty string gracefully', () => {
    const result = getInitials('');
    expect(result).toBe('');
  });
});
