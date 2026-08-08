// =============================================================================
// Data Plane Tests - Gateway Client, User Resolution, Transaction Poster,
// and the orchestrator approve path (end-to-end with a mocked gateway).
// =============================================================================

import jwt from 'jsonwebtoken';

// axios is mocked module-wide: GatewayClient calls axios.create() per instance
// and then instance.request(); every instance shares this one request mock.
const mockRequest = jest.fn();
jest.mock('axios', () => ({
  __esModule: true,
  default: { create: jest.fn(() => ({ request: mockRequest })) },
}));

// Prisma is mocked for user-resolution tests.
const mockGetPrisma = jest.fn();
jest.mock('../src/services/prisma', () => ({
  getPrisma: () => mockGetPrisma(),
  disconnectPrisma: jest.fn(),
}));

import { GatewayClient, GatewayError, isGatewayConfigured } from '../src/services/gateway-client';
import { TransactionPoster } from '../src/services/transaction-poster';
import { UserResolutionService } from '../src/services/user-resolution';
import { AgentOrchestrator } from '../src/agents/orchestrator';
import { MemoryService } from '../src/services/memory.service';
import { WhatsAppMessage } from '../src/types';

const ok = (data: unknown, meta?: unknown) => ({
  status: 200,
  data: { success: true, data, ...(meta ? { meta } : {}) },
});

beforeEach(() => {
  mockRequest.mockReset();
  mockGetPrisma.mockReset();
});

// ─── Gateway Client ──────────────────────────────────────────────────────────

describe('GatewayClient', () => {
  const client = () => new GatewayClient({ userId: 'user-1', phone: '9876543210' }, 'biz-1');

  test('is configured when JWT_SECRET is set', () => {
    expect(isGatewayConfigured()).toBe(true);
  });

  test('mints an act-as-user JWT with the platform claims and sends tenant header', async () => {
    mockRequest.mockResolvedValueOnce(ok({ hello: 'world' }));

    await client().get('/api/v1/profile/parties', { search: 'ram' });

    const call = mockRequest.mock.calls[0][0];
    expect(call.url).toBe('/api/v1/profile/parties');
    expect(call.headers['x-business-id']).toBe('biz-1');

    const token = (call.headers.Authorization as string).replace('Bearer ', '');
    const decoded = jwt.verify(token, 'test-jwt-secret') as Record<string, unknown>;
    expect(decoded.userId).toBe('user-1');
    expect(decoded.phone).toBe('9876543210');
    // Never escalates, even for super-admin users
    expect(decoded.isSuperAdmin).toBe(false);
    // Short-lived (5 min default)
    expect((decoded.exp as number) - (decoded.iat as number)).toBe(300);
  });

  test('unwraps the platform envelope', async () => {
    mockRequest.mockResolvedValueOnce(ok([{ id: 'p1' }], { total: 1 }));
    const { data, meta } = await client().get<Array<{ id: string }>>('/api/v1/profile/parties');
    expect(data).toEqual([{ id: 'p1' }]);
    expect(meta).toEqual({ total: 1 });
  });

  test('success:false and HTTP errors become GatewayError with the service message', async () => {
    mockRequest.mockResolvedValueOnce({ status: 200, data: { success: false, message: 'Nope' } });
    await expect(client().get('/x')).rejects.toThrow('Nope');

    mockRequest.mockRejectedValueOnce({
      response: { status: 403, data: { success: false, message: 'You do not have access to this business' } },
    });
    const err = await client().get('/x').catch(e => e);
    expect(err).toBeInstanceOf(GatewayError);
    expect(err.status).toBe(403);
    expect(err.isClientError).toBe(true);
  });

  test('network failure is a 503 GatewayError, not a crash', async () => {
    mockRequest.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const err = await client().get('/x').catch(e => e);
    expect(err).toBeInstanceOf(GatewayError);
    expect(err.status).toBe(503);
  });
});

// ─── User Resolution (real lookup) ───────────────────────────────────────────

