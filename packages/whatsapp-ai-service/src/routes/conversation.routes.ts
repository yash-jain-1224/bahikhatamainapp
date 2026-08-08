// =============================================================================
// Conversation Routes - View & Manage Conversations
// =============================================================================

import { Router, Request, Response } from 'express';
import { MemoryService } from '../services/memory.service';
import { requireWrite } from '../middleware/auth';
import {
  conversationParamsSchema,
  preferencesBodySchema,
  validateBody,
  validateParams,
} from '../middleware/sanitize';

export const conversationRouter = Router();
const memoryService = new MemoryService();

// This router is mounted in index.ts behind `requireRead`, which is
// apiKeyAuth(['read']) — satisfied by a read-only dashboard key. Two of the
// routes below are not reads: PATCH /:userId/preferences mutates state and
// DELETE /:userId destroys a conversation outright. A read-only key could do
// both, for any phone number, so the mutating routes carry requireWrite
// (apiKeyAuth(['read','write'])) explicitly. The mount-level requireRead stays
// as the default-deny floor for anything added here later.

// Get conversation state for a user
conversationRouter.get('/:userId', validateParams(conversationParamsSchema), async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const state = await memoryService.getConversationState(`whatsapp:${userId}`);
    
    res.json({
      success: true,
      data: {
        userId: state.userId,
        tenantId: state.tenantId,
        sessionId: state.sessionId,
        currentIntent: state.currentIntent,
        pendingClarification: state.pendingClarification,
        pendingApproval: state.pendingApproval,
        preferences: state.preferences,
        messageHistory: state.messageHistory.slice(-10),
        context: state.context,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
});

// Get message history for a user
conversationRouter.get('/:userId/history', validateParams(conversationParamsSchema), async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;
    const state = await memoryService.getConversationState(`whatsapp:${userId}`);

    res.json({
      success: true,
      data: state.messageHistory.slice(-limit),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
});

// Update user preferences (strict body schema: unknown keys rejected)
conversationRouter.patch('/:userId/preferences', requireWrite, validateParams(conversationParamsSchema), validateBody(preferencesBodySchema), async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const updates = req.body;
    const state = await memoryService.getConversationState(`whatsapp:${userId}`);
    
    state.preferences = { ...state.preferences, ...updates };
    await memoryService.saveConversationState(state);

    res.json({
      success: true,
      data: state.preferences,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
});

// Clear conversation (reset state)
conversationRouter.delete('/:userId', requireWrite, validateParams(conversationParamsSchema), async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const state = await memoryService.getConversationState(`whatsapp:${userId}`);
    
    state.messageHistory = [];
    state.pendingClarification = undefined;
    state.pendingApproval = undefined;
    state.currentIntent = undefined;
    await memoryService.saveConversationState(state);

    res.json({ success: true, message: 'Conversation cleared' });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
});
