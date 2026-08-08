// =============================================================================
// Gateway Client - Act-As-User Access to the Platform Services
// =============================================================================
// ADR-1: every accounting read/write goes through the existing service APIs
// (via the API gateway) so RBAC, tenancy, audit logging and ledger invariants
// are enforced exactly once, by the services that own them.
// ADR-2: services share JWT_SECRET; this client mints a short-lived (default
// 5 min) access token for the *mapped user* on every call, so permissions and
// audit attribution remain correct per user. User tokens are never stored.
// =============================================================================

import jwt from 'jsonwebtoken';
import axios, { AxiosError, AxiosInstance } from 'axios';
import { config } from '../config';
import { SecureLogger } from '../middleware/pii-masking';

const logger = new SecureLogger('GatewayClient');

/** The platform's standard response envelope. */
export interface Envelope<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  meta?: Record<string, unknown>;
}

/** The user this client acts as (resolved server-side from the WhatsApp phone). */
export interface ActingUser {
  userId: string;
  phone: string;
}

export class GatewayError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly path: string,
  ) {
    super(message);
    this.name = 'GatewayError';
  }

  /** True for failures the user can fix (validation, permissions, not found). */
  get isClientError(): boolean {
    return this.status >= 400 && this.status < 500;
  }
}

export class GatewayClient {
  private http: AxiosInstance;

  constructor(
    private readonly actor: ActingUser,
    private readonly businessId: string,
  ) {
    this.http = axios.create({
      baseURL: config.gateway.url,
      timeout: config.gateway.timeoutMs,
    });
  }

  // ─── Token Minting (ADR-2) ─────────────────────────────────────────────────

  private mintToken(): string {
    if (!config.auth.jwtSecret) {
      // Fail closed: without the shared secret we cannot act as the user.
      throw new GatewayError('JWT_SECRET not configured — cannot act as user', 503, '(mint)');
    }
    return jwt.sign(
      {
        userId: this.actor.userId,
        phone: this.actor.phone,
        // Never escalate: WhatsApp-originated actions are always a normal user,
        // even if the mapped account happens to be a super admin.
        isSuperAdmin: false,
      },
      config.auth.jwtSecret,
      { expiresIn: config.auth.actAsUserTokenTtlSeconds },
    );
  }

  // ─── Core Request ──────────────────────────────────────────────────────────

  async request<T = unknown>(
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown,
    params?: Record<string, string | number | boolean | undefined>,
  ): Promise<{ data: T; meta?: Record<string, unknown> }> {
    try {
      const response = await this.http.request<Envelope<T>>({
        method,
        url: path,
        data: body,
        params,
        headers: {
          Authorization: `Bearer ${this.mintToken()}`,
          'x-business-id': this.businessId,
          'Content-Type': 'application/json',
        },
      });

      const envelope = response.data;
      if (!envelope || envelope.success !== true) {
        throw new GatewayError(envelope?.message || 'Service reported failure', response.status, path);
      }
      return { data: envelope.data as T, meta: envelope.meta };
    } catch (error) {
      if (error instanceof GatewayError) throw error;

      const axiosErr = error as AxiosError<Envelope>;
      if (axiosErr.response) {
        const msg = axiosErr.response.data?.message || `HTTP ${axiosErr.response.status}`;
        // Never log request/response bodies here — they can carry PII.
        logger.warn(`Gateway ${method} ${path} → ${axiosErr.response.status}: ${msg}`);
        throw new GatewayError(msg, axiosErr.response.status, path);
      }

      logger.error(`Gateway ${method} ${path} unreachable: ${axiosErr.message}`);
      throw new GatewayError('Accounting service unreachable', 503, path);
    }
  }

  get<T = unknown>(path: string, params?: Record<string, string | number | boolean | undefined>) {
    return this.request<T>('GET', path, undefined, params);
  }

  post<T = unknown>(path: string, body: unknown) {
    return this.request<T>('POST', path, body);
  }

  patch<T = unknown>(path: string, body: unknown) {
    return this.request<T>('PATCH', path, body);
  }
}

/**
 * True when the platform data plane is reachable in principle (secret present).
 * Used by agents to decide between real execution and an honest "not
 * available" reply — never between real and fabricated output.
 */
export function isGatewayConfigured(): boolean {
  return Boolean(config.auth.jwtSecret);
}
