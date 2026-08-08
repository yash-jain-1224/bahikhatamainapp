import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { asyncHandler, createAuditLog, AuthenticatedRequest } from '../shared';
import { purchaseService } from '../services/purchase.service';

// ─── Multer for bill attachments ──────────────────────────────────────────────
const attachmentStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(process.cwd(), 'uploads', 'purchase', 'attachments');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.random().toString(36).substring(2, 8)}${ext}`);
  },
});
const attachmentFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Only images and PDF files are allowed'));
};
export const attachmentUploadMiddleware = multer({
  storage: attachmentStorage,
  fileFilter: attachmentFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
}).single('file');

// ─── Multer for payment receipts ──────────────────────────────────────────────
const receiptStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(process.cwd(), 'uploads', 'purchase', 'receipts');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.random().toString(36).substring(2, 8)}${ext}`);
  },
});
export const receiptUploadMiddleware = multer({
  storage: receiptStorage,
  fileFilter: attachmentFilter, // reuse same image/pdf filter
  limits: { fileSize: 10 * 1024 * 1024 },
}).single('file');

// ─── Multer for expense receipts (reuses receipt storage) ─────────────────────
export const expenseReceiptUploadMiddleware = receiptUploadMiddleware;

export const createPurchase = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = req.headers['x-business-id'] as string;
  const userId = (req as unknown as AuthenticatedRequest).user?.userId;

  const purchase = await purchaseService.createPurchase(businessId, userId, req.body);

  await createAuditLog({
    businessId,
    userId,
    action: 'PURCHASE_CREATE',
    entityType: 'purchase',
    entityId: purchase?.id,
    newData: { purchaseNumber: purchase?.purchase_number, total: purchase?.total_amount },
  });

  res.status(201).json({ success: true, message: 'Purchase created', data: purchase });
});

export const getPurchase = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = req.headers['x-business-id'] as string;
  const { purchaseId } = req.params;

  const purchase = await purchaseService.getPurchaseById(purchaseId, businessId);

  if (!purchase) {
    res.status(404).json({ success: false, message: 'Purchase not found' });
    return;
  }

  res.json({ success: true, data: purchase });
});

export const listPurchases = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = req.headers['x-business-id'] as string;
  const result = await purchaseService.listPurchases(businessId, req.query as any);
  res.json({ success: true, ...result });
});

export const deletePurchase = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = req.headers['x-business-id'] as string;
  const userId = (req as unknown as AuthenticatedRequest).user?.userId;
  const { purchaseId } = req.params;

  await purchaseService.deletePurchase(purchaseId, businessId);

  await createAuditLog({
    businessId,
    userId,
    action: 'PURCHASE_DELETE',
    entityType: 'purchase',
    entityId: purchaseId,
  });

  res.json({ success: true, message: 'Purchase deleted' });
});

export const getDashboard = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = req.headers['x-business-id'] as string;
  const result = await purchaseService.getDashboard(businessId);
  res.json({ success: true, data: result });
});

export const updatePurchase = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = req.headers['x-business-id'] as string;
  const userId = (req as unknown as AuthenticatedRequest).user?.userId;
  const { purchaseId } = req.params;

  const purchase = await purchaseService.updatePurchase(purchaseId, businessId, userId, req.body);

  await createAuditLog({
    businessId,
    userId,
    action: 'PURCHASE_UPDATE',
    entityType: 'purchase',
    entityId: purchaseId,
    newData: req.body,
  });

  res.json({ success: true, message: 'Purchase updated', data: purchase });
});

export const uploadAttachment = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = req.headers['x-business-id'] as string;
  const userId = (req as unknown as AuthenticatedRequest).user?.userId;
  const { purchaseId } = req.params;

  if (!req.file) {
    res.status(400).json({ success: false, message: 'No file provided' });
    return;
  }

  // Relative URL, resolved against the frontend origin (which rewrites
  // /uploads/* to the gateway) — same pattern as business-service logos.
  // An absolute URL built from the proxied Host header points at the
  // internal service host and is unreachable from any browser.
  const fileUrl = `/uploads/purchase/attachments/${req.file.filename}`;

  const attachment = await purchaseService.addAttachment(purchaseId, businessId, userId, {
    fileName: req.file.originalname,
    fileUrl,
    fileType: req.file.mimetype,
    fileSize: req.file.size,
  });

  res.status(201).json({ success: true, message: 'Attachment uploaded', data: attachment });
});

export const deleteAttachment = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = req.headers['x-business-id'] as string;
  const { attachmentId } = req.params;

  await purchaseService.deleteAttachment(attachmentId, businessId);
  res.json({ success: true, message: 'Attachment deleted' });
});

export const uploadPaymentReceipt = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ success: false, message: 'No file provided' });
    return;
  }

  // Relative URL — see uploadAttachment above for why.
  const fileUrl = `/uploads/purchase/receipts/${req.file.filename}`;

  res.status(201).json({
    success: true,
    message: 'Payment receipt uploaded',
    data: {
      url: fileUrl,
      fileName: req.file.originalname,
      fileType: req.file.mimetype,
      fileSize: req.file.size,
    },
  });
});

export const uploadExpenseReceipt = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ success: false, message: 'No file provided' });
    return;
  }

  // Relative URL — see uploadAttachment above for why.
  const fileUrl = `/uploads/purchase/receipts/${req.file.filename}`;

  res.status(201).json({
    success: true,
    message: 'Expense receipt uploaded',
    data: {
      url: fileUrl,
      fileName: req.file.originalname,
      fileType: req.file.mimetype,
      fileSize: req.file.size,
    },
  });
});
