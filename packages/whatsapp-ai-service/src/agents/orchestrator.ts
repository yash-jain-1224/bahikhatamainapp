// =============================================================================
// BahiKhata Agent Orchestrator - LangGraph Multi-Agent System
// =============================================================================

import {
  WhatsAppMessage,
  IntentClassification,
  ConversationState,
  DocumentExtractionResult,
  EntityResolutionResult,
  ValidationResult,
  TransactionEntry,
} from '../types';
import { SamajhAgent } from './samajh.agent';
import { DastaveezAgent } from './dastaveez.agent';
import { PehchaanAgent } from './pehchaan.agent';
import { JaanchAgent } from './jaanch.agent';
import { LekhaAgent } from './lekha.agent';
import { HisaabAgent } from './hisaab.agent';
import { MemoryService } from '../services/memory.service';
import { GatewayClient, isGatewayConfigured } from '../services/gateway-client';
import { TransactionPoster } from '../services/transaction-poster';
import { config } from '../config';

export interface AgentInput {
  userId: string;
  senderName: string;
  /**
   * Business (tenant) id resolved server-side from the authenticated user
   * (UserResolutionService). This is the ONLY source of tenant context for
   * the conversation — never derived from the phone number.
   */
  businessId: string;
  message: WhatsAppMessage;
  phoneNumberId: string;
  timestamp: string;
}

export interface AgentResponse {
  text?: string;
  buttons?: Array<{ id: string; title: string }>;
  list?: {
    title: string;
    body: string;
    sections: Array<{
      title: string;
      rows: Array<{ id: string; title: string; description?: string }>;
    }>;
  };
}

// ─── Agent State (LangGraph-style) ──────────────────────────────────────────

interface AgentState {
  input: AgentInput;
  conversationState: ConversationState;
  intent?: IntentClassification;
  documentData?: DocumentExtractionResult;
  entityResolution?: EntityResolutionResult;
  validation?: ValidationResult;
  transaction?: Partial<TransactionEntry>;
  response?: AgentResponse;
  currentNode: string;
  shouldStop: boolean;
  errors: string[];
}

export class AgentOrchestrator {
  private samajhAgent: SamajhAgent;
  private dastaveezAgent: DastaveezAgent;
  private pehchaanAgent: PehchaanAgent;
  private jaanchAgent: JaanchAgent;
  private lekhaAgent: LekhaAgent;
  private hisaabAgent: HisaabAgent;
  private memoryService: MemoryService;

  constructor() {
    this.samajhAgent = new SamajhAgent();
    this.dastaveezAgent = new DastaveezAgent();
    this.pehchaanAgent = new PehchaanAgent();
    this.jaanchAgent = new JaanchAgent();
    this.lekhaAgent = new LekhaAgent();
    this.hisaabAgent = new HisaabAgent();
    this.memoryService = new MemoryService();
  }

  // ─── Main Entry Point ──────────────────────────────────────────────────────
  async processMessage(input: AgentInput): Promise<AgentResponse> {
    const startTime = Date.now();

    // Load conversation state
    const conversationState = await this.memoryService.getConversationState(input.userId);

    // Tenant context always comes from the resolved business of the
    // authenticated user — the memory service's default state has no real
    // tenant (it used to fabricate 'tenant_<phone>', which leaked into Azure
    // Search filters and Cosmos documents).
    conversationState.tenantId = input.businessId;

    // Initialize agent state
    let state: AgentState = {
      input,
      conversationState,
      currentNode: 'START',
      shouldStop: false,
      errors: [],
    };

    try {
      // Execute the agent graph
      state = await this.executeGraph(state);

      // Save updated conversation state
      await this.memoryService.saveConversationState(state.conversationState);

      const elapsed = Date.now() - startTime;
      console.log(`🧠 Agent pipeline completed in ${elapsed}ms (node: ${state.currentNode})`);

      return state.response || { text: 'Samajh nahi aaya. Kripya dubara batayein. 🤔' };
    } catch (error) {
      console.error('Agent orchestration error:', error);
      return {
        text: 'Maaf kijiye, abhi kuch problem aa rahi hai. Thodi der mein try karein. 🙏',
      };
    }
  }

