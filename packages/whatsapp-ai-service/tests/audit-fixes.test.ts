// =============================================================================
// Regression tests for the 2026-08 audit fixes (latent-bug pass)
// =============================================================================

import { SamajhAgent } from '../src/agents/samajh.agent';
import { HisaabAgent } from '../src/agents/hisaab.agent';
import {
  MCP_TOOLS,
  AVAILABLE_MCP_TOOLS,
  IMPLEMENTED_TOOL_NAMES,
  MCPToolExecutor,
} from '../src/mcp/index';
import { ExtractedEntity, ConversationState, IntentClassification } from '../src/types';

// ─── A: duplicate AMOUNT entities / 1000x understatement ─────────────────────

describe('Samajh amount extraction (finding A)', () => {
  const agent = new SamajhAgent();
  const extract = (text: string): ExtractedEntity[] =>
    (agent as any).extractEntitiesRuleBased(text);

  test('"rs 2 lakh" yields a single multiplied AMOUNT, not an unmultiplied ₹2 first', () => {
    const amounts = extract('Ram ko rs 2 lakh diye').filter(e => e.type === 'AMOUNT');
    expect(amounts).toHaveLength(1);
    expect(parseFloat(amounts[0].normalizedValue!)).toBe(200000);
    // Consumers `.find()` the first AMOUNT — it must already be the multiplied one
    expect(amounts.find(e => e.type === 'AMOUNT')!.normalizedValue).toBe('200000');
  });

  test('"₹2.5 lakh" multiplied via following-text lookahead', () => {
    const amounts = extract('payment ₹2.5 lakh aaya').filter(e => e.type === 'AMOUNT');
    expect(amounts).toHaveLength(1);
    expect(parseFloat(amounts[0].normalizedValue!)).toBe(250000);
  });

  test('"15 hazaar" and "15k" multiply by 1000', () => {
    expect(parseFloat(extract('15 hazaar diye')[0].normalizedValue!)).toBe(15000);
    expect(parseFloat(extract('15k diye')[0].normalizedValue!)).toBe(15000);
  });

  test('plain amounts unaffected; "50 kg" is not treated as ₹50,000', () => {
    const amounts = extract('50 kg cement 2500 rs').filter(e => e.type === 'AMOUNT');
    // Only the "2500 rs" is an amount; quantity 50 must not be multiplied
    expect(amounts.every(e => parseFloat(e.normalizedValue!) !== 50000)).toBe(true);
    expect(amounts.some(e => parseFloat(e.normalizedValue!) === 2500)).toBe(true);
  });

  test('two distinct amounts both survive collapsing', () => {
    const amounts = extract('Ram ko 5000 rs aur Shyam ko rs 1 lakh diye').filter(e => e.type === 'AMOUNT');
    const values = amounts.map(e => parseFloat(e.normalizedValue!)).sort((a, b) => a - b);
    expect(values).toEqual([5000, 100000]);
  });
});

// ─── B: unimplemented tools must not be advertised or answer success ─────────

describe('MCP registry honesty (findings B & C)', () => {
  const executor = new MCPToolExecutor();

  test('advertised list contains only implemented tools', () => {
    expect(AVAILABLE_MCP_TOOLS.length).toBe(IMPLEMENTED_TOOL_NAMES.size);
    for (const tool of AVAILABLE_MCP_TOOLS) {
      expect(IMPLEMENTED_TOOL_NAMES.has(tool.name)).toBe(true);
    }
    // The full catalog still defines more (planned) tools than are advertised
    expect(MCP_TOOLS.length).toBeGreaterThan(AVAILABLE_MCP_TOOLS.length);
  });

  test('every advertised tool executes without "not implemented"', async () => {
    const dummyParams: Record<string, Record<string, unknown>> = {
      validate_gstin: { gstin: '27AAPFU0939F1ZV' },
      parse_amount: { text: '15 hazaar' },
      search_party: { query: 'Ram' },
      create_party: { name: 'Ram', type: 'vendor' },
      get_party_outstanding: { party_id: 'p1' },
      daily_summary: {},
      gst_summary: { month: 7, year: 2026 },
    };
    for (const tool of AVAILABLE_MCP_TOOLS) {
      const result = await executor.execute(tool.name, dummyParams[tool.name] || {});
      expect(result.error || '').not.toContain('not implemented');
    }
  });

  test('unimplemented tool reports success:false', async () => {
    const result = await executor.execute('create_purchase', { vendor_id: 'v1', items: [] });
    expect(result.success).toBe(false);
  });

  test('caller-supplied business_id is stripped (tenant scoping is server-side)', async () => {
    const params: Record<string, unknown> = { name: 'X', type: 'vendor', business_id: 'someone-elses' };
    const result = await executor.execute('create_party', params);
    expect(params.business_id).toBeUndefined();
    expect(JSON.stringify(result.data)).not.toContain('someone-elses');
  });
});

