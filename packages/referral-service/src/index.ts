import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { errorHandler, decimalSerializerMiddleware } from './shared';
import { referralRoutes } from './routes/referral.routes';

const app = express();
const PORT = process.env.REFERRAL_SERVICE_PORT || 3012;

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*', credentials: true }));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined'));
app.use(decimalSerializerMiddleware);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'referral-service', timestamp: new Date().toISOString() });
});

app.use('/api/v1/referrals', referralRoutes);

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`🎁 Referral Service running on port ${PORT}`);
});

export default app;