describe('UserResolutionService (real lookup)', () => {
  const svc = () => new UserResolutionService();

  const fakePrisma = (user: unknown, memberships: unknown[] = []) => ({
    user: { findFirst: jest.fn().mockResolvedValue(user) },
    businessUser: { findMany: jest.fn().mockResolvedValue(memberships) },
    whatsAppSession: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn(),
    },
  });

  test('unknown phone → onboarding, never a fabricated owner', async () => {
    mockGetPrisma.mockReturnValue(fakePrisma(null));
    const res = await svc().resolve('919999999999', 'Test');
    expect(res.resolved).toBe(false);
    expect(res.needsOnboarding).toBe(true);
    expect(res.onboardingMessage).toContain('registered nahi');
  });

  test('single business resolves with role and business name', async () => {
    mockGetPrisma.mockReturnValue(
      fakePrisma(
        { id: 'u1', phone: '9876543210', name: 'Ramesh' },
        [{ role: 'OWNER', business: { id: 'b1', name: 'Ramesh Traders' } }],
      ),
    );
    const res = await svc().resolve('919876543210', 'Ramesh');
    expect(res.resolved).toBe(true);
    expect(res.user).toMatchObject({
      userId: 'u1',
      businessId: 'b1',
      businessName: 'Ramesh Traders',
      role: 'OWNER',
    });
  });

  test('multi-business without a stored pick → business picker', async () => {
    mockGetPrisma.mockReturnValue(
      fakePrisma(
        { id: 'u2', phone: '9876500000', name: 'Multi' },
        [
          { role: 'OWNER', business: { id: 'b1', name: 'Shop One' } },
          { role: 'MANAGER', business: { id: 'b2', name: 'Shop Two' } },
        ],
      ),
    );
    const res = await svc().resolve('919876500000', 'Multi');
    expect(res.resolved).toBe(false);
    expect(res.needsBusinessPicker).toBe(true);
    expect(res.businessOptions).toHaveLength(2);
  });

  test('multi-business with a stored pick resolves to it', async () => {
    const prisma = fakePrisma(
      { id: 'u3', phone: '9876511111', name: 'Multi2' },
      [
        { role: 'OWNER', business: { id: 'b1', name: 'Shop One' } },
        { role: 'OWNER', business: { id: 'b2', name: 'Shop Two' } },
      ],
    );
    mockGetPrisma.mockReturnValue(prisma);
    const s = svc();
    s.selectBusiness('919876511111', 'b2');
    const res = await s.resolve('919876511111', 'Multi2');
    expect(res.resolved).toBe(true);
    expect(res.user?.businessId).toBe('b2');
  });

  test('registered user with zero businesses → honest guidance, no fake business', async () => {
    mockGetPrisma.mockReturnValue(fakePrisma({ id: 'u4', phone: '9876522222', name: 'NoBiz' }, []));
    const res = await svc().resolve('919876522222', 'NoBiz');
    expect(res.resolved).toBe(false);
    expect(res.onboardingMessage).toContain('business');
  });
});

// ─── Transaction Poster ──────────────────────────────────────────────────────

