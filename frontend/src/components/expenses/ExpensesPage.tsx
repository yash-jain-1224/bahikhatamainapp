import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Plus, Search, Receipt, TrendingDown, Package, ShoppingCart,
  Download, Upload, Trash2, Pencil, FileText, CheckCircle, XCircle,
  Calendar, IndianRupee,
} from 'lucide-react';
import {
  Button, Input, Tabs, TabsList, TabsTrigger, TabsContent, Badge,
} from '@/components/ui';
import { BulkSelectDataTable } from '@/components/shared/BulkSelectDataTable';
import { Pagination } from '@/components/shared/pagination';
import { StatCard } from '@/components/shared/stat-card';
import { EmptyState } from '@/components/shared/empty-state';
import { AdvancedFilters, type FilterField } from '@/components/shared/AdvancedFilters';
import { ExportButton } from '@/components/shared/ExportButton';
import { ImportDataDialog } from '@/components/shared/ImportDataDialog';
import { EditExpenseDialog } from '@/components/expenses/EditExpenseDialog';
import { CreateExpenseDialog } from '@/components/expenses/CreateExpenseDialog';
import { expenseApi, profileApi } from '@/lib/api';
import { formatCurrency, formatDate } from '@/utils';
import type { Expense, ExpenseType, PaginationMeta } from '@/types';
import toast from 'react-hot-toast';

