import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import expenseRoutes from './routes/expense.routes';
import { createLogger, decimalSerializerMiddleware } from './shared';

const logger = createLogger('expense-service');
const app = express();
// Was `process.env.PORT || 3009`, which collided with notification-service and
// ignored the *_SERVICE_PORT convention every other service follows.
const PORT = process.env.EXPENSE_SERVICE_PORT || 3014;

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*', credentials: true }));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined'));
// Serialise Prisma Decimal the way every other service does, so the frontend
// gets consistent formatting for amounts.
app.use(decimalSerializerMiddleware);

// Mounted at /api/v1/expenses to match every other service and the gateway's
// pathFilter. It was previously /api/expenses, so even once the gateway had a
// prefix for it every request would still have 404'd.
app.use('/api/v1/expenses', expenseRoutes);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'expense-service', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  logger.info(`Expense Service running on port ${PORT}`);
});

export default app;