  // ─── Execute the Agent Graph ───────────────────────────────────────────────
  private async executeGraph(state: AgentState): Promise<AgentState> {
    // Check if there's a pending clarification
    if (state.conversationState.pendingClarification) {
      return this.handleClarificationResponse(state);
    }

    // Check if there's a pending approval
    if (state.conversationState.pendingApproval) {
      return this.handleApprovalResponse(state);
    }

    // Step 1: SAMAJH - Understand intent
    state.currentNode = 'SAMAJH';
    state = await this.runSamajhAgent(state);
    if (state.shouldStop) return state;

    // Step 2: DASTAVEEZ - Process document (if media message)
    if (this.hasMedia(state.input.message)) {
      state.currentNode = 'DASTAVEEZ';
      state = await this.runDastaveezAgent(state);
      if (state.shouldStop) return state;
    }

    // Step 3: Route based on intent
    state = await this.routeByIntent(state);

    return state;
  }

  // ─── Route by Intent ───────────────────────────────────────────────────────
  private async routeByIntent(state: AgentState): Promise<AgentState> {
    // Interactive replies carry a machine id — route on it first. Matching
    // only on the button/list TITLE (the fallback text path) is ambiguous:
    // "Aaj ka Hisaab" and "Baaki Hisaab" both contain "hisaab".
    const interactiveId = this.extractInteractiveId(state.input.message);
    if (interactiveId === 'daily_summary' || interactiveId === 'outstanding') {
      return this.handleQueryFlow(state);
    }
    if (interactiveId === 'help') {
      return this.handleHelp(state);
    }

    const intent = state.intent?.intent;

    switch (intent) {
      case 'PURCHASE_ENTRY':
      case 'SALES_ENTRY':
      case 'EXPENSE_ENTRY':
      case 'VENDOR_PAYMENT':
      case 'CUSTOMER_RECEIPT':
      case 'STOCK_UPDATE':
        return this.handleTransactionFlow(state);

      case 'OUTSTANDING_QUERY':
      case 'GST_QUERY':
      case 'REPORT_REQUEST':
        return this.handleQueryFlow(state);

      case 'PARTY_CREATE':
      case 'ITEM_CREATE':
        return this.handleMasterDataFlow(state);

      case 'CORRECTION':
        return this.handleCorrectionFlow(state);

      case 'GREETING':
        return this.handleGreeting(state);

      case 'HELP':
        return this.handleHelp(state);

      default:
        return this.handleUnknown(state);
    }
  }

  // ─── Transaction Flow ──────────────────────────────────────────────────────
  private async handleTransactionFlow(state: AgentState): Promise<AgentState> {
    // Step 3: PEHCHAAN - Entity Resolution
    state.currentNode = 'PEHCHAAN';
    state = await this.runPehchaanAgent(state);
    if (state.shouldStop) return state;

    // Step 4: JAANCH - Validation
    state.currentNode = 'JAANCH';
    state = await this.runJaanchAgent(state);
    if (state.shouldStop) return state;

    // Step 5: LEKHA - Create transaction (or ask for approval)
    state.currentNode = 'LEKHA';
    state = await this.runLekhaAgent(state);

    return state;
  }

  // ─── Query Flow ────────────────────────────────────────────────────────────
  private async handleQueryFlow(state: AgentState): Promise<AgentState> {
    state.currentNode = 'HISAAB';
    state = await this.runHisaabAgent(state);
    return state;
  }

  // ─── Master Data Flow ──────────────────────────────────────────────────────
  private async handleMasterDataFlow(state: AgentState): Promise<AgentState> {
    state.currentNode = 'LEKHA';
    state = await this.runLekhaAgent(state);
    return state;
  }

  // ─── Correction Flow ───────────────────────────────────────────────────────
  private async handleCorrectionFlow(state: AgentState): Promise<AgentState> {
    state.currentNode = 'LEKHA';
    state.response = {
      text: 'Kaun si entry mein correction karna hai? Entry number ya details batayein.',
      buttons: [
        { id: 'last_entry', title: 'Last Entry' },
        { id: 'search_entry', title: 'Entry Search' },
      ],
    };
    state.shouldStop = true;
    return state;
  }

