import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Shield, Users, Building2, CreditCard, BarChart3, TrendingUp, TrendingDown,
  Activity, AlertTriangle, UserPlus, ArrowRight, Crown, ChevronRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, Button } from '@/components/ui';
import { StatCard } from '@/components/shared/stat-card';
import { SectionLoader } from '@/components/shared/loading';
import { adminApi } from '@/lib/api';
import { formatDate } from '@/utils';

interface DashboardStats {
  totalUsers: number;
  totalBusinesses: number;
  activeSubscriptions: number;
  revenue: number;
  newUsersToday: number;
  newUsersThisWeek: number;
  churnRate: number;
  avgRevenuePerUser: number;
}

// Recent Activity is driven by the audit log. It used to render six hardcoded
// events ("Rahul Verma registered 2 min ago") that never changed, because the
// setter was never called — so the panel always described activity that had not
// happened.
interface AuditEntry {
  id: string;
  action: string;
  entity_type: string;
  created_at: string;
  user?: { id: string; name?: string; phone: string } | null;
  business?: { id: string; name: string } | null;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

interface RecentUser {
  id: string;
  name?: string;
  phone: string;
  email?: string;
  created_at: string;
  is_super_admin?: boolean;
  _count?: { business_users?: number };
}

interface RecentBusiness {
  id: string;
  name: string;
  type?: string;
  city?: string;
  state?: string;
  created_at: string;
  _count?: { business_users?: number; purchases?: number; sales?: number };
  subscriptions?: { plan?: { name: string }; status: string }[];
}

// Zeroes, not sample data. These used to be 1,250 users / 890 businesses /
// ₹450k MRR, which is what an admin saw whenever the request failed — invented
// figures rendered identically to real ones, with nothing on screen to say the
// fetch had failed. An empty platform now reads as empty, and a failed load
// says so.
const defaultStats: DashboardStats = {
  totalUsers: 0,
  totalBusinesses: 0,
  activeSubscriptions: 0,
  revenue: 0,
  newUsersToday: 0,
  newUsersThisWeek: 0,
  churnRate: 0,
  avgRevenuePerUser: 0,
};

export default function AdminDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>(defaultStats);
  const [statsError, setStatsError] = useState(false);
  const [activity, setActivity] = useState<AuditEntry[]>([]);
  const [recentUsers, setRecentUsers] = useState<RecentUser[]>([]);
  const [recentBusinesses, setRecentBusinesses] = useState<RecentBusiness[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    fetchDashboard();
  }, []);

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      const [dashRes, usersRes, bizRes, auditRes] = await Promise.allSettled([
        adminApi.dashboard(),
        adminApi.users({ limit: 8, sortBy: 'created_at', sortOrder: 'desc' }),
        adminApi.businesses({ limit: 8, sortBy: 'created_at', sortOrder: 'desc' }),
        adminApi.auditLogs({ limit: 6 }),
      ]);
      if (dashRes.status === 'fulfilled' && dashRes.value.data?.data) {
        // Map field by field. Assigning the payload wholesale dropped every key
        // the server does not send, so `revenue` became undefined and the MRR
        // tile rendered "₹NaNk"; ARPU and churn rendered as a bare "₹" and "%".
        const d = dashRes.value.data.data;
        setStats({
          totalUsers: num(d.totalUsers),
          totalBusinesses: num(d.totalBusinesses),
          activeSubscriptions: num(d.activeSubscriptions),
          revenue: num(d.revenue ?? d.totalRevenue),
          newUsersToday: num(d.newUsersToday),
          newUsersThisWeek: num(d.newUsersThisWeek),
          churnRate: num(d.churnRate),
          avgRevenuePerUser: num(d.avgRevenuePerUser),
        });
        setStatsError(false);
      } else {
        setStatsError(true);
      }
      if (usersRes.status === 'fulfilled' && usersRes.value.data?.data) {
        setRecentUsers(usersRes.value.data.data);
      }
      if (bizRes.status === 'fulfilled' && bizRes.value.data?.data) {
        setRecentBusinesses(bizRes.value.data.data);
      }
      if (auditRes.status === 'fulfilled' && Array.isArray(auditRes.value.data?.data)) {
        setActivity(auditRes.value.data.data);
      }
    } catch {
      setStatsError(true);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <SectionLoader />;

  // Audit actions are names like ADMIN_CREATE_USER / PAYMENT_CREATE, so match on
  // keywords rather than the exact string — new actions still get a sane icon.
  const iconFor = (action: string): React.ReactNode => {
    const a = action.toUpperCase();
    if (a.includes('PAYMENT') || a.includes('INVOICE')) return <CreditCard className="h-4 w-4 text-purple-500" />;
    if (a.includes('DELETE')) return <AlertTriangle className="h-4 w-4 text-red-500" />;
    if (a.includes('CREATE')) return <UserPlus className="h-4 w-4 text-blue-500" />;
    if (a.includes('SUBSCRIPTION') || a.includes('UPDATE')) return <TrendingUp className="h-4 w-4 text-emerald-500" />;
    return <TrendingDown className="h-4 w-4 text-amber-500" />;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="h-7 w-7 text-red-500" />
        <div>
          <h2 className="text-2xl font-bold">Admin Dashboard</h2>
          <p className="text-muted-foreground">Platform overview & key metrics</p>
        </div>
      </div>

      {statsError && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-600 dark:text-amber-400">
          Could not load platform metrics. The figures below are not current.
        </div>
      )}

      {/* Primary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Users" value={stats.totalUsers.toLocaleString()} icon={Users} iconColor="text-blue-400" />
        <StatCard title="Total Businesses" value={stats.totalBusinesses.toLocaleString()} icon={Building2} iconColor="text-purple-400" />
        <StatCard title="Active Subscriptions" value={stats.activeSubscriptions.toLocaleString()} icon={CreditCard} iconColor="text-emerald-400" />
        {/* Below ₹1,00,000 the "k" form rounded everything real to ₹0k — ₹999 of
            revenue is not "₹1k" of information to whoever reads this tile. */}
        <StatCard
          title="Revenue (paid invoices)"
          value={stats.revenue >= 100000
            ? `₹${(stats.revenue / 1000).toFixed(0)}k`
            : `₹${stats.revenue.toLocaleString('en-IN')}`}
          icon={BarChart3}
          iconColor="text-amber-400"
        />
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <UserPlus className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.newUsersToday}</p>
              <p className="text-xs text-muted-foreground">New today</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.newUsersThisWeek}</p>
              <p className="text-xs text-muted-foreground">New this week</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-red-500/10 flex items-center justify-center">
              <TrendingDown className="h-5 w-5 text-red-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.churnRate}%</p>
              <p className="text-xs text-muted-foreground">Churn rate</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <BarChart3 className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">₹{stats.avgRevenuePerUser}</p>
              <p className="text-xs text-muted-foreground">ARPU</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── Recent Users & Businesses ─────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Users */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4 text-blue-400" />
                Recent Users
              </CardTitle>
              <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => navigate('/admin/users')}>
                View All <ArrowRight className="h-3 w-3" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {recentUsers.length > 0 ? (
              <div className="space-y-1">
                {recentUsers.slice(0, 6).map((u) => (
                  <div
                    key={u.id}
                    className="flex items-center gap-3 py-2 px-2 rounded-lg border-b border-border last:border-0 hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => navigate(`/admin/users?highlight=${u.id}`)}
                  >
                    <div className="h-8 w-8 rounded-full bg-blue-500/10 flex items-center justify-center text-xs font-bold text-blue-400 shrink-0">
                      {(u.name || u.phone).charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium truncate">{u.name || 'Unnamed'}</p>
                        {u.is_super_admin && <Shield className="h-3 w-3 text-red-400" />}
                      </div>
                      <p className="text-xs text-muted-foreground font-mono">{u.phone}</p>
                    </div>
                    <div className="text-right shrink-0">
                      {/* listUsers flattens _count into `businesses` — reading
                          _count here always rendered "0 biz". */}
                      <p className="text-xs text-muted-foreground">{(u as any).businesses ?? u._count?.business_users ?? 0} biz</p>
                      <p className="text-[10px] text-muted-foreground">{formatDate(u.created_at)}</p>
                    </div>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">No users yet</p>
            )}
          </CardContent>
        </Card>

        {/* Recent Businesses */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="h-4 w-4 text-purple-400" />
                Recent Businesses
              </CardTitle>
              <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => navigate('/admin/businesses')}>
                View All <ArrowRight className="h-3 w-3" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {recentBusinesses.length > 0 ? (
              <div className="space-y-1">
                {recentBusinesses.slice(0, 6).map((b) => {
                  // listBusinesses flattens the subscription into `plan`.
                  const plan = (b as any).plan || b.subscriptions?.[0]?.plan?.name || 'Free';
                  const planColors: Record<string, string> = {
                    Free: 'text-gray-400',
                    Pro: 'text-blue-400',
                    Enterprise: 'text-purple-400',
                  };
                  return (
                    <div
                      key={b.id}
                      className="flex items-center gap-3 py-2 px-2 rounded-lg border-b border-border last:border-0 hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => navigate(`/admin/businesses?highlight=${b.id}`)}
                    >
                      <div className="h-8 w-8 rounded-lg bg-purple-500/10 flex items-center justify-center shrink-0">
                        <Building2 className="h-4 w-4 text-purple-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{b.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {[b.type, b.city].filter(Boolean).join(' · ') || 'N/A'}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-xs font-medium ${planColors[plan] || 'text-muted-foreground'}`}>{plan}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {(b as any).users_count ?? b._count?.business_users ?? 0} users
                        </p>
                      </div>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">No businesses yet</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activity.length > 0 ? (
              <div className="space-y-3">
                {activity.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                      {iconFor(item.action)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {item.action} · {item.entity_type}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {item.user?.name || item.user?.phone || 'System'}
                        {item.business?.name ? ` · ${item.business.name}` : ''}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDate(item.created_at)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No recorded activity yet.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Quick Links */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <button
                onClick={() => navigate('/admin/users')}
                className="w-full flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Users className="h-5 w-5 text-blue-500" />
                  <div className="text-left">
                    <p className="text-sm font-medium">Manage Users</p>
                    <p className="text-xs text-muted-foreground">View, edit, and manage all users</p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </button>
              <button
                onClick={() => navigate('/admin/audit')}
                className="w-full flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Activity className="h-5 w-5 text-emerald-500" />
                  <div className="text-left">
                    <p className="text-sm font-medium">Audit Logs</p>
                    <p className="text-xs text-muted-foreground">Review all platform activity</p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </button>
              <button
                onClick={() => navigate('/admin/settings')}
                className="w-full flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted transition-colors"
              >
                <div className="flex items-center gap-3">
                  <BarChart3 className="h-5 w-5 text-purple-500" />
                  <div className="text-left">
                    <p className="text-sm font-medium">Platform Settings</p>
                    <p className="text-xs text-muted-foreground">Configure app settings & plans</p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </button>
              <button
                onClick={() => navigate('/admin/businesses')}
                className="w-full flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Building2 className="h-5 w-5 text-amber-500" />
                  <div className="text-left">
                    <p className="text-sm font-medium">Manage Businesses</p>
                    <p className="text-xs text-muted-foreground">View & manage all businesses</p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </button>
              <button
                onClick={() => navigate('/admin/plans')}
                className="w-full flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Crown className="h-5 w-5 text-cyan-500" />
                  <div className="text-left">
                    <p className="text-sm font-medium">Manage Plans</p>
                    <p className="text-xs text-muted-foreground">Create & edit subscription plans</p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
