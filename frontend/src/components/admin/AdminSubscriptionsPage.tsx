import React, { useEffect, useState } from 'react';
import {
  CreditCard, IndianRupee, Receipt, Building2,
  CheckCircle, Search, Banknote, Download,
} from 'lucide-react';
import {
  Card, CardContent,
  Button, Input, Label,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui';
import { DataTable } from '@/components/shared/data-table';
import { StatCard } from '@/components/shared/stat-card';
import { SectionLoader } from '@/components/shared/loading';
import { ExportButton } from '@/components/shared/ExportButton';
import { adminApi } from '@/lib/api';
import { formatDate, formatCurrency } from '@/utils';
import toast from 'react-hot-toast';
import { downloadInvoicePdf, type InvoiceData } from '@/utils/generateInvoicePdf';

// ─── Types ───────────────────────────────────────────
interface PlanOption {
  id: string;
  name: string;
  price_monthly: number;
  price_quarterly?: number;
  price_half_yearly?: number;
  price_yearly: number;
}

interface BusinessOption {
  id: string;
  name: string;
  owner_name?: string;
  owner_phone?: string;
}

interface SubscriptionRecord {
  id: string;
  business_name: string;
  plan_name: string;
  billing_cycle: string;
  status: string;
  // Nullable on purpose: amount and payment mode come from the subscription's
  // latest invoice, and a TRIAL or manually-created subscription may not have
  // one yet. Rendering "—" is honest; defaulting to 0/CASH would be inventing
  // a payment that never happened.
  payment_mode: string | null;
  amount: number | null;
  start_date: string;
  end_date: string;
  created_at: string;
  invoice_number?: string;
}

// ─── Constants ───────────────────────────────────────
const billingCycles = [
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'QUARTERLY', label: 'Quarterly (3 months)' },
  { value: 'HALF_YEARLY', label: 'Half Yearly (6 months)' },
  { value: 'YEARLY', label: 'Yearly' },
];

const paymentModes = [
  { value: 'CASH', label: '💵 Cash' },
  { value: 'UPI', label: '📱 UPI' },
  { value: 'BANK_TRANSFER', label: '🏦 Bank Transfer / NEFT / RTGS' },
  { value: 'CHEQUE', label: '📝 Cheque' },
  { value: 'CARD', label: '💳 Card (POS)' },
  { value: 'OTHER', label: '📋 Other' },
];

// The four hardcoded "Sharma Trading Co." / "Gupta Mandi Commission" rows that
// used to live here are deleted, not just unreferenced: they were rendered as
// real subscriptions on every load, and an admin could search, filter and
// export them. The table now shows the real list or an empty state.

// ─── Empty form ──────────────────────────────────────
const emptySubForm = {
  businessId: '',
  planId: '',
  billingCycle: 'YEARLY' as const,
  paymentMode: 'CASH',
  paymentRef: '',
  amount: 0,
  notes: '',
};

