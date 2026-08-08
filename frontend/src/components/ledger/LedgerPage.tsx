import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BookOpen, Search, Plus, ArrowDownLeft, ArrowUpRight, Upload, Download, Trash2, RefreshCw } from 'lucide-react';
import { Button, Input, Tabs, TabsList, TabsTrigger, TabsContent, Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { BulkSelectDataTable } from '@/components/shared/BulkSelectDataTable';
import { DataTable } from '@/components/shared/data-table';
import { StatCard } from '@/components/shared/stat-card';
import { EmptyState } from '@/components/shared/empty-state';
import { SectionLoader } from '@/components/shared/loading';
import { Pagination } from '@/components/shared/pagination';
import AccessDeniedPage from '@/components/shared/AccessDeniedPage';
import { AdvancedFilters, type FilterField } from '@/components/shared/AdvancedFilters';
import { ExportButton } from '@/components/shared/ExportButton';
import { ImportDataDialog } from '@/components/shared/ImportDataDialog';
import { CreateLedgerEntryDialog } from '@/components/shared/CreateLedgerEntryDialog';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { ledgerApi } from '@/lib/api';
import { formatCurrency, formatDate } from '@/utils';
import type { LedgerEntry, PaginationMeta } from '@/types';
import toast from 'react-hot-toast';

// Tab ids, which double as the /ledger/<sub> path segments the dashboard links to.
const LEDGER_TABS = ['entries', 'day-book', 'trial-balance', 'profit-loss', 'outstanding'];

interface TrialBalanceRow { account: string; debit: number; credit: number }
interface PnLData { sales: number; purchases: number; grossProfit: number; expenses: number; otherIncome: number; netProfit: number }
interface OutstandingParty { id: string; partyId: string; partyName: string; partyType: string; balance: number }

const today = new Date().toISOString().split('T')[0];
const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

export default function LedgerPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const { t } = useTranslation(['ledger', 'common']);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [page, setPage] = useState(1);
  // Whole-set debit/credit totals from the server (same filters as the list).
  // Without them the stat cards summed only the loaded page.
  const [totals, setTotals] = useState<{ debit: number; credit: number } | null>(null);
  const [loading, setLoading] = useState(true);
  // HTTP status of the last failed fetch (any tab), or null. A bare `catch {}`
  // used to swallow everything, so a 403 rendered as silently-empty tabs.
  const [loadError, setLoadError] = useState<number | null>(null);
  // The dashboard's Quick Actions link to /ledger/day-book, /ledger/trial-balance,
  // /ledger/profit-loss and /ledger/outstanding. The router catches all of them
  // with the /ledger/* wildcard and renders this page, which always opened on
  // 'entries' — so none of the four buttons ever reached the report it named.
  // The path segments already match the tab ids.
  // The dashboard's pending-payments alert links to /ledger?filter=outstanding.
  const [tab, setTab] = useState(() => {
    if (searchParams.get('filter') === 'outstanding') return 'outstanding';
    const sub = location.pathname.replace(/^\/ledger\/?/, '').split('/')[0];
    return LEDGER_TABS.includes(sub) ? sub : 'entries';
  });

  // Keep the tab in sync when the user navigates between these URLs without a
  // remount (e.g. Quick Actions -> Quick Actions).
  useEffect(() => {
    if (searchParams.get('filter') === 'outstanding') {
      setTab('outstanding');
      return;
    }
    const sub = location.pathname.replace(/^\/ledger\/?/, '').split('/')[0];
    setTab(LEDGER_TABS.includes(sub) ? sub : 'entries');
  }, [location.pathname, searchParams]);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Record<string, any>>(() => {
    const partyId = searchParams.get('partyId');
    return partyId ? { party_id: partyId } : {};
  });
  const [showCreateEntry, setShowCreateEntry] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [bulkDeleteItems, setBulkDeleteItems] = useState<LedgerEntry[] | null>(null);

  // Sub-report states
  const [dayBookDate, setDayBookDate] = useState(today);
  const [dayBookEntries, setDayBookEntries] = useState<LedgerEntry[]>([]);
  const [dayBookLoading, setDayBookLoading] = useState(false);

  const [trialBalance, setTrialBalance] = useState<TrialBalanceRow[]>([]);
  const [tbTotals, setTbTotals] = useState({ debit: 0, credit: 0 });
  const [tbLoading, setTbLoading] = useState(false);

  const [plData, setPlData] = useState<PnLData | null>(null);
  const [plLoading, setPlLoading] = useState(false);
  const [plFrom, setPlFrom] = useState(thirtyDaysAgo);
  const [plTo, setPlTo] = useState(today);

  const [outstandingParties, setOutstandingParties] = useState<OutstandingParty[]>([]);
  const [outstandingTotals, setOutstandingTotals] = useState({ receivable: 0, payable: 0 });
  const [outstandingLoading, setOutstandingLoading] = useState(false);

  // Server-driven list: page + search + filters go to the API. Search is
  // debounced; a search/filter change resets to page 1 (same pattern as
  // AdminUsersPage).
  useEffect(() => {
    const timer = setTimeout(() => fetchEntries(), search ? 300 : 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, filters]);

  useEffect(() => { setPage(1); }, [search, filters]);

  // Fetch sub-report data when tab changes
  useEffect(() => {
    if (tab === 'day-book') fetchDayBook();
    if (tab === 'trial-balance') fetchTrialBalance();
    if (tab === 'profit-loss') fetchProfitLoss();
    if (tab === 'outstanding') fetchOutstanding();
  }, [tab]);

  const fetchEntries = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const { data } = await ledgerApi.entries({ search, page, limit: 20, ...filters });
      setEntries(data?.data || []);
      setMeta(data?.meta || null);
      const sums = data?.totals;
      setTotals(sums ? { debit: Number(sums.debit) || 0, credit: Number(sums.credit) || 0 } : null);
    } catch (err: any) {
      setEntries([]);
      setMeta(null);
      setTotals(null);
      setLoadError(err?.response?.status ?? 0);
    } finally {
      setLoading(false);
    }
  };

  const fetchDayBook = async (date?: string) => {
    try {
      setDayBookLoading(true);
      setLoadError(null);
      const d = date ?? dayBookDate;
      const res = await ledgerApi.dayBook({ from: d, to: d });
      const raw = res.data?.data;
      // Day book API returns mapped entries; adapt to LedgerEntry shape for the columns renderer
      const rows = (Array.isArray(raw) ? raw : []).map((e: any) => ({
        id: e.id,
        entry_date: e.date ?? e.entry_date,
        narration: e.narration,
        account_type: e.type ?? e.account_type ?? 'JOURNAL',
        entry_type: e.debit > 0 ? 'DEBIT' : 'CREDIT',
        amount: e.debit > 0 ? e.debit : e.credit,
        party: e.party_name ? { id: '', name: e.party_name, type: '' } : undefined,
      }));
      setDayBookEntries(rows as any[]);
    } catch (err: any) {
      setDayBookEntries([]);
      setLoadError(err?.response?.status ?? 0);
    } finally {
      setDayBookLoading(false);
    }
  };

  const fetchTrialBalance = async () => {
    try {
      setTbLoading(true);
      setLoadError(null);
      const res = await ledgerApi.trialBalance({ startDate: thirtyDaysAgo, endDate: today });
      const data = res.data?.data;
      let rows: TrialBalanceRow[] = [];
      if (Array.isArray(data)) {
        rows = data;
      } else if (data && Array.isArray(data.accounts)) {
        rows = data.accounts.map((a: any) => ({
          account: a.accountType ?? a.account,
          debit: Number(a.debit ?? 0),
          credit: Number(a.credit ?? 0),
        }));
        setTbTotals({ debit: Number(data.totalDebit ?? 0), credit: Number(data.totalCredit ?? 0) });
      }
      if (!data?.totalDebit) {
        setTbTotals({
          debit: rows.reduce((s, r) => s + r.debit, 0),
          credit: rows.reduce((s, r) => s + r.credit, 0),
        });
      }
      setTrialBalance(rows);
    } catch (err: any) {
      setTrialBalance([]);
      setLoadError(err?.response?.status ?? 0);
    } finally {
      setTbLoading(false);
    }
  };

  const fetchProfitLoss = async (from?: string, to?: string) => {
    try {
      setPlLoading(true);
      setLoadError(null);
      const res = await ledgerApi.profitLoss({ startDate: from ?? plFrom, endDate: to ?? plTo });
      const d = res.data?.data;
      if (d && typeof d === 'object') {
        setPlData({
          sales: Number(d.sales ?? 0),
          purchases: Number(d.purchases ?? 0),
          grossProfit: Number(d.grossProfit ?? 0),
          expenses: Number(d.expenses ?? 0),
          otherIncome: Number(d.otherIncome ?? 0),
          netProfit: Number(d.netProfit ?? 0),
        });
      } else {
        setPlData(null);
      }
    } catch (err: any) {
      setPlData(null);
      setLoadError(err?.response?.status ?? 0);
    } finally {
      setPlLoading(false);
    }
  };

  const fetchOutstanding = async () => {
    try {
      setOutstandingLoading(true);
      setLoadError(null);
      const res = await ledgerApi.outstanding();
      const od = res.data?.data;
      if (od && Array.isArray(od.parties)) {
        const parties: OutstandingParty[] = od.parties
          .filter((p: any) => Number(p.balance) !== 0)
          .map((p: any) => ({
            id: p.id,
            partyId: p.id,
            partyName: p.name,
            partyType: p.type ?? '',
            balance: Number(p.balance),
          }));
        setOutstandingParties(parties);
        setOutstandingTotals({
          receivable: Number(od.totalReceivable ?? 0),
          payable: Number(od.totalPayable ?? 0),
        });
      } else {
        setOutstandingParties([]);
        setOutstandingTotals({ receivable: 0, payable: 0 });
      }
    } catch (err: any) {
      setOutstandingParties([]);
      setOutstandingTotals({ receivable: 0, payable: 0 });
      setLoadError(err?.response?.status ?? 0);
    } finally {
      setOutstandingLoading(false);
    }
  };

  // Prefer the server's whole-set totals (same filters as the list); summing
  // the visible page presented one page's slice as business-wide figures.
  const totalDebit = totals?.debit
    ?? entries.filter(e => e.entry_type === 'DEBIT').reduce((sum, e) => sum + Number(e.amount), 0);
  const totalCredit = totals?.credit
    ?? entries.filter(e => e.entry_type === 'CREDIT').reduce((sum, e) => sum + Number(e.amount), 0);

  const handleBulkDelete = async () => {
    if (!bulkDeleteItems) return;
    try {
      // This used to show the success toast without calling anything at all —
      // the rows came straight back on the refetch while the user believed
      // accounting records had been deleted.
      const { data } = await ledgerApi.deleteEntries(bulkDeleteItems.map((e) => e.id));
      const deleted = data?.data?.deleted ?? bulkDeleteItems.length;
      toast.success(t('ledger:entries_deleted', { count: deleted }));
      setBulkDeleteItems(null);
      fetchEntries();
    } catch (err: any) {
      // Surface the server's reason — most often "these came from a purchase or
      // sale and must be voided at the document" — rather than a generic error.
      toast.error(err?.response?.data?.message || t('ledger:entries_delete_error'));
      setBulkDeleteItems(null);
    }
  };

  const retryLoad = () => {
    setLoadError(null);
    fetchEntries();
    if (tab === 'day-book') fetchDayBook();
    if (tab === 'trial-balance') fetchTrialBalance();
    if (tab === 'profit-loss') fetchProfitLoss();
    if (tab === 'outstanding') fetchOutstanding();
  };

  const filterFields: FilterField[] = [
    {
      key: 'account_type', label: t('ledger:account_type'), type: 'select',
      // These must be AccountType enum members. SALE, PAYMENT_IN and PAYMENT_OUT
      // are not — picking one could only ever match zero rows.
      options: [
        { value: 'PURCHASE', label: t('ledger:account_purchase') },
        { value: 'SALES', label: t('ledger:account_sale') },
        { value: 'PARTY_RECEIVABLE', label: t('ledger:account_receivable') },
        { value: 'PARTY_PAYABLE', label: t('ledger:account_payable') },
        { value: 'CASH', label: t('ledger:account_cash') },
        { value: 'BANK', label: t('ledger:account_bank') },
        { value: 'EXPENSE', label: t('ledger:account_expense') },
        { value: 'INCOME', label: t('ledger:account_income') },
        { value: 'INVENTORY', label: t('ledger:account_inventory') },
      ],
    },
    {
      key: 'entry_type', label: t('ledger:entry_type'), type: 'select',
      options: [
        { value: 'DEBIT', label: t('ledger:debit') },
        { value: 'CREDIT', label: t('ledger:credit') },
      ],
    },
    { key: 'amount', label: t('common:amount'), type: 'number-range' },
  ];

  const columns = [
    { key: 'entry_date', header: t('ledger:entry_date'), render: (e: LedgerEntry) => formatDate(e.entry_date) },
    { key: 'narration', header: t('ledger:narration'), render: (e: LedgerEntry) => (
      <div>
        <p className="font-medium text-sm">{e.narration}</p>
        {e.party && <p className="text-xs text-muted-foreground">{e.party.name}</p>}
      </div>
    )},
    { key: 'account_type', header: t('common:type'), render: (e: LedgerEntry) => (
      <span className="text-xs px-2 py-1 rounded bg-muted">{String(e.account_type).replace('_', ' ')}</span>
    )},
    { key: 'debit', header: t('ledger:debit'), render: (e: LedgerEntry) => e.entry_type === 'DEBIT' ? <span className="text-red-400 font-semibold">{formatCurrency(e.amount)}</span> : <span className="text-muted-foreground">-</span> },
    { key: 'credit', header: t('ledger:credit'), render: (e: LedgerEntry) => e.entry_type === 'CREDIT' ? <span className="text-emerald-400 font-semibold">{formatCurrency(e.amount)}</span> : <span className="text-muted-foreground">-</span> },
  ];

  const tbColumns = [
    { key: 'account', header: t('ledger:account'), render: (r: TrialBalanceRow) => <span className="font-medium">{r.account}</span> },
    { key: 'debit', header: t('ledger:debit'), render: (r: TrialBalanceRow) => (
      <span className={r.debit > 0 ? 'text-red-400 font-semibold' : 'text-muted-foreground'}>
        {r.debit > 0 ? formatCurrency(r.debit) : '—'}
      </span>
    )},
    { key: 'credit', header: t('ledger:credit'), render: (r: TrialBalanceRow) => (
      <span className={r.credit > 0 ? 'text-emerald-400 font-semibold' : 'text-muted-foreground'}>
        {r.credit > 0 ? formatCurrency(r.credit) : '—'}
      </span>
    )},
  ];

  // A 403 means the user lacks the ledger permission — say so instead of
  // rendering empty tabs; any other failure gets an explicit retry panel.
  if (loadError === 403) return <AccessDeniedPage />;
  if (loadError !== null) {
    return (
      <div className="text-center py-16 space-y-4">
        <p className="text-muted-foreground">{t('common:something_wrong')}</p>
        <Button variant="outline" onClick={retryLoad}>
          <RefreshCw className="h-4 w-4 mr-2" /> {t('common:retry')}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{t('ledger:title')}</h2>
          <p className="text-muted-foreground">{t('ledger:subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <ExportButton
            data={entries}
            columns={['entry_date', 'account_type', 'entry_type', 'amount', 'narration']}
            filename="ledger"
          />
          <Button variant="outline" onClick={() => setShowImport(true)}>
            <Upload className="h-4 w-4 mr-2" /> {t('common:import')}
          </Button>
          <Button onClick={() => setShowCreateEntry(true)}><Plus className="h-4 w-4 mr-2" /> {t('ledger:new_entry')}</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title={t('ledger:total_debit')} value={formatCurrency(totalDebit)} icon={ArrowUpRight} iconColor="text-red-400" />
        <StatCard title={t('ledger:total_credit')} value={formatCurrency(totalCredit)} icon={ArrowDownLeft} iconColor="text-emerald-400" />
        <StatCard title={t('ledger:net_balance')} value={formatCurrency(Math.abs(totalDebit - totalCredit))} icon={BookOpen} iconColor="text-primary" />
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="flex-1 max-w-sm">
            <Input
              icon={<Search className="h-4 w-4" />}
              placeholder={t('ledger:search_entries')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <AdvancedFilters
          fields={filterFields}
          values={filters}
          onChange={setFilters}
          onReset={() => setFilters({})}
        />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="entries">{t('ledger:all_entries')}</TabsTrigger>
          <TabsTrigger value="day-book">{t('ledger:day_book_title')}</TabsTrigger>
          <TabsTrigger value="trial-balance">{t('ledger:trial_balance_title')}</TabsTrigger>
          <TabsTrigger value="profit-loss">{t('ledger:tab_profit_loss')}</TabsTrigger>
          <TabsTrigger value="outstanding">{t('ledger:tab_outstanding')}</TabsTrigger>
        </TabsList>

        <TabsContent value="entries" className="mt-4">
          <BulkSelectDataTable
            columns={columns}
            data={entries}
            loading={loading}
            onRowClick={(e) => e.party && navigate(`/ledger/party/${e.party.id}`)}
            bulkActions={[
              {
                label: t('common:export_selected'),
                icon: <Download className="h-3.5 w-3.5" />,
                onClick: (items) => {
                  const csv = [
                    'Date,Account Type,Entry Type,Amount,Narration,Party',
                    ...items.map(e => `${e.entry_date},${e.account_type},${e.entry_type},${e.amount},"${e.narration || ''}",${e.party?.name || ''}`),
                  ].join('\n');
                  const blob = new Blob([csv], { type: 'text/csv' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a'); a.href = url; a.download = 'selected_ledger.csv'; a.click();
                  URL.revokeObjectURL(url);
                  toast.success(t('ledger:exported_count', { count: items.length }));
                },
              },
              {
                label: t('common:delete_selected'),
                icon: <Trash2 className="h-3.5 w-3.5" />,
                variant: 'destructive',
                onClick: (items) => setBulkDeleteItems(items),
              },
            ]}
          />
          {meta && <Pagination meta={meta} onPageChange={setPage} />}
        </TabsContent>

        {/* Day Book — fetches from backend for selected date */}
        <TabsContent value="day-book" className="mt-4">
          <Card className="glass">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{t('ledger:day_book_title')}</CardTitle>
                <div className="flex items-center gap-2">
                  <Input
                    type="date"
                    className="w-40"
                    value={dayBookDate}
                    onChange={(e) => { setDayBookDate(e.target.value); fetchDayBook(e.target.value); }}
                  />
                  <Button variant="outline" size="sm" onClick={() => fetchDayBook()}>
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {dayBookLoading ? <SectionLoader /> : (
                <>
                  <DataTable columns={columns} data={dayBookEntries} emptyMessage={t('common:no_entries_for_date')} />
                  {dayBookEntries.length > 0 && (
                    <div className="flex justify-end gap-8 px-4 py-3 mt-2 rounded-lg bg-muted/50 border border-border text-sm font-semibold">
                      <span>{t('ledger:total_debit')}: <span className="text-red-400">{formatCurrency(dayBookEntries.filter(e => e.entry_type === 'DEBIT').reduce((s, e) => s + Number(e.amount), 0))}</span></span>
                      <span>{t('ledger:total_credit')}: <span className="text-emerald-400">{formatCurrency(dayBookEntries.filter(e => e.entry_type === 'CREDIT').reduce((s, e) => s + Number(e.amount), 0))}</span></span>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Trial Balance — fetches from backend */}
        <TabsContent value="trial-balance" className="mt-4">
          <Card className="glass">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{t('ledger:trial_balance_title')}</CardTitle>
                <Button variant="outline" size="sm" onClick={fetchTrialBalance}>
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {tbLoading ? <SectionLoader /> : (
                <>
                  {trialBalance.length === 0 ? (
                    <EmptyState title={t('ledger:no_trial_balance')} description={t('ledger:no_trial_balance_desc')} />
                  ) : (
                    <>
                      <DataTable columns={tbColumns} data={trialBalance} />
                      <div className="flex justify-between p-4 mt-4 bg-muted rounded-lg">
                        <div>
                          <p className="text-sm text-muted-foreground">{t('ledger:total_debit')}</p>
                          <p className="text-xl font-bold text-red-400">{formatCurrency(tbTotals.debit)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-muted-foreground">{t('ledger:total_credit')}</p>
                          <p className="text-xl font-bold text-emerald-400">{formatCurrency(tbTotals.credit)}</p>
                        </div>
                      </div>
                      <div className="mt-3 p-3 rounded-lg border border-border">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground">{t('common:difference')}</span>
                          <span className={`font-bold ${Math.abs(tbTotals.debit - tbTotals.credit) < 0.01 ? 'text-emerald-400' : 'text-amber-400'}`}>
                            {Math.abs(tbTotals.debit - tbTotals.credit) < 0.01 ? t('common:balanced') : formatCurrency(Math.abs(tbTotals.debit - tbTotals.credit))}
                          </span>
                        </div>
                      </div>
                    </>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Profit & Loss — fetches from backend */}
        <TabsContent value="profit-loss" className="mt-4">
          <Card className="glass">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{t('ledger:pl_statement')}</CardTitle>
                <div className="flex items-center gap-2">
                  <Input type="date" className="w-36" value={plFrom} onChange={(e) => setPlFrom(e.target.value)} />
                  <span className="text-muted-foreground text-sm">{t('common:to_separator')}</span>
                  <Input type="date" className="w-36" value={plTo} onChange={(e) => setPlTo(e.target.value)} />
                  <Button variant="outline" size="sm" onClick={() => fetchProfitLoss()}>
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {plLoading ? <SectionLoader /> : plData === null ? (
                <EmptyState title={t('ledger:no_pl_data')} description={t('ledger:no_pl_desc')} />
              ) : (
                <div className="space-y-4">
                  <div className="flex justify-between items-center p-3 rounded-lg bg-muted/30">
                    <span className="text-sm">{t('common:sales_revenue')}</span>
                    <span className="font-semibold text-emerald-400">{formatCurrency(plData.sales)}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 rounded-lg bg-muted/30">
                    <span className="text-sm">{t('common:cost_of_purchases')}</span>
                    <span className="font-semibold text-red-400">{formatCurrency(plData.purchases)}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 rounded-lg bg-muted/20 border border-border">
                    <span className="text-sm font-medium">{t('common:gross_profit')}</span>
                    <span className={`font-semibold ${plData.grossProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{formatCurrency(plData.grossProfit)}</span>
                  </div>
                  {plData.otherIncome > 0 && (
                    <div className="flex justify-between items-center p-3 rounded-lg bg-muted/30">
                      <span className="text-sm">{t('common:other_income')}</span>
                      <span className="font-semibold text-emerald-400">{formatCurrency(plData.otherIncome)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center p-3 rounded-lg bg-muted/30">
                    <span className="text-sm">{t('common:operating_expenses')}</span>
                    <span className="font-semibold text-red-400">{formatCurrency(plData.expenses)}</span>
                  </div>
                  <div className="flex justify-between items-center p-4 rounded-lg border-2 border-primary/30 bg-primary/5">
                    <span className="font-semibold">{plData.netProfit >= 0 ? t('common:net_profit_label') : t('common:net_loss_label')}</span>
                    <span className={`text-xl font-bold ${plData.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {formatCurrency(Math.abs(plData.netProfit))}
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Outstanding — fetches from backend party balances */}
        <TabsContent value="outstanding" className="mt-4">
          <Card className="glass">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{t('ledger:outstanding_title')}</CardTitle>
                <Button variant="outline" size="sm" onClick={fetchOutstanding}>
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {outstandingLoading ? <SectionLoader /> : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                    <StatCard title={t('ledger:total_receivable')} value={formatCurrency(outstandingTotals.receivable)} icon={ArrowDownLeft} iconColor="text-emerald-400" />
                    <StatCard title={t('ledger:total_payable')} value={formatCurrency(outstandingTotals.payable)} icon={ArrowUpRight} iconColor="text-red-400" />
                    <StatCard title={t('common:net_outstanding')} value={formatCurrency(Math.abs(outstandingTotals.receivable - outstandingTotals.payable))} icon={BookOpen} iconColor="text-blue-400" />
                  </div>
                  <div className="space-y-3">
                    {outstandingParties.length === 0 ? (
                      <EmptyState title={t('ledger:no_outstanding')} description={t('ledger:no_outstanding_desc')} />
                    ) : outstandingParties.map(p => (
                      <div
                        key={p.partyId}
                        className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 cursor-pointer transition-colors"
                        onClick={() => navigate(`/ledger/party/${p.partyId}`)}
                      >
                        <div>
                          <p className="font-medium text-sm">{p.partyName}</p>
                          <p className="text-xs text-muted-foreground">{p.partyType}</p>
                        </div>
                        {/* balance < 0 => they owe us (receivable, green);
                            balance > 0 => we owe them (payable, red).
                            This label and colour were inverted. */}
                        <span className={`font-semibold ${p.balance < 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {formatCurrency(Math.abs(p.balance))} {p.balance < 0 ? t('common:receivable') : t('common:payable')}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create Entry Dialog */}
      <CreateLedgerEntryDialog
        open={showCreateEntry}
        onClose={() => setShowCreateEntry(false)}
        onSuccess={() => { setShowCreateEntry(false); fetchEntries(); }}
      />

      {/* Import Dialog */}
      <ImportDataDialog
        open={showImport}
        onClose={() => setShowImport(false)}
        onSuccess={() => { setShowImport(false); fetchEntries(); }}
        defaultModule="ledger"
      />

      {/* Bulk Delete Confirmation */}
      <ConfirmDialog
        open={!!bulkDeleteItems}
        onClose={() => setBulkDeleteItems(null)}
        onConfirm={handleBulkDelete}
        title={t('ledger:delete_ledger_entries')}
        description={t('ledger:delete_entries_confirm', { count: bulkDeleteItems?.length || 0 })}
        confirmLabel={t('ledger:delete_all')}
        variant="danger"
      />
    </div>
  );
}
