// =============================================================================
// Security Middleware Tests
// =============================================================================

import { maskPII, maskPIIInObject } from '../src/middleware/pii-masking';
import { sanitizeInput } from '../src/middleware/sanitize';

describe('PII masking', () => {
  test('phone numbers', () => {
    expect(maskPII('Call me at 9876543210')).toContain('****3210');
    expect(maskPII('WhatsApp: +919876543210')).toContain('3210');
  });

  test('GSTIN', () => {
    expect(maskPII('GSTIN: 27AAPFU0939F1ZV')).not.toContain('AAPFU0939F1ZV');
    expect(maskPII('GSTIN: 27AAPFU0939F1ZV')).toContain('27');
  });

  test('PAN', () => {
    expect(maskPII('PAN: ABCDE1234F')).not.toContain('ABCDE1234F');
  });

  test('email', () => {
    const maskedEmail = maskPII('Contact: john.doe@example.com');
    expect(maskedEmail).not.toContain('john.doe');
    expect(maskedEmail).toContain('@example.com');
  });

  test('objects', () => {
    const obj = {
      name: 'Rajesh',
      phone: '9876543210',
      password: 'secret123',
      gstin: '27AAPFU0939F1ZV',
    };
    const masked = maskPIIInObject(obj) as Record<string, unknown>;
    expect(masked.password).toBe('[REDACTED]');
    expect(typeof masked.phone).toBe('string');
    expect(masked.phone as string).toContain('****');
  });

  test('API keys', () => {
    // Synthetic value, deliberately not in any payment/cloud vendor's live-key
    // format — a realistic-looking fixture trips GitHub push protection.
    expect(
      maskPII('key: token_abcdefghijklmnopqrstuvwx')
    ).not.toContain('abcdefghijklmnopqrstuvwx');
  });
});

describe('Input sanitization', () => {
  function testSanitize(body: unknown): unknown {
    const req = { body } as any;
    const res = {} as any;
    const next = () => {};
    sanitizeInput(req, res, next);
    return req.body;
  }

  test('XSS script tags removed, legitimate text preserved', () => {
    const xssResult = testSanitize({
      msg: '<script>alert("xss")</script>Hello',
    }) as any;
    expect(xssResult.msg).not.toContain('<script>');
    expect(xssResult.msg).toContain('Hello');
  });

  test('javascript: URI removed', () => {
    const jsUriResult = testSanitize({
      url: 'javascript:alert(1)',
    }) as any;
    expect(jsUriResult.url).not.toContain('javascript:');
  });

  test('Buffer bodies pass through untouched (webhook raw body)', () => {
    const buf = Buffer.from('{"object":"whatsapp_business_account"}');
    const result = testSanitize(buf);
    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result).toBe(buf);
  });
});
