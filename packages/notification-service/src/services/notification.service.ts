import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import {
  createLogger, parsePagination, getPaginationOffset, buildPaginationMeta,
  getPrismaClient, getPlatformSettings,
} from '../shared';

const prisma = getPrismaClient();
const logger = createLogger('notification-service');

const WHATSAPP_API_URL = process.env.WHATSAPP_API_URL || 'https://graph.facebook.com/v18.0';
const WHATSAPP_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || '';
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || '';

export class NotificationService {
  // ─── IN-APP NOTIFICATIONS ──────────────────────────────
  async createNotification(data: {
    userId: string; businessId?: string; type: string;
    title: string; message: string; data?: Record<string, any>;
  }) {
    const notification = await prisma.notification.create({
      data: {
        id: uuidv4(),
        user_id: data.userId,
        business_id: data.businessId,
        type: data.type as any,
        title: data.title,
        message: data.message,
        data: data.data ? JSON.parse(JSON.stringify(data.data)) : undefined,
      },
    });
    logger.info('Notification created', { notificationId: notification.id, userId: data.userId });
    return notification;
  }

  async createBulkNotifications(notifications: Array<{
    userId: string; businessId?: string; type: string;
    title: string; message: string; data?: Record<string, any>;
  }>) {
    const data = notifications.map(n => ({
      id: uuidv4(),
      user_id: n.userId,
      business_id: n.businessId,
      type: n.type as any,
      title: n.title,
      message: n.message,
      data: n.data ? JSON.parse(JSON.stringify(n.data)) : undefined,
    }));

    await prisma.notification.createMany({ data });
    return { count: data.length };
  }

