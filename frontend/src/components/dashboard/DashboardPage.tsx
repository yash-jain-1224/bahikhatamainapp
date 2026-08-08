import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ShoppingCart, TrendingUp, AlertTriangle,
  Package, ArrowUpRight, ArrowDownRight, Clock, Plus, Building2, Rocket,
  Scissors, Phone, IndianRupee,
} from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle, Badge } from '@/components/ui';
import { StatCard } from '@/components/shared/stat-card';
import { SectionLoader } from '@/components/shared/loading';
import { businessApi, profileApi } from '@/lib/api';
import { useAppSelector } from '@/hooks';
import { formatCurrency, formatDate } from '@/utils';
import type { Cutter } from '@/types';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const defaultChartData = [
  { name: 'Mon', purchase: 0, sales: 0 },
  { name: 'Tue', purchase: 0, sales: 0 },
  { name: 'Wed', purchase: 0, sales: 0 },
  { name: 'Thu', purchase: 0, sales: 0 },
  { name: 'Fri', purchase: 0, sales: 0 },
  { name: 'Sat', purchase: 0, sales: 0 },
  { name: 'Sun', purchase: 0, sales: 0 },
];

type DatePreset = 'today' | 'last_week' | 'last_month' | 'last_year' | 'custom';

const PRESETS: { id: DatePreset; labelKey: string }[] = [
  { id: 'today',      labelKey: 'dashboard:period_today' },
  { id: 'last_week',  labelKey: 'dashboard:period_last_week' },
  { id: 'last_month', labelKey: 'dashboard:period_last_month' },
  { id: 'last_year',  labelKey: 'dashboard:period_last_year' },
  { id: 'custom',     labelKey: 'dashboard:period_custom' },
];

