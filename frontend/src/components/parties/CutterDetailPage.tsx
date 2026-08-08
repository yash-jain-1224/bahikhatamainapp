import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft, Scissors, Phone, IndianRupee, Package,
  Pencil, Trash2, ShoppingCart, Calendar, ExternalLink,
  CheckCircle2, XCircle, FileText, Image, Loader2, Check, X, Plus,
} from 'lucide-react';
import {
  Button, Card, CardContent, CardHeader, CardTitle,
  Badge, Separator, Input,
} from '@/components/ui';
import { SectionLoader } from '@/components/shared/loading';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { profileApi } from '@/lib/api';
import { formatCurrency, formatDate } from '@/utils';
import type { Cutter, CutterTransaction } from '@/types';
import toast from 'react-hot-toast';

// ── Inline edit dialog ────────────────────────────────────────────────────────
function EditCutterInline({
  cutter,
  onClose,
  onSuccess,
}: {
  cutter: Cutter;
  onClose: () => void;
  onSuccess: (updated: Cutter) => void;
}) {
  const { t } = useTranslation(['parties', 'common']);
  const [name, setName] = useState(cutter.name);
  const [phone, setPhone] = useState(cutter.phone || '');
  const [rate, setRate] = useState(cutter.rate_per_unit ? String(cutter.rate_per_unit) : '');
  const [unit, setUnit] = useState(cutter.unit || 'KG');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) { toast.error(t('parties:name_required')); return; }
    try {
      setSaving(true);
      const { data } = await profileApi.updateCutter(cutter.id, {
        name: name.trim(),
        // null, not undefined — undefined keys are dropped by JSON.stringify,
        // so clearing the phone would silently keep the old value.
        phone: phone.trim() || null,
        ratePerUnit: rate ? parseFloat(rate) : 0,
        unit,
      });
      toast.success(t('parties:cutter_updated'));
      onSuccess(data?.data || { ...cutter, name, phone, rate_per_unit: parseFloat(rate) || 0, unit });
    } catch {
      toast.error(t('parties:cutter_update_error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">{t('parties:edit_cutter')}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>
        <Separator />
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('parties:party_name')} *</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder={t('parties:cutter_name_placeholder')} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('parties:party_phone')}</label>
            <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder={t('parties:cutter_phone_placeholder')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t('parties:cutter_rate')}</label>
              <Input type="number" min={0} step="0.01" value={rate} onChange={e => setRate(e.target.value)} placeholder="0.00" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t('parties:cutter_unit')}</label>
              <select
                value={unit}
                onChange={e => setUnit(e.target.value)}
                className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="KG">KG</option>
                <option value="PCS">PCS</option>
                <option value="BOX">BOX</option>
                <option value="TON">TON</option>
                <option value="SFT">SFT</option>
                <option value="QUINTAL">{t('common:quintal_label')}</option>
              </select>
            </div>
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={saving}>{t('common:cancel')}</Button>
          <Button className="flex-1" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
            {t('common:save_changes')}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Record Payment dialog ─────────────────────────────────────────────────────
