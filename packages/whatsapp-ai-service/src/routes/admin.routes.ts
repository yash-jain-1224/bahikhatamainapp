// =============================================================================
// Admin Routes - Service Management & Monitoring
// =============================================================================

import { Router, Request, Response } from 'express';

export const adminRouter = Router();

// Service health & metrics
adminRouter.get('/metrics', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString(),
      metrics: {
        totalMessages: 0,
        successfulProcessing: 0,
        errors: 0,
        averageResponseTime: 0,
        agentUsage: {
          samajh: 0,
          dastaveez: 0,
          pehchaan: 0,
          jaanch: 0,
          lekha: 0,
          hisaab: 0,
        },
      },
    },
  });
});

// Configuration overview (non-sensitive)
adminRouter.get('/config', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      whatsapp: {
        configured: !!process.env.WHATSAPP_ACCESS_TOKEN,
        apiVersion: process.env.WHATSAPP_API_VERSION || 'v20.0',
      },
      azure: {
        openai: !!process.env.AZURE_OPENAI_ENDPOINT,
        documentIntelligence: !!process.env.AZURE_DOC_INTELLIGENCE_ENDPOINT,
        speech: !!process.env.AZURE_SPEECH_KEY,
        cosmos: !!process.env.AZURE_COSMOS_ENDPOINT,
        search: !!process.env.AZURE_SEARCH_ENDPOINT,
        storage: !!process.env.AZURE_STORAGE_CONNECTION_STRING,
        serviceBus: !!process.env.AZURE_SERVICE_BUS_CONNECTION,
      },
      database: !!process.env.DATABASE_URL,
      redis: !!process.env.REDIS_URL,
    },
  });
});

// Supported languages
adminRouter.get('/languages', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      supported: ['hindi', 'english', 'hinglish'],
      speech: ['hi-IN', 'en-IN'],
      default: 'hinglish',
    },
  });
});

// Edge cases & test scenarios
adminRouter.get('/test-scenarios', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: [
      { id: 1, text: 'Ram ko 15 hazaar diye', expected: 'VENDOR_PAYMENT', language: 'hinglish' },
      { id: 2, text: 'Aaj ki bikri kitni hui?', expected: 'REPORT_REQUEST', language: 'hinglish' },
      { id: 3, text: '50 bag cement aaya Ram Traders se', expected: 'PURCHASE_ENTRY', language: 'hinglish' },
      { id: 4, text: 'GST kitna bharna hai?', expected: 'GST_QUERY', language: 'hinglish' },
      { id: 5, text: 'Shyam ka kitna baaki hai?', expected: 'OUTSTANDING_QUERY', language: 'hinglish' },
      { id: 6, text: 'Naya party add karo - Mohan Electronics', expected: 'PARTY_CREATE', language: 'hinglish' },
      { id: 7, text: 'Petrol dala 500 rupees', expected: 'EXPENSE_ENTRY', language: 'hinglish' },
      { id: 8, text: 'Payment mila 25000 Suresh se', expected: 'CUSTOMER_RECEIPT', language: 'hinglish' },
      { id: 9, text: 'Stock mein cement kitna hai?', expected: 'REPORT_REQUEST', language: 'hinglish' },
      { id: 10, text: 'Invoice bana do Ramesh ke liye 10000', expected: 'SALES_ENTRY', language: 'hinglish' },
    ],
  });
});
