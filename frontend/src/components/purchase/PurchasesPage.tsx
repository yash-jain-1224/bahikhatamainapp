import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, Search, ShoppingCart, Truck, Download, Upload, Trash2, CheckCircle, Clock, XCircle, AlertCircle } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { BulkSelectDataTable } from '@/components/shared/BulkSelectDataTable';
import { EmptyState } from '@/components/shared/empty-state';
import { StatCard } from '@/components/shared/stat-card';
import { AdvancedFilters, type FilterField } from '@/components/shared/AdvancedFilters';
import { ExportButton } from '@/components/shared/ExportButton';
import { ImportDataDialog } from '@/components/shared/ImportDataDialog';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Pagination } from '@/components/shared/pagination';
import { purchaseApi } from '@/lib/api';
import { formatCurrency, formatDate, getStatusColor } from '@/utils';
import type { Purchase, PaginationMeta } from '@/types';
import toast from 'react-hot-toast';

const paymentStatusDisplay: Record<string, { label: string; icon: React.ElementType }> = {
  PAID: { label: 'Paid', icon: CheckCircle },
  PARTIAL: { label: 'Partially Paid', icon: Clock },
  UNPAID: { label: 'Unpaid', icon: XCircle },
  CREDIT: { label: 'Credit', icon: AlertCircle },
  OVERPAID: { label: 'Overpaid', icon: AlertCircle },
};

