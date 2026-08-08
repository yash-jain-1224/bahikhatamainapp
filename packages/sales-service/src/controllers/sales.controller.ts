import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { asyncHandler, createAuditLog, AuthenticatedRequest } from '../shared';
import { salesService } from '../services/sales.service';

// ─── Multer for bill attachments ──────────────────────────────────────────────
const attachmentStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(process.cwd(), 'uploads', 'sale', 'attachments');
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
  limits: { fileSize: 10 * 1024 * 1024 },
}).single('file');

// ─── Multer for payment receipts ──────────────────────────────────────────────
const receiptStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(process.cwd(), 'uploads', 'sale', 'receipts');
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
  fileFilter: attachmentFilter,
  limits: { fileSize: 10 * 1024 * 1024 },
}).single('file');

export const createSale = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = req.headers['x-business-id'] as string;
  const userId = (req as unknown as AuthenticatedRequest).user?.userId;

  const sale = await salesService.createSale(businessId, userId, req.body);

  await createAuditLog({
    businessId, userId,
    action: 'SALE_CREATE',
    entityType: 'sale',
    entityId: sale?.id,
    newData: { saleNumber: sale?.sale_number, total: sale?.total_amount },
  });

  res.status(201).json({ success: true, message: 'Sale created', data: sale });
});

export const getSale = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = req.headers['x-business-id'] as string;
  const { saleId } = req.params;

  const sale = await salesService.getSaleById(saleId, businessId);
  if (!sale) {
    res.status(404).json({ success: false, message: 'Sale not found' });
    return;
  }
  res.json({ success: true, data: sale });
});

export const listSales = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = req.headers['x-business-id'] as string;
  const result = await salesService.listSales(businessId, req.query as any);
  res.json({ success: true, ...result });
});

export const deleteSale = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = req.headers['x-business-id'] as string;
  const userId = (req as unknown as AuthenticatedRequest).user?.userId;
  const { saleId } = req.params;

  await salesService.deleteSale(saleId, businessId);

  await createAuditLog({
    businessId, userId,
    action: 'SALE_DELETE',
    entityType: 'sale',
    entityId: saleId,
  });

  res.json({ success: true, message: 'Sale deleted' });
});

export const getLotDetails = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = req.headers['x-business-id'] as string;
  const { lotId } = req.params;

  const lot = await salesService.getLotDetails(lotId, businessId);
  if (!lot) {
    res.status(404).json({ success: false, message: 'Lot not found' });
    return;
  }
  res.json({ success: true, data: lot });
});

export const listLots = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = req.headers['x-business-id'] as string;
  const result = await salesService.listLots(businessId, req.query as any);
  res.json({ success: true, ...result });
});

export const getSalesDashboard = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = req.headers['x-business-id'] as string;
  const result = await salesService.getSalesDashboard(businessId);
  res.json({ success: true, data: result });
});

export const updateSale = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = req.headers['x-business-id'] as string;
  const userId = (req as unknown as AuthenticatedRequest).user?.userId;
  const { saleId } = req.params;

  const sale = await salesService.updateSale(saleId, businessId, userId, req.body);

  await createAuditLog({
    businessId, userId,
    action: 'SALE_UPDATE',
    entityType: 'sale',
    entityId: saleId,
    newData: req.body,
  });

  res.json({ success: true, message: 'Sale updated', data: sale });
});

export const uploadAttachment = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = req.headers['x-business-id'] as string;
  const userId = (req as unknown as AuthenticatedRequest).user?.userId;
  const { saleId } = req.params;

  if (!req.file) {
    res.status(400).json({ success: false, message: 'No file provided' });
    return;
  }

  // Relative URL, resolved against the frontend origin (which rewrites
  // /uploads/* to the gateway) — same pattern as business-service logos.
  const fileUrl = `/uploads/sale/attachments/${req.file.filename}`;

  const attachment = await salesService.addAttachment(saleId, businessId, userId!, {
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

  await salesService.deleteAttachment(attachmentId, businessId);
  res.json({ success: true, message: 'Attachment deleted' });
});

export const uploadPaymentReceipt = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ success: false, message: 'No file provided' });
    return;
  }

  // Relative URL — see uploadAttachment above for why.
  const fileUrl = `/uploads/sale/receipts/${req.file.filename}`;

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