function RecordPaymentDialog({
  cutterId,
  defaultRate,
  unit,
  onClose,
  onSuccess,
}: {
  cutterId: string;
  defaultRate: number;
  unit: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { t } = useTranslation(['parties', 'common']);
  const [qty, setQty] = useState('');
  const [rate, setRate] = useState(defaultRate ? String(defaultRate) : '');
  const [notes, setNotes] = useState('');
  const [isPaid, setIsPaid] = useState(true);
  const [saving, setSaving] = useState(false);

  const amount = (parseFloat(qty) || 0) * (parseFloat(rate) || 0);

  const handleSave = async () => {
    if (!qty || parseFloat(qty) <= 0) { toast.error('Enter a valid quantity'); return; }
    if (!rate || parseFloat(rate) <= 0) { toast.error('Enter a valid rate'); return; }
    try {
      setSaving(true);
      await profileApi.createCutterTransaction(cutterId, {
        quantity: parseFloat(qty),
        rate: parseFloat(rate),
        notes: notes.trim() || undefined,
        isPaid,
      });
      toast.success('Payment recorded');
      onSuccess();
    } catch {
      toast.error('Failed to record payment');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Record Payment</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>
        <Separator />
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Quantity ({unit}) *</label>
              <Input type="number" min={0} step="0.001" value={qty} onChange={e => setQty(e.target.value)} placeholder="0.000" autoFocus />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Rate (₹/{unit}) *</label>
              <Input type="number" min={0} step="0.01" value={rate} onChange={e => setRate(e.target.value)} placeholder="0.00" />
            </div>
          </div>
          {amount > 0 && (
            <div className="rounded-lg bg-muted/50 px-4 py-2.5 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total Amount</span>
              <span className="text-base font-bold">{formatCurrency(amount)}</span>
            </div>
          )}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Notes</label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes..." />
          </div>
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="isPaid"
              checked={isPaid}
              onChange={e => setIsPaid(e.target.checked)}
              className="h-4 w-4 rounded border-border accent-primary"
            />
            <label htmlFor="isPaid" className="text-sm font-medium cursor-pointer">Mark as Paid</label>
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={saving}>{t('common:cancel')}</Button>
          <Button className="flex-1" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
            Record Payment
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Edit Transaction dialog ───────────────────────────────────────────────────
function EditTransactionDialog({
  cutterId,
  transaction,
  unit,
  onClose,
  onSuccess,
}: {
  cutterId: string;
  transaction: CutterTransaction;
  unit: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { t } = useTranslation(['parties', 'common']);
  const [qty, setQty] = useState(String(transaction.quantity));
  const [rate, setRate] = useState(String(transaction.rate));
  const [notes, setNotes] = useState(transaction.notes || '');
  const [isPaid, setIsPaid] = useState(transaction.is_paid !== false);
  const [saving, setSaving] = useState(false);

  const amount = (parseFloat(qty) || 0) * (parseFloat(rate) || 0);

  const handleSave = async () => {
    if (!qty || parseFloat(qty) <= 0) { toast.error('Enter a valid quantity'); return; }
    if (!rate || parseFloat(rate) <= 0) { toast.error('Enter a valid rate'); return; }
    try {
      setSaving(true);
      await profileApi.updateCutterTransaction(cutterId, transaction.id, {
        quantity: parseFloat(qty),
        rate: parseFloat(rate),
        notes: notes.trim() || null,
        isPaid,
      });
      toast.success('Transaction updated');
      onSuccess();
    } catch {
      toast.error('Failed to update transaction');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Edit Transaction</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>
        <Separator />
        {transaction.purchase && (
          <div className="rounded-lg bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            Linked to purchase: <span className="font-medium text-foreground">{transaction.purchase.purchase_number}</span>
            {transaction.purchase.party?.name && <> · {transaction.purchase.party.name}</>}
          </div>
        )}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Quantity ({unit}) *</label>
              <Input type="number" min={0} step="0.001" value={qty} onChange={e => setQty(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Rate (₹/{unit}) *</label>
              <Input type="number" min={0} step="0.01" value={rate} onChange={e => setRate(e.target.value)} />
            </div>
          </div>
          {amount > 0 && (
            <div className="rounded-lg bg-muted/50 px-4 py-2.5 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total Amount</span>
              <span className="text-base font-bold">{formatCurrency(amount)}</span>
            </div>
          )}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Notes</label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes..." />
          </div>
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="editIsPaid"
              checked={isPaid}
              onChange={e => setIsPaid(e.target.checked)}
              className="h-4 w-4 rounded border-border accent-primary"
            />
            <label htmlFor="editIsPaid" className="text-sm font-medium cursor-pointer">Mark as Paid</label>
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={saving}>{t('common:cancel')}</Button>
          <Button className="flex-1" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
            {t('common:save_changes')}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function CutterDetailPage() {
  const { cutterId } = useParams<{ cutterId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation(['parties', 'common']);
  const [cutter, setCutter] = useState<Cutter | null>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const [markAllOpen, setMarkAllOpen] = useState(false);
  const [recordPaymentOpen, setRecordPaymentOpen] = useState(false);
  const [editTx, setEditTx] = useState<CutterTransaction | null>(null);

  useEffect(() => {
    if (cutterId) fetchCutter();
  }, [cutterId]);

  const fetchCutter = async () => {
    try {
      setLoading(true);
      const { data } = await profileApi.getCutter(cutterId!);
      setCutter(data?.data || null);
    } catch {
      toast.error(t('parties:cutter_load_error'));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    try {
      await profileApi.deleteCutter(cutterId!);
      toast.success(t('parties:cutter_deactivated'));
      navigate('/parties?tab=cutters');
    } catch {
      toast.error(t('parties:cutter_deactivate_error'));
    }
  };

  const handleMarkPaid = async (transactionId: string) => {
    try {
      setPayingId(transactionId);
      await profileApi.updateCutterTransaction(cutterId!, transactionId, { isPaid: true });
      toast.success(t('parties:payment_recorded', { defaultValue: 'Payment recorded' }));
      await fetchCutter();
    } catch {
      toast.error(t('parties:payment_record_error', { defaultValue: 'Failed to record payment' }));
    } finally {
      setPayingId(null);
    }
  };

  const handleMarkAllPaid = async () => {
    try {
      setMarkingAll(true);
      await profileApi.markAllCutterTransactionsPaid(cutterId!);
      toast.success(t('parties:all_payments_recorded', { defaultValue: 'All payments recorded' }));
      setMarkAllOpen(false);
      await fetchCutter();
    } catch {
      toast.error(t('parties:payment_record_error', { defaultValue: 'Failed to record payment' }));
    } finally {
      setMarkingAll(false);
    }
  };

  if (loading) return <SectionLoader />;
  if (!cutter) return (
    <div className="text-center py-16 text-muted-foreground space-y-3">
      <Scissors className="h-12 w-12 mx-auto opacity-30" />
      <p>{t('parties:cutter_not_found')}</p>
      <Button variant="outline" onClick={() => navigate('/parties?tab=cutters')}>
        <ArrowLeft className="h-4 w-4 mr-2" /> {t('parties:back_to_cutters')}
      </Button>
    </div>
  );

  const transactions = cutter.transactions || [];
  const totalQty = transactions.reduce((s, t) => s + Number(t.quantity), 0);
  const totalEarned = transactions.reduce((s, t) => s + Number(t.quantity) * Number(t.rate), 0);
  const unpaidAmount = transactions
    .filter(t => t.is_paid === false)
    .reduce((s, t) => s + Number(t.quantity) * Number(t.rate), 0);
  const paidAmount = transactions
    .filter(t => t.is_paid !== false)
    .reduce((s, t) => s + Number(t.quantity) * Number(t.rate), 0);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/parties?tab=cutters')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-purple-500/10 flex items-center justify-center">
              <Scissors className="h-6 w-6 text-purple-400" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">{cutter.name}</h2>
              {cutter.phone && (
                <a
                  href={`tel:${cutter.phone}`}
                  className="text-sm text-muted-foreground flex items-center gap-1.5 hover:text-primary transition-colors mt-0.5"
                >
                  <Phone className="h-3.5 w-3.5" /> {cutter.phone}
                </a>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setRecordPaymentOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Record Payment
          </Button>
          {cutter.party_id && (
            <Button variant="outline" size="sm" onClick={() => navigate(`/ledger?partyId=${cutter.party_id}`)}>
              <ExternalLink className="h-4 w-4 mr-2" /> View in Ledger
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4 mr-2" /> {t('common:edit')}
          </Button>
          <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="h-4 w-4 mr-2" /> {t('parties:deactivate_cutter')}
          </Button>
        </div>
      </div>

      {/* Rate info */}
      <div className="flex items-center gap-3 px-1">
        <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
          <IndianRupee className="h-4 w-4" />
          <span>Rate:</span>
          <span className="font-semibold text-foreground">
            {cutter.rate_per_unit ? formatCurrency(Number(cutter.rate_per_unit)) : t('parties:rate_not_set')}
          </span>
          {cutter.unit && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 ml-1">
              <Package className="h-2.5 w-2.5 mr-1" />{cutter.unit}
            </Badge>
          )}
        </div>
        {cutter._count?.transactions !== undefined && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
            <ShoppingCart className="h-4 w-4" />
            <span>{cutter._count.transactions} purchase{cutter._count.transactions !== 1 ? 's' : ''}</span>
          </div>
        )}
      </div>

      {/* Summary stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="glass">
          <CardContent className="p-4 text-center space-y-1">
            <p className="text-xs text-muted-foreground">{t('parties:total_quantity')}</p>
            <p className="text-xl font-bold">{totalQty.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">{cutter.unit || 'units'}</p>
          </CardContent>
        </Card>
        <Card className="glass">
          <CardContent className="p-4 text-center space-y-1">
            <p className="text-xs text-muted-foreground">{t('parties:total_earned')}</p>
            <p className="text-xl font-bold">{formatCurrency(totalEarned)}</p>
            <p className="text-xs text-muted-foreground">{t('parties:all_time_lower')}</p>
          </CardContent>
        </Card>
        <Card className="glass">
          <CardContent className="p-4 text-center space-y-1">
            <p className="text-xs text-muted-foreground">{t('parties:paid_label')}</p>
            <p className="text-xl font-bold text-emerald-400">{formatCurrency(paidAmount)}</p>
            <p className="text-xs text-muted-foreground">{t('parties:settled')}</p>
          </CardContent>
        </Card>
        <Card className="glass">
          <CardContent className="p-4 text-center space-y-1">
            <p className="text-xs text-muted-foreground">{t('parties:unpaid_label')}</p>
            <p className={`text-xl font-bold ${unpaidAmount > 0 ? 'text-red-400' : 'text-muted-foreground'}`}>
              {formatCurrency(unpaidAmount)}
            </p>
            <p className="text-xs text-muted-foreground">{t('parties:pending_label')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Transaction history */}
      <Card className="glass">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" /> {t('parties:purchase_history')}
            {transactions.length > 0 && (
              <Badge variant="outline" className="text-xs ml-1">{transactions.length}</Badge>
            )}
            {unpaidAmount > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="ml-auto"
                onClick={() => setMarkAllOpen(true)}
                disabled={markingAll}
              >
                {markingAll ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                {t('parties:mark_all_paid', { defaultValue: 'Mark all as paid' })}
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground space-y-2">
              <ShoppingCart className="h-10 w-10 mx-auto opacity-30" />
              <p className="text-sm">{t('parties:no_purchase_transactions')}</p>
              <p className="text-xs">{t('parties:no_purchase_cutter_desc')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">{t('parties:purchase_col')}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">{t('parties:supplier_col')}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">{t('parties:date_col')}</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">{t('parties:qty_col')}</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">{t('parties:rate_col')}</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">{t('parties:amount_col')}</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase">{t('parties:status_col')}</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase">{t('parties:receipt_col')}</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase">{t('common:action', { defaultValue: 'Action' })}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {transactions.map(tx => {
                    const amount = Number(tx.quantity) * Number(tx.rate);
                    const isPaid = tx.is_paid !== false;
                    const isImage = tx.receipt_url && /\.(jpe?g|png|gif|webp|svg)$/i.test(tx.receipt_url);
                    return (
                      <tr key={tx.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3">
                          {tx.purchase ? (
                            <Link
                              to={`/purchases/${tx.purchase.id}`}
                              className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                            >
                              {tx.purchase.purchase_number}
                              <ExternalLink className="h-3 w-3 shrink-0" />
                            </Link>
                          ) : (
                            <span className="text-sm text-muted-foreground/50">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          {tx.purchase?.party?.name || '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5 shrink-0" />
                            {/* Standalone payments have no linked purchase —
                                fall back to the transaction's own date. */}
                            {formatDate(tx.purchase?.purchase_date ?? tx.created_at)}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-right">
                          {Number(tx.quantity).toLocaleString()} {cutter.unit || ''}
                        </td>
                        <td className="px-4 py-3 text-sm text-right">{formatCurrency(Number(tx.rate))}</td>
                        <td className="px-4 py-3 text-sm text-right font-semibold">{formatCurrency(amount)}</td>
                        <td className="px-4 py-3 text-center">
                          {isPaid ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                              <CheckCircle2 className="h-3 w-3" /> {t('common:status_paid')}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-red-500 bg-red-500/10 px-2 py-0.5 rounded-full">
                              <XCircle className="h-3 w-3" /> {t('common:status_unpaid')}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {tx.receipt_url ? (
                            <a
                              href={tx.receipt_url}
                              target="_blank"
                              rel="noreferrer"
                              title={t('common:view_receipt_title')}
                              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                            >
                              {isImage ? <Image className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
                              {t('parties:view_receipt')}
                            </a>
                          ) : (
                            <span className="text-xs text-muted-foreground/30">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setEditTx(tx)}
                              className="h-7 px-2 text-xs"
                              title="Edit transaction"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            {!isPaid && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleMarkPaid(tx.id)}
                                disabled={payingId === tx.id}
                                className="h-7 px-2 text-xs"
                              >
                                {payingId === tx.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <>
                                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                                    {t('parties:mark_as_paid', { defaultValue: 'Mark as Paid' })}
                                  </>
                                )}
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border bg-muted/30">
                    <td colSpan={3} className="px-4 py-3 text-sm font-semibold">{t('common:total')}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-right">
                      {totalQty.toLocaleString()} {cutter.unit || ''}
                    </td>
                    <td />
                    <td className="px-4 py-3 text-sm font-bold text-right">{formatCurrency(totalEarned)}</td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit dialog */}
      {editOpen && (
        <EditCutterInline
          cutter={cutter}
          onClose={() => setEditOpen(false)}
          onSuccess={updated => {
            setCutter(prev => prev ? { ...prev, ...updated } : updated);
            setEditOpen(false);
          }}
        />
      )}

      {/* Delete confirm */}
      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        title={t('parties:deactivate_cutter')}
        description={t('parties:deactivate_cutter_desc', { name: cutter.name })}
        confirmLabel={t('parties:deactivate_cutter')}
        variant="warning"
      />

      {/* Mark all paid confirm */}
      <ConfirmDialog
        open={markAllOpen}
        onClose={() => setMarkAllOpen(false)}
        onConfirm={handleMarkAllPaid}
        title={t('parties:mark_all_paid', { defaultValue: 'Mark all as paid' })}
        description={t('parties:mark_all_paid_desc', {
          defaultValue: 'Mark all unpaid transactions for {{name}} as paid?',
          name: cutter.name,
        })}
        confirmLabel={t('parties:mark_all_paid', { defaultValue: 'Mark all as paid' })}
      />

      {/* Record Payment dialog */}
      {recordPaymentOpen && (
        <RecordPaymentDialog
          cutterId={cutter.id}
          defaultRate={Number(cutter.rate_per_unit) || 0}
          unit={cutter.unit || 'KG'}
          onClose={() => setRecordPaymentOpen(false)}
          onSuccess={async () => {
            setRecordPaymentOpen(false);
            await fetchCutter();
          }}
        />
      )}

      {/* Edit Transaction dialog */}
      {editTx && (
        <EditTransactionDialog
          cutterId={cutter.id}
          transaction={editTx}
          unit={cutter.unit || 'KG'}
          onClose={() => setEditTx(null)}
          onSuccess={async () => {
            setEditTx(null);
            await fetchCutter();
          }}
        />
      )}
    </div>
  );
}