function getPresetRange(preset: DatePreset): { from: string; to: string } {
  const fmt = (d: Date) => d.toISOString().split('T')[0];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  switch (preset) {
    case 'today':
      return { from: fmt(today), to: fmt(today) };
    case 'last_week': {
      const from = new Date(today); from.setDate(from.getDate() - 6);
      return { from: fmt(from), to: fmt(today) };
    }
    case 'last_month': {
      const from = new Date(today); from.setDate(from.getDate() - 29);
      return { from: fmt(from), to: fmt(today) };
    }
    case 'last_year': {
      const from = new Date(today); from.setFullYear(from.getFullYear() - 1);
      return { from: fmt(from), to: fmt(today) };
    }
    default:
      return { from: fmt(today), to: fmt(today) };
  }
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { t } = useTranslation(['dashboard', 'common']);
  const { trialInfo } = useAppSelector(s => s.auth);
  const { currentBusiness } = useAppSelector(s => s.business);
  const [loading, setLoading] = useState(true);
  const [activePreset, setActivePreset] = useState<DatePreset>('today');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [stats, setStats] = useState({
    purchaseToday: 0,
    salesToday: 0,
    outstandingReceivable: 0,
    outstandingPayable: 0,
    lowStockAlerts: 0,
    partialPaymentAlerts: 0,
  });
  const [recentTransactions, setRecentTransactions] = useState<any[]>([]);
  const [weeklyChart, setWeeklyChart] = useState(defaultChartData);
  const [isEmpty, setIsEmpty] = useState(false);
  const [cutters, setCutters] = useState<Cutter[]>([]);

  const fetchDashboard = async (preset: DatePreset, cFrom?: string, cTo?: string) => {
    setLoading(true);
    try {
      let from: string, to: string;
      if (preset === 'custom') {
        from = cFrom || '';
        to   = cTo   || '';
      } else {
        ({ from, to } = getPresetRange(preset));
      }
      const params = from && to ? { from, to } : undefined;
      const { data } = await businessApi.dashboard(params);
      if (data?.data) {
        const d = data.data;
        setStats({
          purchaseToday: d.purchaseToday?.total ?? d.purchaseToday ?? 0,
          salesToday: d.salesToday?.total ?? d.salesToday ?? 0,
          outstandingReceivable: d.outstandingReceivable ?? 0,
          outstandingPayable: d.outstandingPayable ?? 0,
          lowStockAlerts: d.lowStockAlerts ?? 0,
          partialPaymentAlerts: d.partialPaymentAlerts ?? 0,
        });
        if (d.recentTransactions) setRecentTransactions(d.recentTransactions);
        if (d.weeklyChart && d.weeklyChart.length > 0) setWeeklyChart(d.weeklyChart);
        const total = (d.purchaseToday?.total ?? d.purchaseToday ?? 0)
          + (d.salesToday?.total ?? d.salesToday ?? 0)
          + (d.outstandingReceivable ?? 0)
          + (d.outstandingPayable ?? 0);
        setIsEmpty(total === 0);
      } else {
        setIsEmpty(true);
      }
    } catch {
      setIsEmpty(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard(activePreset);
    profileApi.cutters().then(res => setCutters(res.data?.data || [])).catch(() => {});
  }, [currentBusiness?.id]); 

  const handlePreset = (preset: DatePreset) => {
    setActivePreset(preset);
    if (preset !== 'custom') {
      fetchDashboard(preset);
    }
  };

  const handleCustomApply = () => {
    if (customFrom && customTo) fetchDashboard('custom', customFrom, customTo);
  };

  // First-load only spinner (not shown on filter changes)
  const [firstLoad, setFirstLoad] = useState(true);
  useEffect(() => { if (!loading) setFirstLoad(false); }, [loading]);
  if (loading && firstLoad) return <SectionLoader />;

  return (
    <div className="space-y-6">
      {/* Header + Date Filter Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold">{t('dashboard:title')}</h2>
          <p className="text-muted-foreground text-sm">{t('dashboard:subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate('/purchases/new')}>
            <Plus className="h-4 w-4 mr-1" /> {t('purchases:title', { ns: 'purchases' })}
          </Button>
          <Button size="sm" onClick={() => navigate('/sales/new')}>
            <Plus className="h-4 w-4 mr-1" /> {t('sales:title', { ns: 'sales' })}
          </Button>
        </div>
      </div>

      {/* ── Date Preset Bar ─────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground shrink-0">
            <Clock className="h-3.5 w-3.5" /> {t('common:period')}:
          </span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {PRESETS.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => handlePreset(p.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                  activePreset === p.id
                    ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                    : 'bg-background border-border text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-primary/5'
                }`}
              >
                {t(p.labelKey)}
              </button>
            ))}
          </div>
        </div>

        {/* Custom date range inputs */}
        {activePreset === 'custom' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
          >
            <div className="flex items-end gap-3 p-3 rounded-lg border border-primary/20 bg-primary/5 flex-wrap">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">{t('common:from')}</label>
                <input
                  type="date"
                  className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                  value={customFrom}
                  onChange={e => setCustomFrom(e.target.value)}
                />
              </div>
              <span className="text-muted-foreground pb-1.5">→</span>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">{t('common:to')}</label>
                <input
                  type="date"
                  className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                  value={customTo}
                  onChange={e => setCustomTo(e.target.value)}
                />
              </div>
              <Button
                size="sm"
                disabled={!customFrom || !customTo || loading}
                onClick={handleCustomApply}
                className="mb-0.5"
              >
                {t('common:apply')}
              </Button>
            </div>
          </motion.div>
        )}
      </div>

      {/* Trial banner */}
      {trialInfo && trialInfo.daysRemaining !== null && trialInfo.daysRemaining <= 7 && !trialInfo.expired && (
        <Card className={`${trialInfo.daysRemaining <= 2 ? 'border-red-500/50 bg-red-500/10' : 'border-amber-500/50 bg-amber-500/10'}`}>
          <CardContent className="flex items-center gap-4 py-3">
            <Clock className={`h-5 w-5 flex-shrink-0 ${trialInfo.daysRemaining <= 2 ? 'text-red-500' : 'text-amber-500'}`} />
            <p className={`text-sm font-medium flex-1 ${trialInfo.daysRemaining <= 2 ? 'text-red-500' : 'text-amber-500'}`}>
              {/* isTrial === false = paid subscription — renewal wording, not "free trial" */}
              {trialInfo.isTrial === false
                ? (trialInfo.daysRemaining === 0
                    ? t('dashboard:subscription_expires_today')
                    : t('dashboard:subscription_days_left', { count: trialInfo.daysRemaining }))
                : (trialInfo.daysRemaining === 0
                    ? t('dashboard:trial_expires_today')
                    : t('dashboard:trial_days_left', { count: trialInfo.daysRemaining }))}
            </p>
            <Button size="sm" variant="outline" onClick={() => navigate('/subscription')}>{t('common:upgrade')}</Button>
          </CardContent>
        </Card>
      )}

      {/* Empty state for new users — replaces only the stats/charts region so the
          period bar above stays usable (a quiet "today" is not an empty business). */}
      {isEmpty ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-16"
        >
          <div className="h-24 w-24 rounded-3xl gradient-primary flex items-center justify-center mb-6">
            <Rocket className="h-12 w-12 text-white" />
          </div>
          <h3 className="text-xl font-bold mb-2">{t('dashboard:empty_title')}</h3>
          <p className="text-muted-foreground text-center max-w-md mb-8">
            {t('dashboard:empty_description')}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-lg w-full">
            <Button onClick={() => navigate('/parties')} variant="outline" className="flex-col h-auto py-4 gap-2">
              <Building2 className="h-6 w-6 text-primary" />
              <span className="text-xs">{t('dashboard:add_party')}</span>
            </Button>
            <Button onClick={() => navigate('/purchases/new')} variant="outline" className="flex-col h-auto py-4 gap-2">
              <ShoppingCart className="h-6 w-6 text-blue-500" />
              <span className="text-xs">{t('dashboard:new_purchase')}</span>
            </Button>
            <Button onClick={() => navigate('/sales/new')} variant="outline" className="flex-col h-auto py-4 gap-2">
              <TrendingUp className="h-6 w-6 text-emerald-500" />
              <span className="text-xs">{t('dashboard:new_sale')}</span>
            </Button>
          </div>
        </motion.div>
      ) : (
      <>
      {/* Stats Grid */}
      <div className={`relative transition-opacity duration-200 ${loading ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="flex items-center gap-2 bg-background/80 backdrop-blur-sm rounded-lg px-4 py-2 text-xs text-muted-foreground border border-border shadow">
              <svg className="animate-spin h-3.5 w-3.5 text-primary" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              {t('common:updating')}
            </div>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* No trend props: re-add them when the backend provides real period-over-period data. */}
        <StatCard
          title={activePreset === 'today' ? t('dashboard:todays_purchases') : t('dashboard:purchases')}
          value={formatCurrency(stats.purchaseToday)}
          icon={ShoppingCart}
          iconColor="text-blue-400"
        />
        <StatCard
          title={activePreset === 'today' ? t('dashboard:todays_sales') : t('dashboard:sales')}
          value={formatCurrency(stats.salesToday)}
          icon={TrendingUp}
          iconColor="text-emerald-400"
        />
        <StatCard
          title={t('dashboard:receivable')}
          value={formatCurrency(stats.outstandingReceivable)}
          icon={ArrowDownRight}
          iconColor="text-amber-400"
        />
        <StatCard
          title={t('dashboard:payable')}
          value={formatCurrency(stats.outstandingPayable)}
          icon={ArrowUpRight}
          iconColor="text-red-400"
        />
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue Chart */}
        <Card className="glass">
          <CardHeader>
            <CardTitle className="text-base">
              {activePreset === 'today' ? t('dashboard:chart_today') :
               activePreset === 'last_week' ? t('dashboard:chart_last_week') :
               activePreset === 'last_month' ? t('dashboard:chart_last_month') :
               activePreset === 'last_year' ? t('dashboard:chart_last_year') :
               t('dashboard:chart_custom')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={weeklyChart}>
                <defs>
                  <linearGradient id="purchaseGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--chart-grid))" />
                <XAxis dataKey="name" stroke="hsl(var(--chart-text))" fontSize={12} />
                <YAxis stroke="hsl(var(--chart-text))" fontSize={12} tickFormatter={(v) => `₹${v / 1000}k`} />
                <Tooltip
                  contentStyle={{ background: 'hsl(var(--chart-tooltip-bg))', border: '1px solid hsl(var(--chart-tooltip-border))', borderRadius: '8px' }}
                  labelStyle={{ color: 'hsl(var(--chart-tooltip-text))' }}
                  formatter={(value: number) => [formatCurrency(value)]}
                />
                <Area type="monotone" dataKey="purchase" stroke="#3b82f6" fill="url(#purchaseGrad)" strokeWidth={2} />
                <Area type="monotone" dataKey="sales" stroke="#10b981" fill="url(#salesGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
            <div className="flex items-center justify-center gap-6 mt-2">
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="h-2 w-2 rounded-full bg-blue-500" /> {t('dashboard:legend_purchases')}
              </span>
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="h-2 w-2 rounded-full bg-emerald-500" /> {t('dashboard:legend_sales')}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Alerts */}
        <Card className="glass">
          <CardHeader>
            <CardTitle className="text-base">{t('dashboard:alerts_title')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {stats.lowStockAlerts > 0 && (
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 cursor-pointer hover:bg-amber-500/20 transition-colors"
                onClick={() => navigate('/inventory?filter=low-stock')}
              >
                <Package className="h-5 w-5 text-amber-400" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-amber-400">{t('dashboard:low_stock_alert', { count: stats.lowStockAlerts })}</p>
                  <p className="text-xs text-muted-foreground">{t('dashboard:low_stock_review')}</p>
                </div>
                <ArrowUpRight className="h-4 w-4 text-amber-400" />
              </motion.div>
            )}
            {stats.partialPaymentAlerts > 0 && (
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 }}
                className="flex items-center gap-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20 cursor-pointer hover:bg-red-500/20 transition-colors"
                onClick={() => navigate('/ledger?filter=outstanding')}
              >
                <AlertTriangle className="h-5 w-5 text-red-400" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-red-400">{t('dashboard:pending_payments', { count: stats.partialPaymentAlerts })}</p>
                  <p className="text-xs text-muted-foreground">{t('dashboard:pending_payments_review')}</p>
                </div>
                <ArrowUpRight className="h-4 w-4 text-red-400" />
              </motion.div>
            )}

            <div className="pt-3 border-t border-border">
              <p className="text-xs text-muted-foreground mb-3 flex items-center gap-1">
                <Clock className="h-3 w-3" /> {t('dashboard:quick_actions')}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" size="sm" className="justify-start" onClick={() => navigate('/ledger/day-book')}>
                  📖 {t('dashboard:day_book')}
                </Button>
                <Button variant="outline" size="sm" className="justify-start" onClick={() => navigate('/ledger/trial-balance')}>
                  📊 {t('dashboard:trial_balance')}
                </Button>
                <Button variant="outline" size="sm" className="justify-start" onClick={() => navigate('/ledger/profit-loss')}>
                  💰 {t('dashboard:pl_report')}
                </Button>
                <Button variant="outline" size="sm" className="justify-start" onClick={() => navigate('/ledger/outstanding')}>
                  📋 {t('dashboard:outstanding')}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Cutters widget ───────────────────────────────────────────────── */}
      {cutters.length > 0 && (
        <Card className="glass">
          <CardHeader className="flex-row items-center justify-between pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Scissors className="h-5 w-5 text-purple-400" /> {t('dashboard:cutters')}
              <Badge variant="outline" className="text-xs">{cutters.length}</Badge>
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => navigate('/parties?tab=cutters')}>
              {t('common:view_all')}
            </Button>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {cutters.slice(0, 6).map(c => (
                <div
                  key={c.id}
                  className="flex items-center gap-3 p-3 rounded-xl border border-border hover:border-primary/40 hover:bg-primary/5 transition-all cursor-pointer"
                  onClick={() => navigate(`/cutters/${c.id}`)}
                >
                  <div className="h-9 w-9 rounded-lg bg-purple-500/10 flex items-center justify-center shrink-0">
                    <Scissors className="h-4 w-4 text-purple-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{c.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {c.phone ? (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Phone className="h-3 w-3" />{c.phone}
                        </span>
                      ) : (
                        c.rate_per_unit ? (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <IndianRupee className="h-3 w-3" />{formatCurrency(Number(c.rate_per_unit))}/{c.unit || 'unit'}
                          </span>
                        ) : null
                      )}
                    </div>
                  </div>
                  {(c as any)._count?.transactions > 0 && (
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {(c as any)._count.transactions}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
            {cutters.length > 6 && (
              <p className="text-center text-xs text-muted-foreground mt-3">
                +{cutters.length - 6} more ·{' '}
                <button className="text-primary hover:underline" onClick={() => navigate('/parties?tab=cutters')}>
                  {t('common:view_all')}
                </button>
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Recent Transactions */}
      <Card className="glass">        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">{t('dashboard:recent_transactions')}</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => navigate('/ledger')}>{t('common:view_all')}</Button>
        </CardHeader>
        <CardContent>
          {recentTransactions.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t('dashboard:no_recent_transactions')}
            </p>
          )}
          <div className="space-y-2">
            {recentTransactions.map((tx: any, i: number) => (
              <motion.div
                key={tx.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/30 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${tx.type === 'PURCHASE' ? 'bg-blue-500/10 text-blue-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                    {tx.type === 'PURCHASE' ? <ShoppingCart className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{tx.party}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(tx.date)} · {tx.type}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-semibold ${tx.type === 'SALE' ? 'text-emerald-400' : 'text-foreground'}`}>
                    {tx.type === 'SALE' ? '+' : '-'}{formatCurrency(tx.amount)}
                  </p>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${tx.status === 'PAID' ? 'bg-emerald-500/10 text-emerald-400' : tx.status === 'PARTIAL' ? 'bg-amber-500/10 text-amber-400' : 'bg-red-500/10 text-red-400'}`}>
                    {tx.status}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        </CardContent>
      </Card>
      </>
      )}
    </div>
  );
}
