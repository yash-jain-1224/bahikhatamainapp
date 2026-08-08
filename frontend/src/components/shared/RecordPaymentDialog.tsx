import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Input, Label, Select, SelectTrigger, SelectValue, SelectContent, SelectItem, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui';
import { billingApi, profileApi } from '@/lib/api';
import { IndianRupee, ArrowDownLeft, ArrowUpRight, Paperclip, X, FileText, Image, ChevronDown, ChevronUp, CheckSquare, Square } from 'lucide-react';
import { useFormErrors } from '@/hooks';
import { formatCurrency, formatDate } from '@/utils';
import type { Party } from '@/types';
import toast from 'react-hot-toast';

interface OutstandingBill {
  id: string;
  ref: string;
  date: string;
  total: number;
  paid: number;
  balance: number;
  status: string;
  type: 'SALE' | 'PURCHASE';
}

interface RecordPaymentDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  defaultPartyId?: string;
  defaultType?: 'IN' | 'OUT';
  referenceType?: 'PURCHASE' | 'SALE';
  referenceId?: string;
  defaultAmount?: number;
}

export function RecordPaymentDialog({ open, onClose, onSuccess, defaultPartyId, defaultType, referenceType, referenceId, defaultAmount }: RecordPaymentDialogProps) {
  const { t } = useTranslation(['payments', 'common']);
  const [loading, setLoading] = useState(false);
  const [parties, setParties] = useState<Party[]>([]);
  const [bills, setBills] = useState<OutstandingBill[]>([]);
  const [billsLoading, setBillsLoading] = useState(false);
  const [showBills, setShowBills] = useState(true);
  const [allocations, setAllocations] = useState<Record<string, number>>({});
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const receiptInputRef = useRef<HTMLInputElement>(null);
  const { errors, clearError, validate } = useFormErrors<'party_id' | 'amount'>();

  const [form, setForm] = useState({
    type: (defaultType || 'IN') as 'IN' | 'OUT',
    party_id: defaultPartyId || '',
    amount: defaultAmount || 0,
    date: new Date().toISOString().split('T')[0],
    mode: 'CASH',
    reference: '',
    notes: '',
  });

  useEffect(() => {
    if (open) {
      fetchParties();
      setReceiptFile(null);
      setAllocations({});
      setBills([]);
      setForm(prev => ({
        ...prev,
        type: defaultType || 'IN',
        party_id: defaultPartyId || '',
        amount: defaultAmount || 0,
      }));
    }
  }, [open, defaultPartyId, defaultType, defaultAmount]);

  // Fetch outstanding bills whenever party or type changes
  useEffect(() => {
    if (form.party_id && open) {
      fetchBills(form.party_id, form.type);
    } else {
      setBills([]);
      setAllocations({});
    }
  }, [form.party_id, form.type, open]);

  // If opened with a specific referenceId, pre-fill as a single allocation
  useEffect(() => {
    if (referenceId && defaultAmount && defaultAmount > 0) {
      setAllocations({ [referenceId]: defaultAmount });
    }
  }, [referenceId, defaultAmount]);

  const fetchParties = async () => {
    try {
      const { data } = await profileApi.parties();
      setParties(data?.data || []);
    } catch { /* ignore */ }
  };

  const fetchBills = async (partyId: string, type: 'IN' | 'OUT') => {
    try {
      setBillsLoading(true);
      const { data } = await billingApi.partyOutstandingBills(partyId, type);
      const fetched: OutstandingBill[] = data?.data || [];
      setBills(fetched);
      // If opened for a specific reference, keep that allocation; otherwise clear
      if (!referenceId) {
        setAllocations({});
      }
    } catch {
      setBills([]);
    } finally {
      setBillsLoading(false);
    }
  };

  // Total allocated across all bills
  const totalAllocated = Object.values(allocations).reduce((s, v) => s + (v || 0), 0);

  // Sync form.amount with total allocated (or keep manual if no bills)
  const handleAllocationChange = useCallback((billId: string, value: string) => {
    const num = parseFloat(value) || 0;
    const bill = bills.find(b => b.id === billId);
    const capped = bill ? Math.min(num, bill.balance) : num;
    setAllocations(prev => ({ ...prev, [billId]: capped }));
    clearError('amount');
  }, [bills, clearError]);

  // "Pay full balance" for a single bill
  const allocateFull = (bill: OutstandingBill) => {
    setAllocations(prev => ({ ...prev, [bill.id]: bill.balance }));
    clearError('amount');
  };

  // Toggle bill in/out of allocations
  const toggleBill = (bill: OutstandingBill) => {
    setAllocations(prev => {
      if (prev[bill.id] !== undefined) {
        const next = { ...prev };
        delete next[bill.id];
        return next;
      }
      return { ...prev, [bill.id]: bill.balance };
    });
    clearError('amount');
  };

  // Effective amount: if bills exist use totalAllocated, else use form.amount
  const effectiveAmount = bills.length > 0 ? totalAllocated : form.amount;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = validate({
      party_id: [!form.party_id, 'Select a party'],
      amount: [effectiveAmount <= 0, 'Enter or allocate a valid amount'],
    });
    if (!ok) return;

    try {
      setLoading(true);

      // Case 1: specific single reference from parent (purchase/sale detail page)
      if (referenceType && referenceId && bills.length === 0) {
        const payload: any = {
          referenceType,
          referenceId,
          paymentMode: form.mode,
          amount: form.amount,
          paymentDate: form.date,
          transactionRef: form.reference,
          notes: form.notes,
        };
        if (referenceType === 'PURCHASE') payload.payeePartyId = form.party_id;
        else payload.payerPartyId = form.party_id;
        const { data } = await billingApi.createPayment(payload);
        if (receiptFile && data?.data?.id) {
          try { await billingApi.uploadReceipt(data.data.id, receiptFile); } catch { /* non-fatal */ }
        }
      }
      // Case 2: allocations across multiple bills
      else if (bills.length > 0 && totalAllocated > 0) {
        const allocationList = Object.entries(allocations)
          .filter(([, amt]) => amt > 0)
          .map(([billId, amount]) => {
            const bill = bills.find(b => b.id === billId)!;
            return { referenceId: billId, referenceType: bill.type, amount };
          });

        if (allocationList.length === 0) {
          toast.error(t('payments:allocate_error'));
          return;
        }

        const { data } = await billingApi.createBulkPayment({
          type: form.type,
          party_id: form.party_id,
          mode: form.mode,
          date: form.date,
          reference: form.reference,
          notes: form.notes,
          allocations: allocationList,
        });

        // Upload receipt to first payment if provided
        if (receiptFile && data?.data?.payments?.[0]?.id) {
          try { await billingApi.uploadReceipt(data.data.payments[0].id, receiptFile); } catch { /* non-fatal */ }
        }
      }
      // Case 3: no bills / quick payment
      else {
        const { data } = await billingApi.createPayment({
          type: form.type,
          party_id: form.party_id,
          amount: form.amount,
          date: form.date,
          mode: form.mode,
          reference: form.reference,
          notes: form.notes,
        });
        if (receiptFile && data?.data?.id) {
          try { await billingApi.uploadReceipt(data.data.id, receiptFile); } catch { /* non-fatal */ }
        }
      }

      toast.success(form.type === 'IN' ? t('common:payment_received_success') : t('common:payment_made_success'));
      onSuccess?.();
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('common:payment_record_error'));
    } finally {
      setLoading(false);
    }
  };

  const hasBills = bills.length > 0;
  const allocatedBillIds = new Set(Object.keys(allocations).filter(k => (allocations[k] || 0) > 0));

  return (
    <Dialog open={open} onOpenChange={(val: boolean) => !val && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('common:record_payment')}</DialogTitle>
          <DialogDescription>{t('payments:record_payment_desc', { defaultValue: 'Record money received or paid to a party.' })}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Payment Type Toggle */}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setForm(p => ({ ...p, type: 'IN' }))}
              className={`flex items-center justify-center gap-2 p-3 rounded-lg border text-sm font-medium transition-all ${
                form.type === 'IN' ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400' : 'border-border hover:bg-muted'
              }`}>
              <ArrowDownLeft className="h-4 w-4" /> {t('common:money_in')}
            </button>
            <button type="button" onClick={() => setForm(p => ({ ...p, type: 'OUT' }))}
              className={`flex items-center justify-center gap-2 p-3 rounded-lg border text-sm font-medium transition-all ${
                form.type === 'OUT' ? 'border-red-500 bg-red-500/10 text-red-400' : 'border-border hover:bg-muted'
              }`}>
              <ArrowUpRight className="h-4 w-4" /> {t('common:money_out')}
            </button>
          </div>

          {/* Party */}
          <div>
            <Label>{t('ledger:party')} *</Label>
            <Select value={form.party_id} onValueChange={(val) => { setForm(p => ({ ...p, party_id: val })); clearError('party_id'); }}>
              <SelectTrigger className="mt-1.5" error={errors.party_id}>
                <SelectValue placeholder={t('common:select_party')} />
              </SelectTrigger>
              <SelectContent>
                {parties.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Outstanding Bills Section */}
          {form.party_id && (
            <div className="rounded-xl border border-border overflow-hidden">
              <button
                type="button"
                onClick={() => setShowBills(v => !v)}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-muted/40 hover:bg-muted/60 transition-colors text-sm font-medium"
              >
                <span className="flex items-center gap-2">
                  {t('common:outstanding_bills')}
                  {hasBills && (
                    <span className="px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-500 text-xs font-semibold">
                      {bills.length}
                    </span>
                  )}
                </span>
                {showBills ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </button>

              {showBills && (
                <div className="divide-y divide-border">
                  {billsLoading ? (
                    <div className="px-4 py-6 text-center text-sm text-muted-foreground animate-pulse">{t('common:loading_bills')}</div>
                  ) : !hasBills ? (
                    <div className="px-4 py-4 text-center text-sm text-muted-foreground">
                      {form.type === 'IN' ? t('common:no_outstanding_sales') : t('common:no_outstanding_purchases')}
                    </div>
                  ) : (
                    <>
                      {/* Column headers */}
                      <div className="grid grid-cols-[1fr_80px_80px_100px] gap-2 px-4 py-1.5 bg-muted/20 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                        <div>{t('common:bill')}</div>
                        <div className="text-right">{t('common:balance')}</div>
                        <div className="text-right">{t('common:allocate')}</div>
                        <div></div>
                      </div>

                      {bills.map(bill => {
                        const isSelected = allocatedBillIds.has(bill.id);
                        const alloc = allocations[bill.id] ?? 0;
                        return (
                          <div key={bill.id}
                            className={`grid grid-cols-[1fr_80px_80px_100px] gap-2 items-center px-4 py-2.5 transition-colors ${
                              isSelected ? 'bg-primary/5' : 'hover:bg-muted/30'
                            }`}>
                            {/* Bill info */}
                            <div className="min-w-0">
                              <button type="button" onClick={() => toggleBill(bill)} className="flex items-start gap-2 text-left w-full">
                                <div className="mt-0.5 shrink-0">
                                  {isSelected
                                    ? <CheckSquare className="h-4 w-4 text-primary" />
                                    : <Square className="h-4 w-4 text-muted-foreground" />
                                  }
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-medium truncate">{bill.ref}</p>
                                  <p className="text-[11px] text-muted-foreground">{formatDate(bill.date)}</p>
                                </div>
                              </button>
                            </div>

                            {/* Balance */}
                            <div className="text-right">
                              <p className="text-sm font-semibold text-amber-500">{formatCurrency(bill.balance)}</p>
                              <p className="text-[10px] text-muted-foreground">{t('common:of_total', { amount: formatCurrency(bill.total) })}</p>
                            </div>

                            {/* Allocation input */}
                            <div>
                              <Input
                                type="number"
                                min={0}
                                max={bill.balance}
                                step="0.01"
                                placeholder="0"
                                value={alloc || ''}
                                onChange={e => handleAllocationChange(bill.id, e.target.value)}
                                onFocus={() => { if (!allocations[bill.id]) setAllocations(p => ({ ...p, [bill.id]: bill.balance })); }}
                                className="h-8 text-xs text-right px-2"
                              />
                            </div>

                            {/* Full button */}
                            <div className="flex justify-end">
                              <button
                                type="button"
                                onClick={() => allocateFull(bill)}
                                className="text-[11px] px-2 py-1 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-medium"
                              >
                                {t('common:pay_full')}
                              </button>
                            </div>
                          </div>
                        );
                      })}

                      {/* Allocation total */}
                      {totalAllocated > 0 && (
                        <div className="flex items-center justify-between px-4 py-2.5 bg-primary/5 border-t border-primary/10">
                          <span className="text-sm font-medium text-primary">{t('common:total_allocated')}</span>
                          <span className="text-base font-bold text-primary">{formatCurrency(totalAllocated)}</span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Amount */}
          {(!hasBills || totalAllocated === 0) && (
            <div>
              <Label>{t('common:amount')} (₹) *</Label>
              <Input
                icon={<IndianRupee className="h-4 w-4" />}
                type="number"
                className="mt-1.5 text-lg"
                placeholder="0"
                value={form.amount || ''}
                onChange={(e) => { setForm(p => ({ ...p, amount: parseFloat(e.target.value) || 0 })); clearError('amount'); }}
                error={errors.amount}
              />
              {errors.amount && <p className="mt-1 text-xs text-red-400">{errors.amount}</p>}
            </div>
          )}

          {/* Date + Mode */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>{t('common:date')}</Label>
              <Input type="date" className="mt-1.5" value={form.date}
                onChange={(e) => setForm(p => ({ ...p, date: e.target.value }))} />
            </div>
            <div>
              <Label>{t('payments:mode')}</Label>
              <Select value={form.mode} onValueChange={(val) => setForm(p => ({ ...p, mode: val }))}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CASH">💵 {t('payments:mode_cash')}</SelectItem>
                  <SelectItem value="UPI">📱 {t('payments:mode_upi')}</SelectItem>
                  <SelectItem value="BANK_TRANSFER">🏦 {t('payments:mode_bank')}</SelectItem>
                  <SelectItem value="CARD">💳 {t('payments:mode_card')}</SelectItem>
                  <SelectItem value="CHEQUE">📝 {t('payments:mode_cheque')}</SelectItem>
                  <SelectItem value="CREDIT">🔄 {t('payments:mode_credit')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Reference */}
          <div>
            <Label>{t('payments:reference_notes')}</Label>
            <Input className="mt-1.5" placeholder={t('payments:reference_placeholder')}
              value={form.reference} onChange={(e) => setForm(p => ({ ...p, reference: e.target.value }))} />
          </div>

          {/* Receipt Upload */}
          <div>
            <Label>{t('common:payment_receipt')} <span className="text-muted-foreground text-xs">({t('common:optional')})</span></Label>
            <input ref={receiptInputRef} type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
              className="hidden" onChange={(e) => setReceiptFile(e.target.files?.[0] || null)} />
            {receiptFile ? (
              <div className="mt-1.5 flex items-center gap-2 p-2.5 rounded-lg border border-border bg-muted/30">
                <div className="h-8 w-8 rounded bg-primary/10 flex items-center justify-center shrink-0">
                  {receiptFile.type.startsWith('image/') ? <Image className="h-4 w-4 text-primary" /> : <FileText className="h-4 w-4 text-primary" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{receiptFile.name}</p>
                  <p className="text-[10px] text-muted-foreground">{(receiptFile.size / 1024).toFixed(0)} KB</p>
                </div>
                <button type="button"
                  onClick={() => { setReceiptFile(null); if (receiptInputRef.current) receiptInputRef.current.value = ''; }}
                  className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => receiptInputRef.current?.click()}
                className="mt-1.5 w-full flex items-center justify-center gap-2 p-2.5 rounded-lg border border-dashed border-border hover:border-primary/50 hover:bg-primary/5 transition-colors text-sm text-muted-foreground hover:text-foreground">
                <Paperclip className="h-4 w-4" />
                {t('common:attach_receipt')}
              </button>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>{t('common:cancel')}</Button>
            <Button type="submit" loading={loading} variant={form.type === 'IN' ? 'success' : 'default'}>
              {hasBills && totalAllocated > 0
                ? `${form.type === 'IN' ? t('payments:tab_received') : t('payments:tab_paid')} ${formatCurrency(totalAllocated)}`
                : form.type === 'IN' ? t('common:record_received') : t('common:record_payment')
              }
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
