import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';

// ─── Why this page does NOT use the shared lib/api client ────────────────────
// The whatsapp-ai-service (port 3013, proxied by the API gateway under
// /api/v1/wa) authenticates with SERVICE API KEYS (X-API-Key / Bearer <key>),
// not user JWTs. Routing these calls through lib/api would:
//   1. attach the user's JWT as `Authorization: Bearer …`, which the service
//      rejects as an invalid API key (401), and
//   2. trip the shared 401 interceptor, which responds by refreshing the
//      session and — when the retry 401s again — LOGGING THE USER OUT. Merely
//      opening this page would kick the user to /login.
// So this page keeps its own axios instance with the same base URL convention
// as lib/api (`VITE_API_URL || '/api/v1'` — never append another /api/v1).
//
// A read-only dashboard key may be provided at build time via
// VITE_WHATSAPP_AI_DASHBOARD_KEY (pairs with the service's
// WHATSAPP_AI_DASHBOARD_KEY env var). Without a key the service only accepts
// requests when it was started with WHATSAPP_AI_ALLOW_INSECURE_DEV=true, so
// this page degrades to an honest "not configured" state instead of failing
// cryptically. Note: the read-only key can view status/tools; the classify
// and chat testers hit write-permission routes and will report the service's
// 403 honestly.
const WA_DASHBOARD_KEY =
  (import.meta.env.VITE_WHATSAPP_AI_DASHBOARD_KEY as string | undefined) || undefined;

const waClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    ...(WA_DASHBOARD_KEY ? { 'X-API-Key': WA_DASHBOARD_KEY } : {}),
  },
});

interface AgentStatus {
  name: string;
  status: string;
  description: string;
}

interface StatusPayload {
  agents: AgentStatus[];
  mcp?: { toolCount: number; status: string };
  performance?: { targetResponseTime?: string; avgResponseTime?: string };
}

interface McpTool {
  name: string;
  description: string;
}

interface TestResult {
  intent: string;
  confidence: number;
  language: string;
  entities: Array<{ type: string; value: string; normalizedValue?: string }>;
}

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

type ServiceError = {
  reason: 'not_configured' | 'unauthorized' | 'unavailable' | 'error';
  detail?: string;
};

type ServiceState =
  | { kind: 'loading' }
  | { kind: 'ready'; status: StatusPayload }
  | ({ kind: 'error' } & ServiceError);

/** Map an axios failure to an honest, user-facing reason. */
function describeError(err: unknown): ServiceError {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    const serverMessage =
      (err.response?.data as { message?: string; error?: string } | undefined)?.message ||
      (err.response?.data as { message?: string; error?: string } | undefined)?.error;
    if (status === 401 || status === 403) {
      if (!WA_DASHBOARD_KEY) return { reason: 'not_configured' };
      return { reason: 'unauthorized', detail: serverMessage };
    }
    if (!err.response || status === 502 || status === 503 || status === 504) {
      return { reason: 'unavailable' };
    }
    return { reason: 'error', detail: serverMessage || err.message };
  }
  return { reason: 'error', detail: err instanceof Error ? err.message : undefined };
}

function errorHeadline(reason: ServiceError['reason']): string {
  switch (reason) {
    case 'not_configured':
      return 'WhatsApp AI is not configured';
    case 'unauthorized':
      return 'Dashboard key rejected';
    case 'unavailable':
      return 'WhatsApp AI service is unreachable';
    default:
      return 'Something went wrong';
  }
}

function errorBody(reason: ServiceError['reason']): string {
  switch (reason) {
    case 'not_configured':
      return 'No dashboard API key is configured for this frontend (VITE_WHATSAPP_AI_DASHBOARD_KEY), and the whatsapp-ai-service rejected the unauthenticated request. Set the key in both the service and this app, then rebuild.';
    case 'unauthorized':
      return 'A dashboard key is configured, but the whatsapp-ai-service rejected it. Check that VITE_WHATSAPP_AI_DASHBOARD_KEY matches the service’s WHATSAPP_AI_DASHBOARD_KEY.';
    case 'unavailable':
      return 'Could not reach the whatsapp-ai-service through the API gateway. The service (port 3013) is likely not running — it is optional and requires its own environment configuration.';
    default:
      return 'The whatsapp-ai-service returned an unexpected error.';
  }
}

// ─── Error / empty panel ─────────────────────────────────────────────────────

