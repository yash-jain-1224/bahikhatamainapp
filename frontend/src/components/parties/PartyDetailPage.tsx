import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Phone, Mail, MapPin, Building2, Pencil,
  IndianRupee, ShoppingCart, TrendingUp, CreditCard, ArrowDownLeft,
  FileText, ChevronRight, BarChart3,
  CheckCircle2, Clock, AlertCircle, RefreshCw,
  User, Wallet, ExternalLink, Bell,
  Shield, CalendarClock, Banknote, TrendingDown,
  SlidersHorizontal,
} from 'lucide-react';
import {
  Button, Card, CardContent, CardHeader, CardTitle,
  Tabs, TabsList, TabsTrigger, TabsContent,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Input,
} from '@/components/ui';
import { SectionLoader } from '@/components/shared/loading';
import { EmptyState } from '@/components/shared/empty-state';
import { EditPartyDialog } from '@/components/shared/EditPartyDialog';
import { RecordPaymentDialog } from '@/components/shared/RecordPaymentDialog';
import { ExportButton } from '@/components/shared/ExportButton';
import { profileApi, purchaseApi, salesApi, notificationApi } from '@/lib/api';
import { formatCurrency, formatDate } from '@/utils';
import type { Party, Purchase, Sale, BillEntry } from '@/types';
import toast from 'react-hot-toast';

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation('common');
  const meta: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
    PAID:    { label: t('status_paid'),    cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30', icon: <CheckCircle2 className="h-3 w-3" /> },
    PARTIAL: { label: t('status_partial'), cls: 'bg-amber-500/10  text-amber-400  border-amber-500/30',   icon: <Clock        className="h-3 w-3" /> },
    UNPAID:  { label: t('status_unpaid'),  cls: 'bg-red-500/10    text-red-400    border-red-500/30',     icon: <AlertCircle  className="h-3 w-3" /> },
    CREDIT:  { label: 'Credit',  cls: 'bg-blue-500/10   text-blue-400   border-blue-500/30',    icon: <CreditCard   className="h-3 w-3" /> },
  };
  const m = meta[status] ?? { label: status, cls: 'bg-muted text-muted-foreground border-border', icon: null };
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${m.cls}`}>
      {m.icon}{m.label}
    </span>
  );
}

// ─── Bill ledger builder ──────────────────────────────────────────────────────

/**
 * Compute the party-facing amount for a transaction.
 * This is what the party actually owes or is owed — excludes expenses, cutter costs,
 * and labor charges which are paid to other entities.
 * 
 * Formula: Party Amount = Subtotal + GST - Discount + Round-Off
 * 
 * NOT included: direct_expense, indirect_expense, cutter_cost (these are paid to
 * separate vendors/cutters and have their own ledgers).
 */
function getPartyAmount(tx: Purchase | Sale): number {
  const raw = tx as any;
  const subtotal = Number(raw.subtotal || 0);
  const gst = Number(raw.gst_amount || 0);
  const discount = Number(raw.discount || 0);
  const roundOff = Number(raw.round_off || 0);
  const directExp = Number(raw.direct_expense || 0);
  const indirectExp = Number(raw.indirect_expense || 0);
  const cutterCost = Number(raw.cutter_cost || 0);
  
  // If subtotal is available and there ARE expenses/cutter, compute party-facing amount
  if (subtotal > 0) {
    return subtotal + gst - discount + roundOff;
  }
  
  // If no subtotal but also no expenses/cutter, total_amount IS the party amount
  if (directExp === 0 && indirectExp === 0 && cutterCost === 0) {
    return Number(tx.total_amount);
  }
  
  // Edge case: total_amount includes expenses but we don't have subtotal — derive it
  // total_amount = subtotal + directExp + indirectExp + cutterCost + gst - discount + roundOff
  // So: subtotal = total_amount - directExp - indirectExp - cutterCost - gst + discount - roundOff
  const derivedSubtotal = Number(tx.total_amount) - directExp - indirectExp - cutterCost - gst + discount - roundOff;
  return derivedSubtotal + gst - discount + roundOff;
}

/**
 * Compute the party-facing balance (outstanding) for a transaction.
 * balance = partyAmount - paidAmount
 */
function getPartyBalance(tx: Purchase | Sale): number {
  const partyAmount = getPartyAmount(tx);
  const paid = Number(tx.paid_amount);
  return Math.max(0, partyAmount - paid);
}

/**
 * Build a bill-by-bill ledger for the party using ONLY Sales & Purchase transactions.
 * 
 * For each transaction, the party-facing payable/receivable is:
 *   Party Amount = Item Subtotal + GST - Discount + Round-Off
 * 
 * NOT included in party amount:
 *   - direct_expense, indirect_expense (paid to transport/labor vendors)
 *   - cutter_cost (paid to cutters separately)
 * 
 * These are separate liabilities to other entities.
 */
function buildBillLedger(purchases: Purchase[], sales: Sale[], openingBalance: number): BillEntry[] {
  const rows: Omit<BillEntry, 'running_balance'>[] = [];

  if (openingBalance !== 0) {
    rows.push({
      id: '__opening__', type: 'OPENING', date: '2000-01-01',
      reference: 'Opening Balance', narration: 'Balance brought forward',
      amount: Math.abs(openingBalance), paid_amount: Math.abs(openingBalance),
      bill_balance: 0, source_id: undefined,
    });
  }
  for (const p of purchases) {
    const partyAmount = getPartyAmount(p);
    const partyBalance = getPartyBalance(p);
    rows.push({
      id: p.id, type: 'PURCHASE', date: p.purchase_date, reference: p.purchase_number,
      narration: [p.bill_number && `Bill: ${p.bill_number}`, p.gadi_number && `Gadi: ${p.gadi_number}`].filter(Boolean).join(' · ') || 'Purchase',
      amount: partyAmount, paid_amount: Number(p.paid_amount),
      bill_balance: partyBalance, source_id: p.id,
    });
  }
  for (const s of sales) {
    const partyAmount = getPartyAmount(s);
    const partyBalance = getPartyBalance(s);
    rows.push({
      id: s.id, type: 'SALE', date: s.sale_date, reference: s.sale_number, narration: 'Sale',
      amount: partyAmount, paid_amount: Number(s.paid_amount),
      bill_balance: partyBalance, source_id: s.id,
    });
  }
  rows.sort((a, b) => {
    if (a.id === '__opening__') return -1;
    if (b.id === '__opening__') return 1;
    return new Date(a.date).getTime() - new Date(b.date).getTime();
  });
  let running = openingBalance;
  return rows.map(row => {
    if (row.type === 'PURCHASE') running += row.amount;
    else if (row.type === 'SALE') running -= row.amount;
    else if (row.type === 'OPENING') running = openingBalance;
    return { ...row, running_balance: running };
  });
}

// ─── Detail row helper ────────────────────────────────────────────────────────

function DetailRow({ icon: Icon, label, value, href, mono = false, className = '' }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  href?: string;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex items-start gap-3 py-2.5 border-b border-border/50 last:border-0 ${className}`}>
      <div className="h-7 w-7 rounded-lg bg-muted/60 flex items-center justify-center shrink-0 mt-0.5">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
        {href ? (
          <a href={href} className={`text-sm text-primary hover:underline ${mono ? 'font-mono' : ''}`}>{value}</a>
        ) : (
          <p className={`text-sm font-medium ${mono ? 'font-mono' : ''}`}>{value}</p>
        )}
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PartyDetailPage() {
  const { partyId } = useParams<{ partyId: string }>();
  const navigate    = useNavigate();
  const { t } = useTranslation(['parties', 'common']);

  const [loading,          setLoading]          = useState(true);
  const [refreshing,       setRefreshing]        = useState(false);
  const [party,            setParty]             = useState<Party | null>(null);
  const [purchases,        setPurchases]         = useState<Purchase[]>([]);
  const [sales,            setSales]             = useState<Sale[]>([]);
  const [showEdit,         setShowEdit]          = useState(false);
  const [showPayment,      setShowPayment]       = useState(false);
  const [sendingReminder,  setSendingReminder]   = useState(false);
  const [tab,              setTab]               = useState<'bills' | 'statement' | 'ledger'>('bills');
  const [billFilter,       setBillFilter]        = useState<'ALL' | 'PURCHASE' | 'SALE' | 'UNPAID' | 'PARTIAL'>('ALL');
  const [dateRange,        setDateRange]         = useState<'ALL' | '30' | '90' | '180' | '365'>('ALL');
  const [search,           setSearch]            = useState('');

  // ── fetch ──────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async (silent = false) => {
    if (!partyId) return;
    try {
      if (silent) { setRefreshing(true); } else { setLoading(true); }
      const [partyRes, purchasesRes, salesRes] = await Promise.all([
        profileApi.getParty(partyId),
        purchaseApi.list({ partyId, limit: 500 }),
        salesApi.list({ partyId, limit: 500 }),
      ]);
      if (partyRes.data?.data) setParty(partyRes.data.data);
      setPurchases(purchasesRes.data?.data || []);
      setSales(salesRes.data?.data || []);
    } catch { /* keep existing state */ }
    finally { setLoading(false); setRefreshing(false); }
  }, [partyId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── stats ──────────────────────────────────────────────────────────────────
  // Party balances are derived ONLY from Sales and Purchase transactions.
  // Expenses, Cutters, and other third-party payments are kept completely separate.
  // Party Amount = Subtotal + GST - Discount + Round-Off (excludes expenses/cutter)
  const stats = useMemo(() => {
    const totalPurchases  = purchases.reduce((s, p)  => s + getPartyAmount(p),  0);
    const totalSales      = sales.reduce    ((s, s2) => s + getPartyAmount(s2), 0);
    const paidPurchases   = purchases.reduce((s, p)  => s + Math.min(Number(p.paid_amount), getPartyAmount(p)),   0);
    const paidSales       = sales.reduce    ((s, s2) => s + Math.min(Number(s2.paid_amount), getPartyAmount(s2)),  0);
    const unpaidPurchases = purchases.reduce((s, p)  => s + getPartyBalance(p), 0);
    const unpaidSales     = sales.reduce    ((s, s2) => s + getPartyBalance(s2), 0);
    // Derived balance from transactions only (not including cutter/expense entries)
    const derivedBalance  = unpaidPurchases - unpaidSales;
    return { totalPurchases, totalSales, paidPurchases, paidSales, unpaidPurchases, unpaidSales, derivedBalance };
  }, [purchases, sales]);

  // opening_balance sign convention: positive = payable (we owe the party),
  // negative = receivable (they owe us) — matches party.balance in the backend.
  const openingBalance = useMemo(() => Number(party?.opening_balance ?? 0), [party]);

  // ── bill ledger ────────────────────────────────────────────────────────────
  const billLedger = useMemo(
    () => buildBillLedger(purchases, sales, openingBalance),
    [purchases, sales, openingBalance],
  );

  const filteredBills = useMemo(() => {
    let rows = billLedger;
    if (dateRange !== 'ALL') {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - Number(dateRange));
      rows = rows.filter(r => r.id === '__opening__' || new Date(r.date) >= cutoff);
    }
    if (billFilter === 'PURCHASE') rows = rows.filter(r => r.type === 'PURCHASE' || r.id === '__opening__');
    else if (billFilter === 'SALE')    rows = rows.filter(r => r.type === 'SALE'     || r.id === '__opening__');
    else if (billFilter === 'UNPAID')  rows = rows.filter(r => (r.bill_balance ?? 0) > 0.01 || r.id === '__opening__');
    else if (billFilter === 'PARTIAL') rows = rows.filter(r => r.id !== '__opening__' && (r.paid_amount ?? 0) > 0 && (r.bill_balance ?? 0) > 0.01);
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(r => r.id === '__opening__' || r.reference.toLowerCase().includes(q) || (r.narration || '').toLowerCase().includes(q));
    }
    return rows;
  }, [billLedger, billFilter, dateRange, search]);

  // ── reminder ───────────────────────────────────────────────────────────────
  const handleSendReminder = async () => {
    if (!party) return;
    try {
      setSendingReminder(true);
      await notificationApi.sendReminder(party.id);
      toast.success(t('parties:reminder_sent', { name: party.name }));
    } catch { toast.error(t('parties:reminder_error')); }
    finally { setSendingReminder(false); }
  };

  // ── guards ─────────────────────────────────────────────────────────────────
  if (loading) return <SectionLoader />;
  if (!party)  return (
    <EmptyState title={t('parties:party_not_found')} description={t('parties:party_not_found_desc')}
      action={{ label: t('common:go_back'), onClick: () => navigate('/parties') }} />
  );

  // party.balance from the backend includes expenses/cutter in total_amount for some purchases.
  // Use derived balance based on party-facing amounts only:
  // Party Amount = Subtotal + GST - Discount + Round-Off
  // Balance = opening_balance + unpaid_purchases - unpaid_sales
  const balance      = openingBalance + stats.derivedBalance;
  const isReceivable = balance < 0;  // negative = they owe us (sale outstanding)
  const isPayable    = balance > 0;  // positive = we owe them (purchase outstanding)

  const typeStyle: Record<string, string> = {
    SUPPLIER: 'bg-blue-500/10   text-blue-400   border-blue-500/30',
    CUSTOMER: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    BOTH:     'bg-violet-500/10  text-violet-400  border-violet-500/30',
  };

  const pendingPurchases = purchases.filter(p => getPartyBalance(p) > 0.01);
  const pendingSales     = sales.filter(s => getPartyBalance(s) > 0.01);

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-[1200px] mx-auto pb-12 space-y-0">

      {/* ════════════════════════════════════════════════════════════
          SECTION 1 — HEADER BAR
      ════════════════════════════════════════════════════════════ */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border/60 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3">
        <div className="max-w-[1200px] mx-auto flex items-center gap-3">
          {/* Back */}
          <Button variant="ghost" size="icon" className="shrink-0" onClick={() => navigate('/parties')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>

          {/* Party identity */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-lg font-bold truncate leading-tight">{party.name}</h1>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${typeStyle[party.type]}`}>
                {party.type}
              </span>
              {!party.is_active && (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border bg-muted text-muted-foreground border-border">
                  INACTIVE
                </span>
              )}
            </div>
            {/* Quick info chips */}
            <div className="flex items-center gap-3 mt-0.5 flex-wrap">
              {party.phone && (
                <a href={`tel:${party.phone}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors">
                  <Phone className="h-3 w-3" />{party.phone}
                </a>
              )}
              {(party.city || party.state) && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3" />{[party.city, party.state].filter(Boolean).join(', ')}
                </span>
              )}
              {party.gst_number && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground font-mono">
                  <Building2 className="h-3 w-3" />GST: {party.gst_number}
                </span>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5 shrink-0">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => fetchData(true)} disabled={refreshing} title={t('common:refresh_label')}>
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>
            <Button variant="outline" size="sm" className="h-8" onClick={handleSendReminder} disabled={sendingReminder || balance === 0}>
              <Bell className={`h-3.5 w-3.5 mr-1.5 ${sendingReminder ? 'animate-pulse' : ''}`} />
              {sendingReminder ? t('parties:sending_reminder') : t('parties:send_reminder')}
            </Button>
            <Button variant="outline" size="sm" className="h-8" onClick={() => setShowEdit(true)}>
              <Pencil className="h-3.5 w-3.5 mr-1.5" /> {t('common:edit')}
            </Button>
            <ExportButton
              data={filteredBills}
              columns={['date', 'type', 'reference', 'narration', 'amount', 'paid_amount', 'bill_balance', 'running_balance']}
              filename={`party_${party.name}_ledger`}
            />
          </div>
        </div>
      </div>

      <div className="pt-5 space-y-5">

        {/* ══════════════════════════════════════════════════════════
            SECTION 2 — BALANCE HERO + ACTION BUTTONS
        ══════════════════════════════════════════════════════════ */}
        <div className={`rounded-2xl border-2 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5
          ${isPayable ? 'border-red-500/25 bg-gradient-to-r from-red-500/5 to-transparent'
          : isReceivable ? 'border-emerald-500/25 bg-gradient-to-r from-emerald-500/5 to-transparent'
          : 'border-border bg-card'}`}>

          {/* Balance amount */}
          <div className="flex items-center gap-5">
            <div className={`h-16 w-16 rounded-2xl flex items-center justify-center shrink-0 shadow-sm
              ${isPayable ? 'bg-red-500/10' : isReceivable ? 'bg-emerald-500/10' : 'bg-muted'}`}>
              <Wallet className={`h-8 w-8 ${isPayable ? 'text-red-400' : isReceivable ? 'text-emerald-400' : 'text-muted-foreground'}`} />
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-0.5">{t('parties:current_balance')}</p>
              <p className={`text-4xl font-black tracking-tight ${isPayable ? 'text-red-400' : isReceivable ? 'text-emerald-400' : 'text-muted-foreground'}`}>
                {formatCurrency(Math.abs(balance))}
              </p>
              <p className={`text-sm font-medium mt-1 ${isPayable ? 'text-red-400/80' : isReceivable ? 'text-emerald-400/80' : 'text-muted-foreground'}`}>
                {isPayable ? `↑ ${t('parties:you_owe_party')}`
                  : isReceivable ? `↓ ${t('parties:party_owes_you')}`
                  : `✓ ${t('parties:all_settled')}`}
                {party.credit_period_days ? (
                  <span className="ml-2 text-xs font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                    {party.credit_period_days}d credit
                  </span>
                ) : null}
              </p>
            </div>
          </div>

          {/* Quick action buttons */}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="border-blue-500/30 hover:bg-blue-500/5 hover:border-blue-500/60"
              onClick={() => navigate(`/purchases/new?partyId=${party.id}`)}>
              <ShoppingCart className="h-3.5 w-3.5 mr-1.5 text-blue-400" />
              <span>{t('parties:add_purchase')}</span>
            </Button>
            <Button variant="outline" size="sm" className="border-emerald-500/30 hover:bg-emerald-500/5 hover:border-emerald-500/60"
              onClick={() => navigate(`/sales/new?partyId=${party.id}`)}>
              <TrendingUp className="h-3.5 w-3.5 mr-1.5 text-emerald-400" />
              <span>{t('parties:add_sale')}</span>
            </Button>
            <Button size="sm" className="shadow-sm" onClick={() => setShowPayment(true)}>
              <IndianRupee className="h-3.5 w-3.5 mr-1.5" /> {t('parties:record_payment')}
            </Button>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════
            SECTION 3 — STATS ROW
        ══════════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {([
            {
              label: t('parties:purchases_label'), value: stats.totalPurchases,
              sub: stats.unpaidPurchases > 0.01 ? `${formatCurrency(stats.unpaidPurchases)} ${t('common:status_unpaid').toLowerCase()}` : `${purchases.length} ${t('parties:bills_count', { count: purchases.length })}`,
              subCls: stats.unpaidPurchases > 0.01 ? 'text-red-400' : 'text-muted-foreground',
              icon: ShoppingCart, bg: 'bg-blue-500/10', ic: 'text-blue-400',
            },
            {
              label: t('parties:sales_label'), value: stats.totalSales,
              sub: stats.unpaidSales > 0.01 ? `${formatCurrency(stats.unpaidSales)} ${t('common:status_pending').toLowerCase()}` : `${sales.length} ${t('parties:bills_count', { count: sales.length })}`,
              subCls: stats.unpaidSales > 0.01 ? 'text-amber-400' : 'text-muted-foreground',
              icon: TrendingUp, bg: 'bg-emerald-500/10', ic: 'text-emerald-400',
            },
            {
              label: t('parties:paid_out'), value: stats.paidPurchases,
              sub: `of ${formatCurrency(stats.totalPurchases)}`,
              subCls: 'text-muted-foreground',
              icon: CreditCard, bg: 'bg-violet-500/10', ic: 'text-violet-400',
            },
            {
              label: t('parties:received'), value: stats.paidSales,
              sub: `of ${formatCurrency(stats.totalSales)}`,
              subCls: 'text-muted-foreground',
              icon: ArrowDownLeft, bg: 'bg-amber-500/10', ic: 'text-amber-400',
            },
          ] as const).map(s => (
            <Card key={s.label} className="glass hover:shadow-md transition-shadow">
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`h-10 w-10 rounded-xl ${s.bg} flex items-center justify-center shrink-0`}>
                  <s.icon className={`h-5 w-5 ${s.ic}`} />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{s.label}</p>
                  <p className="text-base font-bold leading-tight mt-0.5">{formatCurrency(s.value)}</p>
                  <p className={`text-[11px] mt-0.5 ${s.subCls}`}>{s.sub}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* ══════════════════════════════════════════════════════════
            SECTION 4 — TWO-COLUMN: PARTY DETAILS + FINANCIAL BREAKDOWN
        ══════════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* ── Party Details ── */}
          <Card className="glass">
            <CardHeader className="pb-1 flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <User className="h-4 w-4 text-primary" /> {t('parties:party_details')}
              </CardTitle>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowEdit(true)}>
                <Pencil className="h-3 w-3 mr-1" /> {t('common:edit')}
              </Button>
            </CardHeader>
            <CardContent className="pt-2 pb-4">
              {party.phone && (
                <DetailRow icon={Phone} label={t('common:phone_label')} value={party.phone} href={`tel:${party.phone}`} />
              )}
              {party.whatsapp && party.whatsapp !== party.phone && (
                <DetailRow icon={Phone} label={t('common:whatsapp_label')}
                  value={<a href={`https://wa.me/91${party.whatsapp}`} target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline text-sm">{party.whatsapp}</a>}
                />
              )}
              {party.email && (
                <DetailRow icon={Mail} label={t('common:email_label')} value={party.email} href={`mailto:${party.email}`} />
              )}
              {(party.address || party.city || party.state) && (
                <DetailRow icon={MapPin} label={t('common:address_label')}
                  value={[party.address, party.city, party.state, party.pincode].filter(Boolean).join(', ')} />
              )}
              {party.gst_number && (
                <DetailRow icon={Building2} label={`GST · ${party.gst_registration_type || 'UNREGISTERED'}`}
                  value={party.gst_number} mono />
              )}
              {party.pan_number && (
                <DetailRow icon={Shield} label={t('common:pan_label')} value={party.pan_number} mono />
              )}
              {(party.credit_period_days || party.credit_limit) && (
                <DetailRow icon={CalendarClock} label={t('common:credit_terms_label')}
                  value={[
                    party.credit_period_days && t('common:credit_days_text', { days: party.credit_period_days }),
                    party.credit_limit       && t('common:credit_limit_text', { amount: formatCurrency(party.credit_limit) }),
                  ].filter(Boolean).join('  ·  ')} />
              )}
              <DetailRow icon={Banknote} label={t('common:opening_balance_label')}
                value={openingBalance === 0 ? t('common:no_opening_balance') : formatCurrency(openingBalance)} />
              {party.bank_accounts && party.bank_accounts.length > 0 && (
                <div className="pt-2.5 mt-1 border-t border-border/50">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">{t('parties:bank_accounts')}</p>
                  {party.bank_accounts.map(acc => (
                    <div key={acc.id} className="flex items-center justify-between py-1.5 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium">{acc.bank_name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{acc.account_number} · {acc.ifsc_code}</p>
                      </div>
                      {acc.is_primary && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">{t('common:primary_account')}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Financial Breakdown ── */}
          <Card className="glass">
            <CardHeader className="pb-1">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary" /> {t('parties:financial_breakdown')}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-2 pb-4 space-y-1">

              {/* Opening */}
              <div className="flex items-center justify-between py-2.5 border-b border-border">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Banknote className="h-4 w-4" /> {t('parties:opening_balance')}
                </div>
                <span className="text-sm font-semibold">{formatCurrency(openingBalance)} <span className="text-xs font-normal text-muted-foreground">B/F</span></span>
              </div>

              {/* Purchases */}
              <div className="flex items-center justify-between py-2">
                <div className="flex items-center gap-2 text-sm">
                  <ShoppingCart className="h-4 w-4 text-blue-400" /> {t('parties:purchases_label')}
                  <span className="text-[10px] text-muted-foreground">({purchases.length} {t('parties:bills_count', { count: purchases.length })})</span>
                </div>
                <span className="text-sm font-semibold text-red-400">+ {formatCurrency(stats.totalPurchases)}</span>
              </div>

              {/* Payments made */}
              <div className="flex items-center justify-between py-2">
                <div className="flex items-center gap-2 text-sm">
                  <CreditCard className="h-4 w-4 text-violet-400" /> {t('parties:payments_made')}
                </div>
                <span className="text-sm font-semibold text-violet-400">− {formatCurrency(stats.paidPurchases)}</span>
              </div>

              {/* Sales */}
              <div className="flex items-center justify-between py-2">
                <div className="flex items-center gap-2 text-sm">
                  <TrendingUp className="h-4 w-4 text-emerald-400" /> {t('parties:sales_label')}
                  <span className="text-[10px] text-muted-foreground">({sales.length} {t('parties:bills_count', { count: sales.length })})</span>
                </div>
                <span className="text-sm font-semibold text-emerald-400">− {formatCurrency(stats.totalSales)}</span>
              </div>

              {/* Receipts */}
              <div className="flex items-center justify-between py-2 border-b border-border pb-3">
                <div className="flex items-center gap-2 text-sm">
                  <ArrowDownLeft className="h-4 w-4 text-amber-400" /> {t('parties:receipts_label')}
                </div>
                <span className="text-sm font-semibold text-amber-400">+ {formatCurrency(stats.paidSales)}</span>
              </div>

              {/* Outstanding */}
              {stats.unpaidPurchases > 0.01 && (
                <div className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-2 text-sm text-red-400">
                    <AlertCircle className="h-4 w-4" /> {t('parties:pending_payable')}
                    <span className="text-[10px] text-muted-foreground">({t('common:bills_count_text', { count: pendingPurchases.length })})</span>
                  </div>
                  <span className="text-sm font-semibold text-red-400">{formatCurrency(stats.unpaidPurchases)}</span>
                </div>
              )}
              {stats.unpaidSales > 0.01 && (
                <div className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-2 text-sm text-amber-400">
                    <AlertCircle className="h-4 w-4" /> {t('parties:pending_receivable')}
                    <span className="text-[10px] text-muted-foreground">({t('common:bills_count_text', { count: pendingSales.length })})</span>
                  </div>
                  <span className="text-sm font-semibold text-amber-400">{formatCurrency(stats.unpaidSales)}</span>
                </div>
              )}

              {/* Net balance */}
              <div className={`flex items-center justify-between mt-2 p-4 rounded-xl border-2
                ${isPayable ? 'bg-red-500/5 border-red-500/25' : isReceivable ? 'bg-emerald-500/5 border-emerald-500/25' : 'bg-muted/30 border-border'}`}>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('parties:net_balance')}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {isPayable ? t('parties:you_owe_party') : isReceivable ? t('parties:party_owes_you') : t('parties:fully_settled')}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1 italic">
                    Sales & Purchases only (excl. cutters/expenses)
                  </p>
                </div>
                <p className={`text-2xl font-black ${isPayable ? 'text-red-400' : isReceivable ? 'text-emerald-400' : 'text-muted-foreground'}`}>
                  {formatCurrency(Math.abs(balance))}
                </p>
              </div>

              {/* Formula info */}
              <div className="mt-3 px-3 py-2 rounded-lg bg-muted/30 border border-border/50">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Calculation Formula</p>
                <p className="text-[11px] text-muted-foreground font-mono leading-relaxed">
                  Party Amount = Subtotal + GST − Discount + Round-Off
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Excludes: Expenses, Cutter Costs, Labor (separate ledgers)
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ══════════════════════════════════════════════════════════
            SECTION 5 — TRANSACTIONS (Bills / Statement / Ledger)
        ══════════════════════════════════════════════════════════ */}
        <Card className="glass overflow-hidden">
          <Tabs value={tab} onValueChange={v => setTab(v as any)}>

            {/* Tab header + filters */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 pt-4 pb-0 border-b border-border">
              <TabsList className="h-9">
                <TabsTrigger value="bills" className="text-xs px-3">
                  <FileText className="h-3.5 w-3.5 mr-1.5" />
                  {t('parties:bills_tab')} <span className="ml-1 text-muted-foreground">({billLedger.filter(b => b.id !== '__opening__').length})</span>
                </TabsTrigger>
                <TabsTrigger value="statement" className="text-xs px-3">
                  <BarChart3 className="h-3.5 w-3.5 mr-1.5" /> {t('parties:statement_tab')}
                </TabsTrigger>
                <TabsTrigger value="ledger" className="text-xs px-3">
                  <TrendingDown className="h-3.5 w-3.5 mr-1.5" /> {t('parties:ledger_tab')}
                </TabsTrigger>
              </TabsList>

              {/* Filters — only for bills/ledger */}
              {(tab === 'bills' || tab === 'ledger') && (
                <div className="flex items-center gap-2 flex-wrap pb-3">
                  <div className="relative">
                    <SlidersHorizontal className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                    <Input
                      className="h-8 pl-8 text-xs w-44"
                      placeholder={t('parties:search_bills')}
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                    />
                  </div>
                  <Select value={dateRange} onValueChange={v => setDateRange(v as any)}>
                    <SelectTrigger className="h-8 text-xs w-[130px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">{t('parties:all_time')}</SelectItem>
                      <SelectItem value="30">{t('parties:last_30_days')}</SelectItem>
                      <SelectItem value="90">{t('parties:last_90_days')}</SelectItem>
                      <SelectItem value="180">{t('parties:last_6_months')}</SelectItem>
                      <SelectItem value="365">{t('parties:last_1_year')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={billFilter} onValueChange={v => setBillFilter(v as any)}>
                    <SelectTrigger className="h-8 text-xs w-[120px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">{t('parties:all_types')}</SelectItem>
                      <SelectItem value="PURCHASE">{t('parties:filter_purchases')}</SelectItem>
                      <SelectItem value="SALE">{t('parties:filter_sales')}</SelectItem>
                      <SelectItem value="UNPAID">{t('parties:filter_unpaid')}</SelectItem>
                      <SelectItem value="PARTIAL">{t('parties:filter_partial')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <ExportButton
                    data={filteredBills}
                    columns={['date', 'type', 'reference', 'narration', 'amount', 'paid_amount', 'bill_balance']}
                    filename={`party_${party.name}_bills`}
                  />
                </div>
              )}
            </div>

            {/* ── Tab: Bills (bill-by-bill) ── */}
            <TabsContent value="bills" className="m-0">
              {filteredBills.length === 0 ? (
                <div className="py-12">
                  <EmptyState
                    title={t('parties:no_transactions_yet')}
                    description={t('parties:no_transactions_desc')}
                    action={
                      { label: t('parties:add_purchase'), onClick: () => navigate(`/purchases/new?partyId=${party.id}`) }
                    }
                  />
                </div>
              ) : (
                <>
                  {/* Column headers */}
                  <div className="hidden sm:grid grid-cols-[90px_1fr_120px_110px_120px_106px] gap-2 px-5 py-2.5 bg-muted/30 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                    <span>{t('parties:date_col')}</span>
                    <span>{t('parties:description_col')}</span>
                    <span className="text-right">{t('common:amount')}</span>
                    <span className="text-right">{t('common:status_paid')}</span>
                    <span className="text-right">{t('common:balance')}</span>
                    <span className="text-center">{t('common:status')}</span>
                  </div>

                  <div className="divide-y divide-border/60">
                    {filteredBills.map((row, i) => {
                      const isOpening  = row.id === '__opening__';
                      const isPurchase = row.type === 'PURCHASE';
                      const billBal    = row.bill_balance ?? 0;
                      const paid       = row.paid_amount  ?? 0;

                      const rowStatus = isOpening ? '' : paid === 0 ? 'UNPAID' : billBal > 0.01 ? 'PARTIAL' : 'PAID';

                      const txChip: Record<string, string> = {
                        PURCHASE: 'bg-blue-500/10 text-blue-400',
                        SALE:     'bg-emerald-500/10 text-emerald-400',
                        OPENING:  'bg-muted text-muted-foreground',
                      };

                      return (
                        <motion.div
                          key={row.id + i}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: Math.min(i * 0.015, 0.3) }}
                          className={`group transition-colors ${isOpening ? 'bg-muted/20' : 'hover:bg-muted/20'}`}
                        >
                          {/* Mobile */}
                          <div className="sm:hidden flex items-start justify-between gap-3 px-4 py-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {!isOpening && (
                                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-black uppercase ${txChip[row.type]}`}>{row.type}</span>
                                )}
                                <span className="text-sm font-semibold">{row.reference}</span>
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">{isOpening ? 'Brought forward' : formatDate(row.date)}</p>
                              {row.narration && !isOpening && <p className="text-xs text-muted-foreground truncate">{row.narration}</p>}
                            </div>
                            <div className="text-right shrink-0 space-y-1">
                              {!isOpening && (
                                <>
                                  <p className={`text-sm font-bold ${isPurchase ? 'text-red-400' : 'text-emerald-400'}`}>{formatCurrency(row.amount)}</p>
                                  <p className="text-xs text-muted-foreground">{formatCurrency(paid)} paid</p>
                                </>
                              )}
                              {billBal > 0.01 && !isOpening && (
                                <p className={`text-xs font-bold ${isPurchase ? 'text-red-400' : 'text-amber-400'}`}>{formatCurrency(billBal)} due</p>
                              )}
                              {!isOpening && <StatusBadge status={rowStatus} />}
                            </div>
                          </div>

                          {/* Desktop */}
                          <div className="hidden sm:grid grid-cols-[90px_1fr_120px_110px_120px_106px] gap-2 items-center px-5 py-3">
                            <span className="text-xs text-muted-foreground">
                              {isOpening ? <span className="italic text-[11px]">Opening</span> : formatDate(row.date)}
                            </span>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                {!isOpening && (
                                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-black uppercase shrink-0 ${txChip[row.type]}`}>{row.type}</span>
                                )}
                                <span className={`text-sm font-semibold truncate ${isOpening ? 'text-muted-foreground italic' : ''}`}>{row.reference}</span>
                              </div>
                              {row.narration && !isOpening && (
                                <p className="text-xs text-muted-foreground truncate">{row.narration}</p>
                              )}
                            </div>
                            <div className="text-right">
                              {isOpening
                                ? <span className="text-xs text-muted-foreground">—</span>
                                : <span className={`text-sm font-semibold ${isPurchase ? 'text-red-400' : 'text-emerald-400'}`}>{formatCurrency(row.amount)}</span>
                              }
                            </div>
                            <div className="text-right">
                              {isOpening
                                ? <span className="text-xs text-muted-foreground">—</span>
                                : <span className="text-sm text-muted-foreground">{formatCurrency(paid)}</span>
                              }
                            </div>
                            <div className="text-right">
                              {isOpening
                                ? <span className="text-sm font-semibold text-muted-foreground">{formatCurrency(row.amount)} B/F</span>
                                : billBal > 0.01
                                  ? <span className={`text-sm font-bold ${isPurchase ? 'text-red-400' : 'text-amber-400'}`}>{formatCurrency(billBal)}</span>
                                  : <span className="text-xs text-muted-foreground">—</span>
                              }
                            </div>
                            <div className="flex items-center justify-center gap-1">
                              {!isOpening && <StatusBadge status={rowStatus} />}
                              {isOpening && <span className="text-[10px] italic text-muted-foreground">B/F</span>}
                              {row.source_id && !isOpening && (
                                <button
                                  type="button"
                                  onClick={() => navigate(`/${isPurchase ? 'purchases' : 'sales'}/${row.source_id}`)}
                                  className="ml-0.5 p-1 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 opacity-0 group-hover:opacity-100 transition-all"
                                  title={t('common:view_details')}
                                >
                                  <ChevronRight className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>

                  {/* Closing balance footer */}
                  <div className={`px-5 py-4 flex items-center justify-between border-t-2
                    ${isPayable ? 'bg-red-500/5 border-red-500/20' : isReceivable ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-muted/20 border-border'}`}>
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('parties:closing_balance')}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {isPayable ? t('parties:total_you_owe') : isReceivable ? t('parties:total_owed_to_you') : t('parties:no_outstanding')}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-2xl font-black ${isPayable ? 'text-red-400' : isReceivable ? 'text-emerald-400' : 'text-muted-foreground'}`}>
                        {formatCurrency(Math.abs(balance))}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {isPayable ? t('parties:you_owe') : isReceivable ? t('parties:they_owe') : t('parties:all_settled')}
                      </p>
                    </div>
                  </div>
                </>
              )}
            </TabsContent>

            {/* ── Tab: Statement (running ledger) ── */}
            <TabsContent value="statement" className="m-0">
              {billLedger.length === 0 ? (
                <div className="py-12">
                  <EmptyState title={t('parties:no_entries')} description={t('parties:no_entries_desc')} />
                </div>
              ) : (
                <>
                  <div className="hidden sm:grid grid-cols-[90px_1fr_140px_140px_140px] gap-2 px-5 py-2.5 bg-muted/30 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                    <span>{t('parties:date_col')}</span>
                    <span>{t('parties:description_col')}</span>
                    <span className="text-right">Debit (+)</span>
                    <span className="text-right">Credit (−)</span>
                    <span className="text-right">{t('common:running_balance')}</span>
                  </div>
                  <div className="divide-y divide-border/60">
                    {billLedger.map((row, i) => {
                      const isOpening  = row.id === '__opening__';
                      const isPurchase = row.type === 'PURCHASE';
                      const rb = row.running_balance;
                      return (
                        <div key={row.id + i} className={`group px-5 py-3 hover:bg-muted/20 transition-colors ${isOpening ? 'bg-muted/10 italic' : ''}`}>
                          <div className="hidden sm:grid grid-cols-[90px_1fr_140px_140px_140px] gap-2 items-center">
                            <span className="text-xs text-muted-foreground">
                              {isOpening ? '—' : formatDate(row.date)}
                            </span>
                            <div className="min-w-0">
                              <span className={`text-sm font-medium truncate block ${isOpening ? 'text-muted-foreground' : ''}`}>{row.reference}</span>
                              {row.narration && !isOpening && <span className="text-xs text-muted-foreground">{row.narration}</span>}
                            </div>
                            <div className="text-right">
                              {isPurchase && !isOpening
                                ? <span className="text-sm font-semibold text-red-400">{formatCurrency(row.amount)}</span>
                                : <span className="text-xs text-muted-foreground">—</span>}
                            </div>
                            <div className="text-right">
                              {!isPurchase && !isOpening
                                ? <span className="text-sm font-semibold text-emerald-400">{formatCurrency(row.amount)}</span>
                                : isOpening
                                  ? <span className="text-sm font-semibold text-muted-foreground">{formatCurrency(row.amount)} B/F</span>
                                  : <span className="text-xs text-muted-foreground">—</span>}
                            </div>
                            <div className="text-right">
                              <span className={`text-sm font-bold ${rb < 0 ? 'text-red-400' : rb > 0 ? 'text-amber-400' : 'text-muted-foreground'}`}>
                                {formatCurrency(Math.abs(rb))}
                              </span>
                              {rb !== 0 && (
                                <span className="ml-1 text-[10px] text-muted-foreground">{rb > 0 ? 'Dr' : 'Cr'}</span>
                              )}
                            </div>
                          </div>
                          {/* Mobile statement */}
                          <div className="sm:hidden flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold">{row.reference}</p>
                              <p className="text-xs text-muted-foreground">{isOpening ? 'Opening B/F' : formatDate(row.date)}</p>
                            </div>
                            <div className="text-right">
                              <p className={`text-sm font-bold ${isPurchase ? 'text-red-400' : 'text-emerald-400'}`}>{formatCurrency(row.amount)}</p>
                              <p className={`text-xs font-semibold ${rb > 0 ? 'text-amber-400' : rb < 0 ? 'text-red-400' : 'text-muted-foreground'}`}>
                                Bal: {formatCurrency(Math.abs(rb))}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {/* Footer */}
                  <div className="px-5 py-4 bg-muted/30 border-t border-border flex items-center justify-between">
                    <span className="text-sm font-semibold">{t('parties:closing_balance')}</span>
                    <span className={`text-xl font-black ${isPayable ? 'text-red-400' : isReceivable ? 'text-emerald-400' : 'text-muted-foreground'}`}>
                      {formatCurrency(Math.abs(balance))}
                    </span>
                  </div>
                </>
              )}
            </TabsContent>

            {/* ── Tab: Ledger (chronological all entries) ── */}
            <TabsContent value="ledger" className="m-0">
              {filteredBills.length === 0 ? (
                <div className="py-12">
                  <EmptyState title={t('parties:no_entries')} description={t('parties:no_entries_filter')} />
                </div>
              ) : (
                <>
                  <div className="hidden sm:grid grid-cols-[90px_80px_1fr_130px_130px_106px] gap-2 px-5 py-2.5 bg-muted/30 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                    <span>{t('parties:date_col')}</span>
                    <span>{t('common:type')}</span>
                    <span>{t('parties:reference_col')}</span>
                    <span className="text-right">{t('common:amount')}</span>
                    <span className="text-right">{t('common:balance')}</span>
                    <span className="text-center">{t('common:status')}</span>
                  </div>
                  <div className="divide-y divide-border/60">
                    {filteredBills.map((row, i) => {
                      const isOpening  = row.id === '__opening__';
                      const isPurchase = row.type === 'PURCHASE';
                      const billBal    = row.bill_balance ?? 0;
                      const paid       = row.paid_amount  ?? 0;
                      const rowStatus  = isOpening ? '' : paid === 0 ? 'UNPAID' : billBal > 0.01 ? 'PARTIAL' : 'PAID';
                      const txChip: Record<string, string> = {
                        PURCHASE: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
                        SALE:     'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
                        OPENING:  'bg-muted text-muted-foreground border-border',
                      };
                      return (
                        <div key={row.id + i} className={`group flex sm:grid sm:grid-cols-[90px_80px_1fr_130px_130px_106px] gap-2 items-center px-5 py-3 hover:bg-muted/20 transition-colors ${isOpening ? 'bg-muted/10' : ''}`}>
                          <span className="hidden sm:block text-xs text-muted-foreground">
                            {isOpening ? '—' : formatDate(row.date)}
                          </span>
                          <div className="hidden sm:flex">
                            <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-black uppercase ${txChip[row.type]}`}>
                              {row.type}
                            </span>
                          </div>
                          <div className="flex-1 sm:flex-none min-w-0">
                            <p className={`text-sm font-semibold truncate ${isOpening ? 'italic text-muted-foreground' : ''}`}>{row.reference}</p>
                            {row.narration && !isOpening && <p className="text-xs text-muted-foreground truncate">{row.narration}</p>}
                            <p className="sm:hidden text-xs text-muted-foreground">{isOpening ? 'Opening B/F' : formatDate(row.date)}</p>
                          </div>
                          <div className="hidden sm:block text-right">
                            <p className={`text-sm font-semibold ${isPurchase ? 'text-red-400' : isOpening ? 'text-muted-foreground' : 'text-emerald-400'}`}>
                              {formatCurrency(row.amount)}
                            </p>
                            {!isOpening && <p className="text-[10px] text-muted-foreground">{formatCurrency(paid)} paid</p>}
                          </div>
                          <div className="hidden sm:block text-right">
                            {isOpening
                              ? <span className="text-xs text-muted-foreground italic">B/F</span>
                              : billBal > 0.01
                                ? <span className={`text-sm font-bold ${isPurchase ? 'text-red-400' : 'text-amber-400'}`}>{formatCurrency(billBal)}</span>
                                : <span className="text-xs text-emerald-400 font-medium">Cleared</span>
                            }
                          </div>
                          <div className="flex items-center gap-1 justify-end sm:justify-center">
                            {!isOpening && <StatusBadge status={rowStatus} />}
                            {row.source_id && !isOpening && (
                              <button
                                type="button"
                                onClick={() => navigate(`/${isPurchase ? 'purchases' : 'sales'}/${row.source_id}`)}
                                className="p-1 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 opacity-0 group-hover:opacity-100 transition-all"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="px-5 py-3.5 bg-muted/20 border-t border-border flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{filteredBills.filter(r => r.id !== '__opening__').length} entries shown</span>
                    <span className={`text-base font-bold ${isPayable ? 'text-red-400' : isReceivable ? 'text-emerald-400' : 'text-muted-foreground'}`}>
                      Balance: {formatCurrency(Math.abs(balance))}
                    </span>
                  </div>
                </>
              )}
            </TabsContent>
          </Tabs>
        </Card>

        {/* ══════════════════════════════════════════════════════════
            SECTION 6 — ALERTS (Pending bills)
        ══════════════════════════════════════════════════════════ */}
        {(pendingPurchases.length > 0 || pendingSales.length > 0) && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-400" />
              <h3 className="text-sm font-semibold">{t('parties:pending_alerts')}</h3>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 font-semibold border border-amber-500/20">
                {t('parties:bills_outstanding', { count: pendingPurchases.length + pendingSales.length })}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Pending Purchases */}
              {pendingPurchases.length > 0 && (
                <Card className="glass border-red-500/20">
                  <CardHeader className="py-3 px-4 border-b border-border/50">
                    <CardTitle className="text-xs font-semibold flex items-center gap-2 text-red-400">
                      <ShoppingCart className="h-3.5 w-3.5" />
                      {t('parties:pending_purchases')}
                      <span className="ml-auto font-bold">{formatCurrency(stats.unpaidPurchases)} due</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="divide-y divide-border/50 max-h-60 overflow-y-auto">
                      {pendingPurchases.map(p => (
                        <div
                          key={p.id}
                          className="flex items-center justify-between px-4 py-2.5 hover:bg-red-500/5 transition-colors group cursor-pointer"
                          onClick={() => navigate(`/purchases/${p.id}`)}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold font-mono">{p.purchase_number}</span>
                              <StatusBadge status={Number(p.paid_amount) > 0 ? 'PARTIAL' : 'UNPAID'} />
                            </div>
                            <p className="text-xs text-muted-foreground">{formatDate(p.purchase_date)} · {formatCurrency(getPartyAmount(p))} total</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-sm font-bold text-red-400">{formatCurrency(getPartyBalance(p))}</span>
                            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Pending Sales */}
              {pendingSales.length > 0 && (
                <Card className="glass border-amber-500/20">
                  <CardHeader className="py-3 px-4 border-b border-border/50">
                    <CardTitle className="text-xs font-semibold flex items-center gap-2 text-amber-400">
                      <TrendingUp className="h-3.5 w-3.5" />
                      {t('parties:pending_sales_receivable')}
                      <span className="ml-auto font-bold">{formatCurrency(stats.unpaidSales)} pending</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="divide-y divide-border/50 max-h-60 overflow-y-auto">
                      {pendingSales.map(s => (
                        <div
                          key={s.id}
                          className="flex items-center justify-between px-4 py-2.5 hover:bg-amber-500/5 transition-colors group cursor-pointer"
                          onClick={() => navigate(`/sales/${s.id}`)}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold font-mono">{s.sale_number}</span>
                              <StatusBadge status={Number(s.paid_amount) > 0 ? 'PARTIAL' : 'UNPAID'} />
                            </div>
                            <p className="text-xs text-muted-foreground">{formatDate(s.sale_date)} · {formatCurrency(getPartyAmount(s))} total</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-sm font-bold text-amber-400">{formatCurrency(getPartyBalance(s))}</span>
                            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}

      </div>{/* end .pt-5 */}

      {/* ── Dialogs ── */}
      <AnimatePresence>
        {showEdit && (
          <EditPartyDialog key="edit" open={showEdit} party={party}
            onClose={() => setShowEdit(false)}
            onSuccess={() => { setShowEdit(false); fetchData(true); }} />
        )}
        {showPayment && (
          <RecordPaymentDialog key="pay" open={showPayment}
            onClose={() => setShowPayment(false)}
            defaultPartyId={party.id}
            defaultType={isPayable ? 'OUT' : 'IN'}
            onSuccess={() => { setShowPayment(false); fetchData(true); toast.success(t('parties:payment_recorded')); }} />
        )}
      </AnimatePresence>
    </div>
  );
}
