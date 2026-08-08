import { AuditLogInput } from '../types';
import { getPrismaClient } from './prisma';

const prisma = getPrismaClient();

export async function createAuditLog(input: AuditLogInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        business_id: input.businessId,
        user_id: input.userId,
        action: input.action,
        entity_type: input.entityType,
        entity_id: input.entityId,
        old_data: input.oldData ? JSON.parse(JSON.stringify(input.oldData)) : undefined,
        new_data: input.newData ? JSON.parse(JSON.stringify(input.newData)) : undefined,
        ip_address: input.ipAddress,
        user_agent: input.userAgent,
      },
    });
  } catch (error) {
    // Don't throw - audit log failure shouldn't break the main operation
    console.error('Audit log creation failed:', error);
  }
}
