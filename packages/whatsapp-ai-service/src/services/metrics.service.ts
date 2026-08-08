// =============================================================================
// Monitoring & Observability Service
// =============================================================================
// Tracks: response times, error rates, token usage/cost, user satisfaction,
// agent performance, and system health. Exports metrics for dashboards.
// =============================================================================

import { SecureLogger } from '../middleware/pii-masking';

const logger = new SecureLogger('Metrics');

// ─── Metric Types ────────────────────────────────────────────────────────────

export interface MetricPoint {
  name: string;
  value: number;
  tags: Record<string, string>;
  timestamp: number;
}

export interface AgentMetrics {
  totalCalls: number;
  successCount: number;
  errorCount: number;
  totalLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  lastCallAt?: string;
}

export interface CostMetrics {
  totalTokensIn: number;
  totalTokensOut: number;
  totalCostINR: number;
  callCount: number;
}

export interface UserMetrics {
  totalMessages: number;
  totalSessions: number;
  avgMessagesPerSession: number;
  satisfactionScore: number; // 0-5
  satisfactionCount: number;
}

export interface SystemHealthSnapshot {
  uptime: number;
  memoryUsageMB: number;
  activeConnections: number;
  requestsPerMinute: number;
  errorRate: number;
  avgResponseTimeMs: number;
}

// ─── Circular Buffer for Latency Percentile Calculation ──────────────────────

class LatencyBuffer {
  private buffer: number[] = [];
  private maxSize: number;

  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
  }

  push(value: number): void {
    if (this.buffer.length >= this.maxSize) {
      this.buffer.shift();
    }
    this.buffer.push(value);
  }

  percentile(p: number): number {
    if (this.buffer.length === 0) return 0;
    const sorted = [...this.buffer].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  average(): number {
    if (this.buffer.length === 0) return 0;
    return this.buffer.reduce((sum, v) => sum + v, 0) / this.buffer.length;
  }

  count(): number {
    return this.buffer.length;
  }

  reset(): void {
    this.buffer = [];
  }
}

// ─── Metrics Collector (Singleton) ───────────────────────────────────────────

class MetricsCollector {
  private static instance: MetricsCollector;

  // Agent-level metrics
  private agentMetrics: Map<string, AgentMetrics> = new Map();
  private agentLatencies: Map<string, LatencyBuffer> = new Map();

  // Cost tracking
  private costMetrics: CostMetrics = {
    totalTokensIn: 0,
    totalTokensOut: 0,
    totalCostINR: 0,
    callCount: 0,
  };

  // User metrics
  private userMetrics: Map<string, UserMetrics> = new Map();
  private globalUserMetrics: UserMetrics = {
    totalMessages: 0,
    totalSessions: 0,
    avgMessagesPerSession: 0,
    satisfactionScore: 0,
    satisfactionCount: 0,
  };

  // Request-level metrics
  private requestLatencies = new LatencyBuffer(5000);
  private errorCounts = { total: 0, last1min: 0, last5min: 0 };
  private requestCounts = { total: 0, last1min: 0, last5min: 0 };
  private intentCounts: Map<string, number> = new Map();

  // Time-windowed counters
  private minuteCounters: Array<{ timestamp: number; requests: number; errors: number }> = [];

  // Alert thresholds
  private readonly ALERT_THRESHOLDS = {
    errorRatePercent: 5,        // Alert if > 5% error rate
    p95LatencyMs: 5000,         // Alert if p95 > 5s
    avgLatencyMs: 3000,         // Alert if avg > 3s
    costPerDayINR: 5000,        // Alert if daily cost > ₹5000
  };

  private startTime = Date.now();

  private constructor() {
    // Initialize agent metrics
    const agents = ['samajh', 'dastaveez', 'pehchaan', 'jaanch', 'lekha', 'hisaab', 'orchestrator'];
    for (const agent of agents) {
      this.agentMetrics.set(agent, {
        totalCalls: 0, successCount: 0, errorCount: 0,
        totalLatencyMs: 0, p50LatencyMs: 0, p95LatencyMs: 0, p99LatencyMs: 0,
      });
      this.agentLatencies.set(agent, new LatencyBuffer(500));
    }

    // Periodic counter update (every minute)
    setInterval(() => this.updateTimeWindowedCounters(), 60000).unref();
  }

