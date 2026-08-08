import { useState, useEffect } from 'react';
import api from '@/lib/api';

// Use the shared client. This file used to build its own base URL as
// `VITE_API_URL || 'http://localhost:3000'` and then append `/api/v1/...`,
// while lib/api.ts uses `VITE_API_URL || '/api/v1'`. With VITE_API_URL set (as
// in production) every call double-prefixed to /api/v1/api/v1/wa/... and 404'd;
// unset, it pointed at localhost. It also bypassed the auth interceptor, so the
// 401-protected agent endpoints could never have worked from here.

interface AgentStatus {
  name: string;
  status: string;
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

export default function WhatsAppAIDashboard() {
  const [agents, setAgents] = useState<AgentStatus[]>([]);
  const [testInput, setTestInput] = useState('');
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [chatMessages, setChatMessages] = useState<ConversationMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'test' | 'chat' | 'tools'>('dashboard');

  useEffect(() => {
    fetchAgentStatus();
  }, []);

  const fetchAgentStatus = async () => {
    try {
      const { data } = await api.get('/wa/agents/status');
      setAgents(data.data.agents);
    } catch (err) {
      console.error('Failed to fetch agent status:', err);
    }
  };

  const testClassification = async () => {
    if (!testInput.trim()) return;
    setLoading(true);
    try {
      const { data } = await api.post('/wa/agents/classify', {
        text: testInput,
      });
      setTestResult(data.data);
    } catch (err) {
      console.error('Classification failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const sendTestMessage = async () => {
    if (!chatInput.trim()) return;
    
    const userMsg: ConversationMessage = {
      role: 'user',
      content: chatInput,
      timestamp: new Date().toISOString(),
    };
    setChatMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setLoading(true);

    try {
      const { data } = await api.post('/wa/agents/test', {
        text: chatInput,
      });
      
      const assistantMsg: ConversationMessage = {
        role: 'assistant',
        content: data.data.text || 'No response',
        timestamp: new Date().toISOString(),
      };
      setChatMessages(prev => [...prev, assistantMsg]);
    } catch (err) {
      console.error('Test message failed:', err);
    } finally {
      setLoading(false);
    }
  };

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

      {/* Tabs */}
      <div className="max-w-7xl mx-auto px-6">
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
            {/* Agent Cards */}
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

            {/* Stats Card */}
            <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700 col-span-full">
              <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-4">System Overview</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <p className="text-2xl font-bold text-green-600">6</p>
                  <p className="text-xs text-gray-500">Active Agents</p>
                </div>
                <div className="text-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <p className="text-2xl font-bold text-blue-600">16</p>
                  <p className="text-xs text-gray-500">MCP Tools</p>
                </div>
                <div className="text-center p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                  <p className="text-2xl font-bold text-purple-600">3</p>
                  <p className="text-xs text-gray-500">Languages</p>
                </div>
                <div className="text-center p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                  <p className="text-2xl font-bold text-orange-600">&lt;5s</p>
                  <p className="text-xs text-gray-500">Target Response</p>
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

              {/* Quick Test Buttons */}
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
                  <p className="text-xs text-green-200">Online • Responds instantly</p>
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

        {/* Tools Tab */}
        {activeTab === 'tools' && (
          <div className="mt-6">
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm">
              <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-4">🔧 MCP Tools</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[
                  { name: 'search_party', icon: '🔍', desc: 'Search vendors/customers' },
                  { name: 'create_party', icon: '👤', desc: 'Add new party' },
                  { name: 'get_party_outstanding', icon: '💰', desc: 'Check outstanding' },
                  { name: 'search_item', icon: '📦', desc: 'Search items' },
                  { name: 'create_item', icon: '➕', desc: 'Add new item' },
                  { name: 'get_stock', icon: '📊', desc: 'Check stock' },
                  { name: 'create_purchase', icon: '🛒', desc: 'Record purchase' },
                  { name: 'create_sale', icon: '🧾', desc: 'Record sale' },
                  { name: 'record_payment', icon: '💳', desc: 'Record payment' },
                  { name: 'daily_summary', icon: '📅', desc: 'Daily report' },
                  { name: 'gst_summary', icon: '🏛️', desc: 'GST report' },
                  { name: 'cash_flow', icon: '💵', desc: 'Cash flow' },
                  { name: 'profit_loss', icon: '📈', desc: 'P&L report' },
                  { name: 'stock_report', icon: '📋', desc: 'Stock report' },
                  { name: 'validate_gstin', icon: '✅', desc: 'Validate GSTIN' },
                  { name: 'parse_amount', icon: '🔢', desc: 'Parse amount text' },
                ].map(tool => (
                  <div key={tool.name} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <span className="text-xl">{tool.icon}</span>
                    <div>
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200 font-mono">{tool.name}</p>
                      <p className="text-xs text-gray-500">{tool.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
