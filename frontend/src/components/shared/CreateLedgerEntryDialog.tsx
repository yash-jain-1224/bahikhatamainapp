import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Input, Label, Textarea, Select, SelectTrigger, SelectValue, SelectContent, SelectItem, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui';
import { ledgerApi, profileApi } from '@/lib/api';
import { IndianRupee, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { useFormErrors } from '@/hooks';
import type { Party } from '@/types';
import toast from 'react-hot-toast';

interface CreateLedgerEntryDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function CreateLedgerEntryDialog({ open, onClose, onSuccess }: CreateLedgerEntryDialogProps) {
  const [loading, setLoading] = useState(false);
  const [parties, setParties] = useState<Party[]>([]);
  const { errors, clearError, validate } = useFormErrors<'amount' | 'narration'>();
  const { t } = useTranslation(['ledger', 'common']);

  const [form, setForm] = useState({
    entry_type: 'DEBIT' as 'DEBIT' | 'CREDIT',
    account_type: 'EXPENSE',
    amount: 0,
    entry_date: new Date().toISOString().split('T')[0],
    party_id: '',
    narration: '',
  });

  useEffect(() => {
    if (open) {
      profileApi.parties()
        .then(({ data }) => setParties(data?.data || []))
        .catch(() => {});
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = validate({
      amount: [form.amount <= 0, t('ledger:enter_valid_amount')],
      narration: [!form.narration.trim(), t('ledger:enter_narration')],
    });
    if (!ok) return;

    try {
      setLoading(true);
      // ledger-service reads camelCase (data.entryType / accountType /
      // entryDate / partyId). Posting the snake_case form state made every
      // manual entry fail with a 500, so entries could never be created.
      await ledgerApi.createEntry({
        entryType: form.entry_type,
        accountType: form.account_type,
        amount: Number(form.amount),
        entryDate: new Date(form.entry_date).toISOString(),
        // "__none__" is the Select's placeholder value (Radix forbids an empty
        // string as an item value). It is truthy, so it used to be posted as a
        // literal party id — which the server now rejects as a missing party,
        // and previously blew up on the foreign key.
        partyId: form.party_id && form.party_id !== '__none__' ? form.party_id : undefined,
        narration: form.narration,
      });
      toast.success(t('ledger:entry_created'));
      setForm({
        entry_type: 'DEBIT',
        account_type: 'EXPENSE',
        amount: 0,
        entry_date: new Date().toISOString().split('T')[0],
        party_id: '',
        narration: '',
      });
      onSuccess?.();
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('ledger:entry_create_error'));
    } finally {
      setLoading(false);
    }
  };

  // Must be AccountType enum members. Five of the seven options that used to be
  // here — SALE, PAYMENT_IN, PAYMENT_OUT, ADJUSTMENT and OTHER — are not in the
  // enum, so picking any of them wrote an invalid value and the entry failed.
  // Only PURCHASE and EXPENSE ever worked.
  const accountTypes = [
    { value: 'CASH', label: t('ledger:account_cash') },
    { value: 'BANK', label: t('ledger:account_bank') },
    { value: 'PARTY_RECEIVABLE', label: t('ledger:account_receivable') },
    { value: 'PARTY_PAYABLE', label: t('ledger:account_payable') },
    { value: 'SALES', label: t('ledger:account_sale') },
    { value: 'PURCHASE', label: t('ledger:account_purchase') },
    { value: 'EXPENSE', label: t('ledger:account_expense') },
    { value: 'INCOME', label: t('ledger:account_income') },
    { value: 'INVENTORY', label: t('ledger:account_inventory') },
  ];

  return (
    <Dialog open={open} onOpenChange={(val: boolean) => !val && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('ledger:new_ledger_entry')}</DialogTitle>
          <DialogDescription>{t('ledger:new_ledger_entry_desc')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Entry Type Toggle */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setForm(p => ({ ...p, entry_type: 'DEBIT' }))}
              className={`flex items-center justify-center gap-2 p-3 rounded-lg border text-sm font-medium transition-all ${
                form.entry_type === 'DEBIT'
                  ? 'border-red-500 bg-red-500/10 text-red-400'
                  : 'border-border hover:bg-muted'
              }`}
            >
              <ArrowUpRight className="h-4 w-4" /> {t('ledger:debit')}
            </button>
            <button
              type="button"
              onClick={() => setForm(p => ({ ...p, entry_type: 'CREDIT' }))}
              className={`flex items-center justify-center gap-2 p-3 rounded-lg border text-sm font-medium transition-all ${
                form.entry_type === 'CREDIT'
                  ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                  : 'border-border hover:bg-muted'
              }`}
            >
              <ArrowDownLeft className="h-4 w-4" /> {t('ledger:credit')}
            </button>
          </div>

          <div>
            <Label>{t('ledger:account_type')}</Label>
            <Select value={form.account_type} onValueChange={(val) => setForm(p => ({ ...p, account_type: val }))}>
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {accountTypes.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>{t('common:amount')} *</Label>
            <Input
              icon={<IndianRupee className="h-4 w-4" />}
              type="number"
              className="mt-1.5"
              placeholder="0"
              value={form.amount || ''}
              onChange={(e) => { setForm(p => ({ ...p, amount: parseFloat(e.target.value) || 0 })); clearError('amount'); }}
              error={errors.amount}
            />
          </div>

          <div>
            <Label>{t('common:date')}</Label>
            <Input
              type="date"
              className="mt-1.5"
              value={form.entry_date}
              onChange={(e) => setForm(p => ({ ...p, entry_date: e.target.value }))}
            />
          </div>

          <div>
            <Label>{t('ledger:party_optional')}</Label>
            <Select value={form.party_id} onValueChange={(val) => setForm(p => ({ ...p, party_id: val }))}>
              <SelectTrigger className="mt-1.5">
                <SelectValue placeholder={t('common:select_party')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{t('common:no_party')}</SelectItem>
                {parties.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>{t('ledger:narration')} *</Label>
            <Textarea
              className="mt-1.5"
              placeholder={t('ledger:narration_placeholder')}
              value={form.narration}
              onChange={(e) => { setForm(p => ({ ...p, narration: e.target.value })); clearError('narration'); }}
              error={errors.narration}
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>{t('common:cancel')}</Button>
            <Button type="submit" loading={loading}>{t('ledger:create_entry_btn')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
