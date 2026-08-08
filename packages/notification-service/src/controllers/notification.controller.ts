import { Request, Response } from 'express';
import { asyncHandler, AuthenticatedRequest } from '../shared';
import { notificationService } from '../services/notification.service';

export const getUserNotifications = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const userId = (req as unknown as AuthenticatedRequest).user?.userId;
  const businessId = req.headers['x-business-id'] as string | undefined;
  const result = await notificationService.getUserNotifications(userId, req.query as any, businessId);
  res.json({ success: true, ...result });
});

export const markAsRead = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const userId = (req as unknown as AuthenticatedRequest).user?.userId;
  await notificationService.markAsRead(req.params.notificationId, userId);
  res.json({ success: true, message: 'Notification marked as read' });
});

export const markAllAsRead = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const userId = (req as unknown as AuthenticatedRequest).user?.userId;
  await notificationService.markAllAsRead(userId);
  res.json({ success: true, message: 'All notifications marked as read' });
});

export const deleteNotification = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const userId = (req as unknown as AuthenticatedRequest).user?.userId;
  await notificationService.deleteNotification(req.params.notificationId, userId);
  res.json({ success: true, message: 'Notification deleted' });
});

const REMINDER_FAILURE_MESSAGES: Record<string, string> = {
  NO_PHONE: 'This party has no phone number, so a reminder cannot be sent.',
  NOT_RECEIVABLE: 'This party has no outstanding balance to remind about.',
  WHATSAPP_UNCONFIGURED: 'WhatsApp messaging is not configured or is disabled, so the reminder was not sent.',
  SEND_FAILED: 'The WhatsApp message could not be delivered. Please try again later.',
};

export const sendPaymentReminder = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = req.headers['x-business-id'] as string;
  const { partyId } = req.body;
  const result = await notificationService.sendPaymentReminder(businessId, partyId);
  const message = result.sent
    ? 'Payment reminder sent'
    : (REMINDER_FAILURE_MESSAGES[result.reason ?? ''] || 'Payment reminder could not be sent.');
  res.status(result.sent ? 200 : 422).json({ success: result.sent, message, data: result });
});

export const sendLowStockAlerts = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = req.headers['x-business-id'] as string;
  const items = await notificationService.sendLowStockAlerts(businessId);
  res.json({ success: true, message: `${items.length} low stock alerts sent`, data: items });
});

export const processBillReminders = asyncHandler(async (_req: Request, res: Response): Promise<void> => {
  const result = await notificationService.processBillReminders();
  res.json({ success: true, message: 'Bill reminders processed', data: result });
});

export const whatsappWebhook = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  // Verify webhook
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      res.status(200).send(challenge);
      return;
    }
    res.sendStatus(403);
    return;
  }

  await notificationService.handleWhatsAppWebhook(req.body);
  res.sendStatus(200);
});