describe('TransactionPoster', () => {
  const gw = () => {
    const get = jest.fn();
    const post = jest.fn();
    const poster = new TransactionPoster({ get, post } as unknown as GatewayClient);
    return { get, post, poster };
  };

  test('payment OUT posts the quick-payment contract (snake_case party_id, enum mode)', async () => {
    const { post, poster } = gw();
    post.mockResolvedValueOnce({ data: { id: 'pay-abc-123', amount: 15000 } });

    const result = await poster.post({
      type: 'payment_out',
      partyId: 'party-1',
      partyName: 'Ram Traders',
      amount: 15000,
      paymentMode: 'upi',
      date: '05/08/2026',
    });

    expect(result.posted).toBe(true);
    const [path, body] = post.mock.calls[0];
    expect(path).toBe('/api/v1/billing/payments');
    expect(body.type).toBe('OUT');
    expect(body.party_id).toBe('party-1');
    expect(body.mode).toBe('UPI');
    expect(body.referenceType).toBeUndefined(); // presence would reroute the service
    expect(body.date).toMatch(/^2026-08-05T/); // DD/MM/YYYY converted
    expect(result.userMessage).toContain('✅');
  });

  test('neft/rtgs/imps map to BANK_TRANSFER', async () => {
    const { post, poster } = gw();
    post.mockResolvedValue({ data: { id: 'p1', amount: 1 } });
    await poster.post({ type: 'payment_in', partyId: 'p', amount: 1, paymentMode: 'neft' });
    expect(post.mock.calls[0][1].mode).toBe('BANK_TRANSFER');
    expect(post.mock.calls[0][1].type).toBe('IN');
  });

  test('payment without a resolved party fails honestly — nothing is posted', async () => {
    const { post, poster } = gw();
    const result = await poster.post({ type: 'payment_out', amount: 500 });
    expect(result.posted).toBe(false);
    expect(result.userMessage).toContain('❌');
    expect(post).not.toHaveBeenCalled();
  });

  test('service failure never becomes a success message', async () => {
    const { post, poster } = gw();
    post.mockRejectedValueOnce(new GatewayError('You do not have access', 403, '/x'));
    const result = await poster.post({ type: 'payment_out', partyId: 'p', amount: 100 });
    expect(result.posted).toBe(false);
    expect(result.userMessage).toContain('permission');
  });

  test('purchase resolves item names to itemIds and posts camelCase body', async () => {
    const { get, post, poster } = gw();
    get.mockResolvedValueOnce({ data: [{ id: 'item-9', name: 'Cement', unit: 'BAG' }] });
    post.mockResolvedValueOnce({ data: { purchase_number: 'PUR-0042', total_amount: 19000 } });

    const result = await poster.post({
      type: 'purchase',
      partyId: 'party-1',
      partyName: 'Ram Traders',
      amount: 19000,
      items: [{ name: 'cement', quantity: 50, unit: 'bag', rate: 380, amount: 19000 }],
    });

    expect(result.posted).toBe(true);
    expect(result.reference).toBe('PUR-0042');
    const [path, body] = post.mock.calls[0];
    expect(path).toBe('/api/v1/purchases');
    expect(body.partyId).toBe('party-1');
    expect(body.items).toEqual([{ itemId: 'item-9', quantity: 50, rate: 380, unit: 'bag' }]);
  });

  test('purchase with an unknown item refuses and names the item', async () => {
    const { get, post, poster } = gw();
    get.mockResolvedValueOnce({ data: [] });
    const result = await poster.post({
      type: 'purchase',
      partyId: 'party-1',
      items: [{ name: 'unobtanium', quantity: 5, unit: 'kg', rate: 100, amount: 500 }],
    });
    expect(result.posted).toBe(false);
    expect(result.userMessage).toContain('unobtanium');
    expect(post).not.toHaveBeenCalled();
  });

  test('sale allocates FIFO across lots (oldest first) and posts saleLots', async () => {
    const { get, post, poster } = gw();
    // item search
    get.mockResolvedValueOnce({ data: [{ id: 'item-1', name: 'Cement', unit: 'BAG' }] });
    // lots (returned newest-first, as the API does)
    get.mockResolvedValueOnce({
      data: [
        { id: 'lot-new', item_id: 'item-1', available_qty: 100, status: 'AVAILABLE', created_at: '2026-08-01T00:00:00Z' },
        { id: 'lot-old', item_id: 'item-1', available_qty: 30, status: 'PARTIAL', created_at: '2026-07-01T00:00:00Z' },
        { id: 'lot-dead', item_id: 'item-1', available_qty: 0, status: 'SOLD_OUT', created_at: '2026-06-01T00:00:00Z' },
      ],
    });
    post.mockResolvedValueOnce({ data: { sale_number: 'SAL-0007', total_amount: 21000 } });

    const result = await poster.post({
      type: 'sale',
      partyId: 'cust-1',
      items: [{ name: 'cement', quantity: 50, unit: 'bag', rate: 420, amount: 21000 }],
    });

    expect(result.posted).toBe(true);
    const body = post.mock.calls[0][1];
    expect(body.saleLots).toEqual([
      { lotId: 'lot-old', itemId: 'item-1', quantitySold: 30, rate: 420 },
      { lotId: 'lot-new', itemId: 'item-1', quantitySold: 20, rate: 420 },
    ]);
  });

  test('sale with insufficient stock reports real availability, posts nothing', async () => {
    const { get, post, poster } = gw();
    get.mockResolvedValueOnce({ data: [{ id: 'item-1', name: 'Cement', unit: 'BAG' }] });
    get.mockResolvedValueOnce({
      data: [{ id: 'lot-1', item_id: 'item-1', available_qty: 10, status: 'AVAILABLE', created_at: '2026-07-01T00:00:00Z' }],
    });
    const result = await poster.post({
      type: 'sale',
      partyId: 'cust-1',
      items: [{ name: 'cement', quantity: 50, unit: 'bag', rate: 420, amount: 21000 }],
    });
    expect(result.posted).toBe(false);
    expect(result.userMessage).toContain('Available: 10');
    expect(post).not.toHaveBeenCalled();
  });

  test('expense matches a real expense type; no match lists what exists', async () => {
    const { get, post, poster } = gw();
    get.mockResolvedValueOnce({ data: [{ id: 'et-1', name: 'Diesel' }, { id: 'et-2', name: 'Chai Pani' }] });
    post.mockResolvedValueOnce({ data: { id: 'exp-1' } });

    const okResult = await poster.post({ type: 'expense', amount: 500, notes: 'diesel' });
    expect(okResult.posted).toBe(true);
    expect(post.mock.calls[0][1].expenseTypeId).toBe('et-1');

    get.mockResolvedValueOnce({ data: [{ id: 'et-1', name: 'Diesel' }] });
    const noMatch = await poster.post({ type: 'expense', amount: 500, notes: 'zzz' });
    expect(noMatch.posted).toBe(false);
    expect(noMatch.userMessage).toContain('Diesel');
  });

  test('party create requires a valid mobile and posts camelCase', async () => {
    const { post, poster } = gw();
    const bad = await poster.post({ type: 'party_create', partyName: 'New Guy' });
    expect(bad.posted).toBe(false);
    expect(post).not.toHaveBeenCalled();

    post.mockResolvedValueOnce({ data: { id: 'party-new', name: 'New Guy' } });
    const good = await poster.post({ type: 'party_create', partyName: 'New Guy', partyPhone: '9876543210' });
    expect(good.posted).toBe(true);
    expect(post.mock.calls[0][1]).toMatchObject({ name: 'New Guy', phone: '9876543210', type: 'BOTH' });
  });
});

