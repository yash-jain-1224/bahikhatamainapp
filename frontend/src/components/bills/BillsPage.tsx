import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  Search, FileText, IndianRupee, Calendar,
  CheckCircle, Clock, XCircle, AlertTriangle, Plus,
  ArrowDownLeft, ArrowUpRight, Receipt,
} from 'lucide-react';
import {
  Button, Input, Badge, Card, CardContent,
  Tabs, TabsList, TabsTrigger,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Label, Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Textarea,
} from '@/components/ui';
import { EmptyState } from '@/components/shared/empty-state';
import { purchaseApi, salesApi, billingApi, ledgerApi } from '@/lib/api';
import { formatCurrency, formatDate } from '@/utils';
import toast from 'react-hot-toast';

interface Bill {
  id: string;
  type: 'PURCHASE' | 'SALE';
  bill_number: string;
  party_name: string;
  party_id: string;
  date: string;
  total_amount: number;
  paid_amount: number;
  balance_amount: number;
  payment_status: 'UNPAID' | 'PARTIAL' | 'PAID' | 'CREDIT' | 'OVERPAID';
}

interface PaymentEntry {
  id: string;
  amount: number;
  date: string;
  mode: string;
  reference?: string;
  notes?: string;
}

const statusConfig: Record<string, { label: string; icon: React.ElementType; variant: string; color: string }> = {
  PAID: { label: 'Paid', icon: CheckCircle, variant: 'default', color: 'text-emerald-500 bg-emerald-500/10' },
  PARTIAL: { label: 'Partially Paid', icon: Clock, variant: 'secondary', color: 'text-amber-500 bg-amber-500/10' },
  UNPAID: { label: 'Unpaid', icon: XCircle, variant: 'destructive', color: 'text-red-500 bg-red-500/10' },
  CREDIT: { label: 'Credit', icon: AlertTriangle, variant: 'outline', color: 'text-blue-500 bg-blue-500/10' },
  OVERPAID: { label: 'Overpaid', icon: AlertTriangle, variant: 'outline', color: 'text-purple-500 bg-purple-500/10' },
};

