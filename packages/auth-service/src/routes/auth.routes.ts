import { Router } from 'express';
import {
  validate,
  authenticateToken,
  sendOtpSchema,
  verifyOtpSchema,
  refreshTokenSchema,
  loginWithEmailSchema,
  registerSchema,
} from '../shared';
import { sendOTP, verifyOTP, refreshToken, logout, me, loginWithEmail, register } from '../controllers/auth.controller';

const router = Router();

// ───────────────────────────────────────────────────────────
// NO IN-PROCESS RATE LIMITING
// ───────────────────────────────────────────────────────────
// `express-rate-limit` with the default MemoryStore keeps state
// inside a single Node.js process.  At 100K+ concurrent users
// (especially behind shared NATs / CGNATs / CDNs):
//
//   • The per-IP counters are NOT shared across replicas, so
//     horizontal scaling defeats the limiter entirely.
//   • Legitimate users who share an IP get collective 429s.
//   • Every page reload calls /refresh + /me, quickly exhausting
//     per-IP quotas that are low enough to actually stop abuse.
//
// Abuse protection (brute-force, credential stuffing) should be
// handled at the infrastructure layer:
//   • Nginx / HAProxy / Envoy   → `limit_req` zone keyed on $binary_remote_addr
//   • Cloudflare / AWS WAF      → managed rate-limit rules
//   • Redis-backed limiter      → shared across all replicas
//
// OTP phone-level throttling is still enforced in Redis via the
// OTP service logic (REDIS_KEYS.OTP_ATTEMPTS), which correctly
// shares state across all processes.
// ───────────────────────────────────────────────────────────

// Public routes
router.post('/send-otp', validate(sendOtpSchema), sendOTP);
router.post('/verify-otp', validate(verifyOtpSchema), verifyOTP);
router.post('/login', validate(loginWithEmailSchema), loginWithEmail);
router.post('/register', validate(registerSchema), register);

// Token refresh — every page reload triggers this; must never be throttled
router.post('/refresh-token', validate(refreshTokenSchema), refreshToken);
router.post('/refresh', validate(refreshTokenSchema), refreshToken);

// Protected routes (already authenticated)
router.post('/logout', authenticateToken, logout);
router.get('/me', authenticateToken, me);

export { router as authRoutes };
