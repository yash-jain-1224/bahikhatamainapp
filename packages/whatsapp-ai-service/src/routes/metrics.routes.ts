// =============================================================================
// Metrics & Monitoring Routes - Dashboard Data API
// =============================================================================

import { Router, Request, Response } from 'express';
import { metrics } from '../services/metrics.service';

export const metricsRouter = Router();

// ─── Full Dashboard Data ─────────────────────────────────────────────────────
metricsRouter.get('/dashboard', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: metrics.getDashboardData(),
  });
});

// ─── Health Snapshot ─────────────────────────────────────────────────────────
metricsRouter.get('/health', (_req: Request, res: Response) => {
  const health = metrics.getHealthSnapshot();
  res.json({
    success: true,
    data: health,
  });
});

// ─── Agent Performance ───────────────────────────────────────────────────────
metricsRouter.get('/agents', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: metrics.getAgentMetrics(),
  });
});

// ─── Latency Stats ───────────────────────────────────────────────────────────
metricsRouter.get('/latency', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: metrics.getLatencyStats(),
  });
});

// ─── Cost Breakdown ──────────────────────────────────────────────────────────
metricsRouter.get('/cost', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: metrics.getCostMetrics(),
  });
});

// ─── Intent Distribution ─────────────────────────────────────────────────────
metricsRouter.get('/intents', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: metrics.getIntentDistribution(),
  });
});

// ─── User Metrics ────────────────────────────────────────────────────────────
metricsRouter.get('/users', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: metrics.getUserMetricsSummary(),
  });
});

// ─── Active Alerts ───────────────────────────────────────────────────────────
metricsRouter.get('/alerts', (_req: Request, res: Response) => {
  const alerts = metrics.getActiveAlerts();
  res.json({
    success: true,
    data: {
      count: alerts.length,
      alerts,
    },
  });
});

// ─── Prometheus-compatible Metrics Export ─────────────────────────────────────
metricsRouter.get('/prometheus', (_req: Request, res: Response) => {
  const health = metrics.getHealthSnapshot();
  const latency = metrics.getLatencyStats();
  const cost = metrics.getCostMetrics();
  const users = metrics.getUserMetricsSummary();
  const agents = metrics.getAgentMetrics();

  const lines: string[] = [
    '# HELP whatsapp_ai_uptime_seconds Service uptime in seconds',
    '# TYPE whatsapp_ai_uptime_seconds gauge',
    `whatsapp_ai_uptime_seconds ${health.uptime}`,
    '',
    '# HELP whatsapp_ai_memory_mb Heap memory usage in MB',
    '# TYPE whatsapp_ai_memory_mb gauge',
    `whatsapp_ai_memory_mb ${health.memoryUsageMB}`,
    '',
    '# HELP whatsapp_ai_requests_per_minute Current request rate',
    '# TYPE whatsapp_ai_requests_per_minute gauge',
    `whatsapp_ai_requests_per_minute ${health.requestsPerMinute}`,
    '',
    '# HELP whatsapp_ai_error_rate_percent Current error rate',
    '# TYPE whatsapp_ai_error_rate_percent gauge',
    `whatsapp_ai_error_rate_percent ${health.errorRate}`,
    '',
    '# HELP whatsapp_ai_latency_ms Response latency',
    '# TYPE whatsapp_ai_latency_ms summary',
    `whatsapp_ai_latency_ms{quantile="0.5"} ${latency.p50}`,
    `whatsapp_ai_latency_ms{quantile="0.95"} ${latency.p95}`,
    `whatsapp_ai_latency_ms{quantile="0.99"} ${latency.p99}`,
    `whatsapp_ai_latency_ms_avg ${latency.avg}`,
    '',
    '# HELP whatsapp_ai_cost_inr Total AI cost in INR',
    '# TYPE whatsapp_ai_cost_inr counter',
    `whatsapp_ai_cost_inr ${cost.totalCostINR.toFixed(4)}`,
    '',
    '# HELP whatsapp_ai_tokens_total Total tokens consumed',
    '# TYPE whatsapp_ai_tokens_total counter',
    `whatsapp_ai_tokens_total{direction="in"} ${cost.totalTokensIn}`,
    `whatsapp_ai_tokens_total{direction="out"} ${cost.totalTokensOut}`,
    '',
    '# HELP whatsapp_ai_users_total Total unique users',
    '# TYPE whatsapp_ai_users_total gauge',
    `whatsapp_ai_users_total ${users.totalUsers}`,
    '',
    '# HELP whatsapp_ai_messages_total Total messages processed',
    '# TYPE whatsapp_ai_messages_total counter',
    `whatsapp_ai_messages_total ${users.totalMessages}`,
    '',
    '# HELP whatsapp_ai_satisfaction User satisfaction score (0-5)',
    '# TYPE whatsapp_ai_satisfaction gauge',
    `whatsapp_ai_satisfaction ${users.avgSatisfaction}`,
  ];

  // Agent-level metrics
  for (const [name, agentM] of Object.entries(agents)) {
    lines.push('');
    lines.push(`# HELP whatsapp_ai_agent_calls_total Total calls for agent ${name}`);
    lines.push(`# TYPE whatsapp_ai_agent_calls_total counter`);
    lines.push(`whatsapp_ai_agent_calls_total{agent="${name}"} ${agentM.totalCalls}`);
    lines.push(`whatsapp_ai_agent_errors_total{agent="${name}"} ${agentM.errorCount}`);
    lines.push(`whatsapp_ai_agent_latency_p95{agent="${name}"} ${agentM.p95LatencyMs}`);
  }

  res.set('Content-Type', 'text/plain; charset=utf-8');
  res.send(lines.join('\n') + '\n');
});