// ─── Orchestrator approve path (end-to-end, mocked gateway) ──────────────────

describe('Orchestrator approval → real posting', () => {
  const approveMessage: WhatsAppMessage = {
    from: '919876543210',
    id: 'wamid.approve1',
    timestamp: '1719936000',
    type: 'interactive',
    interactive: { type: 'button_reply', button_reply: { id: 'approve_entry', title: 'Haan ✅' } },
  } as unknown as WhatsAppMessage;

  const input = (userId: string) => ({
    userId,
    senderName: 'Ramesh',
    businessId: 'biz-1',
    message: approveMessage,
    phoneNumberId: 'phone-1',
    timestamp: new Date().toISOString(),
  });

  const seedPending = async (userId: string, draft: Record<string, unknown> | undefined) => {
    const memory = new MemoryService();
    const state = await memory.getConversationState(userId);
    state.pendingApproval = {
      transactionId: 'txn-1',
      type: 'VENDOR_PAYMENT',
      amount: 15000,
      description: 'test',
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    state.pendingTransaction = draft as any;
    await memory.saveConversationState(state);
  };

  test('approve executes the stored draft and reports the REAL outcome', async () => {
    const userId = 'approve-user-1';
    await seedPending(userId, {
      type: 'payment_out',
      partyId: 'party-1',
      partyName: 'Ram Traders',
      amount: 15000,
      paymentMode: 'cash',
    });

    mockRequest.mockResolvedValueOnce({
      status: 201,
      data: { success: true, message: 'Payment recorded', data: { id: 'pay-real-1', amount: 15000 } },
    });

    const response = await new AgentOrchestrator().processMessage(input(userId));

    expect(mockRequest).toHaveBeenCalledTimes(1);
    const call = mockRequest.mock.calls[0][0];
    expect(call.url).toBe('/api/v1/billing/payments');
    expect(call.data.party_id).toBe('party-1');
    expect(response.text).toContain('✅ Payment entry post ho gayi');
  });

  test('service failure on approve is reported as failure — never fake success', async () => {
    const userId = 'approve-user-2';
    await seedPending(userId, {
      type: 'payment_out',
      partyId: 'party-1',
      amount: 500,
      paymentMode: 'cash',
    });

    mockRequest.mockRejectedValueOnce({
      response: { status: 503, data: { success: false, message: 'down' } },
    });

    const response = await new AgentOrchestrator().processMessage(input(userId));
    expect(response.text).toContain('❌');
    expect(response.text).not.toContain('post ho gayi!');
  });

  test('approve with no stored draft admits it instead of claiming success', async () => {
    const userId = 'approve-user-3';
    await seedPending(userId, undefined);

    const response = await new AgentOrchestrator().processMessage(input(userId));
    expect(mockRequest).not.toHaveBeenCalled();
    expect(response.text).toContain('draft nahi mila');
  });

  test('expired approval is refused', async () => {
    const userId = 'approve-user-4';
    const memory = new MemoryService();
    const state = await memory.getConversationState(userId);
    state.pendingApproval = {
      transactionId: 'txn-x',
      type: 'VENDOR_PAYMENT',
      amount: 100,
      description: 'test',
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    };
    state.pendingTransaction = { type: 'payment_out', partyId: 'p', amount: 100 };
    await memory.saveConversationState(state);

    const response = await new AgentOrchestrator().processMessage(input(userId));
    expect(mockRequest).not.toHaveBeenCalled();
    expect(response.text).toContain('time nikal gaya');
  });
});
