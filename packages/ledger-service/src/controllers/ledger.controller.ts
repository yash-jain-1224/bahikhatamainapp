import { Request, Response } from 'express';
import { asyncHandler, createAuditLog , AuthenticatedRequest } from '../shared';
import { ledgerService } from '../services/ledger.service';

export const getPartyLedger = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = req.headers['x-business-id'] as string;
  const { partyId } = req.params;
  const result = await ledgerService.getPartyLedger(businessId, partyId, req.query as any);
  res.json({ success: true, ...result });
});

export const getBusinessLedger = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = req.headers['x-business-id'] as string;
  const result = await ledgerService.getBusinessLedger(businessId, req.query as any);
  res.json({ success: true, ...result });
});

export const createManualEntry = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = req.headers['x-business-id'] as string;
  const userId = (req as unknown as AuthenticatedRequest).user?.userId;
  const entry = await ledgerService.createManualEntry(businessId, userId, req.body);

  await createAuditLog({
    businessId, userId, action: 'LEDGER_MANUAL_ENTRY', entityType: 'ledger_entry',
    entityId: entry.id, newData: { accountType: entry.account_type, amount: entry.amount },
  });

  res.status(201).json({ success: true, message: 'Ledger entry created', data: entry });
});

export const deleteEntries = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = req.headers['x-business-id'] as string;
  const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids : [];
  const result = await ledgerService.deleteManualEntries(businessId, ids);
  res.json({ success: true, message: 'Entries deleted', data: result });
});

export const getPartyStatement = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = req.headers['x-business-id'] as string;
  const { partyId } = req.params;
  const result = await ledgerService.getPartyStatement(businessId, partyId, req.query as any);
  res.json({ success: true, data: result });
});

export const getTrialBalance = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = req.headers['x-business-id'] as string;
  const result = await ledgerService.getTrialBalance(businessId, req.query as any);
  res.json({ success: true, data: result });
});

export const getProfitAndLoss = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = req.headers['x-business-id'] as string;
  const result = await ledgerService.getProfitAndLoss(businessId, req.query as any);
  res.json({ success: true, data: result });
});

export const getOutstanding = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = req.headers['x-business-id'] as string;
  const type = req.query.type as 'receivable' | 'payable' | undefined;
  const result = await ledgerService.getOutstandingSummary(businessId, type);
  res.json({ success: true, data: result });
});

export const getBalanceSheet = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = req.headers['x-business-id'] as string;
  const result = await ledgerService.getBalanceSheet(businessId, req.query as any);
  res.json({ success: true, data: result });
});

export const getDayBook = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const businessId = req.headers['x-business-id'] as string;
  const date = req.query.date as string | undefined;
  const from = req.query.from as string | undefined;
  const to = req.query.to as string | undefined;
  const result = await ledgerService.getDayBook(businessId, date, from, to);
  res.json({ success: true, data: result });
});