  // ─── Individual Agent Runners ──────────────────────────────────────────────

  private async runSamajhAgent(state: AgentState): Promise<AgentState> {
    const messageText = this.extractMessageText(state.input.message);
    state.intent = await this.samajhAgent.classify(
      messageText,
      state.conversationState
    );

    console.log(`  → Intent: ${state.intent.intent} (${(state.intent.confidence * 100).toFixed(0)}%)`);
    return state;
  }

  private async runDastaveezAgent(state: AgentState): Promise<AgentState> {
    try {
      state.documentData = await this.dastaveezAgent.processDocument(
        state.input.message,
        state.conversationState.tenantId
      );

      // Merge document data into intent entities
      if (state.documentData && state.intent) {
        state.intent = this.samajhAgent.enrichWithDocumentData(
          state.intent,
          state.documentData
        );
      }
    } catch (error) {
      console.error('Document processing error:', error);
      state.errors.push('Document processing failed');
    }
    return state;
  }

  private async runPehchaanAgent(state: AgentState): Promise<AgentState> {
    if (!state.intent) return state;

    const partyEntity = state.intent.entities.find(e => e.type === 'PARTY_NAME');
    if (!partyEntity) return state;

    state.entityResolution = await this.pehchaanAgent.resolveEntity(
      partyEntity.value,
      state.conversationState,
      isGatewayConfigured()
        ? new GatewayClient(
            { userId: state.input.userId, phone: state.input.message.from.replace(/\D/g, '').slice(-10) },
            state.input.businessId,
          )
        : undefined
    );

    // If clarification needed, stop and ask
    if (state.entityResolution.needsClarification) {
      const matches = state.entityResolution.matches;

      // Zero matches: nothing to pick from — parking a pendingClarification
      // with an empty options list trapped every following reply in a
      // "sahi number batayein" loop. Just answer and let the user rephrase.
      if (matches.length === 0) {
        state.response = { text: state.entityResolution.clarificationMessage || '' };
        state.shouldStop = true;
        return state;
      }

      if (matches.length > 3) {
        // Use list for more than 3 options
        state.response = {
          text: state.entityResolution.clarificationMessage || '',
          list: {
            title: 'Party Chunein',
            body: `"${partyEntity.value}" naam ki ${matches.length} party mili:`,
            sections: [{
              title: 'Matching Parties',
              rows: matches.slice(0, 10).map((match, i) => ({
                id: `party_${match.id}`,
                title: match.name,
                description: match.metadata.city || undefined,
              })),
            }],
          },
        };
      } else {
        // Use buttons for 2-3 options
        state.response = {
          text: state.entityResolution.clarificationMessage || '',
          buttons: matches.map(match => ({
            id: `party_${match.id}`,
            title: match.name.slice(0, 20),
          })),
        };
      }

      // Save pending clarification (labels kept so the selection can be
      // rebuilt into a resolved match when the reply arrives)
      state.conversationState.pendingClarification = {
        type: 'party_selection',
        options: matches.map(m => m.id),
        optionLabels: matches.map(m => m.name),
        field: 'partyId',
        originalMessage: this.extractMessageText(state.input.message),
      };

      state.shouldStop = true;
    }

    return state;
  }

  private async runJaanchAgent(state: AgentState): Promise<AgentState> {
    if (!state.intent) return state;

    state.validation = await this.jaanchAgent.validate(
      state.intent,
      state.entityResolution,
      state.documentData,
      state.conversationState
    );

    // If duplicate found, warn user
    if (state.validation.duplicateCheck?.isDuplicate) {
      state.response = {
        text: `⚠️ Ye entry pehle se ho chuki hai (${state.validation.duplicateCheck.existingEntryDate}).\n\nDobara entry karni hai?`,
        buttons: [
          { id: 'confirm_duplicate', title: 'Haan, Karein' },
          { id: 'cancel_duplicate', title: 'Nahi, Cancel' },
        ],
      };
      state.shouldStop = true;
      return state;
    }

    // If validation errors, report them
    if (!state.validation.isValid) {
      const errorMessages = state.validation.errors
        .map(e => `• ${e.messageHindi}`)
        .join('\n');
      state.response = {
        text: `❌ Entry mein kuch problem hai:\n\n${errorMessages}\n\nKripya sahi jaankari bhejein.`,
      };
      state.shouldStop = true;
      return state;
    }

    return state;
  }

