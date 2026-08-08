// =============================================================================
// MCP Routes - Tool Discovery & Execution
// =============================================================================
// Mounted in index.ts behind `requireRead` as the default-deny floor.
// Discovery (GET) is read-only; execution (POST) additionally requires the
// write permission, so a read-only dashboard key can list tools but not run
// them.
// =============================================================================

import { Router, Request, Response } from 'express';
import { AVAILABLE_MCP_TOOLS, MCPToolExecutor } from '../mcp/index';
import { AuthenticatedRequest, requireWrite } from '../middleware/auth';
import { mcpExecuteSchema, validateBody } from '../middleware/sanitize';

export const mcpRouter = Router();
const executor = new MCPToolExecutor();

// List all available MCP tools (only tools with a real executor branch are
// advertised — planned-but-unimplemented tools are not listed).
mcpRouter.get('/tools', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      tools: AVAILABLE_MCP_TOOLS.map(tool => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
        required: tool.required,
      })),
      totalCount: AVAILABLE_MCP_TOOLS.length,
    },
  });
});

// Get specific tool details
mcpRouter.get('/tools/:name', (req: Request, res: Response) => {
  const tool = AVAILABLE_MCP_TOOLS.find(t => t.name === req.params.name);
  if (!tool) {
    return res.status(404).json({ success: false, message: 'Tool not found' });
  }
  res.json({ success: true, data: tool });
});

// Execute a tool
mcpRouter.post('/execute', requireWrite, validateBody(mcpExecuteSchema), async (req: Request, res: Response) => {
  try {
    const { tool, params } = req.body as { tool: string; params?: Record<string, unknown> };

    const toolDef = AVAILABLE_MCP_TOOLS.find(t => t.name === tool);
    if (!toolDef) {
      return res.status(404).json({ success: false, message: `Tool "${tool}" not found` });
    }

    // Validate required parameters
    const missingParams = toolDef.required.filter(p => !(p in (params || {})));
    if (missingParams.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required parameters: ${missingParams.join(', ')}`,
      });
    }

    // Business context comes from the authenticated principal (API key
    // record), never from caller-supplied params — see MCPExecutionContext.
    const auth = req as AuthenticatedRequest;
    const result = await executor.execute(tool, params || {}, { businessId: auth.tenantId });

    // Propagate failure: an unimplemented/failed tool must not answer 200
    // success:true. 501 = executor reported it cannot perform the operation.
    res.status(result.success ? 200 : 501).json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
});

// Batch execute multiple tools
mcpRouter.post('/execute-batch', requireWrite, async (req: Request, res: Response) => {
  try {
    const { calls } = req.body;

    if (!Array.isArray(calls) || calls.length === 0) {
      return res.status(400).json({ success: false, message: 'calls array is required' });
    }

    const auth = req as AuthenticatedRequest;
    const results = await Promise.all(
      calls.map(async (call: { tool: string; params: Record<string, unknown> }) => {
        try {
          return await executor.execute(call.tool, call.params || {}, { businessId: auth.tenantId });
        } catch (error) {
          return { success: false, error: (error as Error).message };
        }
      })
    );

    // Batch is 200 only when every call succeeded; 207-style partial results
    // still return the individual success flags, but the top-level status must
    // not claim success when any tool failed.
    const allOk = results.every(r => r.success);
    res.status(allOk ? 200 : 501).json({ success: allOk, data: results });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
});
