import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FileText, BookOpen, Scale, TrendingUp, IndianRupee, Calendar,
  ArrowDownLeft, ArrowUpRight, BarChart3,
  Printer, RefreshCw, Landmark, AlertTriangle,
} from 'lucide-react';
import {
  Button, Input, Card, CardContent, CardHeader, CardTitle,
  Tabs, TabsList, TabsTrigger, TabsContent,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui';
import { DataTable } from '@/components/shared/data-table';
import { StatCard } from '@/components/shared/stat-card';
import { SectionLoader } from '@/components/shared/loading';
import { ExportButton } from '@/components/shared/ExportButton';
import { ledgerApi } from '@/lib/api';
import { formatCurrency, formatDate } from '@/utils';

// ─── Interfaces ──────────────────────────────────────
interface DayBookEntry {
  id: string;
  date: string;
  narration: string;
  debit: number;
  credit: number;
  type: string;
  party_name?: string;
}

interface TrialBalanceRow {
  account: string;
  debit: number;
  credit: number;
}

interface ProfitLossRow {
  category: string;
  items: { name: string; amount: number }[];
  total: number;
}

interface OutstandingRow {
  id: string;
  party_name: string;
  phone?: string;
  type: 'RECEIVABLE' | 'PAYABLE';
  amount: number;
}

interface BalanceSheetItem {
  name: string;
  amount: number;
}

interface BalanceSheetData {
  asOnDate: string;
  assets: {
    currentAssets: BalanceSheetItem[];
    totalCurrentAssets: number;
  };
  liabilities: {
    currentLiabilities: BalanceSheetItem[];
    totalCurrentLiabilities: number;
  };
  equity: {
    items: BalanceSheetItem[];
    totalEquity: number;
  };
  totalAssets: number;
  totalLiabilitiesAndEquity: number;
}

// ─── Empty defaults ──────────────────────────────────
const defaultPL: { income: ProfitLossRow[]; expenses: ProfitLossRow[] } = { income: [], expenses: [] };
const defaultBalanceSheet: BalanceSheetData = {
  asOnDate: new Date().toISOString(),
  assets: { currentAssets: [], totalCurrentAssets: 0 },
  liabilities: { currentLiabilities: [], totalCurrentLiabilities: 0 },
  equity: { items: [], totalEquity: 0 },
  totalAssets: 0,
  totalLiabilitiesAndEquity: 0,
};

export default function ReportsPage() {
  const { t } = useTranslation(['reports', 'common']);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('daybook');
  const [dateRange, setDateRange] = useState<{ from: string; to: string }>({
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0],
  });

  // Data states
  const [dayBook, setDayBook] = useState<DayBookEntry[]>([]);
  const [trialBalance, setTrialBalance] = useState<TrialBalanceRow[]>([]);
  const [pl, setPL] = useState(defaultPL);
  const [outstanding, setOutstanding] = useState<OutstandingRow[]>([]);
  const [outstandingTotals, setOutstandingTotals] = useState({ receivable: 0, payable: 0 });
  const [balanceSheet, setBalanceSheet] = useState<BalanceSheetData>(defaultBalanceSheet);
  const [outstandingFilter, setOutstandingFilter] = useState<'all' | 'RECEIVABLE' | 'PAYABLE'>('all');
  // HTTP status of a failed load (null = no error). Without it a failed fetch
  // (e.g. every request 403ing for a STAFF user) looked identical to "no data".
  const [loadErrorStatus, setLoadErrorStatus] = useState<number | null>(null);

  useEffect(() => {
    fetchReport(tab);
  }, [tab, dateRange]);

  const fetchReport = async (type: string) => {
    try {
      setLoading(true);
      setLoadErrorStatus(null);
      switch (type) {
        case 'daybook': {
          const res = await ledgerApi.dayBook({ from: dateRange.from, to: dateRange.to });
          const data = res.data?.data;
          setDayBook(Array.isArray(data) ? data : []);
          break;
        }
        case 'trial-balance': {
          const res = await ledgerApi.trialBalance({ startDate: dateRange.from, endDate: dateRange.to });
          const data = res.data?.data;
          if (Array.isArray(data)) {
            // Already in [{account, debit, credit}] shape
            setTrialBalance(data);
          } else if (data && Array.isArray(data.accounts)) {
            // Backend returns { accounts: [{accountType, debit, credit, balance}], totalDebit, totalCredit }
            const rows: TrialBalanceRow[] = data.accounts.map((a: any) => ({
              account: a.accountType ?? a.account,
              debit: Number(a.debit ?? 0),
              credit: Number(a.credit ?? 0),
            }));
            setTrialBalance(rows);
          } else {
            setTrialBalance([]);
          }
          break;
        }
        case 'profit-loss': {
          const res = await ledgerApi.profitLoss({ startDate: dateRange.from, endDate: dateRange.to });
          const plData = res.data?.data;
          if (plData && typeof plData === 'object') {
            if (Array.isArray(plData.income) || Array.isArray(plData.expenses)) {
              // Already in the grouped ProfitLossRow[] shape
              setPL({
                income: Array.isArray(plData.income) ? plData.income : [],
                expenses: Array.isArray(plData.expenses) ? plData.expenses : [],
              });
            } else {
              // Backend returns flat: { sales, purchases, grossProfit, expenses, otherIncome, netProfit }
              const sales = Number(plData.sales ?? 0);
              const otherIncome = Number(plData.otherIncome ?? 0);
              const purchases = Number(plData.purchases ?? 0);
              const expenses = Number(plData.expenses ?? 0);
              setPL({
                income: [
                  ...(sales > 0 ? [{ category: 'Revenue', items: [{ name: 'Sales', amount: sales }], total: sales }] : []),
                  ...(otherIncome > 0 ? [{ category: 'Other Income', items: [{ name: 'Other Income', amount: otherIncome }], total: otherIncome }] : []),
                ],
                expenses: [
                  ...(purchases > 0 ? [{ category: 'Cost of Goods', items: [{ name: 'Purchases', amount: purchases }], total: purchases }] : []),
                  ...(expenses > 0 ? [{ category: 'Operating Expenses', items: [{ name: 'Expenses', amount: expenses }], total: expenses }] : []),
                ],
              });
            }
          } else {
            setPL(defaultPL);
          }
          break;
        }
        case 'outstanding': {
          const res = await ledgerApi.outstanding();
          const od = res.data?.data;
          if (Array.isArray(od)) {
            setOutstanding(od);
          } else if (od && typeof od === 'object') {
            if (Array.isArray(od.parties)) {
              // Backend returns { parties: [{id, name, phone, type, balance}], totalReceivable, totalPayable }
              // No overdue-days/last-transaction here: the API doesn't provide them,
              // and the old placeholder values (0 days / today) read as real data.
              const rows: OutstandingRow[] = od.parties
                .filter((p: any) => Number(p.balance) !== 0)
                .map((p: any) => ({
                  id: p.id,
                  party_name: p.name,
                  phone: p.phone,
                  type: Number(p.balance) > 0 ? 'RECEIVABLE' : 'PAYABLE',
                  amount: Math.abs(Number(p.balance)),
                }));
              setOutstanding(rows);
              setOutstandingTotals({
                receivable: Number(od.totalReceivable ?? 0),
                payable: Number(od.totalPayable ?? 0),
              });
            } else if (Array.isArray(od.receivable) || Array.isArray(od.payable)) {
              // Legacy shape { receivable: [...], payable: [...] }
              const rows: OutstandingRow[] = [
                ...((od.receivable ?? []) as OutstandingRow[]),
                ...((od.payable ?? []) as OutstandingRow[]),
              ];
              setOutstanding(rows);
            } else {
              setOutstanding([]);
            }
          } else {
            setOutstanding([]);
          }
          break;
        }
        case 'balance-sheet': {
          const res = await ledgerApi.balanceSheet({ asOnDate: dateRange.to });
          if (res.data?.data) setBalanceSheet(res.data.data);
          else setBalanceSheet(defaultBalanceSheet);
          break;
        }
      }
    } catch (err: any) {
      setLoadErrorStatus(err?.response?.status ?? 0);
      setDayBook([]);
      setTrialBalance([]);
      setPL(defaultPL);
      setOutstanding([]);
      setOutstandingTotals({ receivable: 0, payable: 0 });
      setBalanceSheet(defaultBalanceSheet);
    } finally {
      setLoading(false);
    }
  };

  const totalIncome = (pl.income ?? []).reduce((s, c) => s + c.total, 0);
  const totalExpenses = (pl.expenses ?? []).reduce((s, c) => s + c.total, 0);
  const netProfit = totalIncome - totalExpenses;

  // Use backend-provided totals if available (more accurate), else fall back to row sums
  const totalReceivable = outstandingTotals.receivable ||
    outstanding.filter(o => o.type === 'RECEIVABLE').reduce((s, o) => s + o.amount, 0);
  const totalPayable = outstandingTotals.payable ||
    outstanding.filter(o => o.type === 'PAYABLE').reduce((s, o) => s + o.amount, 0);

  const filteredOutstanding = outstandingFilter === 'all' ? outstanding : outstanding.filter(o => o.type === outstandingFilter);

  // Column definitions
  const dayBookColumns = [
    { key: 'date', header: t('reports:date'), render: (e: DayBookEntry) => formatDate(e.date) },
    { key: 'narration', header: t('reports:narration'), render: (e: DayBookEntry) => (
      <div>
        <p className="font-medium">{e.narration}</p>
        {e.party_name && <p className="text-xs text-muted-foreground">{e.party_name}</p>}
      </div>
    )},
    { key: 'type', header: t('reports:type'), render: (e: DayBookEntry) => {
      const colors: Record<string, string> = {
        PURCHASE: 'bg-blue-500/10 text-blue-400',
        SALE: 'bg-emerald-500/10 text-emerald-400',
        PAYMENT: 'bg-purple-500/10 text-purple-400',
        EXPENSE: 'bg-amber-500/10 text-amber-400',
      };
      return <span className={`px-2 py-1 rounded text-xs font-medium ${colors[e.type] || 'bg-muted text-muted-foreground'}`}>{e.type}</span>;
    }},
    { key: 'debit', header: t('reports:debit'), render: (e: DayBookEntry) => (
      <span className={e.debit > 0 ? 'text-red-400 font-semibold' : 'text-muted-foreground'}>
        {e.debit > 0 ? formatCurrency(e.debit) : '—'}
      </span>
    )},
    { key: 'credit', header: t('reports:credit'), render: (e: DayBookEntry) => (
      <span className={e.credit > 0 ? 'text-emerald-400 font-semibold' : 'text-muted-foreground'}>
        {e.credit > 0 ? formatCurrency(e.credit) : '—'}
      </span>
    )},
  ];

  const trialBalanceColumns = [
    { key: 'account', header: t('reports:account'), render: (r: TrialBalanceRow) => <span className="font-medium">{r.account}</span> },
    { key: 'debit', header: t('reports:debit'), className: 'text-right', render: (r: TrialBalanceRow) => (
      <span className={r.debit > 0 ? 'font-semibold' : 'text-muted-foreground'}>{r.debit > 0 ? formatCurrency(r.debit) : '—'}</span>
    )},
    { key: 'credit', header: t('reports:credit'), className: 'text-right', render: (r: TrialBalanceRow) => (
      <span className={r.credit > 0 ? 'font-semibold' : 'text-muted-foreground'}>{r.credit > 0 ? formatCurrency(r.credit) : '—'}</span>
    )},
  ];

  const outstandingColumns = [
    { key: 'party_name', header: t('reports:party'), render: (o: OutstandingRow) => (
      <div>
        <p className="font-medium">{o.party_name}</p>
        {o.phone && <p className="text-xs text-muted-foreground">{o.phone}</p>}
      </div>
    )},
    { key: 'type', header: t('reports:type'), render: (o: OutstandingRow) => (
      <div className="flex items-center gap-1.5">
        {o.type === 'RECEIVABLE' ? <ArrowDownLeft className="h-3 w-3 text-emerald-400" /> : <ArrowUpRight className="h-3 w-3 text-red-400" />}
        <span className={`text-xs font-medium ${o.type === 'RECEIVABLE' ? 'text-emerald-400' : 'text-red-400'}`}>
          {o.type === 'RECEIVABLE' ? t('reports:receivable') : t('reports:payable')}
        </span>
      </div>
    )},
    { key: 'amount', header: t('reports:amount'), render: (o: OutstandingRow) => (
      <span className="font-semibold">{formatCurrency(o.amount)}</span>
    )},
  ];

  const getExportData = () => {
    switch (tab) {
      case 'daybook': return dayBook;
      case 'trial-balance': return trialBalance;
      case 'outstanding': return filteredOutstanding;
      case 'profit-loss': {
        const flatten = (section: string, cats: ProfitLossRow[]) =>
          cats.flatMap(cat => cat.items.map(item => ({
            section,
            category: cat.category,
            name: item.name,
            amount: item.amount,
          })));
        return [
          ...flatten('Income', pl.income ?? []),
          ...flatten('Expenses', pl.expenses ?? []),
          { section: 'Summary', category: '', name: 'Total Income', amount: totalIncome },
          { section: 'Summary', category: '', name: 'Total Expenses', amount: totalExpenses },
          { section: 'Summary', category: '', name: netProfit >= 0 ? 'Net Profit' : 'Net Loss', amount: netProfit },
        ];
      }
      case 'balance-sheet': {
        const flatten = (section: string, items: BalanceSheetItem[]) =>
          items.map(item => ({ section, name: item.name, amount: item.amount }));
        return [
          ...flatten('Assets', balanceSheet.assets.currentAssets),
          { section: 'Assets', name: 'Total Assets', amount: balanceSheet.totalAssets },
          ...flatten('Liabilities', balanceSheet.liabilities.currentLiabilities),
          { section: 'Liabilities', name: 'Total Liabilities', amount: balanceSheet.liabilities.totalCurrentLiabilities },
          ...flatten('Equity', balanceSheet.equity.items),
          { section: 'Equity', name: 'Total Equity', amount: balanceSheet.equity.totalEquity },
        ];
      }
      default: return [];
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" />
            {t('reports:title')}
          </h2>
          <p className="text-muted-foreground">{t('reports:subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton data={getExportData()} filename={`report_${tab}`} />
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-2" /> {t('reports:print')}
          </Button>
        </div>
      </div>

      {/* Date Range — hidden for Outstanding: that report is point-in-time and
          the backend ignores dates for it */}
      {tab !== 'outstanding' && (
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{t('reports:period')}:</span>
            </div>
            <Input
              type="date"
              className="w-40"
              value={dateRange.from}
              onChange={(e) => setDateRange(prev => ({ ...prev, from: e.target.value }))}
            />
            <span className="text-sm text-muted-foreground">{t('reports:to')}</span>
            <Input
              type="date"
              className="w-40"
              value={dateRange.to}
              onChange={(e) => setDateRange(prev => ({ ...prev, to: e.target.value }))}
            />
            <Button variant="outline" size="sm" onClick={() => fetchReport(tab)}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> {t('reports:refresh')}
            </Button>
          </div>
        </CardContent>
      </Card>
      )}

      {/* Load error panel — a failed fetch must not masquerade as an empty report */}
      {loadErrorStatus !== null && !loading && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-red-400 shrink-0" />
            <p className="text-sm font-medium text-red-400 flex-1">
              {loadErrorStatus === 403 ? t('reports:load_error_forbidden') : t('reports:load_error')}
            </p>
            {loadErrorStatus !== 403 && (
              <Button variant="outline" size="sm" onClick={() => fetchReport(tab)}>
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> {t('common:retry')}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="daybook">
            <BookOpen className="h-4 w-4 mr-1.5" /> {t('reports:tab_daybook')}
          </TabsTrigger>
          <TabsTrigger value="trial-balance">
            <Scale className="h-4 w-4 mr-1.5" /> {t('reports:tab_trial_balance')}
          </TabsTrigger>
          <TabsTrigger value="profit-loss">
            <TrendingUp className="h-4 w-4 mr-1.5" /> {t('reports:tab_profit_loss')}
          </TabsTrigger>
          <TabsTrigger value="balance-sheet">
            <Landmark className="h-4 w-4 mr-1.5" /> {t('reports:tab_balance_sheet')}
          </TabsTrigger>
          <TabsTrigger value="outstanding">
            <IndianRupee className="h-4 w-4 mr-1.5" /> {t('reports:tab_outstanding')}
          </TabsTrigger>
        </TabsList>

        {/* Day Book */}
        <TabsContent value="daybook" className="mt-4 space-y-4">
          {loading ? <SectionLoader /> : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <StatCard title={t('reports:total_debit')} value={formatCurrency(dayBook.reduce((s, e) => s + e.debit, 0))} icon={ArrowUpRight} iconColor="text-red-400" />
                <StatCard title={t('reports:total_credit')} value={formatCurrency(dayBook.reduce((s, e) => s + e.credit, 0))} icon={ArrowDownLeft} iconColor="text-emerald-400" />
                <StatCard title={t('reports:entries')} value={dayBook.length} icon={BookOpen} iconColor="text-blue-400" />
              </div>
              <DataTable columns={dayBookColumns} data={dayBook} />
              {/* Totals Row */}
              <div className="flex justify-end gap-8 px-4 py-3 rounded-lg bg-muted/50 border border-border text-sm font-semibold">
                <span>{t('reports:total_debit')}: <span className="text-red-400">{formatCurrency(dayBook.reduce((s, e) => s + e.debit, 0))}</span></span>
                <span>{t('reports:total_credit')}: <span className="text-emerald-400">{formatCurrency(dayBook.reduce((s, e) => s + e.credit, 0))}</span></span>
              </div>
            </>
          )}
        </TabsContent>

        {/* Trial Balance */}
        <TabsContent value="trial-balance" className="mt-4 space-y-4">
          {loading ? <SectionLoader /> : (
            <>
              <DataTable columns={trialBalanceColumns} data={trialBalance} />
              <div className="flex justify-end gap-8 px-4 py-3 rounded-lg bg-muted/50 border border-border text-sm font-semibold">
                <span>{t('reports:total_debit')}: <span className="text-red-400">{formatCurrency(trialBalance.reduce((s, r) => s + r.debit, 0))}</span></span>
                <span>{t('reports:total_credit')}: <span className="text-emerald-400">{formatCurrency(trialBalance.reduce((s, r) => s + r.credit, 0))}</span></span>
              </div>
            </>
          )}
        </TabsContent>

        {/* Profit & Loss */}
        <TabsContent value="profit-loss" className="mt-4 space-y-4">
          {loading ? <SectionLoader /> : (
            <>
              {/* Summary Stats */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <StatCard title={t('reports:total_income')} value={formatCurrency(totalIncome)} icon={TrendingUp} iconColor="text-emerald-400" />
                <StatCard title={t('reports:total_expenses')} value={formatCurrency(totalExpenses)} icon={TrendingUp} iconColor="text-red-400" />
                {/* No trend prop: re-add it when the backend provides real period-over-period data. */}
                <StatCard
                  title={t('reports:net_profit')}
                  value={formatCurrency(Math.abs(netProfit))}
                  icon={BarChart3}
                  iconColor={netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Income */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base text-emerald-400 flex items-center gap-2">
                      <ArrowDownLeft className="h-4 w-4" /> {t('reports:income')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {(pl.income ?? []).map((cat, idx) => (
                      <div key={idx} className="mb-4 last:mb-0">
                        <h4 className="text-sm font-semibold mb-2 text-muted-foreground">{cat.category}</h4>
                        {cat.items.map((item, i) => (
                          <div key={i} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                            <span className="text-sm">{item.name}</span>
                            <span className="text-sm font-medium">{formatCurrency(item.amount)}</span>
                          </div>
                        ))}
                        <div className="flex items-center justify-between py-2 mt-1 font-semibold text-sm">
                          <span>{t('reports:subtotal')}</span>
                          <span className="text-emerald-400">{formatCurrency(cat.total)}</span>
                        </div>
                      </div>
                    ))}
                    <div className="flex items-center justify-between py-3 mt-2 border-t-2 border-border font-bold">
                      <span>{t('reports:total_income')}</span>
                      <span className="text-emerald-400">{formatCurrency(totalIncome)}</span>
                    </div>
                  </CardContent>
                </Card>

                {/* Expenses */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base text-red-400 flex items-center gap-2">
                      <ArrowUpRight className="h-4 w-4" /> {t('reports:expenses')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {(pl.expenses ?? []).map((cat, idx) => (
                      <div key={idx} className="mb-4 last:mb-0">
                        <h4 className="text-sm font-semibold mb-2 text-muted-foreground">{cat.category}</h4>
                        {cat.items.map((item, i) => (
                          <div key={i} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                            <span className="text-sm">{item.name}</span>
                            <span className="text-sm font-medium">{formatCurrency(item.amount)}</span>
                          </div>
                        ))}
                        <div className="flex items-center justify-between py-2 mt-1 font-semibold text-sm">
                          <span>{t('reports:subtotal')}</span>
                          <span className="text-red-400">{formatCurrency(cat.total)}</span>
                        </div>
                      </div>
                    ))}
                    <div className="flex items-center justify-between py-3 mt-2 border-t-2 border-border font-bold">
                      <span>{t('reports:total_expenses')}</span>
                      <span className="text-red-400">{formatCurrency(totalExpenses)}</span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Net Profit Banner */}
              <Card className={netProfit >= 0 ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5'}>
                <CardContent className="p-5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <BarChart3 className={`h-6 w-6 ${netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`} />
                    <div>
                      <p className="text-sm text-muted-foreground">{netProfit >= 0 ? t('reports:net_profit') : t('reports:net_loss')}</p>
                      <p className={`text-2xl font-bold ${netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {formatCurrency(Math.abs(netProfit))}
                      </p>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {dateRange.from} — {dateRange.to}
                  </p>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* Balance Sheet */}
        <TabsContent value="balance-sheet" className="mt-4 space-y-4">
          {loading ? <SectionLoader /> : (
            <>
              {/* Summary Stats */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <StatCard
                  title={t('reports:total_assets')}
                  value={formatCurrency(balanceSheet.totalAssets)}
                  icon={TrendingUp}
                  iconColor="text-blue-400"
                />
                <StatCard
                  title={t('reports:total_liabilities')}
                  value={formatCurrency(balanceSheet.liabilities.totalCurrentLiabilities)}
                  icon={ArrowUpRight}
                  iconColor="text-red-400"
                />
                <StatCard
                  title={t('reports:owners_equity')}
                  value={formatCurrency(balanceSheet.equity.totalEquity)}
                  icon={Landmark}
                  iconColor="text-emerald-400"
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Assets Column */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base text-blue-400 flex items-center gap-2">
                      <TrendingUp className="h-4 w-4" /> {t('reports:assets')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <h4 className="text-sm font-semibold mb-3 text-muted-foreground">{t('reports:current_assets')}</h4>
                    {balanceSheet.assets.currentAssets.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                        <span className="text-sm">{item.name}</span>
                        <span className="text-sm font-medium">{formatCurrency(item.amount)}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between py-3 mt-2 border-t-2 border-border font-bold">
                      <span>{t('reports:total_assets')}</span>
                      <span className="text-blue-400">{formatCurrency(balanceSheet.totalAssets)}</span>
                    </div>
                  </CardContent>
                </Card>

                {/* Liabilities & Equity Column */}
                <div className="space-y-6">
                  {/* Liabilities */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base text-red-400 flex items-center gap-2">
                        <ArrowUpRight className="h-4 w-4" /> {t('reports:liabilities')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <h4 className="text-sm font-semibold mb-3 text-muted-foreground">{t('reports:current_liabilities')}</h4>
                      {balanceSheet.liabilities.currentLiabilities.map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                          <span className="text-sm">{item.name}</span>
                          <span className="text-sm font-medium">{formatCurrency(item.amount)}</span>
                        </div>
                      ))}
                      <div className="flex items-center justify-between py-3 mt-2 border-t-2 border-border font-bold">
                        <span>{t('reports:total_liabilities')}</span>
                        <span className="text-red-400">{formatCurrency(balanceSheet.liabilities.totalCurrentLiabilities)}</span>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Equity */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base text-emerald-400 flex items-center gap-2">
                        <Landmark className="h-4 w-4" /> {t('reports:owners_equity')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {balanceSheet.equity.items.map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                          <span className="text-sm">{item.name}</span>
                          <span className={`text-sm font-medium ${item.amount >= 0 ? '' : 'text-red-400'}`}>
                            {item.amount < 0 ? `(${formatCurrency(Math.abs(item.amount))})` : formatCurrency(item.amount)}
                          </span>
                        </div>
                      ))}
                      <div className="flex items-center justify-between py-3 mt-2 border-t-2 border-border font-bold">
                        <span>{t('reports:equity')}</span>
                        <span className="text-emerald-400">{formatCurrency(balanceSheet.equity.totalEquity)}</span>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* Balance Check Banner */}
              <Card className={
                Math.abs(balanceSheet.totalAssets - balanceSheet.totalLiabilitiesAndEquity) < 1
                  ? 'border-emerald-500/30 bg-emerald-500/5'
                  : 'border-amber-500/30 bg-amber-500/5'
              }>
                <CardContent className="p-5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Landmark className={`h-6 w-6 ${
                      Math.abs(balanceSheet.totalAssets - balanceSheet.totalLiabilitiesAndEquity) < 1
                        ? 'text-emerald-400' : 'text-amber-400'
                    }`} />
                    <div>
                      <p className="text-sm text-muted-foreground">{t('reports:balance_check')}</p>
                      <div className="flex gap-6 text-sm">
                        <span>{t('reports:assets')}: <strong className="text-blue-400">{formatCurrency(balanceSheet.totalAssets)}</strong></span>
                        <span>=</span>
                        <span>{t('reports:liabilities_equity')}: <strong className="text-emerald-400">{formatCurrency(balanceSheet.totalLiabilitiesAndEquity)}</strong></span>
                      </div>
                    </div>
                  </div>
                  <span className={`text-xs font-semibold px-2 py-1 rounded ${
                    Math.abs(balanceSheet.totalAssets - balanceSheet.totalLiabilitiesAndEquity) < 1
                      ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
                  }`}>
                    {Math.abs(balanceSheet.totalAssets - balanceSheet.totalLiabilitiesAndEquity) < 1
                      ? t('reports:balanced') : t('reports:diff', { amount: formatCurrency(Math.abs(balanceSheet.totalAssets - balanceSheet.totalLiabilitiesAndEquity)) })}
                  </span>
                </CardContent>
              </Card>

              <p className="text-xs text-muted-foreground text-right">
                {t('reports:as_on', { date: formatDate(balanceSheet.asOnDate) })}
              </p>
            </>
          )}
        </TabsContent>

        {/* Outstanding */}
        <TabsContent value="outstanding" className="mt-4 space-y-4">
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" />
            {t('reports:outstanding_as_of_now', 'Balances are as of now')}
          </p>
          {loading ? <SectionLoader /> : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <StatCard title={t('reports:total_receivable')} value={formatCurrency(totalReceivable)} icon={ArrowDownLeft} iconColor="text-emerald-400" />
                <StatCard title={t('reports:total_payable')} value={formatCurrency(totalPayable)} icon={ArrowUpRight} iconColor="text-red-400" />
                <StatCard title={t('reports:net_outstanding')} value={formatCurrency(totalReceivable - totalPayable)} icon={IndianRupee} iconColor="text-blue-400" />
              </div>

              <div className="flex items-center gap-3">
                <Select value={outstandingFilter} onValueChange={(v) => setOutstandingFilter(v as any)}>
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('reports:all_outstanding')}</SelectItem>
                    <SelectItem value="RECEIVABLE">{t('reports:receivable_only')}</SelectItem>
                    <SelectItem value="PAYABLE">{t('reports:payable_only')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <DataTable columns={outstandingColumns} data={filteredOutstanding} />
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
