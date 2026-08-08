import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JwtPayload, AuthenticatedRequest } from '../types';
import { getPlatformSettings } from '../utils/platform-settings';

const JWT_SECRET = process.env.JWT_SECRET || 'bahi-khata-pro-secret-key-change-in-production';

export function authenticateToken(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({
      success: false,
      message: 'Access token is required',
    });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    (req as unknown as AuthenticatedRequest).user = decoded;
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        success: false,
        message: 'Token has expired',
      });
      return;
    }
    // 401, not 403. A token that fails verification is a *credentials* problem,
    // and the frontend's axios interceptor only attempts a silent refresh (and
    // only falls back to logout + redirect to /login) on 401. Returning 403
    // here meant any token that was malformed or signed with a different
    // secret — exactly what happens after a JWT_SECRET rotation — left the user
    // permanently wedged: every request 403s, no refresh is attempted, no
    // logout fires, and the app renders empty states forever with no way back
    // to the login screen.
    //
    // 403 stays reserved for "authenticated but not permitted", which is what
    // requireSuperAdmin/requireBusiness/requireInternalService return — those
    // must NOT log the user out.
    res.status(401).json({
      success: false,
      message: 'Invalid token',
    });
  }
}

/**
 * Enforces the Platform Settings "Maintenance Mode" toggle.
 *
 * The admin console has always been able to save this flag and report success;
 * nothing read it, so the platform stayed fully open while the switch showed as
 * on. Mount it after authenticateToken so super admins — the people who need to
 * work during a maintenance window, including the ones turning the flag back
 * off — are exempt.
 *
 * Reads are cached (see platform-settings) and fall back to "not in
 * maintenance" if the lookup fails, so this can never lock everyone out because
 * of a transient database problem.
 */
export async function checkMaintenanceMode(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authReq = req as unknown as AuthenticatedRequest;
  if (authReq.user?.isSuperAdmin) {
    next();
    return;
  }

  const settings = await getPlatformSettings();
  if (settings.maintenanceMode) {
    res.status(503).json({
      success: false,
      message: 'The platform is temporarily unavailable for maintenance. Please try again shortly.',
      code: 'MAINTENANCE_MODE',
    });
    return;
  }

  next();
}

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
  const authReq = req as unknown as AuthenticatedRequest;
  if (!authReq.user?.isSuperAdmin) {
    res.status(403).json({
      success: false,
      message: 'Super admin access required',
    });
    return;
  }
  next();
}

function timingSafeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Guard for service-to-service endpoints that must never be callable by an
 * end user's access token — e.g. "this account has now paid, grant the
 * rewards". A normal user JWT is not sufficient authority for these.
 *
 * Follows the existing convention: caller presents `X-Internal-Key`, compared
 * against the INTERNAL_SERVICE_KEY env var. A super admin JWT is also accepted
 * so these can be driven manually from the admin console.
 *
 * FAILS CLOSED: if INTERNAL_SERVICE_KEY is not configured the route is
 * refused, so a missing env var can never silently open the endpoint up.
 */
export function requireInternalService(req: Request, res: Response, next: NextFunction): void {
  const authReq = req as unknown as AuthenticatedRequest;

  // Super admins may invoke internal endpoints directly.
  if (authReq.user?.isSuperAdmin) {
    next();
    return;
  }

  const internalKey = process.env.INTERNAL_SERVICE_KEY;
  if (!internalKey) {
    res.status(503).json({
      success: false,
      message: 'Internal endpoint is not configured. Set INTERNAL_SERVICE_KEY to enable it.',
    });
    return;
  }

  const provided = req.headers['x-internal-key'] as string | undefined;
  if (!provided || !timingSafeEquals(provided, internalKey)) {
    res.status(403).json({
      success: false,
      message: 'Internal service credentials required',
    });
    return;
  }

  next();
}