  async getUserNotifications(userId: string, query: Record<string, any>, businessId?: string) {
    const { page, limit } = parsePagination(query);
    const offset = getPaginationOffset(page, limit);

    const where: any = { user_id: userId };
    if (query.isRead !== undefined) where.is_read = query.isRead === 'true';
    if (query.type) where.type = query.type;

    // Scope to the active business (plus business-less platform notices).
    // Without this a multi-business user saw every business's reminders mixed
    // together with no indication which business they belonged to. The header
    // is only honoured after a membership check — this route is not behind
    // requireBusiness.
    if (businessId) {
      const member = await prisma.businessUser.findFirst({
        where: { user_id: userId, business_id: businessId, is_active: true },
        select: { id: true },
      });
      if (member) {
        where.OR = [{ business_id: businessId }, { business_id: null }];
      }
    }

    const [notifications, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: offset,
        take: limit,
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { user_id: userId, is_read: false } }),
    ]);

    return {
      data: notifications,
      meta: buildPaginationMeta(total, page, limit),
      unreadCount,
    };
  }

  async markAsRead(notificationId: string, userId: string) {
    return prisma.notification.updateMany({
      where: { id: notificationId, user_id: userId },
      data: { is_read: true },
    });
  }

  async markAllAsRead(userId: string) {
    return prisma.notification.updateMany({
      where: { user_id: userId, is_read: false },
      data: { is_read: true },
    });
  }

  async deleteNotification(notificationId: string, userId: string) {
    return prisma.notification.deleteMany({
      where: { id: notificationId, user_id: userId },
    });
  }

  // ─── WHATSAPP INTEGRATION ─────────────────────────────
  async sendWhatsAppMessage(phone: string, message: string) {
    // Platform Settings' "SMS Notifications" switch governs outbound messaging.
    // WhatsApp is this product's messaging channel, so it is what the toggle
    // controls; before this, turning it off changed nothing.
    const settings = await getPlatformSettings();
    if (!settings.smsNotifications) {
      logger.info('Outbound messaging disabled in platform settings, skipping', { phone });
      return null;
    }

    if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) {
      logger.warn('WhatsApp not configured, skipping message');
      return null;
    }

    try {
      const response = await axios.post(
        `${WHATSAPP_API_URL}/${WHATSAPP_PHONE_ID}/messages`,
        {
          messaging_product: 'whatsapp',
          to: `91${phone}`,
          type: 'text',
          text: { body: message },
        },
        {
          headers: {
            Authorization: `Bearer ${WHATSAPP_TOKEN}`,
            'Content-Type': 'application/json',
          },
        },
      );
      logger.info('WhatsApp message sent', { phone, messageId: response.data?.messages?.[0]?.id });
      return response.data;
    } catch (error: any) {
      logger.error('WhatsApp send failed', { phone, error: error.message });
      return null;
    }
  }

  async sendWhatsAppTemplate(phone: string, templateName: string, params: string[]) {
    const settings = await getPlatformSettings();
    if (!settings.smsNotifications) {
      logger.info('Outbound messaging disabled in platform settings, skipping template', { phone, templateName });
      return null;
    }

    if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) return null;

    try {
      const response = await axios.post(
        `${WHATSAPP_API_URL}/${WHATSAPP_PHONE_ID}/messages`,
        {
          messaging_product: 'whatsapp',
          to: `91${phone}`,
          type: 'template',
          template: {
            name: templateName,
            language: { code: 'en' },
            components: [{
              type: 'body',
              parameters: params.map(p => ({ type: 'text', text: p })),
            }],
          },
        },
        {
          headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
        },
      );
      return response.data;
    } catch (error: any) {
      logger.error('WhatsApp template send failed', { phone, error: error.message });
      return null;
    }
  }

  // ─── PAYMENT REMINDER ─────────────────────────────────
  /**
   * Returns an honest outcome instead of null-on-every-failure: the controller
   * used to reply "Payment reminder sent" whether or not anything went out.
   */
  async sendPaymentReminder(businessId: string, partyId: string): Promise<{
    sent: boolean;
    reason?: 'NO_PHONE' | 'NOT_RECEIVABLE' | 'WHATSAPP_UNCONFIGURED' | 'SEND_FAILED';
  }> {
    const party = await prisma.party.findFirst({
      where: { id: partyId, business_id: businessId },
    });
    if (!party || !party.phone) return { sent: false, reason: 'NO_PHONE' };

    const balance = Number(party.balance);
    if (balance <= 0) return { sent: false, reason: 'NOT_RECEIVABLE' };

    // sendWhatsAppMessage returns null for both "channel unavailable" and
    // "send failed"; distinguish the unconfigured/disabled cases up front so
    // the caller gets a precise reason.
    const settings = await getPlatformSettings();
    if (!settings.smsNotifications || !WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) {
      return { sent: false, reason: 'WHATSAPP_UNCONFIGURED' };
    }

    const message = `🔔 Payment Reminder from Bahi Khata Pro\n\nDear ${party.name},\nYou have an outstanding balance of ₹${balance.toLocaleString('en-IN')}.\n\nPlease settle at your earliest convenience.\n\nThank you!`;

    // Send WhatsApp (null = API call failed)
    const waResult = await this.sendWhatsAppMessage(party.phone, message);
    if (!waResult) return { sent: false, reason: 'SEND_FAILED' };

    // Create in-app notification for the business owner — only after the
    // reminder actually went out, so "Reminder Sent" is never a lie.
    const businessUsers = await prisma.businessUser.findMany({
      where: { business_id: businessId, role: 'OWNER' },
    });

    for (const bu of businessUsers) {
      await this.createNotification({
        userId: bu.user_id,
        businessId,
        type: 'PAYMENT_REMINDER',
        title: 'Payment Reminder Sent',
        message: `Reminder sent to ${party.name} for ₹${balance.toLocaleString('en-IN')}`,
      });
    }

    return { sent: true };
  }

  // ─── BILL REMINDER ────────────────────────────────────
  /**
   * Process all Purchase and Sale records whose reminder_date is on or before today
   * and for which a reminder notification has not yet been fired.
   * Called by the daily scheduler in index.ts.
   */
  async processBillReminders() {
    const now = new Date();
    // End of today (inclusive)
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    // ── Purchases with pending reminders ──
    const purchases: any[] = await prisma.$queryRaw`
      SELECT p.id, p.business_id, p.purchase_number, p.reminder_date, p.reminder_amount,
             p.balance_amount, par.name AS party_name, par.phone AS party_phone
      FROM purchases p
      LEFT JOIN parties par ON par.id = p.party_id
      WHERE p.reminder_date IS NOT NULL
        AND p.reminder_date <= ${todayEnd}
        AND (p.reminder_notified_at IS NULL OR p.reminder_notified_at < p.reminder_date)
        AND p.status = 'ACTIVE'
    `;

    for (const purchase of purchases) {
      await this._fireBillReminder({
        businessId: purchase.business_id,
        billNumber: purchase.purchase_number,
        billType: 'Purchase',
        reminderAmount: purchase.reminder_amount,
        balanceAmount: purchase.balance_amount,
        partyName: purchase.party_name || 'Supplier',
        partyPhone: purchase.party_phone,
        referenceId: purchase.id,
        referenceType: 'PURCHASE',
      });
      // Mark notified
      await prisma.$executeRaw`
        UPDATE purchases SET reminder_notified_at = ${now} WHERE id = ${purchase.id}
      `;
    }

    // ── Sales with pending reminders ──
    const sales: any[] = await prisma.$queryRaw`
      SELECT s.id, s.business_id, s.sale_number, s.reminder_date, s.reminder_amount,
             s.balance_amount, par.name AS party_name, par.phone AS party_phone
      FROM sales s
      LEFT JOIN parties par ON par.id = s.party_id
      WHERE s.reminder_date IS NOT NULL
        AND s.reminder_date <= ${todayEnd}
        AND (s.reminder_notified_at IS NULL OR s.reminder_notified_at < s.reminder_date)
        AND s.status = 'ACTIVE'
    `;

    for (const sale of sales) {
      await this._fireBillReminder({
        businessId: sale.business_id,
        billNumber: sale.sale_number,
        billType: 'Sale',
        reminderAmount: sale.reminder_amount,
        balanceAmount: sale.balance_amount,
        partyName: sale.party_name || 'Customer',
        partyPhone: sale.party_phone,
        referenceId: sale.id,
        referenceType: 'SALE',
      });
      await prisma.$executeRaw`
        UPDATE sales SET reminder_notified_at = ${now} WHERE id = ${sale.id}
      `;
    }

    logger.info('Bill reminders processed', {
      purchases: purchases.length,
      sales: sales.length,
    });

    return { purchases: purchases.length, sales: sales.length };
  }

  private async _fireBillReminder(opts: {
    businessId: string;
    billNumber: string;
    billType: 'Purchase' | 'Sale';
    reminderAmount: any;
    balanceAmount: any;
    partyName: string;
    partyPhone?: string;
    referenceId: string;
    referenceType: 'PURCHASE' | 'SALE';
  }) {
    const amount = Number(opts.reminderAmount ?? opts.balanceAmount ?? 0);
    const amountStr = amount > 0 ? `₹${amount.toLocaleString('en-IN')}` : '';

    const isPurchase = opts.billType === 'Purchase';
    const action = isPurchase ? 'pay' : 'collect';
    const emoji = isPurchase ? '💸' : '💰';

    const title = `${emoji} ${opts.billType} Reminder — ${opts.billNumber}`;
    const message = amountStr
      ? `Reminder to ${action} ${amountStr} to/from ${opts.partyName} (Bill: ${opts.billNumber})`
      : `Reminder for ${opts.billType.toLowerCase()} bill ${opts.billNumber} with ${opts.partyName}`;

    // In-app notification for all business owners/managers
    const businessUsers = await prisma.businessUser.findMany({
      where: { business_id: opts.businessId, role: { in: ['OWNER', 'MANAGER'] } },
    });

    const notifications = businessUsers.map(bu => ({
      userId: bu.user_id,
      businessId: opts.businessId,
      type: 'BILL_REMINDER',
      title,
      message,
      data: {
        referenceId: opts.referenceId,
        referenceType: opts.referenceType,
        billNumber: opts.billNumber,
        amount,
      },
    }));

    if (notifications.length > 0) {
      await this.createBulkNotifications(notifications);
    }

    // WhatsApp to party (if phone available)
    if (opts.partyPhone) {
      const waMsg = `🔔 Bahi Khata Pro Reminder\n\n${message}\n\nPlease settle at your earliest convenience.\nThank you!`;
      await this.sendWhatsAppMessage(opts.partyPhone, waMsg);
    }
  }

  // ─── LOW STOCK ALERT ──────────────────────────────────
  async sendLowStockAlerts(businessId: string) {
    const lowStockItems: any[] = await prisma.$queryRaw`
      SELECT id, name, current_stock, min_stock, unit 
      FROM inventory_items
      WHERE business_id = ${businessId} AND is_active = true 
        AND current_stock <= min_stock AND min_stock > 0
    `;

    if (lowStockItems.length === 0) return [];

    const businessUsers = await prisma.businessUser.findMany({
      where: { business_id: businessId, role: { in: ['OWNER', 'MANAGER'] } },
    });

    const notifications = [];
    for (const bu of businessUsers) {
      for (const item of lowStockItems) {
        notifications.push({
          userId: bu.user_id,
          businessId,
          type: 'LOW_STOCK',
          title: `Low Stock: ${item.name}`,
          message: `${item.name} stock is low. Current: ${item.current_stock} ${item.unit}, Min: ${item.min_stock} ${item.unit}`,
          data: { itemId: item.id, currentStock: item.current_stock },
        });
      }
    }

    if (notifications.length > 0) {
      await this.createBulkNotifications(notifications);
    }

    return lowStockItems;
  }

  // ─── WHATSAPP WEBHOOK ─────────────────────────────────
  async handleWhatsAppWebhook(payload: any) {
    const entries = payload?.entry || [];
    for (const entry of entries) {
      const changes = entry?.changes || [];
      for (const change of changes) {
        const messages = change?.value?.messages || [];
        for (const msg of messages) {
          logger.info('WhatsApp message received', { from: msg.from, text: msg.text?.body });

          // Auto-reply logic could be added here
          // Update the sender's existing session(s) by phone. The old code
          // upserted on the uuid PRIMARY KEY with a phone number (never
          // matches) and then created a row with business_id 'system' — a
          // guaranteed FK violation, so every inbound message 500'd and Meta
          // retried until it disabled the webhook. Without a way to resolve
          // the business (that mapping lives in whatsapp-ai-service, which
          // owns the webhook role now), an unknown sender is logged and
          // skipped rather than written against a fake tenant.
          const updated = await prisma.whatsAppSession.updateMany({
            where: { phone: msg.from },
            data: {
              last_message: msg.text?.body || '',
              updated_at: new Date(),
            },
          });
          if (updated.count === 0) {
            logger.info('WhatsApp message from unknown session — skipped', { from: msg.from });
          }
        }
      }
    }
  }
}

export const notificationService = new NotificationService();
