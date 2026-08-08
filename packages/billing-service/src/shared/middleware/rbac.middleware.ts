import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest, BusinessUserContext } from '../types';
import { ROLE_PERMISSIONS } from '../constants';
import { getPrismaClient } from '../utils/prisma';

const prisma = getPrismaClient();

/**
 * Middleware to extract and validate business context from request.
 * Populates req.businessId and req.businessUser
 *
 * Two things this MUST do, both of which it previously did not:
 *
 * 1. Prefer the URL param over the x-business-id header. Routes shaped
 *    /:businessId/... have controllers that act on the param, so trusting the
 *    header here allowed a confused deputy: a caller could authorize against a
 *    business they legitimately own (header) while mutating a different one
 *    (param). That is how PATCH /business/:id and POST /business/:id/invite
 *    could be pointed at another tenant.
 *
 * 2. Verify the caller is actually a member of that business. Many routes rely
 *    on this middleware alone and carry no requirePermission of their own —
 *    every party/cutter/expense-type route in profile-service, and
 *    GET /business/dashboard — so without a membership check here the
 *    x-business-id header was effectively an unauthenticated tenant selector.
 */
export async function requireBusiness(req: Request, res: Response, next: NextFunction): Promise<void> {
  const businessId = req.params.businessId || (req.headers['x-business-id'] as string);

  if (!businessId) {
    res.status(400).json({
      success: false,
      message: 'Business ID is required. Pass it via x-business-id header or URL param.',
    });
    return;
  }

  const authReq = req as unknown as AuthenticatedRequest;
  const userId = authReq.user?.userId;

  if (!userId) {
    res.status(401).json({
      success: false,
      message: 'Authentication required',
    });
    return;
  }

  // Super admins may act on any business
  if (authReq.user.isSuperAdmin) {
    authReq.businessId = businessId;
    next();
    return;
  }

  try {
    const businessUser = await prisma.businessUser.findUnique({
      where: {
        user_id_business_id: {
          user_id: userId,
          business_id: businessId,
        },
      },
      include: {
        permissions: true,
      },
    });

    if (!businessUser || !businessUser.is_active) {
      res.status(403).json({
        success: false,
        message: 'You do not have access to this business',
      });
      return;
    }

    const rolePermissions = ROLE_PERMISSIONS[businessUser.role] || [];
    const customPermissions = businessUser.permissions.map((p: any) => p.permission);
    const allPermissions = [...new Set([...rolePermissions, ...customPermissions])];

    // Cache the resolved context so a downstream requirePermission on the same
    // route does not repeat this query.
    const context: BusinessUserContext = {
      id: businessUser.id,
      userId: businessUser.user_id,
      businessId: businessUser.business_id,
      role: businessUser.role,
      permissions: allPermissions,
    };

    authReq.businessUser = context;
    authReq.businessId = businessId;
    next();
  } catch (_error) {
    res.status(500).json({
      success: false,
      message: 'Business access check failed',
    });
  }
}

/**
 * Middleware factory: checks if user has required permission for the business.
 */
export function requirePermission(...requiredPermissions: string[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const authReq = req as unknown as AuthenticatedRequest;
    const userId = authReq.user?.userId;
    // Same precedence as requireBusiness: the param identifies the business the
    // controller will act on, so it must be the one we authorize against.
    const businessId =
      authReq.businessId || req.params.businessId || (req.headers['x-business-id'] as string);

    if (!userId || !businessId) {
      res.status(401).json({
        success: false,
        message: 'Authentication and business context required',
      });
      return;
    }

    try {
      // Super admin bypass
      if (authReq.user.isSuperAdmin) {
        authReq.businessId = businessId;
        next();
        return;
      }

      // requireBusiness already resolved and verified membership for this exact
      // business — reuse it instead of issuing the same query twice.
      let context = authReq.businessUser;

      if (!context || context.businessId !== businessId) {
        const businessUser = await prisma.businessUser.findUnique({
          where: {
            user_id_business_id: {
              user_id: userId,
              business_id: businessId,
            },
          },
          include: {
            permissions: true,
          },
        });

        if (!businessUser || !businessUser.is_active) {
          res.status(403).json({
            success: false,
            message: 'You do not have access to this business',
          });
          return;
        }

        // Get role-based default permissions + custom permissions
        const rolePermissions = ROLE_PERMISSIONS[businessUser.role] || [];
        const customPermissions = businessUser.permissions.map((p: any) => p.permission);
        const allPermissions = [...new Set([...rolePermissions, ...customPermissions])];

        context = {
          id: businessUser.id,
          userId: businessUser.user_id,
          businessId: businessUser.business_id,
          role: businessUser.role,
          permissions: allPermissions,
        };
      }

      // Check if user has ALL required permissions
      const hasPermission = requiredPermissions.every(p => context!.permissions.includes(p));

      if (!hasPermission) {
        res.status(403).json({
          success: false,
          message: `Insufficient permissions. Required: ${requiredPermissions.join(', ')}`,
        });
        return;
      }

      authReq.businessUser = context;
      authReq.businessId = businessId;
      next();
    } catch (_error) {
      res.status(500).json({
        success: false,
        message: 'Authorization check failed',
      });
    }
  };
}

/**
 * Middleware factory: checks role level
 */
export function requireRole(...roles: string[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const authReq = req as unknown as AuthenticatedRequest;
    const userId = authReq.user?.userId;
    // Same precedence as requireBusiness — see the note there.
    const businessId =
      authReq.businessId || req.params.businessId || (req.headers['x-business-id'] as string);

    if (!userId || !businessId) {
      res.status(401).json({
        success: false,
        message: 'Authentication and business context required',
      });
      return;
    }

    try {
      if (authReq.user.isSuperAdmin) {
        next();
        return;
      }

      const businessUser = await prisma.businessUser.findUnique({
        where: {
          user_id_business_id: {
            user_id: userId,
            business_id: businessId,
          },
        },
      });

      if (!businessUser || !businessUser.is_active) {
        res.status(403).json({
          success: false,
          message: 'Access denied',
        });
        return;
      }

      if (!roles.includes(businessUser.role)) {
        res.status(403).json({
          success: false,
          message: `Required role: ${roles.join(' or ')}`,
        });
        return;
      }

      authReq.businessId = businessId;
      next();
    } catch (_error) {
      res.status(500).json({
        success: false,
        message: 'Role check failed',
      });
    }
  };
}
