// Runs before test modules load (jest setupFiles) — config/index.ts reads
// process.env at import time, so these must be in place first.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
process.env.API_GATEWAY_URL = 'http://gateway.test';
delete process.env.WHATSAPP_AI_ALLOW_INSECURE_DEV;
