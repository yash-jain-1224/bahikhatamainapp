import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { errorHandler, decimalSerializerMiddleware } from './shared';
import { subscriptionRoutes } from './routes/subscription.routes';

const app = express();
const PORT = process.env.SUBSCRIPTION_SERVICE_PORT || 3007;

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*', credentials: true }));
app.use(compression());
// The Razorpay webhook signature is an HMAC over the RAW request bytes —
// express.json's parse/re-stringify does not round-trip byte-for-byte, so the
// webhook route must receive the untouched body. express.raw marks the body
// as consumed, so express.json below skips it.
app.use('/api/v1/subscriptions/webhook/razorpay', express.raw({ type: '*/*', limit: '1mb' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined'));
app.use(decimalSerializerMiddleware);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'subscription-service', timestamp: new Date().toISOString() });
});

app.use('/api/v1/subscriptions', subscriptionRoutes);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`💳 Subscription Service running on port ${PORT}`);
});

export default app;
