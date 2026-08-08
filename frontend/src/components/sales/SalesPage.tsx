import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, Search, TrendingUp, IndianRupee, AlertCircle, Download, Upload, Trash2, CheckCircle, Clock, XCircle } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { BulkSelectDataTable } from '@/components/shared/BulkSelectDataTable';
import { EmptyState } from '@/components/shared/empty-state';
import { StatCard } from '@/components/shared/stat-card';
import { AdvancedFilters, type FilterField } from '@/components/shared/AdvancedFilters';
import { ExportButton } from '@/components/shared/ExportButton';
import { ImportDataDialog } from '@/components/shared/ImportDataDialog';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Pagination } from '@/components/shared/pagination';
import { salesApi } from '@/lib/api';
import { formatCurrency, formatDate, getStatusColor } from '@/utils';
import type { Sale, PaginationMeta } from '@/types';
import toast from 'react-hot-toast';

const paymentStatusDisplay: Record<string, { label: string; icon: React.ElementType }> = {
  PAID: { label: 'Paid', icon: CheckCircle },
  PARTIAL: { label: 'Partially Paid', icon: Clock },
  UNPAID: { label: 'Unpaid', icon: XCircle },
  CREDIT: { label: 'Credit', icon: AlertCircle },
  OVERPAID: { label: 'Overpaid', icon: AlertCircle },
};