export default function ExpensesPage() {
  const navigate = useNavigate();
  const { t } = useTranslation(['expenses', 'common']);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expenseTypes, setExpenseTypes] = useState<ExpenseType[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('all');
  const [filters, setFilters] = useState<Record<string, any>>({});
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showImport, setShowImport] = useState(false);
  // Both the Edit button and the row click used to navigate to /expenses/:id,
  // a route that does not exist — every one of them hit the 404 page.
  const [editExpense, setEditExpense] = useState<any | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);

  // Server-driven list: page + search + filters + tab go to the API (the
  // server returns 20 rows per page — the list used to silently truncate to
  // the first 20). Search is debounced like AdminUsersPage.
  useEffect(() => {
    const timer = setTimeout(() => fetchExpenses(), search ? 300 : 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, filters, tab]);

  useEffect(() => { setPage(1); }, [search, filters, tab]);
  useEffect(() => { fetchExpenseTypes(); fetchStats(); }, []);

  const fetchExpenses = async () => {
    try {
      setLoading(true);
      const typeFilter = tab === 'all' ? undefined : tab;
      const { data } = await expenseApi.listAll({ search, type: typeFilter, page, limit: 20, ...filters });
      setExpenses(data?.data || []);
      setMeta(data?.meta || null);
    } catch (_error) {
      toast.error(t('expenses:fetch_error'));
      setExpenses([]);
      setMeta(null);
    } finally {
      setLoading(false);
    }
  };

  const fetchExpenseTypes = async () => {
    try {
      const { data } = await profileApi.expenseTypes();
      setExpenseTypes(data?.data || []);
    } catch {
      setExpenseTypes([]);
    }
  };

  const fetchStats = async () => {
    try {
      const { data } = await expenseApi.getStats();
      setStats(data?.data || null);
    } catch {
      setStats(null);
    }
  };

  const handleDelete = async (expense: Expense) => {
    if (!confirm(t('expenses:delete_confirm'))) return;
    try {
      if (expense.source === 'standalone') {
        await expenseApi.delete(expense.id);
        toast.success(t('expenses:deleted'));
        fetchExpenses();
        fetchStats();
      } else {
        toast.error(t('expenses:cannot_delete_linked'));
      }
    } catch {
      toast.error(t('expenses:delete_error'));
    }
  };

  const filterFields: FilterField[] = [
    {
      key: 'expense_type_id',
      label: t('expenses:expense_type'),
      type: 'select',
      options: expenseTypes.map(et => ({ value: et.id, label: et.name })),
    },
    {
      key: 'category',
      label: t('expenses:category'),
      type: 'select',
      options: [
        { value: 'DIRECT', label: t('expenses:direct') },
        { value: 'INDIRECT', label: t('expenses:indirect') },
      ],
    },
    { key: 'date', label: t('common:date_range'), type: 'date-range' },
    { key: 'amount', label: t('expenses:amount_range'), type: 'number-range' },
    {
      key: 'is_paid',
      label: t('expenses:payment_status'),
      type: 'select',
      options: [
        { value: '__all__', label: t('common:all') },
        { value: 'true', label: t('expenses:paid') },
        { value: 'false', label: t('expenses:unpaid') },
      ],
    },
  ];

  const getSourceIcon = (source: string) => {
    if (source === 'purchase') return <Package className="h-3.5 w-3.5 text-blue-400" />;
    if (source === 'sale') return <ShoppingCart className="h-3.5 w-3.5 text-emerald-400" />;
    return <Receipt className="h-3.5 w-3.5 text-purple-400" />;
  };

  const getSourceBadge = (expense: Expense) => {
    const colors = {
      standalone: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
      purchase: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      sale: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    };
    return (
      <Badge variant="outline" className={`${colors[expense.source]} flex items-center gap-1`}>
        {getSourceIcon(expense.source)}
        <span className="capitalize">{expense.source}</span>
      </Badge>
    );
  };

  const columns = [
    {
      key: 'date',
      header: t('common:date'),
      render: (e: Expense) => (
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm">{formatDate(e.expense_date)}</span>
        </div>
      ),
    },
    {
      key: 'expense_type',
      header: t('expenses:expense_type'),
      render: (e: Expense) => (
        <div>
          <p className="font-medium">{e.expense_type?.name || '—'}</p>
          <p className="text-xs text-muted-foreground">
            {e.expense_category === 'DIRECT' ? t('expenses:direct') : t('expenses:indirect')}
          </p>
        </div>
      ),
    },
    {
      key: 'source',
      header: t('expenses:source'),
      render: (e: Expense) => (
        <div className="space-y-1">
          {getSourceBadge(e)}
          {e.source_number && (
            <p className="text-xs text-muted-foreground">{e.source_number}</p>
          )}
          {e.party_name && (
            <p className="text-xs text-muted-foreground">{e.party_name}</p>
          )}
        </div>
      ),
    },
    {
      key: 'amount',
      header: t('expenses:amount'),
      render: (e: Expense) => (
        <div className="flex items-center gap-1.5">
          <IndianRupee className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-semibold text-red-400">{formatCurrency(e.amount)}</span>
        </div>
      ),
    },
    {
      key: 'payment_status',
      header: t('expenses:payment_status'),
      render: (e: Expense) => (
        // Sale-linked expenses have no payment status (is_paid is null) —
        // render a neutral badge instead of falsely claiming "Paid".
        e.is_paid == null ? (
          <Badge variant="outline" className="text-muted-foreground border-muted-foreground/30">
            —
          </Badge>
        ) : e.is_paid ? (
          <Badge variant="outline" className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
            <CheckCircle className="h-3 w-3 mr-1" />
            {t('expenses:paid')}
          </Badge>
        ) : (
          <Badge variant="outline" className="bg-red-500/20 text-red-400 border-red-500/30">
            <XCircle className="h-3 w-3 mr-1" />
            {t('expenses:unpaid')}
          </Badge>
        )
      ),
    },
    {
      key: 'notes',
      header: t('common:notes'),
      render: (e: Expense) => (
        <p className="text-xs text-muted-foreground truncate max-w-[200px]">
          {e.notes || '—'}
        </p>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (e: Expense) => (
        <div className="flex items-center gap-1" onClick={(ev) => ev.stopPropagation()}>
          {e.source === 'standalone' && (
            <>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditExpense(e)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-300" onClick={() => handleDelete(e)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
          {e.source === 'purchase' && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(`/purchases/${e.source_id}`)}>
              <FileText className="h-3.5 w-3.5" />
            </Button>
          )}
          {e.source === 'sale' && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(`/sales/${e.source_id}`)}>
              <FileText className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  // The list is server-paginated, so counting the loaded slice per source
  // would understate reality. The fetch filters by the active tab, so
  // meta.total IS the full count for that tab — show it there and leave the
  // other tabs uncounted rather than implying the visible slice is everything.
  const tabCount = (value: string) =>
    tab === value && meta ? ` (${meta.total})` : '';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{t('expenses:title')}</h2>
          <p className="text-muted-foreground">{t('expenses:subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <ExportButton
            data={expenses}
            columns={['expense_date', 'expense_type.name', 'amount', 'source', 'is_paid']}
            filename="expenses"
          />
          <Button variant="outline" onClick={() => setShowImport(true)}>
            <Upload className="h-4 w-4 mr-2" /> {t('common:import')}
          </Button>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-2" /> {t('expenses:new_expense')}
          </Button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <StatCard
            title={t('expenses:today_expenses')}
            value={formatCurrency(stats.today?.amount || 0)}
            icon={Calendar}
            iconColor="text-blue-400"
          />
          <StatCard
            title={t('expenses:this_month')}
            value={formatCurrency(stats.thisMonth?.amount || 0)}
            icon={TrendingDown}
            iconColor="text-red-400"
          />
          <StatCard
            title={t('expenses:purchase_expenses')}
            value={formatCurrency(stats.overall?.purchase || 0)}
            icon={Package}
            iconColor="text-blue-400"
          />
          <StatCard
            title={t('expenses:sale_expenses')}
            value={formatCurrency(stats.overall?.sale || 0)}
            icon={ShoppingCart}
            iconColor="text-emerald-400"
          />
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="all">{t('expenses:all')}{tabCount('all')}</TabsTrigger>
              <TabsTrigger value="standalone">{t('expenses:standalone')}{tabCount('standalone')}</TabsTrigger>
              <TabsTrigger value="purchase">{t('expenses:purchase_linked')}{tabCount('purchase')}</TabsTrigger>
              <TabsTrigger value="sale">{t('expenses:sale_linked')}{tabCount('sale')}</TabsTrigger>
            </TabsList>
            <Input
              icon={<Search className="h-4 w-4" />}
              placeholder={t('common:search_placeholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-64"
            />
          </div>
          <AdvancedFilters
            fields={filterFields}
            values={filters}
            onChange={setFilters}
            onReset={() => setFilters({})}
          />
        </div>

        <TabsContent value={tab}>
          {expenses.length === 0 && !loading ? (
            <EmptyState
              icon={<Receipt className="h-16 w-16 text-muted-foreground" />}
              title={t('expenses:empty_title')}
              description={t('expenses:empty_description')}
              action={{ label: t('expenses:empty_action'), onClick: () => setShowCreateDialog(true) }}
            />
          ) : (
            <BulkSelectDataTable
              columns={columns}
              data={expenses}
              loading={loading}
              onRowClick={(e) => {
                if (e.source === 'standalone') setEditExpense(e);
                else if (e.source === 'purchase') navigate(`/purchases/${e.source_id}`);
                else if (e.source === 'sale') navigate(`/sales/${e.source_id}`);
              }}
              bulkActions={[
                {
                  label: t('common:export_selected'),
                  icon: <Download className="h-3.5 w-3.5" />,
                  onClick: (items) => {
                    const csv = [
                      'Date,Type,Category,Amount,Source,Status',
                      ...items.map(e => `${formatDate(e.expense_date)},${e.expense_type?.name},${e.expense_category},${e.amount},${e.source},${e.is_paid == null ? '—' : e.is_paid ? 'Paid' : 'Unpaid'}`)
                    ].join('\n');
                    const blob = new Blob([csv], { type: 'text/csv' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'selected_expenses.csv';
                    a.click();
                    URL.revokeObjectURL(url);
                    toast.success(t('expenses:exported_count', { count: items.length }));
                  },
                },
              ]}
            />
          )}
          {meta && <Pagination meta={meta} onPageChange={setPage} />}
        </TabsContent>
      </Tabs>

      {/* Create Expense Dialog */}
      <CreateExpenseDialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onSuccess={() => {
          setShowCreateDialog(false);
          fetchExpenses();
          fetchStats();
        }}
        expenseTypes={expenseTypes}
      />

      {/* Import Dialog */}
      <ImportDataDialog
        open={showImport}
        onClose={() => setShowImport(false)}
        defaultModule="expenses"
        onSuccess={() => {
          setShowImport(false);
          fetchExpenses();
        }}
      />

      <EditExpenseDialog
        expense={editExpense}
        expenseTypes={expenseTypes}
        onClose={() => setEditExpense(null)}
        onSuccess={() => {
          setEditExpense(null);
          fetchExpenses();
        }}
      />
    </div>
  );
}