// ─── I: parse_amount word boundaries ─────────────────────────────────────────

describe('parse_amount boundaries (finding I)', () => {
  const executor = new MCPToolExecutor();
  const parse = async (text: string): Promise<number> => {
    const result = await executor.execute('parse_amount', { text });
    return (result.data as { amount: number }).amount;
  };

  test('"50 kg" parses as 50, not 50,000', async () => {
    expect(await parse('50 kg')).toBe(50);
  });

  test('"15k" still parses as 15,000', async () => {
    expect(await parse('15k')).toBe(15000);
  });

  test('"2.5 lakh" parses as 2,50,000', async () => {
    expect(await parse('2.5 lakh')).toBe(250000);
  });

  test('"2 litre" is not treated as 2 lakh', async () => {
    expect(await parse('2 litre')).toBe(2);
  });

  test('"1 crore" parses as 1,00,00,000', async () => {
    expect(await parse('1 crore')).toBe(10000000);
  });
});

// ─── H: daily summary vs outstanding routing ─────────────────────────────────

describe('Hisaab report routing (finding H)', () => {
  const previousFlag = process.env.WHATSAPP_AI_ALLOW_INSECURE_DEV;

  beforeAll(() => {
    // The placeholder report bodies are gated behind the dev flag; routing is
    // what we assert here.
    process.env.WHATSAPP_AI_ALLOW_INSECURE_DEV = 'true';
  });
  afterAll(() => {
    if (previousFlag === undefined) delete process.env.WHATSAPP_AI_ALLOW_INSECURE_DEV;
    else process.env.WHATSAPP_AI_ALLOW_INSECURE_DEV = previousFlag;
  });

  const agent = new HisaabAgent();

  const makeIntent = (rawText: string, intent: IntentClassification['intent']): IntentClassification => ({
    intent,
    confidence: 0.9,
    language: 'hinglish',
    entities: [],
    rawText,
    normalizedText: rawText.toLowerCase(),
  });

  const context = {
    userId: 'whatsapp:919876543210',
    tenantId: 'biz_test',
    sessionId: 's1',
    context: { recentParties: [], recentItems: [] },
    preferences: {
      language: 'hinglish',
      defaultPaymentMode: 'upi',
      approvalThreshold: 50000,
      autoMappings: {},
      frequentVendors: [],
      frequentCustomers: [],
      frequentItems: [],
      entityMappings: {},
      learningData: [],
    },
    messageHistory: [],
  } as unknown as ConversationState;

  test('"Aaj ka Hisaab" button (daily_summary id) returns the daily summary', async () => {
    const report = await agent.generateReport(
      makeIntent('Aaj ka Hisaab', 'REPORT_REQUEST'),
      context,
      'daily_summary'
    );
    expect(report).toContain('Aaj ka Hisaab');
    expect(report).not.toContain('Outstanding');
  });

  test('"Baaki Hisaab" button (outstanding id) returns the outstanding report', async () => {
    const report = await agent.generateReport(
      makeIntent('Baaki Hisaab', 'UNKNOWN'),
      context,
      'outstanding'
    );
    expect(report).toContain('Outstanding');
  });

  test('typed "aaj ka hisaab" (REPORT_REQUEST) reaches the daily branch', async () => {
    const report = await agent.generateReport(
      makeIntent('aaj ka hisaab', 'REPORT_REQUEST'),
      context
    );
    expect(report).toContain('Aaj ka Hisaab');
    expect(report).not.toContain('Outstanding');
  });

  test('OUTSTANDING_QUERY intent routes to outstanding', async () => {
    const report = await agent.generateReport(
      makeIntent('Ram ka baaki kitna hai', 'OUTSTANDING_QUERY'),
      context
    );
    expect(report).toContain('Outstanding');
  });

  test('reports refuse (honest message) without the dev flag', async () => {
    delete process.env.WHATSAPP_AI_ALLOW_INSECURE_DEV;
    try {
      const report = await agent.generateReport(
        makeIntent('aaj ka hisaab', 'REPORT_REQUEST'),
        context
      );
      expect(report).toContain('Reports abhi available nahi');
    } finally {
      process.env.WHATSAPP_AI_ALLOW_INSECURE_DEV = 'true';
    }
  });
});
