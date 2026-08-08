import { Router } from 'express';
import {
  authenticateToken, checkMaintenanceMode,
  requireBusiness,
  validate,
  createExpenseSchema,
  updateExpenseSchema,
} from '../shared';
import { expenseController } from '../controllers/expense.controller';

const router = Router();

// This router previously had NO authentication of any kind, while the
// controller read x-business-id straight off the request. It was unreachable
// (the gateway had no /api/v1/expenses prefix), which is the only reason it was
// not an open door — wiring it up without these two lines would have exposed
// every business's expenses to anonymous callers.
router.use(authenticateToken);
// Platform Settings "Maintenance Mode". Mounted after authenticateToken so super
// admins are exempt and can keep working (including to switch it back off).
router.use(checkMaintenanceMode);
router.use(requireBusiness);

router.post('/', validate(createExpenseSchema), expenseController.createExpense.bind(expenseController));
router.get('/', expenseController.listAllExpenses.bind(expenseController));
router.get('/stats', expenseController.getExpenseStats.bind(expenseController));
router.get('/:id', expenseController.getExpenseById.bind(expenseController));
router.put('/:id', validate(updateExpenseSchema), expenseController.updateExpense.bind(expenseController));
router.delete('/:id', expenseController.deleteExpense.bind(expenseController));

export default router;
