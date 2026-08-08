import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import path from 'path';
import fs from 'fs';
import { errorHandler, decimalSerializerMiddleware } from './shared';
import { purchaseRoutes } from './routes/purchase.routes';

const app = express();
const PORT = process.env.PURCHASE_SERVICE_PORT || 3003;

// Ensure upload directory exists
const uploadsDir = path.join(process.cwd(), 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*', credentials: true }));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined'));
app.use(decimalSerializerMiddleware);

// Serve uploaded attachments as static files
app.use('/uploads', express.static(uploadsDir));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'purchase-service', timestamp: new Date().toISOString() });
});

app.use('/api/v1/purchases', purchaseRoutes);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`📦 Purchase Service running on port ${PORT}`);
});

export default app;