export default function SalesPage() {
  const navigate = useNavigate();
  const { t } = useTranslation(['sales', 'common']);
  const [sales, setSales] = useState<Sale[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [page, setPage] = useState(1);
  // Business-wide totals for the stat cards — the list is paginated, so
  // summing the loaded page understates every number.
  const [overall, setOverall] = useState<{ totalAmount: number; paidAmount: number; balanceAmount: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Record<string, any>>({});
  const [showImport, setShowImport] = useState(false);
  const [bulkDeleteItems, setBulkDeleteItems] = useState<Sale[] | null>(null);

  // Server-driven list: page + search + filters go to the API. Search is debounced.
  useEffect(() => {
    const timer = setTimeout(() => fetchSales(), search ? 300 : 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, filters]);

  useEffect(() => { setPage(1); }, [search, filters]);

  useEffect(() => { fetchOverall(); }, []);

  const fetchOverall = async () => {
    try {
      const { data } = await salesApi.dashboard();
      const o = data?.data?.overall;
      if (o) {
        setOverall({
          totalAmount: Number(o.totalAmount || 0),
          paidAmount: Number(o.paidAmount || 0),
          balanceAmount: Number(o.balanceAmount || 0),
        });
      }
    } catch {
      // Fall back to page sums below
      setOverall(null);
    }
  };

  const fetchSales = async () => {
    try {
      setLoading(true);
      const { data } = await salesApi.list({ page, limit: 20, search, ...filters });
      setSales(data?.data || []);
      setMeta(data?.meta || null);
    } catch {
      // Previously injected four invented sales (Gupta Trading ₹72,000,
      // Krishna Exports ₹95,000, …) on any API failure, which the stat cards
      // then summed as though it were real revenue. See PurchasesPage.
      setSales([]);
      setMeta(null);
      toast.error(t('sales:fetch_error'));
    } finally {
      setLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    if (!bulkDeleteItems) return;
    try {
      // This used to fire the success toast without calling the API at all, so
      // "Delete selected" reported N deleted and deleted nothing.
      await Promise.all(bulkDeleteItems.map((s) => salesApi.delete(s.id)));
      toast.success(t('sales:deleted_count', { count: bulkDeleteItems.length }));
      setBulkDeleteItems(null);
      fetchSales();
      fetchOverall();
    } catch {
      toast.error(t('sales:delete_error'));
    }
  };

  // Prefer business-wide dashboard totals; fall back to page sums only if the
  // dashboard call failed.
  const totalAmount = overall ? overall.totalAmount : sales.reduce((s, p) => s + Number(p.total_amount), 0);
  const totalPaid = overall ? overall.paidAmount : sales.reduce((s, p) => s + Number(p.paid_amount), 0);
  const totalBalance = overall ? overall.balanceAmount : sales.reduce((s, p) => s + Number(p.balance_amount), 0);

  const filterFields: FilterField[] = [
    {
      key: 'payment_status', label: t('sales:payment_status_filter'), type: 'select',
      options: [
        { value: 'PAID', label: t('sales:paid_option') },
        { value: 'PARTIAL', label: t('sales:partial_option') },
        { value: 'UNPAID', label: t('sales:unpaid_option') },
      ],
    },
    { key: 'amount', label: t('sales:amount_range_filter'), type: 'number-range' },
  ];

  const columns = [
    {
      key: 'sale_number',
      header: t('sales:sale_number'),
      render: (s: Sale) => <span className="font-mono text-primary">{s.sale_number}</span>,
    },
    {
      key: 'sale_date',
      header: t('sales:sale_date'),
      render: (s: Sale) => formatDate(s.sale_date),
    },
    {
      key: 'party',
      header: t('sales:party'),
      render: (s: Sale) => <span className="font-medium">{s.party?.name}</span>,
    },
    {
      key: 'total_amount',
      header: t('sales:amount'),
      render: (s: Sale) => <span className="font-semibold">{formatCurrency(s.total_amount)}</span>,
    },
    {
      key: 'balance_amount',
      header: t('sales:balance'),
      render: (s: Sale) => (
        <span className={Number(s.balance_amount) > 0 ? 'text-amber-400' : 'text-emerald-400'}>
          {formatCurrency(s.balance_amount)}
        </span>
      ),
    },
    {
      key: 'payment_status',
      header: t('sales:status'),
      render: (s: Sale) => {
        const cfg = paymentStatusDisplay[s.payment_status] || paymentStatusDisplay.UNPAID;
        const Icon = cfg.icon;
        const progress = Number(s.total_amount) > 0
          ? Math.min(100, (Number(s.paid_amount) / Number(s.total_amount)) * 100)
          : 0;
        const progressColor = s.payment_status === 'PAID' ? 'bg-emerald-500'
          : s.payment_status === 'PARTIAL' ? 'bg-amber-500'
          : 'bg-red-500';
        return (
          <div className="space-y-1">
            <span className={`px-2 py-1 rounded-full text-xs font-medium inline-flex items-center gap-1 ${getStatusColor(s.payment_status)}`}>
              <Icon className="h-3 w-3" />
              {cfg.label}
            </span>
            {s.payment_status !== 'PAID' && Number(s.total_amount) > 0 && (
              <div className="flex items-center gap-1.5">
                <div className="h-1 w-16 bg-muted rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${progressColor}`} style={{ width: `${progress}%` }} />
                </div>
                <span className="text-[10px] text-muted-foreground">{Math.round(progress)}%</span>
              </div>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{t('sales:title')}</h2>
          <p className="text-muted-foreground">{t('sales:subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <ExportButton
            data={sales}
            columns={['sale_number', 'sale_date', 'total_amount', 'paid_amount', 'balance_amount', 'payment_status']}
            filename="sales"
          />
          <Button variant="outline" onClick={() => setShowImport(true)}>
            <Upload className="h-4 w-4 mr-2" /> {t('common:import')}
          </Button>
          <Button onClick={() => navigate('/sales/new')}>
            <Plus className="h-4 w-4 mr-2" /> {t('sales:new_sale')}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title={t('sales:total_sales')} value={formatCurrency(totalAmount)} icon={TrendingUp} iconColor="text-blue-400" />
        <StatCard title={t('sales:total_received')} value={formatCurrency(totalPaid)} icon={IndianRupee} iconColor="text-emerald-400" />
        <StatCard title={t('sales:total_balance')} value={formatCurrency(totalBalance)} icon={AlertCircle} iconColor="text-amber-400" />
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="flex-1 max-w-sm">
            <Input
              icon={<Search className="h-4 w-4" />}
              placeholder={t('common:search_placeholder')}
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

      {sales.length === 0 && !loading ? (
        <EmptyState
          icon={<TrendingUp className="h-16 w-16 text-muted-foreground" />}
          title={t('sales:empty_title')}
          description={t('sales:empty_description')}
          action={{ label: t('sales:empty_action'), onClick: () => navigate('/sales/new') }}
        />
      ) : (
        <>
        <BulkSelectDataTable
          columns={columns}
          data={sales}
          loading={loading}
          onRowClick={(s) => navigate(`/sales/${s.id}`)}
          bulkActions={[
            {
              label: t('sales:export_selected'),
              icon: <Download className="h-3.5 w-3.5" />,
              onClick: (items) => {
                const csv = [
                  'Sale #,Date,Party,Amount,Paid,Balance,Status',
                  ...items.map(s => `${s.sale_number},${s.sale_date},${s.party?.name || ''},${s.total_amount},${s.paid_amount},${s.balance_amount},${s.payment_status}`),
                ].join('\n');
                const blob = new Blob([csv], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a'); a.href = url; a.download = 'selected_sales.csv'; a.click();
                URL.revokeObjectURL(url);
                toast.success(t('sales:exported_count', { count: items.length }));
              },
            },
            {
              label: t('sales:delete_selected'),
              icon: <Trash2 className="h-3.5 w-3.5" />,
              variant: 'destructive',
              onClick: (items) => setBulkDeleteItems(items),
            },
          ]}
        />
        {meta && <Pagination meta={meta} onPageChange={setPage} />}
        </>
      )}

      {/* Import Dialog */}
      <ImportDataDialog
        open={showImport}
        onClose={() => setShowImport(false)}
        onSuccess={() => { setShowImport(false); fetchSales(); fetchOverall(); }}
        defaultModule="sales"
      />

      {/* Bulk Delete Confirmation */}
      <ConfirmDialog
        open={!!bulkDeleteItems}
        onClose={() => setBulkDeleteItems(null)}
        onConfirm={handleBulkDelete}
        title={t('sales:delete_sales_title')}
        description={t('sales:delete_sales_desc', { count: bulkDeleteItems?.length || 0 })}
        confirmLabel={t('sales:delete_all')}
        variant="danger"
      />
    </div>
  );
}
