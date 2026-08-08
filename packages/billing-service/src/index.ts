import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import path from 'path';
import { errorHandler, decimalSerializerMiddleware } from './shared';
import { billingRoutes } from './routes/billing.routes';

const app = express();
const PORT = process.env.BILLING_SERVICE_PORT || 3008;

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*', credentials: true }));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined'));
app.use(decimalSerializerMiddleware);

// Serve uploaded receipt files
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'billing-service', timestamp: new Date().toISOString() });
});

app.use('/api/v1/billing', billingRoutes);

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`💳 Billing Service running on port ${PORT}`);
});

export default app;