  private async runLekhaAgent(state: AgentState): Promise<AgentState> {
    if (!state.intent) return state;

    const result = await this.lekhaAgent.processTransaction(
      state.intent,
      state.entityResolution,
      state.documentData,
      state.conversationState
    );

    // No draft = Lekha is asking for missing details; plain reply, no buttons.
    if (!result.transaction) {
      state.response = { text: result.confirmationMessage };
      return state;
    }

    // A draft exists. Store it — the approval reply is a NEW message, and the
    // poster can only execute what was actually saved here. (The old flow
    // stored nothing and then claimed "Entry post ho gayi!" without posting —
    // a fabricated success about a money transaction.)
    state.transaction = result.transaction;
    state.conversationState.pendingTransaction = result.transaction;

    const amount = result.transaction.amount || 0;
    const needsApproval = amount > state.conversationState.preferences.approvalThreshold;

    state.response = {
      text: result.confirmationMessage,
      buttons: needsApproval
        ? [
            { id: 'approve_entry', title: 'Haan ✅' },
            { id: 'reject_entry', title: 'Nahi ❌' },
          ]
        : [
            { id: 'confirm_post', title: 'Post Karein ✅' },
            { id: 'cancel_post', title: 'Cancel ❌' },
          ],
    };

    // Both flavours park a pending approval — the confirm/cancel reply arrives
    // as a fresh message and must be routed to handleApprovalResponse (the old
    // below-threshold path set buttons but no pending state, so the reply fell
    // through to intent classification and the buttons did nothing).
    state.conversationState.pendingApproval = {
      transactionId: result.transactionId || 'pending',
      type: state.intent.intent,
      amount,
      description: result.confirmationMessage,
      expiresAt: new Date(Date.now() + 30 * 60000).toISOString(), // 30 min expiry
    };

    return state;
  }

  private async runHisaabAgent(state: AgentState): Promise<AgentState> {
    if (!state.intent) return state;

    // Reports read the REAL books via the act-as-user gateway client; when the
    // connection is not configured, hisaab gives an honest "unavailable".
    const gateway = isGatewayConfigured()
      ? new GatewayClient(
          { userId: state.input.userId, phone: state.input.message.from.replace(/\D/g, '').slice(-10) },
          state.input.businessId,
        )
      : undefined;

    const report = await this.hisaabAgent.generateReport(
      state.intent,
      state.conversationState,
      this.extractInteractiveId(state.input.message),
      gateway
    );

    state.response = { text: report };
    return state;
  }

  // ─── Handle Clarification Response ─────────────────────────────────────────
  private async handleClarificationResponse(state: AgentState): Promise<AgentState> {
    const clarification = state.conversationState.pendingClarification!;
    const messageText = this.extractMessageText(state.input.message);

    if (messageText.toLowerCase().includes('cancel')) {
      state.conversationState.pendingClarification = undefined;
      state.response = { text: '❌ Theek hai, entry cancel kar di gayi.' };
      state.shouldStop = true;
      return state;
    }

    // Handle party selection
    if (clarification.type === 'party_selection') {
      // Button/list replies carry the machine id (`party_<id>`); typed replies
      // fall back to number/name matching.
      const interactiveId = this.extractInteractiveId(state.input.message);
      const options = clarification.options || [];
      const labels = clarification.optionLabels || [];

      let selectedId: string | undefined;
      if (interactiveId?.startsWith('party_')) {
        const candidate = interactiveId.slice('party_'.length);
        selectedId = options.find(o => o === candidate);
      }
      if (!selectedId) {
        selectedId = this.extractSelection(messageText, options, labels);
      }

      if (selectedId) {
        // Learn from selection
        await this.memoryService.learnEntityMapping(
          state.conversationState,
          clarification.originalMessage,
          selectedId
        );

        // Re-process the ORIGINAL message with the party pre-resolved, so the
        // entry actually continues instead of dead-ending on a status line.
        state.conversationState.pendingClarification = undefined;
        const selectedName = labels[options.indexOf(selectedId)] || messageText;
        const selectedMatch = {
          id: selectedId,
          name: selectedName,
          type: 'both' as const,
          score: 1.0,
          metadata: { recentTransactions: 0 },
        };

        state.intent = await this.samajhAgent.classify(
          clarification.originalMessage,
          state.conversationState
        );
        state.entityResolution = {
          resolved: true,
          matches: [selectedMatch],
          selectedMatch,
          needsClarification: false,
        };

        state.currentNode = 'JAANCH';
        state = await this.runJaanchAgent(state);
        if (state.shouldStop) return state;

        state.currentNode = 'LEKHA';
        state = await this.runLekhaAgent(state);
        state.shouldStop = true;
        return state;
      }

      state.response = {
        text: 'Sahi number ya naam batayein. Ya "cancel" likhein.',
      };
    }

    state.shouldStop = true;
    return state;
  }