function ServiceErrorPanel({ error, onRetry, retrying }: {
  error: ServiceError;
  onRetry: () => void;
  retrying: boolean;
}) {
  return (
    <div className="mt-10 max-w-xl mx-auto bg-white dark:bg-gray-800 rounded-xl p-8 shadow-sm border border-gray-100 dark:border-gray-700 text-center">
      <p className="text-4xl mb-3">{error.reason === 'not_configured' ? '🔧' : '📴'}</p>
      <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-2">
        {errorHeadline(error.reason)}
      </h2>
      <p className="text-sm text-gray-500 dark:text-gray-400">{errorBody(error.reason)}</p>
      {error.detail && (
        <p className="mt-2 text-xs text-gray-400 dark:text-gray-500 font-mono break-words">
          {error.detail}
        </p>
      )}
      <button
        onClick={onRetry}
        disabled={retrying}
        className="mt-5 px-5 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
      >
        {retrying ? 'Retrying…' : 'Retry'}
      </button>
    </div>
  );
}

export default function WhatsAppAIDashboard() {
  const [service, setService] = useState<ServiceState>({ kind: 'loading' });
  const [activeTab, setActiveTab] = useState<'dashboard' | 'test' | 'chat' | 'tools'>('dashboard');

  // MCP tools tab (fetched from the service — never hardcoded)
  const [tools, setTools] = useState<McpTool[] | null>(null);
  const [toolsError, setToolsError] = useState<ServiceError | null>(null);
  const [toolsLoading, setToolsLoading] = useState(false);

  // Intent test tab
  const [testInput, setTestInput] = useState('');
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  // Chat test tab
  const [chatMessages, setChatMessages] = useState<ConversationMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatError, setChatError] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);

  const fetchStatus = useCallback(async () => {
    setService({ kind: 'loading' });
    try {
      const { data } = await waClient.get('/wa/agents/status');
      const payload = data?.data as StatusPayload | undefined;
      if (!payload || !Array.isArray(payload.agents)) {
        setService({ kind: 'error', reason: 'error', detail: 'Unexpected response shape from /wa/agents/status' });
        return;
      }
      setService({ kind: 'ready', status: payload });
    } catch (err) {
      setService({ kind: 'error', ...describeError(err) });
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const fetchTools = useCallback(async () => {
    setToolsLoading(true);
    setToolsError(null);
    try {
      const { data } = await waClient.get('/wa/mcp/tools');
      setTools((data?.data?.tools as McpTool[] | undefined) ?? []);
    } catch (err) {
      setTools(null);
      setToolsError(describeError(err));
    } finally {
      setToolsLoading(false);
    }
  }, []);

  // Load the real tool list once the service is known to be up and the tab opens
  useEffect(() => {
    if (activeTab === 'tools' && service.kind === 'ready' && tools === null && !toolsLoading && !toolsError) {
      fetchTools();
    }
  }, [activeTab, service.kind, tools, toolsLoading, toolsError, fetchTools]);

  const testClassification = async () => {
    if (!testInput.trim()) return;
    setLoading(true);
    setTestError(null);
    try {
      const { data } = await waClient.post('/wa/agents/classify', { text: testInput });
      setTestResult(data.data);
    } catch (err) {
      setTestResult(null);
      const e = describeError(err);
      setTestError(e.detail || `${errorHeadline(e.reason)} — ${errorBody(e.reason)}`);
    } finally {
      setLoading(false);
    }
  };

  const sendTestMessage = async () => {
    if (!chatInput.trim() || loading) return;

    const userMsg: ConversationMessage = {
      role: 'user',
      content: chatInput,
      timestamp: new Date().toISOString(),
    };
    setChatMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setChatError(null);
    setLoading(true);

    try {
      const { data } = await waClient.post('/wa/agents/test', { text: userMsg.content });
      const replyText = typeof data?.data?.text === 'string' ? data.data.text : null;
      if (!replyText) {
        // Never fabricate an assistant reply — report the empty response.
        setChatError('The service returned no reply text for this message.');
      } else {
        setChatMessages(prev => [
          ...prev,
          { role: 'assistant', content: replyText, timestamp: new Date().toISOString() },
        ]);
      }
    } catch (err) {
      const e = describeError(err);
      setChatError(e.detail || `${errorHeadline(e.reason)} — ${errorBody(e.reason)}`);
    } finally {
      setLoading(false);
    }
  };

  const status = service.kind === 'ready' ? service.status : null;
  const agents = status?.agents ?? [];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-gradient-to-r from-green-600 to-emerald-700 text-white p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
              <span className="text-2xl">🤖</span>
            </div>
            <div>
              <h1 className="text-2xl font-bold">BahiKhata AI Munshi</h1>
              <p className="text-green-100">WhatsApp AI Accounting Assistant</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6">
        {/* Loading state */}
        {service.kind === 'loading' && (
          <div className="mt-10 max-w-xl mx-auto bg-white dark:bg-gray-800 rounded-xl p-8 shadow-sm border border-gray-100 dark:border-gray-700 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400 animate-pulse">
              Checking WhatsApp AI service…
            </p>
          </div>
        )}

        {/* Honest error / not-configured state */}
        {service.kind === 'error' && (
          <ServiceErrorPanel error={service} onRetry={fetchStatus} retrying={false} />
        )}

        {/* Service reachable — render the real dashboard */}
        {service.kind === 'ready' && (
          <>
            {/* Tabs */}
            <div className="flex gap-1 mt-4 bg-gray-200 dark:bg-gray-800 rounded-lg p-1">
              {(['dashboard', 'test', 'chat', 'tools'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                    activeTab === tab
                      ? 'bg-white dark:bg-gray-700 text-green-700 dark:text-green-400 shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-800'
                  }`}
                >
                  {tab === 'dashboard' && '📊 Dashboard'}
                  {tab === 'test' && '🧪 Intent Test'}
                  {tab === 'chat' && '💬 Chat Test'}
                  {tab === 'tools' && '🔧 MCP Tools'}
                </button>
              ))}
            </div>

            {/* Dashboard Tab */}
            {activeTab === 'dashboard' && (
              <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Agent Cards — from the service's status response */}
                {agents.map(agent => (
                  <div key={agent.name} className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                          <span className="text-lg">
                            {agent.name === 'Samajh' && '🧠'}
                            {agent.name === 'Dastaveez' && '📄'}
                            {agent.name === 'Pehchaan' && '🔍'}
                            {agent.name === 'Jaanch' && '✅'}
                            {agent.name === 'Lekha' && '📝'}
                            {agent.name === 'Hisaab' && '📊'}
                          </span>
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-800 dark:text-gray-200">{agent.name}</h3>
                          <p className="text-xs text-gray-500">{agent.description}</p>
                        </div>
                      </div>
                      <span className={`w-3 h-3 rounded-full ${
                        agent.status === 'active' ? 'bg-green-500' : 'bg-red-500'
                      }`} />
                    </div>
                  </div>
                ))}
                {agents.length === 0 && (
                  <div className="col-span-full bg-white dark:bg-gray-800 rounded-xl p-8 shadow-sm border border-gray-100 dark:border-gray-700 text-center text-sm text-gray-500">
                    The service reported no agents.
                  </div>
                )}

                {/* Stats Card — every number comes from the status endpoint */}
                <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700 col-span-full">
                  <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-4">System Overview</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                      <p className="text-2xl font-bold text-green-600">
                        {agents.filter(a => a.status === 'active').length}
                      </p>
                      <p className="text-xs text-gray-500">Active Agents</p>
                    </div>
                    <div className="text-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                      <p className="text-2xl font-bold text-blue-600">
                        {status?.mcp?.toolCount ?? '—'}
                      </p>
                      <p className="text-xs text-gray-500">MCP Tools</p>
                    </div>
                    <div className="text-center p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                      <p className="text-2xl font-bold text-purple-600">
                        {status?.performance?.targetResponseTime ?? '—'}
                      </p>
                      <p className="text-xs text-gray-500">Target Response</p>
                    </div>
                    <div className="text-center p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                      <p className="text-2xl font-bold text-orange-600">
                        {status?.performance?.avgResponseTime ?? '—'}
                      </p>
                      <p className="text-xs text-gray-500">Avg Response</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Intent Test Tab */}
            {activeTab === 'test' && (
              <div className="mt-6">
                <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm">
                  <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-4">🧪 Test Intent Classification</h3>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={testInput}
                      onChange={e => setTestInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && testClassification()}
                      placeholder="Type a message in Hindi/English/Hinglish..."
                      className="flex-1 px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 focus:ring-2 focus:ring-green-500 outline-none"
                    />
                    <button
                      onClick={testClassification}
                      disabled={loading}
                      className="px-6 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50"
                    >
                      {loading ? '...' : 'Classify'}
                    </button>
                  </div>

                  {/* Example inputs (suggestions only — nothing is pre-computed) */}
                  <div className="flex flex-wrap gap-2 mt-4">
                    {[
                      'Ram ko 15 hazaar diye',
                      'Aaj ki bikri kitni hui?',
                      '50 bag cement aaya',
                      'GST kitna bharna hai?',
                      'Petrol dala 500 rupees',
                    ].map(text => (
                      <button
                        key={text}
                        onClick={() => { setTestInput(text); }}
                        className="px-3 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600"
                      >
                        {text}
                      </button>
                    ))}
                  </div>

                  {testError && (
                    <div className="mt-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
                      {testError}
                    </div>
                  )}

                  {/* Results */}
                  {testResult && (
                    <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                        <div>
                          <p className="text-xs text-gray-500">Intent</p>
                          <p className="font-bold text-green-600">{testResult.intent}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Confidence</p>
                          <p className="font-bold">{(testResult.confidence * 100).toFixed(0)}%</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Language</p>
                          <p className="font-bold">{testResult.language}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Entities</p>
                          <p className="font-bold">{testResult.entities.length} found</p>
                        </div>
                      </div>
                      {testResult.entities.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-gray-500">Extracted Entities:</p>
                          {testResult.entities.map((entity, i) => (
                            <div key={i} className="flex items-center gap-2 text-sm">
                              <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded text-xs font-mono">
                                {entity.type}
                              </span>
                              <span className="text-gray-700 dark:text-gray-300">{entity.value}</span>
                              {entity.normalizedValue && (
                                <span className="text-gray-400">→ {entity.normalizedValue}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Chat Test Tab */}
            {activeTab === 'chat' && (
              <div className="mt-6">
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
                  {/* Chat Header */}
                  <div className="bg-green-700 text-white px-4 py-3 flex items-center gap-3">
                    <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">🤖</div>
                    <div>
                      <p className="font-medium">BahiKhata AI Munshi</p>
                      <p className="text-xs text-green-200">Test conversation (simulated WhatsApp message)</p>
                    </div>
                  </div>

                  {/* Messages */}
                  <div className="h-96 overflow-y-auto p-4 space-y-3 bg-[#e5ddd5] dark:bg-gray-900">
                    {chatMessages.length === 0 && (
                      <div className="text-center text-gray-500 mt-16">
                        <p className="text-4xl mb-2">💬</p>
                        <p>Start a conversation with AI Munshi</p>
                        <p className="text-sm">Try: "Ram ko 15000 diye" or "Aaj ki bikri?"</p>
                      </div>
                    )}
                    {chatMessages.map((msg, i) => (
                      <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] px-3 py-2 rounded-lg text-sm whitespace-pre-wrap ${
                          msg.role === 'user'
                            ? 'bg-green-100 dark:bg-green-800 text-gray-800 dark:text-gray-200'
                            : 'bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 shadow-sm'
                        }`}>
                          {msg.content}
                        </div>
                      </div>
                    ))}
                    {loading && (
                      <div className="flex justify-start">
                        <div className="bg-white dark:bg-gray-700 px-4 py-2 rounded-lg shadow-sm">
                          <span className="animate-pulse">typing...</span>
                        </div>
                      </div>
                    )}
                    {chatError && (
                      <div className="flex justify-start">
                        <div className="max-w-[80%] px-3 py-2 rounded-lg text-sm bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300">
                          {chatError}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Input */}
                  <div className="p-3 bg-gray-100 dark:bg-gray-800 flex gap-2">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && sendTestMessage()}
                      placeholder="Message AI Munshi..."
                      className="flex-1 px-4 py-2 rounded-full border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 focus:ring-2 focus:ring-green-500 outline-none"
                    />
                    <button
                      onClick={sendTestMessage}
                      disabled={loading}
                      className="w-10 h-10 bg-green-600 text-white rounded-full flex items-center justify-center hover:bg-green-700 disabled:opacity-50"
                    >
                      ➤
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Tools Tab — fetched from GET /wa/mcp/tools, never hardcoded */}
            {activeTab === 'tools' && (
              <div className="mt-6">
                <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm">
                  <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-4">🔧 MCP Tools</h3>

                  {toolsLoading && (
                    <p className="py-8 text-center text-sm text-gray-500 animate-pulse">Loading tools…</p>
                  )}

                  {!toolsLoading && toolsError && (
                    <div className="py-6 text-center">
                      <p className="text-sm text-red-600 dark:text-red-400 mb-1">{errorHeadline(toolsError.reason)}</p>
                      <p className="text-xs text-gray-500 mb-4">{toolsError.detail || errorBody(toolsError.reason)}</p>
                      <button
                        onClick={fetchTools}
                        className="px-4 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
                      >
                        Retry
                      </button>
                    </div>
                  )}

                  {!toolsLoading && !toolsError && tools !== null && tools.length === 0 && (
                    <p className="py-8 text-center text-sm text-gray-500">
                      The service reported no implemented MCP tools.
                    </p>
                  )}

                  {!toolsLoading && !toolsError && tools !== null && tools.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {tools.map(tool => (
                        <div key={tool.name} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                          <span className="text-xl">🔧</span>
                          <div>
                            <p className="text-sm font-medium text-gray-800 dark:text-gray-200 font-mono">{tool.name}</p>
                            <p className="text-xs text-gray-500">{tool.description}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