export default function PurchasesPage() {
  const navigate = useNavigate();
  const { t } = useTranslation(['purchases', 'common']);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [page, setPage] = useState(1);
  // Business-wide totals for the stat cards — the list is paginated, so
  // summing the loaded page understates every number.
  const [overall, setOverall] = useState<{ totalAmount: number; paidAmount: number; balanceAmount: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Record<string, any>>({});
  const [showImport, setShowImport] = useState(false);
  const [bulkDeleteItems, setBulkDeleteItems] = useState<Purchase[] | null>(null);

  // Server-driven list: page + search + filters go to the API. Search is debounced.
  useEffect(() => {
    const timer = setTimeout(() => fetchPurchases(), search ? 300 : 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, filters]);

  useEffect(() => { setPage(1); }, [search, filters]);

  useEffect(() => { fetchOverall(); }, []);

  const fetchOverall = async () => {
    try {
      const { data } = await purchaseApi.dashboard();
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

  const fetchPurchases = async () => {
    try {
      setLoading(true);
      const { data } = await purchaseApi.list({ page, limit: 20, search, ...filters });
      setPurchases(data?.data || []);
      setMeta(data?.meta || null);
    } catch {
      // Previously injected three invented purchases (Sharma Seeds ₹125,000,
      // Ram Traders ₹78,000, Lakshmi Suppliers ₹38,000) whenever the API failed.
      // The stat cards then summed that fiction, so a backend outage looked like
      // real money. Show the error and an empty list instead.
      setPurchases([]);
      setMeta(null);
      toast.error(t('purchases:fetch_error'));
    } finally {
      setLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    if (!bulkDeleteItems) return;
    try {
      await Promise.all(bulkDeleteItems.map(p => purchaseApi.delete(p.id)));
      toast.success(t('purchases:delete_success', { count: bulkDeleteItems.length }));
      setBulkDeleteItems(null);
      fetchPurchases();
      fetchOverall();
    } catch {
      toast.error(t('purchases:delete_error'));
    }
  };

  // Prefer business-wide dashboard totals; fall back to page sums only if the
  // dashboard call failed.
  const totalAmount = overall ? overall.totalAmount : purchases.reduce((s, p) => s + Number(p.total_amount), 0);
  const totalPaid = overall ? overall.paidAmount : purchases.reduce((s, p) => s + Number(p.paid_amount), 0);
  const totalBalance = overall ? overall.balanceAmount : purchases.reduce((s, p) => s + Number(p.balance_amount), 0);

  const filterFields: FilterField[] = [
    { key: 'payment_status', label: t('purchases:payment_status_filter'), type: 'select', options: [
      { value: 'PAID', label: t('purchases:paid_option') }, { value: 'PARTIAL', label: t('purchases:partial_option') }, { value: 'UNPAID', label: t('purchases:unpaid_option') },
    ]},
    { key: 'amount', label: t('purchases:amount_range_filter'), type: 'number-range' },
  ];

  const columns = [
    {
      key: 'purchase_number',
      header: t('purchases:purchase_number'),
      render: (p: Purchase) => <span className="font-mono text-primary">{p.purchase_number}</span>,
    },
    {
      key: 'purchase_date',
      header: t('purchases:purchase_date'),
      render: (p: Purchase) => formatDate(p.purchase_date),
    },
    {
      key: 'party',
      header: t('purchases:party'),
      render: (p: Purchase) => (
        <div>
          <p className="font-medium">{p.party?.name}</p>
          {p.gadi_number && <p className="text-xs text-muted-foreground flex items-center gap-1"><Truck className="h-3 w-3" />{p.gadi_number}</p>}
        </div>
      ),
    },
    {
      key: 'total_amount',
      header: t('purchases:amount'),
      render: (p: Purchase) => <span className="font-semibold">{formatCurrency(p.total_amount)}</span>,
    },
    {
      key: 'balance_amount',
      header: t('purchases:balance'),
      render: (p: Purchase) => (
        <span className={Number(p.balance_amount) > 0 ? 'text-red-400' : 'text-emerald-400'}>
          {formatCurrency(p.balance_amount)}
        </span>
      ),
    },
    {
      key: 'payment_status',
      header: t('purchases:status'),
      render: (p: Purchase) => {
        const cfg = paymentStatusDisplay[p.payment_status] || paymentStatusDisplay.UNPAID;
        const Icon = cfg.icon;
        const progress = Number(p.total_amount) > 0
          ? Math.min(100, (Number(p.paid_amount) / Number(p.total_amount)) * 100)
          : 0;
        const progressColor = p.payment_status === 'PAID' ? 'bg-emerald-500'
          : p.payment_status === 'PARTIAL' ? 'bg-amber-500'
          : 'bg-red-500';
        return (
          <div className="space-y-1">
            <span className={`px-2 py-1 rounded-full text-xs font-medium inline-flex items-center gap-1 ${getStatusColor(p.payment_status)}`}>
              <Icon className="h-3 w-3" />
              {cfg.label}
            </span>
            {p.payment_status !== 'PAID' && Number(p.total_amount) > 0 && (
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
          <h2 className="text-2xl font-bold">{t('purchases:title')}</h2>
          <p className="text-muted-foreground">{t('purchases:subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <ExportButton
            data={purchases}
            columns={['purchase_number', 'purchase_date', 'total_amount', 'paid_amount', 'balance_amount', 'payment_status']}
            filename="purchases"
          />
          <Button variant="outline" onClick={() => setShowImport(true)}>
            <Upload className="h-4 w-4 mr-2" /> {t('common:import')}
          </Button>
          <Button onClick={() => navigate('/purchases/new')}>
            <Plus className="h-4 w-4 mr-2" /> {t('purchases:new_purchase')}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title={t('purchases:total_purchases')} value={formatCurrency(totalAmount)} icon={ShoppingCart} iconColor="text-blue-400" />
        <StatCard title={t('purchases:total_paid')} value={formatCurrency(totalPaid)} icon={ShoppingCart} iconColor="text-emerald-400" />
        <StatCard title={t('purchases:total_balance')} value={formatCurrency(totalBalance)} icon={ShoppingCart} iconColor="text-red-400" />
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

      {purchases.length === 0 && !loading ? (
        <EmptyState
          icon={<ShoppingCart className="h-16 w-16 text-muted-foreground" />}
          title={t('purchases:empty_title')}
          description={t('purchases:empty_description')}
          action={{ label: t('purchases:empty_action'), onClick: () => navigate('/purchases/new') }}
        />
      ) : (
        <>
        <BulkSelectDataTable
          columns={columns}
          data={purchases}
          loading={loading}
          onRowClick={(p) => navigate(`/purchases/${p.id}`)}
          bulkActions={[
            {
              label: t('purchases:export_selected'),
              icon: <Download className="h-3.5 w-3.5" />,
              onClick: (items) => {
                const csv = [
                  'Purchase #,Date,Party,Gadi No,Amount,Paid,Balance,Status',
                  ...items.map(p => `${p.purchase_number},${p.purchase_date},${p.party?.name || ''},${p.gadi_number || ''},${p.total_amount},${p.paid_amount},${p.balance_amount},${p.payment_status}`),
                ].join('\n');
                const blob = new Blob([csv], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a'); a.href = url; a.download = 'selected_purchases.csv'; a.click();
                URL.revokeObjectURL(url);
                toast.success(t('purchases:exported_count', { count: items.length }));
              },
            },
            {
              label: t('purchases:delete_selected'),
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
        onSuccess={() => { setShowImport(false); fetchPurchases(); fetchOverall(); }}
        defaultModule="purchases"
      />

      {/* Bulk Delete Confirmation */}
      <ConfirmDialog
        open={!!bulkDeleteItems}
        onClose={() => setBulkDeleteItems(null)}
        onConfirm={handleBulkDelete}
        title={t('purchases:delete_purchases_title')}
        description={t('purchases:delete_purchases_desc', { count: bulkDeleteItems?.length || 0 })}
        confirmLabel={t('purchases:delete_all')}
        variant="danger"
      />
    </div>
  );
}