  // ─── Handle Approval Response ──────────────────────────────────────────────
  private async handleApprovalResponse(state: AgentState): Promise<AgentState> {
    const messageText = this.extractMessageText(state.input.message).toLowerCase();
    const approval = state.conversationState.pendingApproval!;
    const draft = state.conversationState.pendingTransaction;

    // Button replies are matched by their machine id first ('approve_entry' /
    // 'reject_entry' are the ids sent with the approval buttons); title-text
    // matching remains as the fallback for typed replies.
    const interactiveId = this.extractInteractiveId(state.input.message);
    const isApproveById = interactiveId === 'approve_entry' || interactiveId === 'confirm_post';
    const isRejectById = interactiveId === 'reject_entry' || interactiveId === 'cancel_post';

    const clearPending = () => {
      state.conversationState.pendingApproval = undefined;
      state.conversationState.pendingTransaction = undefined;
    };

    if (isApproveById || messageText.includes('haan') || messageText.includes('yes') || messageText.includes('approve')) {
      if (new Date(approval.expiresAt).getTime() < Date.now()) {
        clearPending();
        state.response = { text: '⏰ Approval ka time nikal gaya (30 min). Kripya entry dubara bhejein.' };
        state.shouldStop = true;
        return state;
      }

      if (!draft) {
        // Nothing stored to execute — never pretend it was posted.
        clearPending();
        state.response = { text: '❌ Entry ka draft nahi mila (session reset ho gaya hoga). Kripya entry dubara bhejein.' };
        state.shouldStop = true;
        return state;
      }

      if (!isGatewayConfigured()) {
        clearPending();
        state.response = {
          text: '❌ Entry post nahi ho sakti — accounting service se connection configure nahi hai. Kripya app se entry karein.',
        };
        state.shouldStop = true;
        return state;
      }

      // THE actual posting step: act-as-user call through the platform
      // services. The reply is whatever really happened — never a claim.
      const poster = new TransactionPoster(
        new GatewayClient(
          { userId: state.input.userId, phone: state.input.message.from.replace(/\D/g, '').slice(-10) },
          state.input.businessId,
        ),
      );
      const result = await poster.post(draft);
      clearPending();
      state.response = { text: result.userMessage };
    } else if (isRejectById || messageText.includes('nahi') || messageText.includes('no') || messageText.includes('cancel')) {
      clearPending();
      state.response = {
        text: '❌ Entry cancel kar di gayi.',
      };
    } else {
      state.response = {
        text: `Kya aap ye entry approve karte hain?\n\n${approval.description}\n\n"Haan" ya "Nahi" likhein.`,
      };
    }

    state.shouldStop = true;
    return state;
  }

