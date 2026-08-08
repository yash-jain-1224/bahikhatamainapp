import React, { useEffect, useState } from 'react';
import {
  Receipt, Search, Download, Eye, Building2,
  CheckCircle, Clock, AlertTriangle, FileText, IndianRupee,
} from 'lucide-react';
import {
  Card, CardContent,
  Button, Input,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui';
import { DataTable } from '@/components/shared/data-table';
import { Pagination } from '@/components/shared/pagination';
import { StatCard } from '@/components/shared/stat-card';
import { SectionLoader } from '@/components/shared/loading';
import { ExportButton } from '@/components/shared/ExportButton';
import { adminApi } from '@/lib/api';
import { formatDate, formatCurrency } from '@/utils';
import { downloadInvoicePdf, previewInvoicePdf, type InvoiceData } from '@/utils/generateInvoicePdf';
import toast from 'react-hot-toast';

// ─── Types ───────────────────────────────────────────
interface InvoiceRecord {
  id: string;
  invoice_number: string;
  amount: number | string;
  tax_amount: number | string;
  total_amount: number | string;
  status: string;
  paid_at?: string;
  due_date: string;
  created_at: string;
  business?: {
    id: string;
    name: string;
    phone?: string;
    email?: string;
    gst_number?: string;
    address?: string;
    city?: string;
    state?: string;
    pincode?: string;
  };
  subscription?: {
    id: string;
    billing_cycle: string;
    current_period_start?: string;
    current_period_end?: string;
    plan?: { id: string; name: string };
  };
}

// NOTE: a hard-coded `defaultInvoices` fixture used to be substituted whenever
// the API failed or even returned an empty list — an admin could not tell a
// broken backend from a healthy one. Errors now render an explicit error state
// and an empty response renders the table's real empty state.

// ─── Helpers ─────────────────────────────────────────
function toNum(v: number | string): number {
  return typeof v === 'string' ? parseFloat(v) : v;
}

function invoiceToData(inv: InvoiceRecord): InvoiceData {
  return {
    invoiceNumber: inv.invoice_number,
    invoiceDate: inv.created_at,
    dueDate: inv.due_date,
    status: inv.status,
    businessName: inv.business?.name || 'Unknown Business',
    businessAddress: inv.business?.address,
    businessCity: inv.business?.city,
    businessState: inv.business?.state,
    businessPincode: inv.business?.pincode,
    businessGst: inv.business?.gst_number,
    businessPhone: inv.business?.phone,
    businessEmail: inv.business?.email,
    planName: inv.subscription?.plan?.name || 'N/A',
    billingCycle: inv.subscription?.billing_cycle || 'YEARLY',
    periodStart: inv.subscription?.current_period_start || inv.created_at,
    periodEnd: inv.subscription?.current_period_end || inv.due_date,
    amount: toNum(inv.amount),
    taxAmount: toNum(inv.tax_amount),
    totalAmount: toNum(inv.total_amount),
    paidAt: inv.paid_at,
  };
}

// ─── Component ───────────────────────────────────────
export default function AdminInvoicesPage() {
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [meta, setMeta] = useState<{ page: number; limit: number; total: number; totalPages: number; hasNext: boolean; hasPrev: boolean } | null>(null);
  const [page, setPage] = useState(1);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceRecord | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  // Server-driven list: page + search + status go to the API (the server
  // defaults to 20 rows — filtering only the loaded slice made real records
  // unfindable). Search is debounced.
  useEffect(() => {
    const timer = setTimeout(() => fetchInvoices(), search ? 300 : 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, statusFilter]);

  useEffect(() => { setPage(1); }, [search, statusFilter]);

  const fetchInvoices = async () => {
    try {
      setLoading(true);
      setLoadError(false);
      const res = await adminApi.invoices({
        page,
        limit: 20,
        ...(search ? { search } : {}),
        ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
      });
      setInvoices(res.data?.data || []);
      setMeta(res.data?.meta || null);
    } catch {
      setInvoices([]);
      setMeta(null);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = (inv: InvoiceRecord) => {
    try {
      downloadInvoicePdf(invoiceToData(inv));
      toast.success(`Downloaded ${inv.invoice_number}.pdf`);
    } catch (err) {
      console.error('PDF generation error:', err);
      toast.error('Failed to generate PDF');
    }
  };

  const handlePreview = (inv: InvoiceRecord) => {
    try {
      previewInvoicePdf(invoiceToData(inv));
    } catch (err) {
      console.error('PDF preview error:', err);
      toast.error('Failed to preview PDF');
    }
  };

  const filtered = invoices.filter((inv) => {
    const matchSearch = !search ||
      inv.invoice_number.toLowerCase().includes(search.toLowerCase()) ||
      inv.business?.name?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || inv.status === statusFilter;
    return matchSearch && matchStatus;
  });

  // Stats
  const totalPaid = invoices.filter(i => i.status === 'PAID').reduce((s, i) => s + toNum(i.total_amount), 0);
  const totalPending = invoices.filter(i => i.status === 'PENDING').reduce((s, i) => s + toNum(i.total_amount), 0);
  const paidCount = invoices.filter(i => i.status === 'PAID').length;
  const pendingCount = invoices.filter(i => i.status === 'PENDING').length;

  const statusColors: Record<string, string> = {
    PAID: 'bg-emerald-500/10 text-emerald-500',
    PENDING: 'bg-amber-500/10 text-amber-400',
    FAILED: 'bg-red-500/10 text-red-400',
    REFUNDED: 'bg-blue-500/10 text-blue-400',
    CANCELLED: 'bg-gray-500/10 text-gray-400',
  };

  const statusIcons: Record<string, React.ReactNode> = {
    PAID: <CheckCircle className="h-3.5 w-3.5" />,
    PENDING: <Clock className="h-3.5 w-3.5" />,
    FAILED: <AlertTriangle className="h-3.5 w-3.5" />,
  };

  const columns = [
    {
      key: 'invoice_number', header: 'Invoice',
      render: (inv: InvoiceRecord) => (
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-blue-400" />
          <span className="font-mono text-sm font-medium">{inv.invoice_number}</span>
        </div>
      ),
    },
    {
      key: 'business', header: 'Business',
      render: (inv: InvoiceRecord) => (
        <div className="flex items-center gap-2">
          <Building2 className="h-3.5 w-3.5 text-purple-400" />
          <span className="text-sm">{inv.business?.name || '—'}</span>
        </div>
      ),
    },
    {
      key: 'plan', header: 'Plan',
      render: (inv: InvoiceRecord) => (
        <span className="text-sm font-medium">{inv.subscription?.plan?.name || '—'}</span>
      ),
    },
    {
      key: 'total_amount', header: 'Amount',
      render: (inv: InvoiceRecord) => (
        <span className="font-semibold text-emerald-400">{formatCurrency(toNum(inv.total_amount))}</span>
      ),
    },
    {
      key: 'status', header: 'Status',
      render: (inv: InvoiceRecord) => (
        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${statusColors[inv.status] || ''}`}>
          {statusIcons[inv.status]}
          {inv.status}
        </span>
      ),
    },
    {
      key: 'created_at', header: 'Date',
      render: (inv: InvoiceRecord) => (
        <span className="text-sm text-muted-foreground">{formatDate(inv.created_at)}</span>
      ),
    },
    {
      key: 'due_date', header: 'Due',
      render: (inv: InvoiceRecord) => {
        const overdue = inv.status === 'PENDING' && new Date(inv.due_date) < new Date();
        return (
          <span className={`text-sm ${overdue ? 'text-red-400 font-medium' : 'text-muted-foreground'}`}>
            {formatDate(inv.due_date)}
            {overdue && ' ⚠'}
          </span>
        );
      },
    },
    {
      key: 'actions', header: '',
      render: (inv: InvoiceRecord) => (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title="View Details"
            onClick={() => { setSelectedInvoice(inv); setShowDetail(true); }}
          >
            <Eye className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-purple-400 hover:text-purple-300"
            title="View PDF"
            onClick={() => handlePreview(inv)}
          >
            <FileText className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-blue-400 hover:text-blue-300"
            title="Download PDF"
            onClick={() => handleDownload(inv)}
          >
            <Download className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  if (loading) return <SectionLoader />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Receipt className="h-7 w-7 text-blue-500" />
          <div>
            <h2 className="text-2xl font-bold">Invoices</h2>
            <p className="text-muted-foreground">View, manage, and download all subscription invoices</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Invoices" value={(meta?.total ?? invoices.length).toString()} icon={FileText} iconColor="text-blue-400" />
        <StatCard title="Paid" value={`${paidCount} (${formatCurrency(totalPaid)})`} icon={CheckCircle} iconColor="text-emerald-400" />
        <StatCard title="Pending" value={`${pendingCount} (${formatCurrency(totalPending)})`} icon={Clock} iconColor="text-amber-400" />
        <StatCard title="Revenue Collected" value={formatCurrency(totalPaid)} icon={IndianRupee} iconColor="text-green-400" />
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Input
              icon={<Search className="h-4 w-4" />}
              placeholder="Search by invoice # or business name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-80"
            />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="PAID">Paid</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="FAILED">Failed</SelectItem>
                <SelectItem value="REFUNDED">Refunded</SelectItem>
                <SelectItem value="CANCELLED">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <div className="ml-auto">
              <ExportButton
                data={filtered.map(i => ({
                  invoice_number: i.invoice_number,
                  business: i.business?.name,
                  plan: i.subscription?.plan?.name,
                  amount: toNum(i.amount),
                  tax: toNum(i.tax_amount),
                  total: toNum(i.total_amount),
                  status: i.status,
                  date: i.created_at,
                  due_date: i.due_date,
                  paid_at: i.paid_at || '',
                }))}
                columns={['invoice_number', 'business', 'plan', 'amount', 'tax', 'total', 'status', 'date', 'due_date', 'paid_at']}
                filename="admin_invoices"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Load error — distinct from a genuinely empty list */}
      {loadError && (
        <Card className="border-red-500/30">
          <CardContent className="p-4 flex items-center justify-between">
            <p className="text-sm text-red-400">Couldn't load invoices — the data shown may be incomplete.</p>
            <Button variant="outline" size="sm" onClick={fetchInvoices}>Retry</Button>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <DataTable
        columns={columns}
        data={filtered}
        onRowClick={(inv) => { setSelectedInvoice(inv); setShowDetail(true); }}
        emptyMessage="No invoices found"
      />
      {meta && <Pagination meta={meta} onPageChange={setPage} />}

      {/* ─── Invoice Detail Dialog ─── */}
      <Dialog open={showDetail} onOpenChange={(v) => { if (!v) setShowDetail(false); }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          {selectedInvoice && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-blue-400" />
                  Invoice {selectedInvoice.invoice_number}
                </DialogTitle>
                <DialogDescription>
                  {selectedInvoice.business?.name} — {selectedInvoice.subscription?.plan?.name} Plan
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 mt-2">
                {/* Status badge */}
                <div className="flex items-center justify-between">
                  <span className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold ${statusColors[selectedInvoice.status]}`}>
                    {statusIcons[selectedInvoice.status]}
                    {selectedInvoice.status}
                  </span>
                  <span className="text-lg font-bold text-emerald-400">
                    {formatCurrency(toNum(selectedInvoice.total_amount))}
                  </span>
                </div>

                {/* Business info */}
                <Card className="bg-muted/30">
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground mb-1">BILLED TO</p>
                    <p className="font-semibold">{selectedInvoice.business?.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {[selectedInvoice.business?.city, selectedInvoice.business?.state].filter(Boolean).join(', ') || '—'}
                    </p>
                    {selectedInvoice.business?.gst_number && (
                      <p className="text-xs font-mono text-muted-foreground mt-1">GSTIN: {selectedInvoice.business.gst_number}</p>
                    )}
                  </CardContent>
                </Card>

                {/* Amounts */}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs">Subtotal</p>
                    <p className="font-medium">{formatCurrency(toNum(selectedInvoice.amount))}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Tax (GST 18%)</p>
                    <p className="font-medium">{formatCurrency(toNum(selectedInvoice.tax_amount))}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Total</p>
                    <p className="font-bold text-lg">{formatCurrency(toNum(selectedInvoice.total_amount))}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Billing Cycle</p>
                    <p className="font-medium">{selectedInvoice.subscription?.billing_cycle?.replace(/_/g, ' ') || '—'}</p>
                  </div>
                </div>

                {/* Dates */}
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs">Invoice Date</p>
                    <p>{formatDate(selectedInvoice.created_at)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Due Date</p>
                    <p>{formatDate(selectedInvoice.due_date)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Paid On</p>
                    <p>{selectedInvoice.paid_at ? formatDate(selectedInvoice.paid_at) : '—'}</p>
                  </div>
                </div>

                {/* Period */}
                {selectedInvoice.subscription?.current_period_start && (
                  <div className="text-sm">
                    <p className="text-muted-foreground text-xs">Subscription Period</p>
                    <p className="font-medium">
                      {formatDate(selectedInvoice.subscription.current_period_start)} → {formatDate(selectedInvoice.subscription.current_period_end || '')}
                    </p>
                  </div>
                )}
              </div>

              <DialogFooter className="gap-2 mt-4">
                <Button variant="outline" onClick={() => setShowDetail(false)}>
                  Close
                </Button>
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => handlePreview(selectedInvoice)}
                >
                  <Eye className="h-4 w-4" />
                  View PDF
                </Button>
                <Button
                  className="gap-2"
                  onClick={() => handleDownload(selectedInvoice)}
                >
                  <Download className="h-4 w-4" />
                  Download PDF
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
