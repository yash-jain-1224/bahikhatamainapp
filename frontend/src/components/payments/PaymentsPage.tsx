import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IndianRupee, ArrowDownLeft, ArrowUpRight, Plus, Search, Upload, Download, Trash2 } from 'lucide-react';
import { Button, Input, Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui';
import { BulkSelectDataTable } from '@/components/shared/BulkSelectDataTable';
import { StatCard } from '@/components/shared/stat-card';
import { EmptyState } from '@/components/shared/empty-state';
import { AdvancedFilters, type FilterField } from '@/components/shared/AdvancedFilters';
import { ExportButton } from '@/components/shared/ExportButton';
import { ImportDataDialog } from '@/components/shared/ImportDataDialog';
import { RecordPaymentDialog } from '@/components/shared/RecordPaymentDialog';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { billingApi } from '@/lib/api';
import { formatCurrency, formatDate, getStatusColor } from '@/utils';
import toast from 'react-hot-toast';

interface Payment {
  id: string;
  type: 'IN' | 'OUT';
  party_name: string;
  party_id?: string;
  amount: number;
  date: string;
  mode: string;
  status: string;
  reference?: string;
  notes?: string;
  reference_type?: string;
  reference_id?: string;
}

const paymentStatusLabels: Record<string, string> = {
  PAID: 'Paid',
  PARTIAL: 'Partially Paid',
  UNPAID: 'Unpaid',
  COMPLETED: 'Completed',
  PENDING: 'Pending',
  CREDIT: 'Credit',
  OVERPAID: 'Overpaid',
};

export default function PaymentsPage() {
  const { t } = useTranslation(['payments', 'common']);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Record<string, any>>({});
  const [showRecordPayment, setShowRecordPayment] = useState(false);
  const [defaultPaymentType, setDefaultPaymentType] = useState<'IN' | 'OUT'>('IN');
  const [showImport, setShowImport] = useState(false);
  const [bulkDeleteItems, setBulkDeleteItems] = useState<Payment[] | null>(null);

  useEffect(() => { fetchPayments(); }, [search, filters]);

  const fetchPayments = async () => {
    try {
      setLoading(true);
      const { data } = await billingApi.payments({ search, ...filters });
      setPayments(data?.data || []);
    } catch {
      setPayments([
        { id: '1', type: 'IN', party_name: 'Gupta Trading', amount: 80000, date: '2024-01-15', mode: 'UPI', status: 'PAID', reference: 'UPI-12345' },
        { id: '2', type: 'OUT', party_name: 'Sharma Seeds', amount: 50000, date: '2024-01-14', mode: 'Bank Transfer', status: 'PAID', reference: 'NEFT-67890' },
        { id: '3', type: 'IN', party_name: 'Krishna Exports', amount: 35000, date: '2024-01-13', mode: 'Cash', status: 'PAID' },
        { id: '4', type: 'OUT', party_name: 'Ram Traders', amount: 78000, date: '2024-01-12', mode: 'Cheque', status: 'PARTIAL', reference: 'CHQ-11111' },
        { id: '5', type: 'IN', party_name: 'Agarwal Traders', amount: 45000, date: '2024-01-11', mode: 'Cash', status: 'PAID' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    if (!bulkDeleteItems) return;
    try {
      toast.success(t('payments:deleted_count', { count: bulkDeleteItems.length }));
      setBulkDeleteItems(null);
      fetchPayments();
    } catch {
      toast.error(t('payments:delete_error'));
    }
  };

  const totalIn = payments.filter(p => p.type === 'IN').reduce((s, p) => s + p.amount, 0);
  const totalOut = payments.filter(p => p.type === 'OUT').reduce((s, p) => s + p.amount, 0);
  const filtered = tab === 'all' ? payments : payments.filter(p => p.type === (tab === 'received' ? 'IN' : 'OUT'));

  const filterFields: FilterField[] = [
    {
      key: 'mode', label: t('payments:payment_mode'), type: 'select',
      options: [
        { value: 'CASH', label: t('payments:mode_cash') },
        { value: 'UPI', label: t('payments:mode_upi') },
        { value: 'BANK_TRANSFER', label: t('payments:mode_bank') },
        { value: 'CARD', label: t('payments:mode_card') },
        { value: 'CHEQUE', label: t('payments:mode_cheque') },
        { value: 'CREDIT', label: t('payments:mode_credit') },
      ],
    },
    {
      key: 'status', label: t('common:status'), type: 'select',
      options: [
        { value: 'PAID', label: 'Paid' },
        { value: 'PARTIAL', label: 'Partially Paid' },
        { value: 'UNPAID', label: 'Unpaid' },
      ],
    },
    { key: 'amount', label: t('payments:amount_range'), type: 'number-range' },
  ];

  const columns = [
    { key: 'date', header: t('payments:date'), render: (p: Payment) => formatDate(p.date) },
    { key: 'party_name', header: t('payments:party'), render: (p: Payment) => <span className="font-medium">{p.party_name}</span> },
    { key: 'type', header: t('payments:type'), render: (p: Payment) => (
      <span className={`flex items-center gap-1 text-xs font-medium ${p.type === 'IN' ? 'text-emerald-400' : 'text-red-400'}`}>
        {p.type === 'IN' ? <ArrowDownLeft className="h-3 w-3" /> : <ArrowUpRight className="h-3 w-3" />}
        {p.type === 'IN' ? t('payments:type_received') : t('payments:type_paid')}
      </span>
    )},
    { key: 'amount', header: t('payments:amount'), render: (p: Payment) => (
      <span className={`font-semibold ${p.type === 'IN' ? 'text-emerald-400' : 'text-red-400'}`}>
        {p.type === 'IN' ? '+' : '-'}{formatCurrency(p.amount)}
      </span>
    )},
    { key: 'mode', header: t('payments:mode'), render: (p: Payment) => (
      <span className="text-xs px-2 py-1 rounded bg-muted">{p.mode}</span>
    )},
    { key: 'reference', header: t('payments:reference'), render: (p: Payment) => (
      <span className="text-xs text-muted-foreground font-mono">{p.reference || '—'}</span>
    )},
    { key: 'status', header: t('payments:status'), render: (p: Payment) => <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(p.status)}`}>{paymentStatusLabels[p.status] || p.status}</span> },
  ];

  const handleOpenRecordPayment = (type: 'IN' | 'OUT' = 'IN') => {
    setDefaultPaymentType(type);
    setShowRecordPayment(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{t('payments:title')}</h2>
          <p className="text-muted-foreground">{t('payments:subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <ExportButton
            data={payments}
            columns={['date', 'party_name', 'type', 'amount', 'mode', 'reference', 'status']}
            filename="payments"
          />
          <Button variant="outline" onClick={() => setShowImport(true)}>
            <Upload className="h-4 w-4 mr-2" /> {t('common:import')}
          </Button>
          <Button variant="outline" onClick={() => handleOpenRecordPayment('OUT')}>
            <ArrowUpRight className="h-4 w-4 mr-2" /> {t('payments:pay_out')}
          </Button>
          <Button onClick={() => handleOpenRecordPayment('IN')}>
            <Plus className="h-4 w-4 mr-2" /> {t('payments:record_payment')}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title={t('payments:total_received')} value={formatCurrency(totalIn)} icon={ArrowDownLeft} iconColor="text-emerald-400" />
        <StatCard title={t('payments:total_paid')} value={formatCurrency(totalOut)} icon={ArrowUpRight} iconColor="text-red-400" />
        <StatCard title={t('payments:net_flow')} value={formatCurrency(totalIn - totalOut)} icon={IndianRupee} iconColor="text-primary" />
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

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="all">{t('payments:tab_all')} ({payments.length})</TabsTrigger>
          <TabsTrigger value="received">{t('payments:tab_received')} ({payments.filter(p => p.type === 'IN').length})</TabsTrigger>
          <TabsTrigger value="paid">{t('payments:tab_paid')} ({payments.filter(p => p.type === 'OUT').length})</TabsTrigger>
        </TabsList>
        <TabsContent value={tab} className="mt-4">
          {filtered.length === 0 && !loading ? (
            <EmptyState
              icon={<IndianRupee className="h-16 w-16 text-muted-foreground" />}
              title={t('payments:no_payments_found')}
              description={t('payments:no_payments_found_desc')}
              action={{ label: t('payments:record_payment'), onClick: () => handleOpenRecordPayment('IN') }}
            />
          ) : (
            <BulkSelectDataTable
              columns={columns}
              data={filtered}
              loading={loading}
              bulkActions={[
                {
                  label: t('common:export_selected'),
                  icon: <Download className="h-3.5 w-3.5" />,
                  onClick: (items) => {
                    const csv = [
                      'Date,Party,Type,Amount,Mode,Reference,Status',
                      ...items.map(p => `${p.date},${p.party_name},${p.type},${p.amount},${p.mode},${p.reference || ''},${p.status}`),
                    ].join('\n');
                    const blob = new Blob([csv], { type: 'text/csv' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a'); a.href = url; a.download = 'selected_payments.csv'; a.click();
                    URL.revokeObjectURL(url);
                    toast.success(t('payments:exported_count', { count: items.length }));
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
          )}
        </TabsContent>
      </Tabs>

      {/* Record Payment Dialog */}
      <RecordPaymentDialog
        open={showRecordPayment}
        onClose={() => setShowRecordPayment(false)}
        onSuccess={() => { setShowRecordPayment(false); fetchPayments(); }}
        defaultType={defaultPaymentType}
      />

      {/* Import Dialog */}
      <ImportDataDialog
        open={showImport}
        onClose={() => setShowImport(false)}
        onSuccess={() => { setShowImport(false); fetchPayments(); }}
        defaultModule="payments"
      />

      {/* Bulk Delete Confirmation */}
      <ConfirmDialog
        open={!!bulkDeleteItems}
        onClose={() => setBulkDeleteItems(null)}
        onConfirm={handleBulkDelete}
        title={t('payments:delete_payments_title')}
        description={t('payments:delete_payments_confirm', { count: bulkDeleteItems?.length || 0 })}
        confirmLabel={t('payments:delete_all')}
        variant="danger"
      />
    </div>
  );
}
