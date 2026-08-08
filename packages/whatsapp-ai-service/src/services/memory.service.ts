// =============================================================================
// Memory Service - Conversation State & Learning (Cosmos DB / In-Memory)
// =============================================================================

import {
  ConversationState,
  UserPreferences,
  ConversationContext,
  LanguageType,
  MessageHistoryItem,
} from '../types';
import { config } from '../config';

// In-memory store for development (replaced by Cosmos DB in production)
const memoryStore = new Map<string, ConversationState>();

export class MemoryService {
  // ─── Get Conversation State ────────────────────────────────────────────────
  async getConversationState(userId: string): Promise<ConversationState> {
    // Try in-memory first
    const existing = memoryStore.get(userId);
    if (existing) return existing;

    // Try Cosmos DB
    if (config.azure.cosmos.endpoint) {
      try {
        const state = await this.loadFromCosmos(userId);
        if (state) {
          memoryStore.set(userId, state);
          return state;
        }
      } catch (error) {
        console.warn('Cosmos DB load error:', (error as Error).message);
      }
    }

    // Create new state
    const newState = this.createDefaultState(userId);
    memoryStore.set(userId, newState);
    return newState;
  }

  // ─── Save Conversation State ───────────────────────────────────────────────
  async saveConversationState(state: ConversationState): Promise<void> {
    // Update in-memory
    memoryStore.set(state.userId, state);

    // Persist to Cosmos DB
    if (config.azure.cosmos.endpoint) {
      try {
        await this.saveToCosmos(state);
      } catch (error) {
        console.warn('Cosmos DB save error:', (error as Error).message);
      }
    }
  }

  // ─── Learn Entity Mapping ──────────────────────────────────────────────────
  async learnEntityMapping(
    state: ConversationState,
    input: string,
    resolvedId: string
  ): Promise<void> {
    const normalizedInput = input.toLowerCase().trim();

    // Find existing learning entry
    const existingIndex = state.preferences.learningData.findIndex(
      l => l.input === normalizedInput && l.type === 'party'
    );

    if (existingIndex >= 0) {
      const entry = state.preferences.learningData[existingIndex];
      entry.confirmations++;
      
      // Auto-apply after threshold
      if (entry.confirmations >= config.rules.autoLearnConfirmations) {
        entry.autoApply = true;
        state.preferences.entityMappings[normalizedInput] = resolvedId;
        console.log(`🧠 Learned: "${normalizedInput}" → "${resolvedId}" (auto-apply enabled)`);
      }
    } else {
      state.preferences.learningData.push({
        input: normalizedInput,
        resolvedTo: resolvedId,
        type: 'party',
        confirmations: 1,
        autoApply: false,
      });
    }

    await this.saveConversationState(state);
  }

  // ─── Add Message to History ────────────────────────────────────────────────
  async addToHistory(
    state: ConversationState,
    role: 'user' | 'assistant',
    content: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const historyItem: MessageHistoryItem = {
      role,
      content,
      timestamp: new Date().toISOString(),
      metadata,
    };

    state.messageHistory.push(historyItem);

    // Keep only last N messages
    if (state.messageHistory.length > config.rules.maxConversationHistory) {
      state.messageHistory = state.messageHistory.slice(-config.rules.maxConversationHistory);
    }

    await this.saveConversationState(state);
  }

  // ─── Update Context ────────────────────────────────────────────────────────
  async updateContext(
    state: ConversationState,
    updates: Partial<ConversationContext>
  ): Promise<void> {
    state.context = { ...state.context, ...updates };
    await this.saveConversationState(state);
  }

  // ─── Cosmos DB Operations ──────────────────────────────────────────────────

  private async loadFromCosmos(userId: string): Promise<ConversationState | null> {
    try {
      const { CosmosClient } = await import('@azure/cosmos');
      const client = new CosmosClient({
        endpoint: config.azure.cosmos.endpoint,
        key: config.azure.cosmos.key,
      });

      const database = client.database(config.azure.cosmos.databaseId);
      const container = database.container(config.azure.cosmos.containers.conversations);

      const { resource } = await container.item(userId, userId).read<ConversationState>();
      return resource || null;
    } catch (error: any) {
      if (error.code === 404) return null;
      throw error;
    }
  }

  private async saveToCosmos(state: ConversationState): Promise<void> {
    try {
      const { CosmosClient } = await import('@azure/cosmos');
      const client = new CosmosClient({
        endpoint: config.azure.cosmos.endpoint,
        key: config.azure.cosmos.key,
      });

      const database = client.database(config.azure.cosmos.databaseId);
      const container = database.container(config.azure.cosmos.containers.conversations);

      await container.items.upsert({
        id: state.userId,
        partitionKey: state.userId,
        ...state,
        _updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Cosmos DB upsert error:', error);
    }
  }

  // ─── Default State Factory ─────────────────────────────────────────────────
  private createDefaultState(userId: string): ConversationState {
    return {
      userId,
      // Unknown until the orchestrator stamps it from the resolved business
      // (AgentInput.businessId) at the start of processMessage. Never
      // fabricate a tenant from the phone number — a fabricated id leaked
      // into Azure Search filters and Cosmos documents as if it were real.
      tenantId: '',
      sessionId: `session_${Date.now()}`,
      context: {
        recentParties: [],
        recentItems: [],
      },
      preferences: this.createDefaultPreferences(),
      messageHistory: [],
    };
  }

  private createDefaultPreferences(): UserPreferences {
    return {
      language: 'hinglish' as LanguageType,
      defaultPaymentMode: 'upi',
      approvalThreshold: config.rules.defaultApprovalThreshold,
      autoMappings: {
        'petrol': 'Vehicle Expense',
        'diesel': 'Vehicle Expense',
        'chai': 'Office Expense',
        'khana': 'Staff Welfare',
        'courier': 'Shipping Charges',
        'freight': 'Transport Charges',
        'kiraya': 'Rent',
        'bijli': 'Electricity',
        'phone': 'Communication',
        'internet': 'Communication',
        'stationery': 'Office Expense',
      },
      frequentVendors: [],
      frequentCustomers: [],
      frequentItems: [],
      entityMappings: {},
      learningData: [],
    };
  }
}