  static getInstance(): MetricsCollector {
    if (!MetricsCollector.instance) {
      MetricsCollector.instance = new MetricsCollector();
    }
    return MetricsCollector.instance;
  }

  // ─── Record Methods ──────────────────────────────────────────────────────

  /**
   * Record an agent invocation
   */
  recordAgentCall(
    agentName: string,
    latencyMs: number,
    success: boolean,
    metadata?: Record<string, unknown>
  ): void {
    const metrics = this.agentMetrics.get(agentName);
    const latencyBuf = this.agentLatencies.get(agentName);

    if (metrics && latencyBuf) {
      metrics.totalCalls++;
      metrics.totalLatencyMs += latencyMs;
      metrics.lastCallAt = new Date().toISOString();

      if (success) {
        metrics.successCount++;
      } else {
        metrics.errorCount++;
      }

      latencyBuf.push(latencyMs);
      metrics.p50LatencyMs = latencyBuf.percentile(50);
      metrics.p95LatencyMs = latencyBuf.percentile(95);
      metrics.p99LatencyMs = latencyBuf.percentile(99);
    }

    // Check latency alert
    if (latencyMs > this.ALERT_THRESHOLDS.p95LatencyMs) {
      logger.warn(`Slow agent response: ${agentName} took ${latencyMs}ms`, metadata);
    }
  }

  /**
   * Record a full request (end-to-end)
   */
  recordRequest(latencyMs: number, success: boolean, intent?: string): void {
    this.requestLatencies.push(latencyMs);
    this.requestCounts.total++;
    this.requestCounts.last1min++;

    if (!success) {
      this.errorCounts.total++;
      this.errorCounts.last1min++;
    }

    if (intent) {
      this.intentCounts.set(intent, (this.intentCounts.get(intent) || 0) + 1);
    }

    this.globalUserMetrics.totalMessages++;
  }

  /**
   * Record AI token usage and cost
   */
  recordTokenUsage(tokensIn: number, tokensOut: number, model = 'gpt-4o'): void {
    this.costMetrics.totalTokensIn += tokensIn;
    this.costMetrics.totalTokensOut += tokensOut;
    this.costMetrics.callCount++;

    // Cost calculation (Azure OpenAI pricing in INR, approximate)
    // GPT-4o: $2.50/1M input, $10/1M output → ~₹210/1M input, ₹840/1M output
    const costRates: Record<string, { input: number; output: number }> = {
      'gpt-4o': { input: 0.00021, output: 0.00084 },      // per token in INR
      'gpt-4o-mini': { input: 0.0000126, output: 0.0000504 },
    };
    const rates = costRates[model] || costRates['gpt-4o'];
    const cost = (tokensIn * rates.input) + (tokensOut * rates.output);
    this.costMetrics.totalCostINR += cost;

    // Daily cost alert
    const uptimeHours = (Date.now() - this.startTime) / 3600000;
    const projectedDailyCost = (this.costMetrics.totalCostINR / Math.max(uptimeHours, 1)) * 24;
    if (projectedDailyCost > this.ALERT_THRESHOLDS.costPerDayINR) {
      logger.warn(`High cost alert: Projected ₹${projectedDailyCost.toFixed(2)}/day`);
    }
  }

  /**
   * Record user satisfaction feedback
   */
  recordSatisfaction(userId: string, score: number): void {
    // Global
    const gs = this.globalUserMetrics;
    gs.satisfactionScore = ((gs.satisfactionScore * gs.satisfactionCount) + score) / (gs.satisfactionCount + 1);
    gs.satisfactionCount++;

    // Per-user
    let userM = this.userMetrics.get(userId);
    if (!userM) {
      userM = { totalMessages: 0, totalSessions: 0, avgMessagesPerSession: 0, satisfactionScore: 0, satisfactionCount: 0 };
      this.userMetrics.set(userId, userM);
    }
    userM.satisfactionScore = ((userM.satisfactionScore * userM.satisfactionCount) + score) / (userM.satisfactionCount + 1);
    userM.satisfactionCount++;
  }

