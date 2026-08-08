// =============================================================================
// BahiKhata WhatsApp AI - Configuration
// =============================================================================

import dotenv from 'dotenv';
dotenv.config();

export const config = {
  // Server
  port: parseInt(process.env.WHATSAPP_AI_PORT || '3013'),
  nodeEnv: process.env.NODE_ENV || 'development',

  // WhatsApp Business API (Meta)
  whatsapp: {
    // No fallback: a hardcoded default verify token is public in source (and
    // disagreed with .env.example). Empty means webhook verification always
    // 403s — fail-closed. Production misconfiguration is caught in
    // services/init.ts.
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || '',
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '',
    apiVersion: process.env.WHATSAPP_API_VERSION || 'v20.0',
    webhookSecret: process.env.WHATSAPP_WEBHOOK_SECRET || '',
  },

  // Azure OpenAI
  azure: {
    openai: {
      endpoint: process.env.AZURE_OPENAI_ENDPOINT || '',
      apiKey: process.env.AZURE_OPENAI_API_KEY || '',
      deploymentName: process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o',
      apiVersion: process.env.AZURE_OPENAI_API_VERSION || '2024-08-01-preview',
    },
    // Document Intelligence
    documentIntelligence: {
      endpoint: process.env.AZURE_DOC_INTELLIGENCE_ENDPOINT || '',
      apiKey: process.env.AZURE_DOC_INTELLIGENCE_KEY || '',
    },
    // Speech Services
    speech: {
      endpoint: process.env.AZURE_SPEECH_ENDPOINT || '',
      apiKey: process.env.AZURE_SPEECH_KEY || '',
      region: process.env.AZURE_SPEECH_REGION || 'centralindia',
    },
    // Cosmos DB
    cosmos: {
      endpoint: process.env.AZURE_COSMOS_ENDPOINT || '',
      key: process.env.AZURE_COSMOS_KEY || '',
      databaseId: process.env.AZURE_COSMOS_DATABASE || 'bahikhata',
      containers: {
        conversations: 'conversations',
        memory: 'memory',
        approvals: 'approvals',
        auditTrail: 'audit_trail',
      },
    },
    // Blob Storage
    storage: {
      connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING || '',
      containers: {
        documents: 'documents',
        images: 'images',
        audio: 'audio',
        reports: 'reports',
      },
    },
    // AI Search
    search: {
      endpoint: process.env.AZURE_SEARCH_ENDPOINT || '',
      apiKey: process.env.AZURE_SEARCH_KEY || '',
      indexName: process.env.AZURE_SEARCH_INDEX || 'bahikhata-entities',
    },
    // Service Bus
    serviceBus: {
      connectionString: process.env.AZURE_SERVICE_BUS_CONNECTION || '',
      queues: {
        incomingMessages: 'incoming-messages',
        documentProcessing: 'document-processing',
        transactionPosting: 'transaction-posting',
        notifications: 'notifications',
      },
    },
    // Key Vault
    keyVault: {
      url: process.env.AZURE_KEYVAULT_URL || '',
    },
  },

  // Redis
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    sessionTTL: 3600, // 1 hour
    cacheTTL: 300, // 5 minutes
  },

  // Database (uses existing Prisma setup)
  database: {
    url: process.env.DATABASE_URL || '',
  },

  // Business Rules
  rules: {
    defaultApprovalThreshold: 50000, // ₹50,000
    maxClarificationAttempts: 3,
    autoLearnConfirmations: 5, // Auto-apply after 5 confirmations
    duplicateTimeWindowHours: 24,
    duplicateAmountTolerance: 0.05, // 5%
    maxBackdatedDays: 7,
    responseTimeoutMs: 5000, // 5 seconds target
    maxConversationHistory: 20,
  },

  // Indian Accounting
  accounting: {
    financialYearStart: 4, // April
    defaultCurrency: 'INR',
    gstRates: [0, 5, 12, 18, 28],
    tdsRates: [1, 2, 5, 10],
    dateFormat: 'DD/MM/YYYY',
    amountLocale: 'en-IN',
  },

  // Security
  security: {
    apiKeys: {
      service: process.env.WHATSAPP_AI_SERVICE_KEY || '',
      dashboard: process.env.WHATSAPP_AI_DASHBOARD_KEY || '',
      admin: process.env.WHATSAPP_AI_ADMIN_KEY || '',
    },
    adminAllowedIPs: process.env.ADMIN_ALLOWED_IPS?.split(',').filter(Boolean) || [],
    rateLimits: {
      webhookPerMinute: 300,
      apiPerMinute: 60,
      adminPerMinute: 30,
      userMessagePerMinute: 30,
    },
    webhookMaxAgeSeconds: 300, // Reject messages older than 5 minutes
    enablePIIMasking: process.env.NODE_ENV === 'production',
  },
} as const;

export type Config = typeof config;
