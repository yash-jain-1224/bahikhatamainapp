// =============================================================================
// Agent Routes - Agent Status & Testing
// =============================================================================

import { Router, Request, Response } from 'express';
import { AgentOrchestrator } from '../agents/orchestrator';
import { SamajhAgent } from '../agents/samajh.agent';
import { MemoryService } from '../services/memory.service';
import { AVAILABLE_MCP_TOOLS } from '../mcp/index';
import { requireWrite } from '../middleware/auth';
import { agentClassifySchema, validateBody } from '../middleware/sanitize';

export const agentRouter = Router();
const orchestrator = new AgentOrchestrator();
const samajhAgent = new SamajhAgent();
const memoryService = new MemoryService();

// This router is mounted in index.ts behind `requireRead` (the read-only
// dashboard key must be able to hit GET /status). The mutating/processing
// routes below (/classify runs the AI pipeline, /test simulates a full
// message) carry `requireWrite` explicitly.

// Test intent classification
agentRouter.post('/classify', requireWrite, validateBody(agentClassifySchema), async (req: Request, res: Response) => {
  try {
    const { text, userId } = req.body;
    if (!text) {
      return res.status(400).json({ success: false, message: 'text is required' });
    }

    const state = await memoryService.getConversationState(userId || 'test:user');
    const result = await samajhAgent.classify(text, state);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
});

// Test full agent pipeline (simulate WhatsApp message)
agentRouter.post('/test', requireWrite, async (req: Request, res: Response) => {
  try {
    const { text, from, type } = req.body;
    if (!text) {
      return res.status(400).json({ success: false, message: 'text is required' });
    }

    const response = await orchestrator.processMessage({
      userId: `whatsapp:${from || '919876543210'}`,
      senderName: 'Test User',
      businessId: 'test_business',
      message: {
        from: from || '919876543210',
        id: `test_${Date.now()}`,
        timestamp: Math.floor(Date.now() / 1000).toString(),
        type: type || 'text',
        text: { body: text },
      },
      phoneNumberId: 'test_phone_id',
      timestamp: new Date().toISOString(),
    });

    res.json({
      success: true,
      data: response,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
});

// Get agent status
agentRouter.get('/status', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      agents: [
        { name: 'Samajh', status: 'active', description: 'Intent Understanding' },
        { name: 'Dastaveez', status: 'active', description: 'Document Processing' },
        { name: 'Pehchaan', status: 'active', description: 'Entity Resolution' },
        { name: 'Jaanch', status: 'active', description: 'Validation' },
        { name: 'Lekha', status: 'active', description: 'Transaction Processing' },
        { name: 'Hisaab', status: 'active', description: 'Reporting' },
      ],
      mcp: {
        // Derived from the registry of actually-implemented tools — never
        // hardcode this (it silently drifted to 16 while 17 were defined and
        // only 7 implemented).
        toolCount: AVAILABLE_MCP_TOOLS.length,
        status: 'active',
      },
      performance: {
        targetResponseTime: '< 5000ms',
        avgResponseTime: 'N/A (no traffic yet)',
      },
    },
  });
});