  // ─── Greeting Handler ──────────────────────────────────────────────────────
  private handleGreeting(state: AgentState): AgentState {
    const name = state.input.senderName.split(' ')[0];
    const hour = new Date().getHours();
    let greeting = 'Namaste';
    if (hour < 12) greeting = 'Suprabhat';
    else if (hour < 17) greeting = 'Namaskar';
    else greeting = 'Shubh Sandhya';

    state.response = {
      text: `${greeting} ${name}! 🙏\n\nMain aapka AI Munshi hoon. Aap mujhe ye bhej sakte hain:\n\n📸 Bill/Invoice photo\n🎤 Voice note (Hindi/English)\n💬 Text message\n📄 PDF document\n\nKya madad chahiye?`,
      buttons: [
        { id: 'daily_summary', title: 'Aaj ka Hisaab' },
        { id: 'outstanding', title: 'Baaki Hisaab' },
        { id: 'help', title: 'Help' },
      ],
    };
    state.shouldStop = true;
    return state;
  }

  // ─── Help Handler ──────────────────────────────────────────────────────────
  private handleHelp(state: AgentState): AgentState {
    state.response = {
      text: `🤖 *BahiKhata AI Munshi - Help*\n\n` +
        `Aap ye kaam kar sakte hain:\n\n` +
        `📝 *Entries:*\n` +
        `• "Ram ko 15000 diye" → Payment entry\n` +
        `• "50 bag cement aaya" → Purchase entry\n` +
        `• Bill photo bhejein → Auto entry\n\n` +
        `📊 *Reports:*\n` +
        `• "Aaj ki bikri?" → Daily sales\n` +
        `• "Ram ka baaki?" → Outstanding\n` +
        `• "GST kitna hai?" → Tax report\n\n` +
        `⚙️ *Settings:*\n` +
        `• "Naya party add karo"\n` +
        `• "Naya item add karo"\n\n` +
        `🎤 Voice notes bhi bhej sakte hain Hindi ya English mein!`,
    };
    state.shouldStop = true;
    return state;
  }

  // ─── Unknown Intent Handler ────────────────────────────────────────────────
  private handleUnknown(state: AgentState): AgentState {
    state.response = {
      text: 'Maaf kijiye, samajh nahi aaya. 🤔\n\nKya aap thoda aur detail mein bata sakte hain? Ya "help" likhein.',
      buttons: [
        { id: 'help', title: 'Help' },
        { id: 'daily_summary', title: 'Aaj ka Hisaab' },
      ],
    };
    state.shouldStop = true;
    return state;
  }

  // ─── Utility Methods ───────────────────────────────────────────────────────

  private extractMessageText(message: WhatsAppMessage): string {
    switch (message.type) {
      case 'text':
        return message.text?.body || '';
      case 'interactive':
        return message.interactive?.button_reply?.title
          || message.interactive?.list_reply?.title || '';
      case 'button':
        return message.button?.text || '';
      case 'image':
        return message.image?.caption || '';
      case 'document':
        return message.document?.caption || '';
      default:
        return '';
    }
  }

  private hasMedia(message: WhatsAppMessage): boolean {
    return ['image', 'document', 'audio', 'video'].includes(message.type);
  }

  /**
   * Machine id of an interactive reply (button/list) or quick-reply payload.
   * Prefer routing on this over the human-readable title text.
   */
  private extractInteractiveId(message: WhatsAppMessage): string | undefined {
    return (
      message.interactive?.button_reply?.id ||
      message.interactive?.list_reply?.id ||
      message.button?.payload ||
      undefined
    );
  }

  private extractAmount(intent: IntentClassification): number | undefined {
    const amountEntity = intent.entities.find(e => e.type === 'AMOUNT');
    if (!amountEntity) return undefined;
    return parseFloat(amountEntity.normalizedValue || amountEntity.value);
  }

  private extractSelection(text: string, options: string[], labels: string[] = []): string | undefined {
    // Check if it's a number selection
    const num = parseInt(text);
    if (!isNaN(num) && num > 0 && num <= options.length) {
      return options[num - 1];
    }
    // Match against display names (what the user actually sees and types)
    const lower = text.toLowerCase();
    const labelIdx = labels.findIndex(
      l => l && (lower.includes(l.toLowerCase()) || l.toLowerCase().includes(lower))
    );
    if (labelIdx >= 0) return options[labelIdx];
    // Legacy fallback: raw option ids in the text
    return options.find(opt => lower.includes(opt.toLowerCase()));
  }
}
