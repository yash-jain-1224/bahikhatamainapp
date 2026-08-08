import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { asyncHandler, createAuditLog, AuthenticatedRequest } from '../shared';
import { businessService } from '../services/business.service';

// ─── Multer setup for business logos ─────────────────────────────────────────
const logoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(process.cwd(), 'uploads', 'business', 'logos');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `${Date.now()}-${Math.random().toString(36).substring(2, 8)}${ext}`);
  },
});

const logoFileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Only JPEG, PNG, WEBP and GIF images are allowed'));
};

export const logoUploadMiddleware = multer({
  storage: logoStorage,
  fileFilter: logoFileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
}).single('logo');

export const createBusiness = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const userId = (req as unknown as AuthenticatedRequest).user?.userId;

  // If a logo was uploaded via multipart, build the URL
  const logoUrl = req.file
    ? `/uploads/business/logos/${req.file.filename}`
    : undefined;

  const business = await businessService.createBusiness(userId, { ...req.body, logoUrl });

  await createAuditLog({
    businessId: business.id,
    userId,
    action: 'BUSINESS_CREATE',
    entityType: 'business',
    entityId: business.id,
    newData: req.body,
  });

  res.status(201).json({ success: true, message: 'Business created', data: business });
});

export const getBusiness = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { businessId } = req.params;
  const business = await businessService.getBusinessById(businessId);

  if (!business) {
    res.status(404).json({ success: false, message: 'Business not found' });
    return;
  }

  res.json({ success: true, data: business });
});

export const getUserBusinesses = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const userId = (req as unknown as AuthenticatedRequest).user?.userId;
  const businesses = await businessService.getUserBusinesses(userId);
  res.json({ success: true, data: businesses });
});

export const updateBusiness = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { businessId } = req.params;
  const userId = (req as unknown as AuthenticatedRequest).user?.userId;
  const business = await businessService.updateBusiness(businessId, req.body);

  await createAuditLog({
    businessId,
    userId,
    action: 'BUSINESS_UPDATE',
    entityType: 'business',
    entityId: businessId,
    newData: req.body,
  });

  res.json({ success: true, message: 'Business updated', data: business });
});

export const inviteUser = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { businessId } = req.params;
  const { phone, role } = req.body;
  const invitedBy = (req as unknown as AuthenticatedRequest).user?.userId;

  const result = await businessService.inviteUser(businessId, phone, role, invitedBy);
  res.status(201).json({ success: true, message: 'User invited', data: result });
});

export const createShop = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { businessId } = req.params;
  const shop = await businessService.createShop(businessId, req.body);
  res.status(201).json({ success: true, message: 'Shop created', data: shop });
});

export const getDashboard = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { businessId } = req.params;
  const { from, to } = req.query as { from?: string; to?: string };
  const dashboard = await businessService.getDashboard(businessId, from, to);
  res.json({ success: true, data: dashboard });
});

export const getDashboardFromHeader = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = req.headers['x-business-id'] as string;
  if (!businessId) {
    res.status(400).json({ success: false, message: 'Business ID header required' });
    return;
  }
  const { from, to } = req.query as { from?: string; to?: string };
  const dashboard = await businessService.getDashboard(businessId, from, to);
  res.json({ success: true, data: dashboard });
});

export const uploadLogo = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { businessId } = req.params;
  if (!req.file) {
    res.status(400).json({ success: false, message: 'No logo file provided' });
    return;
  }
  // URL is gateway-relative so the browser can load it via the proxy
  const logo_url = `/uploads/business/logos/${req.file.filename}`;
  const business = await businessService.updateBusinessLogo(businessId, logo_url);
  res.json({ success: true, message: 'Logo updated', data: { logo_url, business } });
});

export const removeLogo = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { businessId } = req.params;

  // Delete the file from disk if present
  const current = await businessService.getBusinessById(businessId);
  if (current?.logo_url) {
    try {
      const filename = current.logo_url.split('/').pop();
      if (filename) {
        const filePath = path.join(process.cwd(), 'uploads', 'business', 'logos', filename);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }
    } catch {
      // Non-fatal
    }
  }

  const business = await businessService.updateBusinessLogo(businessId, '');
  res.json({ success: true, message: 'Logo removed', data: { business } });
});

