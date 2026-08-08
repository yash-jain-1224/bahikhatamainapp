import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import path from 'path';
import { errorHandler, decimalSerializerMiddleware } from './shared';
import { salesRoutes } from './routes/sales.routes';

const app = express();
const PORT = process.env.SALES_SERVICE_PORT || 3004;

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*', credentials: true }));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined'));
app.use(decimalSerializerMiddleware);

// Serve uploaded files (attachments, receipts)
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'sales-service', timestamp: new Date().toISOString() });
});

app.use('/api/v1/sales', salesRoutes);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`💰 Sales Service running on port ${PORT}`);
});

export default app;
