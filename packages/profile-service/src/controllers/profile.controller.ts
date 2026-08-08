import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { asyncHandler, createAuditLog, AuthenticatedRequest } from '../shared';
import { profileService } from '../services/profile.service';

// ─── Multer setup: store avatars in uploads/avatars ───────────────────────
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, path.join(process.cwd(), 'uploads', 'avatars'));
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `${Date.now()}-${Math.random().toString(36).substring(2, 8)}${ext}`);
  },
});

const fileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPEG, PNG, WEBP and GIF images are allowed'));
  }
};

export const uploadMiddleware = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
}).single('avatar');


// Profile
export const getProfile = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const userId = (req as unknown as AuthenticatedRequest).user?.userId;
  const profile = await profileService.getProfile(userId);
  res.json({ success: true, data: profile });
});

export const updateProfile = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const userId = (req as unknown as AuthenticatedRequest).user?.userId;
  const profile = await profileService.updateProfile(userId, req.body);
  await createAuditLog({ userId, action: 'PROFILE_UPDATE', entityType: 'user', entityId: userId });
  res.json({ success: true, message: 'Profile updated', data: profile });
});

// Bank Accounts
export const addBankAccount = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const userId = (req as unknown as AuthenticatedRequest).user?.userId;
  const account = await profileService.addBankAccount(userId, req.body);
  res.status(201).json({ success: true, data: account });
});

export const listBankAccounts = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const userId = (req as unknown as AuthenticatedRequest).user?.userId;
  const accounts = await profileService.listBankAccounts(userId);
  res.json({ success: true, data: accounts });
});

export const deleteBankAccount = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const userId = (req as unknown as AuthenticatedRequest).user?.userId;
  await profileService.deleteBankAccount(req.params.accountId, userId);
  res.json({ success: true, message: 'Bank account deleted' });
});

// Parties
export const createParty = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = req.headers['x-business-id'] as string;
  const party = await profileService.createParty(businessId, req.body);
  res.status(201).json({ success: true, message: 'Party created', data: party });
});

export const updateParty = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = req.headers['x-business-id'] as string;
  const party = await profileService.updateParty(req.params.partyId, businessId, req.body);
  res.json({ success: true, data: party });
});

export const listParties = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = req.headers['x-business-id'] as string;
  const parties = await profileService.listParties(businessId, req.query as any);
  res.json({ success: true, data: parties });
});

export const getParty = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = req.headers['x-business-id'] as string;
  const party = await profileService.getParty(req.params.partyId, businessId);
  res.json({ success: true, data: party });
});

// Cutters
export const createCutter = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = req.headers['x-business-id'] as string;
  const cutter = await profileService.createCutter(businessId, req.body);
  res.status(201).json({ success: true, data: cutter });
});

export const listCutters = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = req.headers['x-business-id'] as string;
  const cutters = await profileService.listCutters(businessId);
  res.json({ success: true, data: cutters });
});

export const getCutter = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = req.headers['x-business-id'] as string;
  const { cutterId } = req.params;
  const cutter = await profileService.getCutter(cutterId, businessId);
  res.json({ success: true, data: cutter });
});

export const updateCutter = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = req.headers['x-business-id'] as string;
  const { cutterId } = req.params;
  const cutter = await profileService.updateCutter(cutterId, businessId, req.body);
  res.json({ success: true, data: cutter });
});

export const deleteCutter = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = req.headers['x-business-id'] as string;
  const { cutterId } = req.params;
  await profileService.deleteCutter(cutterId, businessId);
  res.json({ success: true, message: 'Cutter deactivated' });
});

export const createCutterTransaction = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = req.headers['x-business-id'] as string;
  const { cutterId } = req.params;
  const tx = await profileService.createCutterTransaction(cutterId, businessId, req.body);
  res.status(201).json({ success: true, data: tx });
});

export const updateCutterTransaction = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = req.headers['x-business-id'] as string;
  const { cutterId, transactionId } = req.params;
  const tx = await profileService.updateCutterTransaction(transactionId, cutterId, businessId, req.body);
  res.json({ success: true, data: tx });
});

export const markAllCutterTransactionsPaid = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = req.headers['x-business-id'] as string;
  const { cutterId } = req.params;
  const result = await profileService.markAllCutterTransactionsPaid(cutterId, businessId);
  res.json({ success: true, data: result });
});

// Expense Types
export const createExpenseType = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = req.headers['x-business-id'] as string;
  const expType = await profileService.createExpenseType(businessId, req.body);
  res.status(201).json({ success: true, data: expType });
});

export const listExpenseTypes = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = req.headers['x-business-id'] as string;
  const types = await profileService.listExpenseTypes(businessId);
  res.json({ success: true, data: types });
});

// Avatar Upload
export const uploadAvatar = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const userId = (req as unknown as AuthenticatedRequest).user?.userId;

  if (!req.file) {
    res.status(400).json({ success: false, message: 'No image file provided' });
    return;
  }

  // Use relative URL so it works through the API gateway on all clients (web, mobile).
  // The API gateway proxies /uploads/avatars to the profile-service.
  const avatarUrl = `/uploads/avatars/${req.file.filename}`;

  const updated = await profileService.updateProfile(userId, { avatarUrl });
  await createAuditLog({ userId, action: 'AVATAR_UPLOAD', entityType: 'user', entityId: userId });

  res.json({ success: true, message: 'Avatar updated', data: { avatarUrl, user: updated } });
});

// Avatar Remove
export const removeAvatar = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const userId = (req as unknown as AuthenticatedRequest).user?.userId;

  // Fetch current avatar to delete the file from disk
  const profile = await profileService.getProfile(userId);
  if (profile?.avatar_url) {
    try {
      // avatar_url may be an absolute URL like http://host/uploads/avatars/<file>
      const filename = profile.avatar_url.split('/').pop();
      if (filename) {
        const filePath = path.join(process.cwd(), 'uploads', 'avatars', filename);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }
    } catch {
      // Non-fatal – continue even if file deletion fails
    }
  }

  const updated = await profileService.updateProfile(userId, { avatarUrl: null as unknown as string });
  await createAuditLog({ userId, action: 'AVATAR_REMOVE', entityType: 'user', entityId: userId });

  res.json({ success: true, message: 'Avatar removed', data: { user: updated } });
});
