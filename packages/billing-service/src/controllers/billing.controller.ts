import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { asyncHandler, createAuditLog, AuthenticatedRequest } from '../shared';
import { billingService } from '../services/billing.service';

// ─── Multer for payment receipts ──────────────────────────────────────────────
const receiptStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(process.cwd(), 'uploads', 'billing', 'receipts');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.random().toString(36).substring(2, 8)}${ext}`);
  },
});
const receiptFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Only images and PDF files are allowed'));
};
export const receiptUploadMiddleware = multer({
  storage: receiptStorage,
  fileFilter: receiptFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
}).single('receipt');

export const generateInvoice = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { subscriptionId } = req.body;
  const invoice = await billingService.generateInvoice(subscriptionId);
  res.status(201).json({ success: true, message: 'Invoice generated', data: invoice });
});

export const getInvoice = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = req.headers['x-business-id'] as string;
  const invoice = await billingService.getInvoice(req.params.invoiceId, businessId);
  res.json({ success: true, data: invoice });
});

export const listInvoices = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = req.headers['x-business-id'] as string;
  const result = await billingService.listInvoices(businessId, req.query as any);
  res.json({ success: true, ...result });
});

export const markInvoicePaid = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = req.headers['x-business-id'] as string;
  const userId = (req as unknown as AuthenticatedRequest).user?.userId;
  const invoice = await billingService.markInvoicePaid(req.params.invoiceId, req.body);

  await createAuditLog({
    businessId, userId, action: 'INVOICE_PAID', entityType: 'invoice',
    entityId: req.params.invoiceId,
  });

  res.json({ success: true, message: 'Invoice marked as paid', data: invoice });
});

export const createPayment = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = req.headers['x-business-id'] as string;
  const userId = (req as unknown as AuthenticatedRequest).user?.userId;

  // Detect if this is a "quick payment" (simplified format from RecordPaymentDialog)
  // or a structured payment (from purchase/sale detail page)
  const isQuickPayment = req.body.type && req.body.party_id && !req.body.referenceType;

  let payment;
  if (isQuickPayment) {
    payment = await billingService.createQuickPayment(businessId, userId, req.body);
  } else {
    payment = await billingService.createPayment(businessId, userId, req.body);
  }

  await createAuditLog({
    businessId, userId, action: 'PAYMENT_CREATE', entityType: 'payment',
    entityId: payment.id, newData: { amount: payment.amount, mode: payment.payment_mode },
  });

  res.status(201).json({ success: true, message: 'Payment recorded', data: payment });
});

export const listPayments = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = req.headers['x-business-id'] as string;
  const result = await billingService.listPayments(businessId, req.query as any);
  res.json({ success: true, ...result });
});

export const uploadReceipt = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = req.headers['x-business-id'] as string;
  const { paymentId } = req.params;

  if (!req.file) {
    res.status(400).json({ success: false, message: 'No file provided' });
    return;
  }

  const host = req.get('x-forwarded-host') || req.get('host') || `localhost:${process.env.BILLING_SERVICE_PORT || 3008}`;
  const protocol = req.get('x-forwarded-proto') || req.protocol || 'http';
  const receiptUrl = `${protocol}://${host}/uploads/billing/receipts/${req.file.filename}`;

  const payment = await billingService.attachReceipt(paymentId, businessId, receiptUrl);
  res.json({ success: true, message: 'Receipt uploaded', data: payment });
});

export const getPartyOutstandingBills = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = req.headers['x-business-id'] as string;
  const { partyId } = req.params;
  const type = (req.query.type as 'IN' | 'OUT') || 'IN';
  const bills = await billingService.getPartyOutstandingBills(businessId, partyId, type);
  res.json({ success: true, data: bills });
});

export const createBulkPayment = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = req.headers['x-business-id'] as string;
  const userId = (req as unknown as AuthenticatedRequest).user?.userId;
  const result = await billingService.createBulkPayment(businessId, userId, req.body);

  await createAuditLog({
    businessId, userId, action: 'PAYMENT_CREATE', entityType: 'payment',
    entityId: result.payments[0]?.id, newData: { totalAmount: result.totalAmount, count: result.payments.length },
  });

  res.status(201).json({ success: true, message: 'Payments recorded', data: result });
});