// ─── BANK ACCOUNTS ────────────────────────────────────────────────────────────

export const listBankAccounts = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = (req as any).businessId || req.params.businessId;
  const accounts = await businessService.listBankAccounts(businessId);
  res.json({ success: true, data: accounts });
});

export const createBankAccount = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = (req as any).businessId || req.params.businessId;
  const { accountName, accountNumber, ifscCode, bankName, upiId, isDefault } = req.body;
  const account = await businessService.createBankAccount(businessId, {
    accountName, accountNumber, ifscCode, bankName, upiId, isDefault,
  });
  res.status(201).json({ success: true, data: account });
});

export const updateBankAccount = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = (req as any).businessId || req.params.businessId;
  const { accountId } = req.params;
  const account = await businessService.updateBankAccount(businessId, accountId, req.body);
  res.json({ success: true, data: account });
});

export const deleteBankAccount = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = (req as any).businessId || req.params.businessId;
  const { accountId } = req.params;
  await businessService.deleteBankAccount(businessId, accountId);
  res.json({ success: true, message: 'Bank account deleted' });
});

// ─── BANK STATEMENT UPLOAD & RECONCILIATION ──────────────────────────────────

export const uploadStatement = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { rows } = req.body; // Already parsed CSV rows from frontend
  const parsed = await businessService.parseStatementCSV(rows);
  res.json({ success: true, data: parsed });
});

export const findStatementMatches = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = (req as any).businessId || req.params.businessId;
  const { date, amount, type, narration } = req.body;
  const matches = await businessService.findMatches(businessId, { date, amount, type, narration });
  res.json({ success: true, data: matches });
});

export const reconcileEntry = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = (req as any).businessId || req.params.businessId;
  const result = await businessService.reconcileEntry(businessId, req.body);
  res.json({ success: true, data: result });
});

// ─── CREDIT CARDS ─────────────────────────────────────────────────────────────

export const listCreditCards = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = (req as any).businessId || req.params.businessId;
  const cards = await businessService.listCreditCards(businessId);
  res.json({ success: true, data: cards });
});

export const getCreditCard = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = (req as any).businessId || req.params.businessId;
  const { cardId } = req.params;
  const card = await businessService.getCreditCard(businessId, cardId);
  res.json({ success: true, data: card });
});

export const createCreditCard = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = (req as any).businessId || req.params.businessId;
  const { cardName, cardNumber, cardNetwork, bankName, cardHolder, billingDate, dueDate, creditLimit } = req.body;
  const card = await businessService.createCreditCard(businessId, {
    cardName, cardNumber, cardNetwork, bankName, cardHolder, billingDate, dueDate, creditLimit,
  });
  res.status(201).json({ success: true, data: card });
});

export const updateCreditCard = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = (req as any).businessId || req.params.businessId;
  const { cardId } = req.params;
  const card = await businessService.updateCreditCard(businessId, cardId, req.body);
  res.json({ success: true, data: card });
});

export const deleteCreditCard = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = (req as any).businessId || req.params.businessId;
  const { cardId } = req.params;
  await businessService.deleteCreditCard(businessId, cardId);
  res.json({ success: true, message: 'Credit card deleted' });
});

// ─── CREDIT CARD STATEMENT UPLOAD & RECONCILIATION ───────────────────────────

export const uploadCreditCardStatement = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { rows } = req.body;
  const parsed = await businessService.parseCreditCardStatementCSV(rows);
  res.json({ success: true, data: parsed });
});

export const findCreditCardMatches = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = (req as any).businessId || req.params.businessId;
  const { date, amount, type, narration } = req.body;
  const matches = await businessService.findCreditCardMatches(businessId, { date, amount, type, narration });
  res.json({ success: true, data: matches });
});

export const reconcileCreditCardEntry = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = (req as any).businessId || req.params.businessId;
  const { cardId } = req.params;
  const result = await businessService.reconcileCreditCardEntry(businessId, cardId, req.body);
  res.json({ success: true, data: result });
});