  /**
   * Record a new user session
   */
  recordSession(userId: string): void {
    this.globalUserMetrics.totalSessions++;
    const userM = this.userMetrics.get(userId);
    if (userM) userM.totalSessions++;
  }

  // ─── Query Methods ───────────────────────────────────────────────────────

  /**
   * Get full system health snapshot
   */
  getHealthSnapshot(): SystemHealthSnapshot {
    const mem = process.memoryUsage();
    return {
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      memoryUsageMB: Math.round(mem.heapUsed / 1048576),
      activeConnections: 0, // Would come from server.getConnections
      requestsPerMinute: this.requestCounts.last1min,
      errorRate: this.requestCounts.last1min > 0
        ? (this.errorCounts.last1min / this.requestCounts.last1min) * 100
        : 0,
      avgResponseTimeMs: Math.round(this.requestLatencies.average()),
    };
  }

  /**
   * Get all agent performance metrics
   */
  getAgentMetrics(): Record<string, AgentMetrics> {
    const result: Record<string, AgentMetrics> = {};
    for (const [name, metrics] of this.agentMetrics) {
      result[name] = { ...metrics };
    }
    return result;
  }

  /**
   * Get cost breakdown
   */
  getCostMetrics(): CostMetrics & { projectedDailyCostINR: number; avgCostPerCallINR: number } {
    const uptimeHours = (Date.now() - this.startTime) / 3600000;
    return {
      ...this.costMetrics,
      projectedDailyCostINR: Math.round(((this.costMetrics.totalCostINR / Math.max(uptimeHours, 1)) * 24) * 100) / 100,
      avgCostPerCallINR: this.costMetrics.callCount > 0
        ? Math.round((this.costMetrics.totalCostINR / this.costMetrics.callCount) * 10000) / 10000
        : 0,
    };
  }

