// =============================================================================
// Azure Infrastructure - BahiKhata WhatsApp AI Deployment
// =============================================================================

// This file provides the ARM/Bicep equivalent configuration for deploying
// BahiKhata's WhatsApp AI infrastructure on Azure.

export const azureResourceConfig = {
  resourceGroup: 'rg-bahikhata-prod',
  location: 'centralindia',
  
  resources: {
    // Azure OpenAI
    openai: {
      name: 'bahikhata-openai',
      sku: 'S0',
      deployments: [
        { name: 'gpt-4o', model: 'gpt-4o', version: '2024-08-06', capacity: 80 },
        { name: 'text-embedding-3-large', model: 'text-embedding-3-large', capacity: 120 },
      ],
    },

    // Cosmos DB
    cosmosDB: {
      name: 'bahikhata-cosmos',
      kind: 'GlobalDocumentDB',
      consistencyLevel: 'Session',
      databases: [{
        name: 'bahikhata',
        containers: [
          { name: 'conversations', partitionKey: '/userId', ttl: -1 },
          { name: 'memory', partitionKey: '/userId', ttl: -1 },
          { name: 'approvals', partitionKey: '/businessId', ttl: 2592000 }, // 30 days
          { name: 'audit_trail', partitionKey: '/businessId', ttl: 31536000 }, // 1 year
        ],
      }],
    },

    // Azure SQL (already exists - shared with main app)
    sql: {
      name: 'bahikhata-sql',
      sku: 'GP_S_Gen5_2', // General Purpose Serverless
      database: 'bahikhata',
    },

    // Azure AI Search
    search: {
      name: 'bahikhata-search',
      sku: 'basic',
      indexes: [{
        name: 'bahikhata-entities',
        fields: [
          { name: 'id', type: 'Edm.String', key: true },
          { name: 'tenantId', type: 'Edm.String', filterable: true },
          { name: 'name', type: 'Edm.String', searchable: true },
          { name: 'type', type: 'Edm.String', filterable: true },
          { name: 'city', type: 'Edm.String', filterable: true, searchable: true },
          { name: 'gstin', type: 'Edm.String', searchable: true },
          { name: 'phone', type: 'Edm.String', searchable: true },
          { name: 'aliases', type: 'Collection(Edm.String)', searchable: true },
          { name: 'nameVector', type: 'Collection(Edm.Single)', dimensions: 3072 },
          { name: 'recentTransactionCount', type: 'Edm.Int32', sortable: true },
          { name: 'lastTransactionDate', type: 'Edm.DateTimeOffset', sortable: true },
        ],
        semanticConfiguration: {
          name: 'default',
          prioritizedFields: {
            titleField: { fieldName: 'name' },
            contentFields: [{ fieldName: 'city' }],
            keywordsFields: [{ fieldName: 'aliases' }],
          },
        },
        vectorSearch: {
          algorithms: [{ name: 'hnsw', kind: 'hnsw', parameters: { m: 4, efConstruction: 400, efSearch: 500 } }],
          profiles: [{ name: 'vector-profile', algorithmConfigurationName: 'hnsw', vectorizer: 'openai' }],
        },
      }],
    },

    // Document Intelligence
    documentIntelligence: {
      name: 'bahikhata-doc-intel',
      sku: 'S0',
      customModels: [
        'indian-invoice',
        'upi-screenshot',
        'handwritten-bill',
      ],
    },

    // Speech Services
    speech: {
      name: 'bahikhata-speech',
      sku: 'S0',
      languages: ['hi-IN', 'en-IN'],
    },

    // Storage Account
    storage: {
      name: 'bahikhatadocs',
      sku: 'Standard_LRS',
      containers: [
        { name: 'documents', accessLevel: 'private' },
        { name: 'images', accessLevel: 'private' },
        { name: 'audio', accessLevel: 'private' },
        { name: 'reports', accessLevel: 'private' },
      ],
    },

    // Service Bus
    serviceBus: {
      name: 'bahikhata-servicebus',
      sku: 'Standard',
      queues: [
        { name: 'incoming-messages', maxDeliveryCount: 5, lockDuration: 'PT1M' },
        { name: 'document-processing', maxDeliveryCount: 3, lockDuration: 'PT5M' },
        { name: 'transaction-posting', maxDeliveryCount: 3, lockDuration: 'PT1M' },
        { name: 'notifications', maxDeliveryCount: 5, lockDuration: 'PT30S' },
      ],
      topics: [
        { name: 'transaction-events', subscriptions: ['ledger', 'notifications', 'analytics'] },
        { name: 'user-events', subscriptions: ['memory', 'analytics'] },
      ],
    },

    // Redis Cache
    redis: {
      name: 'bahikhata-redis',
      sku: 'Basic',
      capacity: 1,
      features: ['sessions', 'entity-cache', 'rate-limiting'],
    },

    // Container Apps (for agent orchestrator)
    containerApps: {
      environment: 'bahikhata-cae',
      apps: [{
        name: 'whatsapp-ai-service',
        image: 'bahikhata.azurecr.io/whatsapp-ai-service:latest',
        cpu: 1,
        memory: '2Gi',
        minReplicas: 1,
        maxReplicas: 10,
        scaleRules: [{
          name: 'service-bus-scale',
          custom: { type: 'azure-servicebus', metadata: { queueName: 'incoming-messages', messageCount: '5' } },
        }],
      }],
    },

    // Key Vault
    keyVault: {
      name: 'bahikhata-kv',
      sku: 'standard',
      secrets: [
        'whatsapp-access-token',
        'whatsapp-webhook-secret',
        'azure-openai-key',
        'cosmos-key',
        'sql-connection-string',
        'redis-connection-string',
      ],
    },

    // Application Insights
    appInsights: {
      name: 'bahikhata-ai-insights',
      workspaceName: 'bahikhata-log-analytics',
      customMetrics: [
        'ocr_accuracy',
        'speech_wer',
        'entity_resolution_accuracy',
        'duplicate_detection_precision',
        'response_time_ms',
        'clarification_rate',
        'cost_per_transaction',
      ],
    },
  },

  // Estimated Monthly Cost (INR)
  costEstimate: {
    openai: { units: '100K tokens/day', cost: '₹15,000/month' },
    cosmosDB: { units: '10K RU/s', cost: '₹8,000/month' },
    sql: { units: 'Serverless Gen5 2vCore', cost: '₹5,000/month' },
    search: { units: 'Basic tier', cost: '₹5,000/month' },
    documentIntelligence: { units: '1000 pages/month', cost: '₹3,000/month' },
    speech: { units: '100 hours/month', cost: '₹2,000/month' },
    storage: { units: '50 GB', cost: '₹500/month' },
    serviceBus: { units: 'Standard', cost: '₹2,000/month' },
    redis: { units: 'Basic C1', cost: '₹3,000/month' },
    containerApps: { units: '1-10 replicas', cost: '₹5,000/month' },
    total: '₹48,500/month (for 100 businesses)',
    perBusiness: '₹485/month/business',
  },
};
