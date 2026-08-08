import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import path from 'path';
import { errorHandler, decimalSerializerMiddleware } from './shared';
import { businessRoutes } from './routes/business.routes';

const app = express();
const PORT = process.env.BUSINESS_SERVICE_PORT || 3002;

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: process.env.CORS_ORIGIN || '*', credentials: true }));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined'));
app.use(decimalSerializerMiddleware);

// Serve uploaded logos as static files — path matches /uploads/business/logos/...
app.use('/uploads/business', express.static(path.join(process.cwd(), 'uploads', 'business')));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'business-service', timestamp: new Date().toISOString() });
});

app.use('/api/v1/business', businessRoutes);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`🏢 Business Service running on port ${PORT}`);
});

export default app;