  /**
   * Get intent distribution
   */
  getIntentDistribution(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [intent, count] of this.intentCounts) {
      result[intent] = count;
    }
    return result;
  }

  /**
   * Get response time statistics
   */
  getLatencyStats(): { avg: number; p50: number; p95: number; p99: number; count: number } {
    return {
      avg: Math.round(this.requestLatencies.average()),
      p50: Math.round(this.requestLatencies.percentile(50)),
      p95: Math.round(this.requestLatencies.percentile(95)),
      p99: Math.round(this.requestLatencies.percentile(99)),
      count: this.requestLatencies.count(),
    };
  }

  /**
   * Get user metrics summary
   */
  getUserMetricsSummary(): {
    totalUsers: number;
    totalMessages: number;
    totalSessions: number;
    avgSatisfaction: number;
  } {
    return {
      totalUsers: this.userMetrics.size,
      totalMessages: this.globalUserMetrics.totalMessages,
      totalSessions: this.globalUserMetrics.totalSessions,
      avgSatisfaction: Math.round(this.globalUserMetrics.satisfactionScore * 100) / 100,
    };
  }

  /**
   * Get complete dashboard data
   */
  getDashboardData() {
    return {
      timestamp: new Date().toISOString(),
      health: this.getHealthSnapshot(),
      latency: this.getLatencyStats(),
      agents: this.getAgentMetrics(),
      cost: this.getCostMetrics(),
      intents: this.getIntentDistribution(),
      users: this.getUserMetricsSummary(),
      alerts: this.getActiveAlerts(),
    };
  }

  /**
   * Check for active alerts
   */
  getActiveAlerts(): Array<{ level: 'warning' | 'critical'; message: string; since: string }> {
    const alerts: Array<{ level: 'warning' | 'critical'; message: string; since: string }> = [];
    const now = new Date().toISOString();

    // Error rate alert
    const errorRate = this.requestCounts.last1min > 0
      ? (this.errorCounts.last1min / this.requestCounts.last1min) * 100
      : 0;
    if (errorRate > this.ALERT_THRESHOLDS.errorRatePercent) {
      alerts.push({
        level: errorRate > 20 ? 'critical' : 'warning',
        message: `Error rate ${errorRate.toFixed(1)}% exceeds threshold (${this.ALERT_THRESHOLDS.errorRatePercent}%)`,
        since: now,
      });
    }

    // Latency alert
    const p95 = this.requestLatencies.percentile(95);
    if (p95 > this.ALERT_THRESHOLDS.p95LatencyMs && this.requestLatencies.count() > 10) {
      alerts.push({
        level: p95 > 10000 ? 'critical' : 'warning',
        message: `P95 latency ${p95}ms exceeds threshold (${this.ALERT_THRESHOLDS.p95LatencyMs}ms)`,
        since: now,
      });
    }

    // Cost alert
    const uptimeHours = (Date.now() - this.startTime) / 3600000;
    const projectedDaily = (this.costMetrics.totalCostINR / Math.max(uptimeHours, 1)) * 24;
    if (projectedDaily > this.ALERT_THRESHOLDS.costPerDayINR && this.costMetrics.callCount > 50) {
      alerts.push({
        level: 'warning',
        message: `Projected daily cost ₹${projectedDaily.toFixed(0)} exceeds budget (₹${this.ALERT_THRESHOLDS.costPerDayINR})`,
        since: now,
      });
    }

    // Memory alert (> 512 MB)
    const memMB = process.memoryUsage().heapUsed / 1048576;
    if (memMB > 512) {
      alerts.push({
        level: memMB > 1024 ? 'critical' : 'warning',
        message: `High memory usage: ${Math.round(memMB)}MB`,
        since: now,
      });
    }

    return alerts;
  }

  /**
   * Reset all metrics (for testing)
   */
  reset(): void {
    for (const [name] of this.agentMetrics) {
      this.agentMetrics.set(name, {
        totalCalls: 0, successCount: 0, errorCount: 0,
        totalLatencyMs: 0, p50LatencyMs: 0, p95LatencyMs: 0, p99LatencyMs: 0,
      });
      this.agentLatencies.get(name)?.reset();
    }
    this.costMetrics = { totalTokensIn: 0, totalTokensOut: 0, totalCostINR: 0, callCount: 0 };
    this.requestLatencies.reset();
    this.errorCounts = { total: 0, last1min: 0, last5min: 0 };
    this.requestCounts = { total: 0, last1min: 0, last5min: 0 };
    this.intentCounts.clear();
    this.userMetrics.clear();
    this.globalUserMetrics = {
      totalMessages: 0, totalSessions: 0, avgMessagesPerSession: 0,
      satisfactionScore: 0, satisfactionCount: 0,
    };
  }

  // ─── Internal ────────────────────────────────────────────────────────────

  private updateTimeWindowedCounters(): void {
    const now = Date.now();
    this.minuteCounters.push({
      timestamp: now,
      requests: this.requestCounts.last1min,
      errors: this.errorCounts.last1min,
    });

    // Roll forward 5-min window
    this.requestCounts.last5min += this.requestCounts.last1min;
    this.errorCounts.last5min += this.errorCounts.last1min;

    // Keep only last 5 minutes of counters
    while (this.minuteCounters.length > 5) {
      const old = this.minuteCounters.shift()!;
      this.requestCounts.last5min -= old.requests;
      this.errorCounts.last5min -= old.errors;
    }

    // Reset 1-minute counters
    this.requestCounts.last1min = 0;
    this.errorCounts.last1min = 0;
  }
}

// ─── Singleton Export ────────────────────────────────────────────────────────

export const metrics = MetricsCollector.getInstance();

// ─── Express Middleware for Auto-Tracking ────────────────────────────────────

import { Request, Response, NextFunction } from 'express';

/**
 * Middleware that auto-tracks request latency and error rates
 */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  // Hook into response finish event
  res.on('finish', () => {
    const latency = Date.now() - start;
    const success = res.statusCode < 400;
    const intent = (res as any).__intent; // Set by agent routes

    // Skip health checks from metrics
    if (req.path === '/health') return;

    metrics.recordRequest(latency, success, intent);
  });

  next();
}
