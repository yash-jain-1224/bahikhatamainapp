import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { errorHandler, decimalSerializerMiddleware } from './shared';
import { notificationRoutes } from './routes/notification.routes';
import { notificationService } from './services/notification.service';

const app = express();
const PORT = process.env.NOTIFICATION_SERVICE_PORT || 3009;

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*', credentials: true }));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined'));
app.use(decimalSerializerMiddleware);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'notification-service', timestamp: new Date().toISOString() });
});

app.use('/api/v1/notifications', notificationRoutes);

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`🔔 Notification Service running on port ${PORT}`);
  scheduleDailyBillReminders();
});

/**
 * Runs bill-reminder processing once per day.
 * Fires immediately at startup, then every 24 hours.
 */
function scheduleDailyBillReminders() {
  const runReminders = async () => {
    try {
      const result = await notificationService.processBillReminders();
      console.log(`📅 Bill reminders processed: ${result.purchases} purchases, ${result.sales} sales`);
    } catch (err: any) {
      console.error('Bill reminder scheduler error:', err?.message || err);
    }
  };

  // Run once shortly after startup
  setTimeout(runReminders, 5000);

  // Then repeat every 24 hours
  setInterval(runReminders, 24 * 60 * 60 * 1000);
}

export default app;