// ─── Component ───────────────────────────────────────
export default function AdminSubscriptionsPage() {
  const [loading, setLoading] = useState(true);
  const [subscriptions, setSubscriptions] = useState<SubscriptionRecord[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Manual subscription dialog
  const [showPurchase, setShowPurchase] = useState(false);
  const [subForm, setSubForm] = useState(emptySubForm);
  const [subLoading, setSubLoading] = useState(false);
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [businesses, setBusinesses] = useState<BusinessOption[]>([]);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      // Read the real list. This used to pull `recentSubscriptions` off the
      // analytics response — a key that endpoint never returns — so the
      // `|| defaultSubs` fallback fired on every successful load and the table
      // permanently showed four invented subscriptions. The invented analytics
      // numbers (620 active, ₹287,085 revenue) did the same for the stat cards.
      const [subsRes, analyticsRes] = await Promise.all([
        adminApi.subscriptions({ limit: 100 }).catch(() => null),
        adminApi.subscriptionAnalytics().catch(() => null),
      ]);

      if (subsRes?.data?.data) {
        setSubscriptions(subsRes.data.data);
      } else {
        // Render the empty state rather than fiction.
        setSubscriptions([]);
        toast.error('Could not load subscriptions');
      }

      setAnalytics(analyticsRes?.data?.data ?? null);
    } catch {
      setSubscriptions([]);
      setAnalytics(null);
      toast.error('Could not load subscriptions');
    } finally {
      setLoading(false);
    }
  };

  const fetchFormData = async () => {
    try {
      const [plansRes, bizRes] = await Promise.all([
        adminApi.plans(),
        adminApi.businesses({ limit: 1000 }),
      ]);
      setPlans(plansRes.data?.data || []);
      setBusinesses((bizRes.data?.data || []).map((b: any) => ({
        id: b.id,
        name: b.name,
        owner_name: b.owner_name,
        owner_phone: b.owner_phone,
      })));
    } catch {
      // Use mock plans if API fails
      setPlans([
        { id: '1', name: 'Free', price_monthly: 0, price_yearly: 0 },
        { id: '2', name: 'Pro', price_monthly: 499, price_yearly: 4999 },
        { id: '3', name: 'Enterprise', price_monthly: 1499, price_yearly: 14999 },
      ]);
    }
  };

  const handleOpenPurchase = () => {
    setShowPurchase(true);
    fetchFormData();
  };

  // Auto-calculate amount when plan or billing cycle changes
  const getCalculatedAmount = (planId: string, cycle: string): number => {
    const plan = plans.find((p) => p.id === planId);
    if (!plan) return 0;
    switch (cycle) {
      case 'MONTHLY': return plan.price_monthly;
      // Use the plan's configured (usually discounted) cycle prices; the
      // monthly multiple is only a fallback when no price is configured.
      case 'QUARTERLY': return plan.price_quarterly || plan.price_monthly * 3;
      case 'HALF_YEARLY': return plan.price_half_yearly || plan.price_monthly * 6;
      case 'YEARLY': return plan.price_yearly || plan.price_monthly * 12;
      default: return 0;
    }
  };

  const handlePlanOrCycleChange = (field: 'planId' | 'billingCycle', value: string) => {
    const updated = { ...subForm, [field]: value };
    const newAmount = getCalculatedAmount(
      field === 'planId' ? value : subForm.planId,
      field === 'billingCycle' ? value : subForm.billingCycle,
    );
    setSubForm({ ...updated, amount: newAmount });
  };

  const handleCreateSubscription = async () => {
    if (!subForm.businessId) { toast.error('Please select a business'); return; }
    if (!subForm.planId) { toast.error('Please select a plan'); return; }
    if (!subForm.paymentMode) { toast.error('Please select payment mode'); return; }
    if (subForm.amount <= 0) { toast.error('Amount must be greater than 0'); return; }

    try {
      setSubLoading(true);
      await adminApi.createManualSubscription({
        businessId: subForm.businessId,
        planId: subForm.planId,
        billingCycle: subForm.billingCycle as any,
        paymentMode: subForm.paymentMode,
        paymentRef: subForm.paymentRef || undefined,
        amount: subForm.amount,
        notes: subForm.notes || undefined,
      });
      toast.success('Subscription purchased successfully! Invoice generated.');
      setShowPurchase(false);
      setSubForm(emptySubForm);
      fetchData();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to create subscription');
    } finally {
      setSubLoading(false);
    }
  };

  const handleDownloadInvoice = (s: SubscriptionRecord) => {
    // Without an invoice there is no amount to bill. Generating a PDF from a
    // null amount produced a "₹NaN" invoice; refuse instead.
    if (s.amount == null) {
      toast.error('No invoice has been raised for this subscription yet');
      return;
    }
    try {
      const invData: InvoiceData = {
        invoiceNumber: s.invoice_number || `INV-${s.id}`,
        invoiceDate: s.created_at,
        dueDate: s.start_date,
        status: s.status === 'ACTIVE' ? 'PAID' : s.status,
        businessName: s.business_name,
        planName: s.plan_name,
        billingCycle: s.billing_cycle,
        periodStart: s.start_date,
        periodEnd: s.end_date,
        amount: s.amount,
        taxAmount: s.amount * 0.18,
        totalAmount: s.amount * 1.18,
        paymentMode: s.payment_mode ?? undefined,
        paidAt: s.status === 'ACTIVE' ? s.created_at : undefined,
      };
      downloadInvoicePdf(invData);
      toast.success(`Downloaded ${invData.invoiceNumber}.pdf`);
    } catch {
      toast.error('Failed to generate PDF');
    }
  };

  const filteredSubs = subscriptions.filter((s) => {
    const matchSearch = !search ||
      s.business_name?.toLowerCase().includes(search.toLowerCase()) ||
      s.invoice_number?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || s.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const statusColors: Record<string, string> = {
    ACTIVE: 'bg-emerald-500/10 text-emerald-500',
    TRIAL: 'bg-blue-500/10 text-blue-500',
    EXPIRED: 'bg-gray-500/10 text-gray-400',
    CANCELLED: 'bg-red-500/10 text-red-400',
    PAST_DUE: 'bg-amber-500/10 text-amber-400',
    SUSPENDED: 'bg-red-500/10 text-red-500',
  };

  const paymentModeLabels: Record<string, string> = {
    CASH: '💵 Cash',
    UPI: '📱 UPI',
    BANK_TRANSFER: '🏦 Bank Transfer',
    CHEQUE: '📝 Cheque',
    CARD: '💳 Card',
    OTHER: '📋 Other',
    ONLINE: '🌐 Online',
  };

  const columns = [
    {
      key: 'business_name', header: 'Business',
      render: (s: SubscriptionRecord) => (
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-purple-400" />
          <span className="font-medium">{s.business_name}</span>
        </div>
      ),
    },
    {
      key: 'plan_name', header: 'Plan',
      render: (s: SubscriptionRecord) => {
        const colors: Record<string, string> = { Free: 'text-gray-400', Pro: 'text-blue-400', Enterprise: 'text-purple-400' };
        return <span className={`font-medium ${colors[s.plan_name] || ''}`}>{s.plan_name}</span>;
      },
    },
    {
      key: 'billing_cycle', header: 'Cycle',
      render: (s: SubscriptionRecord) => (
        <span className="text-xs text-muted-foreground">{s.billing_cycle.replace('_', ' ')}</span>
      ),
    },
    {
      key: 'amount', header: 'Amount',
      render: (s: SubscriptionRecord) => (
        <span className="font-semibold text-emerald-400">
          {s.amount != null ? formatCurrency(s.amount) : <span className="text-muted-foreground">—</span>}
        </span>
      ),
    },
    {
      key: 'payment_mode', header: 'Payment',
      render: (s: SubscriptionRecord) => (
        <span className="text-sm">
          {s.payment_mode
            ? (paymentModeLabels[s.payment_mode] || s.payment_mode)
            : <span className="text-muted-foreground">—</span>}
        </span>
      ),
    },
    {
      key: 'status', header: 'Status',
      render: (s: SubscriptionRecord) => (
        <span className={`px-2 py-1 rounded text-xs font-medium ${statusColors[s.status] || ''}`}>
          {s.status}
        </span>
      ),
    },
    {
      key: 'end_date', header: 'Expires',
      render: (s: SubscriptionRecord) => {
        const isExpired = new Date(s.end_date) < new Date();
        return (
          <span className={`text-sm ${isExpired ? 'text-red-400' : 'text-muted-foreground'}`}>
            {formatDate(s.end_date)}
          </span>
        );
      },
    },
    {
      key: 'invoice_number', header: 'Invoice',
      render: (s: SubscriptionRecord) => (
        <div className="flex items-center gap-1">
          <span className="font-mono text-xs text-muted-foreground">{s.invoice_number || '—'}</span>
          {s.invoice_number && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-blue-400 hover:text-blue-300"
              title="Download Invoice PDF"
              onClick={(e) => {
                e.stopPropagation();
                handleDownloadInvoice(s);
              }}
            >
              <Download className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  if (loading) return <SectionLoader />;

  const selectedPlan = plans.find((p) => p.id === subForm.planId);
  const selectedBiz = businesses.find((b) => b.id === subForm.businessId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CreditCard className="h-7 w-7 text-emerald-500" />
          <div>
            <h2 className="text-2xl font-bold">Subscription Management</h2>
            <p className="text-muted-foreground">Manage subscriptions & process manual (cash) payments</p>
          </div>
        </div>
        <Button onClick={handleOpenPurchase} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
          <Banknote className="h-4 w-4" />
          Manual Subscription Purchase
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Active Subscriptions"
          value={analytics?.totalActive?.toLocaleString() || '0'}
          icon={CheckCircle}
          iconColor="text-emerald-400"
        />
        <StatCard
          title="Total Revenue"
          value={formatCurrency(analytics?.totalRevenue || 0)}
          icon={IndianRupee}
          iconColor="text-amber-400"
        />
        <StatCard
          title="Monthly Recurring Revenue"
          value={formatCurrency(analytics?.mrr || 0)}
          icon={Receipt}
          iconColor="text-blue-400"
        />
        <StatCard
          title="Cash Payments"
          value={analytics?.cashPayments?.toLocaleString() || '0'}
          icon={Banknote}
          iconColor="text-green-400"
        />
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Input
              icon={<Search className="h-4 w-4" />}
              placeholder="Search by business or invoice..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-72"
            />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="TRIAL">Trial</SelectItem>
                <SelectItem value="EXPIRED">Expired</SelectItem>
                <SelectItem value="CANCELLED">Cancelled</SelectItem>
                <SelectItem value="PAST_DUE">Past Due</SelectItem>
              </SelectContent>
            </Select>
            <div className="ml-auto">
              <ExportButton
                data={filteredSubs}
                columns={['business_name', 'plan_name', 'billing_cycle', 'amount', 'payment_mode', 'status', 'start_date', 'end_date', 'invoice_number']}
                filename="admin_subscriptions"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Subscription Table */}
      <DataTable
        columns={columns}
        data={filteredSubs}
        emptyMessage="No subscriptions found"
      />

      {/* ─── Manual Purchase Dialog ─── */}
      <Dialog open={showPurchase} onOpenChange={(v) => { if (!v) { setShowPurchase(false); setSubForm(emptySubForm); } }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Banknote className="h-5 w-5 text-emerald-500" />
              Manual Subscription Purchase
            </DialogTitle>
            <DialogDescription>
              Record a cash / offline subscription payment. This will activate the subscription and generate an invoice automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Business Selection */}
            <div className="space-y-2">
              <Label>Business <span className="text-red-400">*</span></Label>
              <Select value={subForm.businessId} onValueChange={(v) => setSubForm({ ...subForm, businessId: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select business..." />
                </SelectTrigger>
                <SelectContent>
                  {businesses.length === 0 ? (
                    <SelectItem value="__none" disabled>No businesses found</SelectItem>
                  ) : (
                    businesses.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name} {b.owner_name ? `(${b.owner_name})` : ''}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Plan Selection */}
            <div className="space-y-2">
              <Label>Subscription Plan <span className="text-red-400">*</span></Label>
              <Select value={subForm.planId} onValueChange={(v) => handlePlanOrCycleChange('planId', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select plan..." />
                </SelectTrigger>
                <SelectContent>
                  {plans.filter(p => p.price_monthly > 0).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} — ₹{p.price_monthly}/mo · ₹{p.price_yearly}/yr
                    </SelectItem>
                  ))}
                  {plans.filter(p => p.price_monthly > 0).length === 0 && (
                    <SelectItem value="__none" disabled>No paid plans found</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Billing Cycle */}
            <div className="space-y-2">
              <Label>Billing Cycle <span className="text-red-400">*</span></Label>
              <Select value={subForm.billingCycle} onValueChange={(v) => handlePlanOrCycleChange('billingCycle', v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {billingCycles.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Payment Mode */}
            <div className="space-y-2">
              <Label>Payment Mode <span className="text-red-400">*</span></Label>
              <Select value={subForm.paymentMode} onValueChange={(v) => setSubForm({ ...subForm, paymentMode: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {paymentModes.map((pm) => (
                    <SelectItem key={pm.value} value={pm.value}>{pm.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Payment Reference */}
            <div className="space-y-2">
              <Label>Payment Reference / Transaction ID</Label>
              <Input
                placeholder="e.g. UPI Ref, Cheque No., Receipt No."
                value={subForm.paymentRef}
                onChange={(e) => setSubForm({ ...subForm, paymentRef: e.target.value })}
              />
            </div>

            {/* Amount */}
            <div className="space-y-2">
              <Label>Amount (₹) <span className="text-red-400">*</span></Label>
              <Input
                type="number"
                min={0}
                placeholder="0"
                value={subForm.amount || ''}
                onChange={(e) => setSubForm({ ...subForm, amount: Number(e.target.value) })}
              />
              {subForm.amount > 0 && (
                <p className="text-xs text-muted-foreground">
                  +18% GST = Total: <strong className="text-foreground">₹{(subForm.amount * 1.18).toFixed(2)}</strong>
                </p>
              )}
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>Admin Notes (optional)</Label>
              <Input
                placeholder="Internal notes, reason for manual purchase, etc."
                value={subForm.notes}
                onChange={(e) => setSubForm({ ...subForm, notes: e.target.value })}
              />
            </div>

            {/* Summary Card */}
            {subForm.businessId && subForm.planId && subForm.amount > 0 && (
              <Card className="border-emerald-500/30 bg-emerald-500/5">
                <CardContent className="p-4 space-y-2">
                  <h4 className="text-sm font-semibold text-emerald-400 flex items-center gap-2">
                    <CheckCircle className="h-4 w-4" />
                    Purchase Summary
                  </h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Business:</span>
                      <span className="ml-1 font-medium">{selectedBiz?.name || '—'}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Plan:</span>
                      <span className="ml-1 font-medium">{selectedPlan?.name || '—'}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Cycle:</span>
                      <span className="ml-1">{billingCycles.find(c => c.value === subForm.billingCycle)?.label}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Payment:</span>
                      <span className="ml-1">{paymentModes.find(pm => pm.value === subForm.paymentMode)?.label}</span>
                    </div>
                    <div className="col-span-2 pt-1 border-t border-emerald-500/20">
                      <span className="text-muted-foreground">Subtotal:</span>
                      <span className="ml-1 font-medium">{formatCurrency(subForm.amount)}</span>
                      <span className="mx-1 text-muted-foreground">+</span>
                      <span className="text-muted-foreground">GST (18%):</span>
                      <span className="ml-1 font-medium">{formatCurrency(subForm.amount * 0.18)}</span>
                      <span className="mx-1 text-muted-foreground">=</span>
                      <span className="font-bold text-emerald-400 text-base">{formatCurrency(subForm.amount * 1.18)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setShowPurchase(false); setSubForm(emptySubForm); }}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateSubscription}
              disabled={subLoading}
              className="gap-2 bg-emerald-600 hover:bg-emerald-700"
            >
              {subLoading ? (
                <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <CheckCircle className="h-4 w-4" />
              )}
              {subLoading ? 'Processing...' : 'Confirm Purchase & Generate Invoice'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
