// =============================================================================
// PII Masking for Logs - Prevents sensitive data from leaking into logs
// =============================================================================
// Masks: phone numbers, GSTIN, bank account numbers, UPI IDs, Aadhaar,
// PAN numbers, email addresses, and API keys
// =============================================================================

export interface PIIMaskConfig {
  maskPhone: boolean;
  maskGSTIN: boolean;
  maskBank: boolean;
  maskUPI: boolean;
  maskAadhaar: boolean;
  maskPAN: boolean;
  maskEmail: boolean;
  maskAPIKey: boolean;
}

const DEFAULT_CONFIG: PIIMaskConfig = {
  maskPhone: true,
  maskGSTIN: true,
  maskBank: true,
  maskUPI: true,
  maskAadhaar: true,
  maskPAN: true,
  maskEmail: true,
  maskAPIKey: true,
};

// ─── PII Detection Patterns ─────────────────────────────────────────────────

const PII_PATTERNS: Array<{
  name: string;
  configKey: keyof PIIMaskConfig;
  regex: RegExp;
  mask: (match: string) => string;
}> = [
  {
    name: 'phone_india',
    configKey: 'maskPhone',
    regex: /(\+?91[\s-]?)?[6-9]\d{9}/g,
    mask: (m) => m.slice(0, -4).replace(/\d/g, '*') + m.slice(-4),
  },
  {
    name: 'phone_international',
    configKey: 'maskPhone',
    regex: /\+\d{10,15}/g,
    mask: (m) => m.slice(0, 4) + '*'.repeat(m.length - 8) + m.slice(-4),
  },
  {
    name: 'gstin',
    configKey: 'maskGSTIN',
    regex: /\d{2}[A-Z]{5}\d{4}[A-Z]\d[A-Z\d][A-Z\d]/g,
    mask: (m) => m.slice(0, 2) + '***' + m.slice(5, 9) + '***' + m.slice(-2),
  },
  {
    name: 'aadhaar',
    configKey: 'maskAadhaar',
    regex: /\d{4}[\s-]?\d{4}[\s-]?\d{4}/g,
    mask: (m) => '****-****-' + m.replace(/[\s-]/g, '').slice(-4),
  },
  {
    name: 'pan',
    configKey: 'maskPAN',
    regex: /[A-Z]{5}\d{4}[A-Z]/g,
    mask: (m) => m.slice(0, 2) + '***' + m.slice(5, 8) + '**',
  },
  {
    name: 'upi',
    configKey: 'maskUPI',
    regex: /[\w.-]+@[\w]+/g,
    mask: (m) => {
      const parts = m.split('@');
      if (parts[0].length <= 3) return '***@' + parts[1];
      return parts[0].slice(0, 2) + '***@' + parts[1];
    },
  },
  {
    name: 'bank_account',
    configKey: 'maskBank',
    regex: /\d{9,18}/g,
    mask: (m) => {
      if (m.length < 9) return m; // Don't mask short numbers
      return '*'.repeat(m.length - 4) + m.slice(-4);
    },
  },
  {
    name: 'api_key',
    configKey: 'maskAPIKey',
    regex: /(?:sk|pk|key|token|secret|api[_-]?key)[_-]?[a-zA-Z0-9_]{20,}/gi,
    mask: (m) => m.slice(0, 8) + '***' + m.slice(-4),
  },
  {
    name: 'email',
    configKey: 'maskEmail',
    regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    mask: (m) => {
      const [local, domain] = m.split('@');
      const maskedLocal = local.slice(0, 2) + '***';
      return maskedLocal + '@' + domain;
    },
  },
];

/**
 * Mask PII in a string
 */
export function maskPII(text: string, customConfig?: Partial<PIIMaskConfig>): string {
  const cfg = { ...DEFAULT_CONFIG, ...customConfig };
  let masked = text;

  for (const pattern of PII_PATTERNS) {
    if (!cfg[pattern.configKey]) continue;
    masked = masked.replace(pattern.regex, pattern.mask);
  }

  return masked;
}

/**
 * Mask PII in an object (deep)
 */
export function maskPIIInObject(obj: unknown, config?: Partial<PIIMaskConfig>): unknown {
  if (typeof obj === 'string') {
    return maskPII(obj, config);
  }
  if (Array.isArray(obj)) {
    return obj.map(item => maskPIIInObject(item, config));
  }
  if (obj && typeof obj === 'object') {
    const masked: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      // Completely redact known sensitive field names
      if (['password', 'secret', 'token', 'apiKey', 'accessToken', 'refreshToken'].includes(key)) {
        masked[key] = '[REDACTED]';
      } else {
        masked[key] = maskPIIInObject(value, config);
      }
    }
    return masked;
  }
  return obj;
}

// ─── Secure Logger Wrapper ───────────────────────────────────────────────────

export class SecureLogger {
  private context: string;
  private config: PIIMaskConfig;

  constructor(context: string, config?: Partial<PIIMaskConfig>) {
    this.context = context;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  info(message: string, data?: unknown): void {
    const maskedMsg = maskPII(message, this.config);
    const maskedData = data ? maskPIIInObject(data, this.config) : undefined;
    console.log(`[${this.context}] ${maskedMsg}`, maskedData || '');
  }

  warn(message: string, data?: unknown): void {
    const maskedMsg = maskPII(message, this.config);
    const maskedData = data ? maskPIIInObject(data, this.config) : undefined;
    console.warn(`⚠️ [${this.context}] ${maskedMsg}`, maskedData || '');
  }

  error(message: string, error?: unknown): void {
    const maskedMsg = maskPII(message, this.config);
    if (error instanceof Error) {
      const maskedError = maskPII(error.message, this.config);
      console.error(`❌ [${this.context}] ${maskedMsg}:`, maskedError);
    } else {
      const maskedData = error ? maskPIIInObject(error, this.config) : undefined;
      console.error(`❌ [${this.context}] ${maskedMsg}`, maskedData || '');
    }
  }

  debug(message: string, data?: unknown): void {
    if (process.env.NODE_ENV === 'production') return;
    const maskedMsg = maskPII(message, this.config);
    const maskedData = data ? maskPIIInObject(data, this.config) : undefined;
    console.debug(`🔍 [${this.context}] ${maskedMsg}`, maskedData || '');
  }

  /**
   * Audit log entry - always logged, with structured format
   */
  audit(action: string, details: Record<string, unknown>): void {
    const entry = {
      timestamp: new Date().toISOString(),
      context: this.context,
      action,
      details: maskPIIInObject(details, this.config),
    };
    console.log(`📋 [AUDIT] ${JSON.stringify(entry)}`);
  }
}
