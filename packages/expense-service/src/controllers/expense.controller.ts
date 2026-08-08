import { Request, Response } from 'express';
import { expenseService } from '../services/expense.service';
import { createLogger } from '../shared';

const logger = createLogger('expense-controller');

/**
 * Every catch here used to return HTTP 500 with a bare `{ error }` body, so a
 * missing expenseTypeId (a user mistake) and a nonexistent id both surfaced as
 * "Internal server error". The frontend also reads `message`, not `error`, so
 * the real reason never reached the toast.
 *
 * Map the Prisma error codes we can actually attribute, and use the same
 * { success, message } envelope as every other service.
 */
function fail(res: Response, error: any, context: string) {
  const code = error?.code;

  // AppError subclasses (NotFoundError, ValidationError, …) already carry the
  // status they want — honour it instead of flattening everything to 500.
  if (typeof error?.statusCode === 'number' && error.statusCode >= 400 && error.statusCode < 600) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
      ...(error.errors ? { errors: error.errors } : {}),
    });
  }

  if (code === 'P2003') {
    // Foreign key constraint — e.g. expenseTypeId does not exist for this business
    return res.status(400).json({
      success: false,
      message: 'Invalid reference: check the expense type belongs to this business',
    });
  }
  if (code === 'P2025') {
    return res.status(404).json({ success: false, message: 'Expense not found' });
  }
  if (code === 'P2002') {
    return res.status(409).json({ success: false, message: 'That expense already exists' });
  }
  if (error?.name === 'ZodError' || Array.isArray(error?.issues)) {
    return res.status(400).json({ success: false, message: 'Validation failed', errors: error.issues });
  }

  logger.error(context, error);
  return res.status(500).json({ success: false, message: error?.message || 'Internal server error' });
}

const missingBusiness = (res: Response) =>
  res.status(400).json({ success: false, message: 'Missing x-business-id header' });

export class ExpenseController {
  async createExpense(req: Request, res: Response) {
    try {
      const businessId = req.headers['x-business-id'] as string;
      if (!businessId) return missingBusiness(res);

      const expense = await expenseService.createExpense(businessId, req.body);
      res.status(201).json({ success: true, data: expense });
    } catch (error: any) {
      return fail(res, error, 'Error creating expense');
    }
  }

  async listAllExpenses(req: Request, res: Response) {
    try {
      const businessId = req.headers['x-business-id'] as string;
      if (!businessId) return missingBusiness(res);

      const result = await expenseService.listAllExpenses(businessId, req.query);
      res.json({ success: true, ...result });
    } catch (error: any) {
      return fail(res, error, 'Error listing expenses');
    }
  }

  async getExpenseById(req: Request, res: Response) {
    try {
      const businessId = req.headers['x-business-id'] as string;
      if (!businessId) return missingBusiness(res);

      const expense = await expenseService.getExpenseById(req.params.id, businessId);
      if (!expense) return res.status(404).json({ success: false, message: 'Expense not found' });

      res.json({ success: true, data: expense });
    } catch (error: any) {
      return fail(res, error, 'Error getting expense');
    }
  }

  async updateExpense(req: Request, res: Response) {
    try {
      const businessId = req.headers['x-business-id'] as string;
      if (!businessId) return missingBusiness(res);

      const expense = await expenseService.updateExpense(req.params.id, businessId, req.body);
      res.json({ success: true, data: expense });
    } catch (error: any) {
      return fail(res, error, 'Error updating expense');
    }
  }

  async deleteExpense(req: Request, res: Response) {
    try {
      const businessId = req.headers['x-business-id'] as string;
      if (!businessId) return missingBusiness(res);

      await expenseService.deleteExpense(req.params.id, businessId);
      res.json({ success: true, message: 'Expense deleted' });
    } catch (error: any) {
      return fail(res, error, 'Error deleting expense');
    }
  }

  async getExpenseStats(req: Request, res: Response) {
    try {
      const businessId = req.headers['x-business-id'] as string;
      if (!businessId) return missingBusiness(res);

      const stats = await expenseService.getExpenseStats(businessId);
      res.json({ success: true, data: stats });
    } catch (error: any) {
      return fail(res, error, 'Error getting expense stats');
    }
  }
}

export const expenseController = new ExpenseController();
