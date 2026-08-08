import React, { useEffect, useState } from 'react';
import {
  ScrollText, Search, AlertTriangle,
  Shield, RefreshCw,
} from 'lucide-react';
import {
  Card, CardContent,
  Button, Input,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui';
import { DataTable } from '@/components/shared/data-table';
import { ExportButton } from '@/components/shared/ExportButton';
import { SectionLoader } from '@/components/shared/loading';
import { adminApi } from '@/lib/api';
import { formatDate } from '@/utils';

interface AuditLog {
  id: string;
  action: string;
  user_name: string;
  user_phone?: string;
  ip: string;
  timestamp: string;
  details: string;
  severity: 'info' | 'warning' | 'critical';
}

// NOTE: a hard-coded `defaultLogs` array of ten fabricated audit entries
// ("Rajesh Kumar logged in via OTP", "Razorpay payment ₹999", …) used to live
// here and was rendered whenever the API returned nothing or errored. Showing
// invented audit history to an administrator is worse than showing none, so the
// page now renders a genuine empty state instead.

export default function AdminAuditPage() {
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [actionFilter, setActionFilter] = useState<string>('all');

  useEffect(() => {
    fetchLogs();
  }, []);

  /**
   * The API returns raw Prisma AuditLog rows — { action, entity_type, new_data,
   * ip_address, created_at, user: { name, phone } } — none of which match the
   * flat shape this page renders. In particular no row has a `severity` field,
   * so `l.severity.toUpperCase()` threw a TypeError on the first real row and,
   * with no ErrorBoundary in the app, blanked the entire SPA. Normalise here.
   */
  const normalise = (row: Record<string, any>): AuditLog => {
    const action: string = row.action ?? 'UNKNOWN';
    const CRITICAL = ['DELETE', 'ADMIN', 'SUSPEND', 'FAILED_LOGIN'];
    const WARNING = ['UPDATE', 'DEACTIVATE', 'CANCEL', 'REFUND'];
    const severity: AuditLog['severity'] = CRITICAL.some((k) => action.includes(k))
      ? 'critical'
      : WARNING.some((k) => action.includes(k))
        ? 'warning'
        : 'info';

    // Prefer an explicit server-side severity if one is ever added.
    const rawSeverity = row.severity as AuditLog['severity'] | undefined;

    const detailSource = row.new_data ?? row.old_data;
    const details =
      row.details ??
      [row.entity_type, row.entity_id && String(row.entity_id).slice(0, 8)]
        .filter(Boolean)
        .join(' ') +
        (detailSource ? ` — ${JSON.stringify(detailSource).slice(0, 120)}` : '');

    return {
      id: row.id ?? crypto.randomUUID(),
      action,
      user_name: row.user_name ?? row.user?.name ?? 'System',
      user_phone: row.user_phone ?? row.user?.phone,
      ip: row.ip ?? row.ip_address ?? '—',
      timestamp: row.timestamp ?? row.created_at ?? new Date().toISOString(),
      details: details || '—',
      severity: rawSeverity ?? severity,
    };
  };

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const res = await adminApi.auditLogs();
      const rows = res.data?.data;
      if (Array.isArray(rows) && rows.length) setLogs(rows.map(normalise));
      else setLogs([]);
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredLogs = logs.filter((l) => {
    const matchSearch = !searchQuery ||
      l.user_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.details.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.ip.includes(searchQuery);
    const matchSeverity = severityFilter === 'all' || l.severity === severityFilter;
    const matchAction = actionFilter === 'all' || l.action === actionFilter;
    return matchSearch && matchSeverity && matchAction;
  });

  const uniqueActions = [...new Set(logs.map((l) => l.action))];

  const severityColors: Record<string, string> = {
    info: 'bg-blue-500/10 text-blue-500',
    warning: 'bg-amber-500/10 text-amber-500',
    critical: 'bg-red-500/10 text-red-500',
  };

  const severityIcons: Record<string, React.ReactNode> = {
    info: <ScrollText className="h-3.5 w-3.5" />,
    warning: <AlertTriangle className="h-3.5 w-3.5" />,
    critical: <Shield className="h-3.5 w-3.5" />,
  };

  const columns = [
    {
      key: 'timestamp',
      header: 'Time',
      render: (l: AuditLog) => (
        <span className="text-sm text-muted-foreground whitespace-nowrap">{formatDate(l.timestamp)}</span>
      ),
    },
    {
      key: 'severity',
      header: 'Level',
      render: (l: AuditLog) => (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${severityColors[l.severity]}`}>
          {severityIcons[l.severity]}
          {l.severity.toUpperCase()}
        </span>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      render: (l: AuditLog) => <span className="font-mono text-xs text-primary">{l.action}</span>,
    },
    {
      key: 'user_name',
      header: 'User',
      render: (l: AuditLog) => (
        <div>
          <span className="font-medium text-sm">{l.user_name}</span>
          {l.user_phone && <span className="text-xs text-muted-foreground block">{l.user_phone}</span>}
        </div>
      ),
    },
    {
      key: 'details',
      header: 'Details',
      render: (l: AuditLog) => <span className="text-sm">{l.details}</span>,
    },
    {
      key: 'ip',
      header: 'IP',
      render: (l: AuditLog) => <span className="text-xs text-muted-foreground font-mono">{l.ip}</span>,
    },
  ];

  if (loading) return <SectionLoader />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ScrollText className="h-7 w-7 text-emerald-500" />
          <div>
            <h2 className="text-2xl font-bold">Audit Logs</h2>
            <p className="text-muted-foreground">{logs.length} total events</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchLogs}>
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
          </Button>
          <ExportButton
            label="Export Logs"
            data={filteredLogs}
            columns={['action', 'user_name', 'user_phone', 'ip', 'details', 'severity', 'timestamp']}
            filename="admin_audit_logs"
          />
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <ScrollText className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <p className="text-xl font-bold">{logs.filter(l => l.severity === 'info').length}</p>
              <p className="text-xs text-muted-foreground">Info Events</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <p className="text-xl font-bold">{logs.filter(l => l.severity === 'warning').length}</p>
              <p className="text-xs text-muted-foreground">Warnings</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-red-500/10 flex items-center justify-center">
              <Shield className="h-5 w-5 text-red-500" />
            </div>
            <div>
              <p className="text-xl font-bold">{logs.filter(l => l.severity === 'critical').length}</p>
              <p className="text-xs text-muted-foreground">Critical</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search logs by user, action, details, or IP..."
                className="pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Severity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Levels</SelectItem>
                <SelectItem value="info">Info</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                {uniqueActions.map((a) => (
                  <SelectItem key={a} value={a}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Logs Table */}
      <DataTable
        columns={columns}
        data={filteredLogs}
        emptyMessage="No audit logs found matching your filters"
      />
    </div>
  );
}