export default function BillsPage() {
  const { t: _t } = useTranslation(['common', 'payments']);
  const _navigate = useNavigate();
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'all' | 'purchases' | 'sales'>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [stats, setStats] = useState({ total: 0, paid: 0, partial: 0, unpaid: 0, totalReceivable: 0, totalPayable: 0 });
  // Set when the 200-row fetch did not cover every bill, so the truncation
  // (and the slice-based count stats) is disclosed instead of silent.
  const [truncation, setTruncation] = useState<{ loaded: number; total: number } | null>(null);

  // Payment dialog state
  const [showPayDialog, setShowPayDialog] = useState(false);
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);
  const [paymentHistory, setPaymentHistory] = useState<PaymentEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payMode, setPayMode] = useState('CASH');
  const [payRef, setPayRef] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchBills = useCallback(async () => {
    try {
      setLoading(true);
      // Fetch purchases, sales, and the ledger outstanding summary in parallel.
      // The outstanding summary gives the real Receivable/Payable totals —
      // summing the 200-row slice understated them whenever more bills exist.
      const [purchasesRes, salesRes, outstandingRes] = await Promise.allSettled([
        purchaseApi.list({ limit: 200, payment_status: statusFilter !== 'all' ? statusFilter : undefined }),
        salesApi.list({ limit: 200, payment_status: statusFilter !== 'all' ? statusFilter : undefined }),
        ledgerApi.outstanding(),
      ]);

      const purchaseBills: Bill[] = [];
      const saleBills: Bill[] = [];

      if (purchasesRes.status === 'fulfilled') {
        const items = purchasesRes.value?.data?.data || [];
        items.forEach((p: any) => {
          purchaseBills.push({
            id: p.id,
            type: 'PURCHASE',
            bill_number: p.purchase_number || p.bill_number || `PUR-${p.id.slice(0, 6)}`,
            party_name: p.party?.name || p.party_name || 'Unknown',
            party_id: p.party_id,
            date: p.purchase_date || p.created_at,
            total_amount: Number(p.total_amount || 0),
            paid_amount: Number(p.paid_amount || 0),
            balance_amount: Number(p.balance_amount || 0),
            payment_status: p.payment_status || 'UNPAID',
          });
        });
      }

      if (salesRes.status === 'fulfilled') {
        const items = salesRes.value?.data?.data || [];
        items.forEach((s: any) => {
          saleBills.push({
            id: s.id,
            type: 'SALE',
            bill_number: s.sale_number || s.invoice_number || `SAL-${s.id.slice(0, 6)}`,
            party_name: s.party?.name || s.party_name || 'Unknown',
            party_id: s.party_id,
            date: s.sale_date || s.created_at,
            total_amount: Number(s.total_amount || 0),
            paid_amount: Number(s.paid_amount || 0),
            balance_amount: Number(s.balance_amount || 0),
            payment_status: s.payment_status || 'UNPAID',
          });
        });
      }

      const allBills = [...purchaseBills, ...saleBills];
      allBills.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setBills(allBills);

      // Truncation disclosure: compare loaded rows against server totals
      const purchasesTotal = purchasesRes.status === 'fulfilled'
        ? Number(purchasesRes.value?.data?.meta?.total ?? purchaseBills.length)
        : purchaseBills.length;
      const salesTotal = salesRes.status === 'fulfilled'
        ? Number(salesRes.value?.data?.meta?.total ?? saleBills.length)
        : saleBills.length;
      const grandTotal = purchasesTotal + salesTotal;
      setTruncation(grandTotal > allBills.length ? { loaded: allBills.length, total: grandTotal } : null);

      // Count-type stats stay slice-based (disclosed via the banner above),
      // but Receivable/Payable come from the ledger outstanding summary —
      // real totals independent of the 200-row cap.
      const paid = allBills.filter(b => b.payment_status === 'PAID').length;
      const partial = allBills.filter(b => b.payment_status === 'PARTIAL').length;
      const unpaid = allBills.filter(b => b.payment_status === 'UNPAID').length;
      let totalReceivable = saleBills.reduce((s, b) => s + b.balance_amount, 0);
      let totalPayable = purchaseBills.reduce((s, b) => s + b.balance_amount, 0);
      if (outstandingRes.status === 'fulfilled') {
        const summary = outstandingRes.value?.data?.data;
        if (summary) {
          totalReceivable = Number(summary.totalReceivable ?? totalReceivable);
          totalPayable = Number(summary.totalPayable ?? totalPayable);
        }
      }
      setStats({ total: allBills.length, paid, partial, unpaid, totalReceivable, totalPayable });
    } catch {
      toast.error('Failed to load bills');
      setBills([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetchBills(); }, [fetchBills]);

  // Filter bills by tab & search
  const filteredBills = bills.filter(bill => {
    if (tab === 'purchases' && bill.type !== 'PURCHASE') return false;
    if (tab === 'sales' && bill.type !== 'SALE') return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      bill.bill_number.toLowerCase().includes(q) ||
      bill.party_name.toLowerCase().includes(q)
    );
  });

  // Open payment dialog for a bill
  const handleRecordPayment = async (bill: Bill) => {
    setSelectedBill(bill);
    setPayAmount(bill.balance_amount.toString());
    setPayMode('CASH');
    setPayRef('');
    setPayNotes('');
    setShowPayDialog(true);
    // Fetch payment history
    setLoadingHistory(true);
    try {
      const { data } = await billingApi.payments({
        referenceType: bill.type,
        referenceId: bill.id,
      });
      setPaymentHistory((data?.data || []).map((p: any) => ({
        id: p.id,
        amount: Number(p.amount),
        date: p.date || p.payment_date,
        mode: p.mode || p.payment_mode,
        reference: p.reference || p.transaction_ref,
        notes: p.notes,
      })));
    } catch {
      setPaymentHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Submit payment
  const handleSubmitPayment = async () => {
    if (!selectedBill) return;
    const amount = parseFloat(payAmount);
    if (!amount || amount <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    if (amount > selectedBill.balance_amount) {
      toast.error(`Amount cannot exceed balance of ${formatCurrency(selectedBill.balance_amount)}`);
      return;
    }
    try {
      setSubmitting(true);
      await billingApi.createPayment({
        referenceType: selectedBill.type,
        referenceId: selectedBill.id,
        payerPartyId: selectedBill.type === 'SALE' ? selectedBill.party_id : undefined,
        payeePartyId: selectedBill.type === 'PURCHASE' ? selectedBill.party_id : undefined,
        paymentMode: payMode,
        amount,
        transactionRef: payRef || undefined,
        notes: payNotes || undefined,
      });
      toast.success('Payment recorded successfully');
      setShowPayDialog(false);
      fetchBills();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to record payment');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const cfg = statusConfig[status] || statusConfig.UNPAID;
    const Icon = cfg.icon;
    return (
      <Badge variant={cfg.variant as any} className="gap-1 text-xs">
        <Icon className={`h-3 w-3`} />
        {cfg.label}
      </Badge>
    );
  };

  const getProgressWidth = (bill: Bill) => {
    if (bill.total_amount === 0) return 0;
    return Math.min(100, (bill.paid_amount / bill.total_amount) * 100);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Bills</h1>
          <p className="text-muted-foreground text-sm">Track payments across all purchases & sales</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="glass">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="text-lg font-bold">{stats.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="glass">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <CheckCircle className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Paid</p>
                <p className="text-lg font-bold">{stats.paid}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="glass">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <Clock className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Partial</p>
                <p className="text-lg font-bold">{stats.partial}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="glass">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-red-500/10 flex items-center justify-center">
                <XCircle className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Unpaid</p>
                <p className="text-lg font-bold">{stats.unpaid}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="glass col-span-2 lg:col-span-1">
          <CardContent className="p-4">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground flex items-center gap-1"><ArrowDownLeft className="h-3 w-3 text-emerald-500" />Receivable</span>
                <span className="font-semibold text-emerald-600">{formatCurrency(stats.totalReceivable)}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground flex items-center gap-1"><ArrowUpRight className="h-3 w-3 text-red-500" />Payable</span>
                <span className="font-semibold text-red-600">{formatCurrency(stats.totalPayable)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs + Filters */}
      <div className="flex flex-col gap-3">
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <TabsList>
              <TabsTrigger value="all">All Bills</TabsTrigger>
              <TabsTrigger value="purchases">Purchases</TabsTrigger>
              <TabsTrigger value="sales">Sales</TabsTrigger>
            </TabsList>
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search bill number or party..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </Tabs>
        <div className="flex gap-2 flex-wrap">
          {['all', 'UNPAID', 'PARTIAL', 'PAID'].map(s => (
            <Button
              key={s}
              variant={statusFilter === s ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatusFilter(s)}
            >
              {s === 'all' ? 'All' : statusConfig[s]?.label || s}
            </Button>
          ))}
        </div>
      </div>

      {/* Truncation disclosure */}
      {!loading && truncation && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-600">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>
            Showing the {truncation.loaded} most recent of {truncation.total} bills.
            The Total/Paid/Partial/Unpaid counts above reflect only the loaded bills;
            Receivable and Payable are full ledger totals.
          </span>
        </div>
      )}

      {/* Bills List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => (
            <Card key={i} className="glass animate-pulse">
              <CardContent className="p-4 h-24" />
            </Card>
          ))}
        </div>
      ) : filteredBills.length === 0 ? (
        <EmptyState
          icon={<Receipt className="h-16 w-16 text-muted-foreground" />}
          title="No bills found"
          description={search || statusFilter !== 'all'
            ? "Try adjusting your search or filters"
            : "Bills from your purchases and sales will appear here."}
        />
      ) : (
        <div className="space-y-3">
          {filteredBills.map((bill) => {
            const progress = getProgressWidth(bill);
            const progressColor = bill.payment_status === 'PAID' ? 'bg-emerald-500'
              : bill.payment_status === 'PARTIAL' ? 'bg-amber-500'
              : 'bg-red-500';

            return (
              <Card key={bill.id} className="glass hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    {/* Left: Bill info */}
                    <div className="flex items-start gap-3 flex-1">
                      <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${
                        bill.type === 'PURCHASE' ? 'bg-orange-500/10' : 'bg-blue-500/10'
                      }`}>
                        {bill.type === 'PURCHASE'
                          ? <ArrowUpRight className="h-5 w-5 text-orange-500" />
                          : <ArrowDownLeft className="h-5 w-5 text-blue-500" />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-sm truncate">{bill.bill_number}</p>
                          <Badge variant="outline" className="text-[10px]">
                            {bill.type === 'PURCHASE' ? 'Purchase' : 'Sale'}
                          </Badge>
                          {getStatusBadge(bill.payment_status)}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {bill.party_name}
                        </p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {formatDate(bill.date)}
                          </span>
                        </div>
                        {/* Payment progress bar */}
                        <div className="mt-2 space-y-1">
                          <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden max-w-[200px]">
                            <div
                              className={`h-full rounded-full transition-all ${progressColor}`}
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                          <p className="text-[10px] text-muted-foreground">
                            {formatCurrency(bill.paid_amount)} paid of {formatCurrency(bill.total_amount)}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Right: Amount + Action */}
                    <div className="flex items-center gap-4 shrink-0">
                      <div className="text-right">
                        <p className="text-lg font-bold">{formatCurrency(bill.total_amount)}</p>
                        {bill.balance_amount > 0 && (
                          <p className="text-xs text-red-500 font-medium">
                            Balance: {formatCurrency(bill.balance_amount)}
                          </p>
                        )}
                      </div>
                      {bill.payment_status !== 'PAID' && bill.balance_amount > 0 && (
                        <Button
                          size="sm"
                          className="gradient-primary text-white"
                          onClick={() => handleRecordPayment(bill)}
                        >
                          <Plus className="h-3.5 w-3.5 mr-1" />
                          Pay
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Record Payment Dialog ──────────────────────────── */}
      <Dialog open={showPayDialog} onOpenChange={setShowPayDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <IndianRupee className="h-5 w-5" />
              Record Payment
            </DialogTitle>
          </DialogHeader>

          {selectedBill && (
            <div className="space-y-4">
              {/* Bill summary */}
              <div className="rounded-lg bg-muted/50 p-3 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Bill</span>
                  <span className="font-medium">{selectedBill.bill_number}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Party</span>
                  <span>{selectedBill.party_name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Amount</span>
                  <span className="font-semibold">{formatCurrency(selectedBill.total_amount)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Already Paid</span>
                  <span className="text-emerald-600">{formatCurrency(selectedBill.paid_amount)}</span>
                </div>
                <div className="flex justify-between text-sm font-semibold border-t pt-1 mt-1">
                  <span>Outstanding</span>
                  <span className="text-red-600">{formatCurrency(selectedBill.balance_amount)}</span>
                </div>
              </div>

              {/* Payment history */}
              {paymentHistory.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Payment History</p>
                  <div className="max-h-32 overflow-y-auto space-y-1.5">
                    {paymentHistory.map((ph, idx) => (
                      <div key={ph.id || idx} className="flex justify-between items-center text-xs bg-muted/30 rounded px-2 py-1.5">
                        <div>
                          <span className="font-medium">{formatCurrency(ph.amount)}</span>
                          <span className="text-muted-foreground ml-2">{ph.mode}</span>
                          {ph.reference && <span className="text-muted-foreground ml-1">• {ph.reference}</span>}
                        </div>
                        <span className="text-muted-foreground">{formatDate(ph.date)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {loadingHistory && <p className="text-xs text-muted-foreground">Loading payment history...</p>}

              {/* New payment form */}
              <div className="space-y-3">
                <div>
                  <Label>Amount</Label>
                  <div className="relative">
                    <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="number"
                      placeholder="Enter amount"
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                      className="pl-9"
                      max={selectedBill.balance_amount}
                    />
                  </div>
                  <div className="flex gap-2 mt-1">
                    <button
                      type="button"
                      className="text-[10px] px-2 py-0.5 rounded bg-muted hover:bg-muted/70 text-muted-foreground"
                      onClick={() => setPayAmount(selectedBill.balance_amount.toString())}
                    >
                      Full ({formatCurrency(selectedBill.balance_amount)})
                    </button>
                    <button
                      type="button"
                      className="text-[10px] px-2 py-0.5 rounded bg-muted hover:bg-muted/70 text-muted-foreground"
                      onClick={() => setPayAmount((selectedBill.balance_amount / 2).toFixed(2))}
                    >
                      Half ({formatCurrency(selectedBill.balance_amount / 2)})
                    </button>
                  </div>
                </div>

                <div>
                  <Label>Payment Mode</Label>
                  <Select value={payMode} onValueChange={setPayMode}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CASH">Cash</SelectItem>
                      <SelectItem value="UPI">UPI</SelectItem>
                      <SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
                      <SelectItem value="CARD">Card</SelectItem>
                      <SelectItem value="CHEQUE">Cheque</SelectItem>
                      <SelectItem value="CREDIT">Credit</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Reference / Transaction ID (optional)</Label>
                  <Input
                    placeholder="e.g. UPI-123456"
                    value={payRef}
                    onChange={(e) => setPayRef(e.target.value)}
                  />
                </div>

                <div>
                  <Label>Notes (optional)</Label>
                  <Textarea
                    placeholder="e.g. Partial payment for June delivery"
                    value={payNotes}
                    onChange={(e) => setPayNotes(e.target.value)}
                    rows={2}
                  />
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPayDialog(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmitPayment} disabled={submitting} className="gradient-primary text-white">
              {submitting ? 'Recording...' : 'Record Payment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
