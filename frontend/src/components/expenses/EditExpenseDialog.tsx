import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Save, Loader2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Button, Input, Label, Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui';
import { expenseApi } from '@/lib/api';
import type { ExpenseType } from '@/types';
import toast from 'react-hot-toast';

/**
 * Edit a standalone expense.
 *
 * The Edit button and every row click used to `navigate('/expenses/' + id)`, a
 * route that was never registered — so both landed on the 404 page and
 * `expenseApi.update` had no caller at all. Editing an expense was impossible.
 * A dialog rather than a detail page: the row already holds everything the form
 * needs, and it keeps the user in the list they were working through.
 */
interface EditExpenseDialogProps {
  expense: any | null;
  onClose: () => void;
  onSuccess: () => void;
  expenseTypes: ExpenseType[];
}

export function EditExpenseDialog({ expense, onClose, onSuccess, expenseTypes }: EditExpenseDialogProps) {
  const { t } = useTranslation(['expenses', 'common']);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    expenseTypeId: '',
    expenseCategory: 'INDIRECT' as 'DIRECT' | 'INDIRECT',
    amount: '',
    expenseDate: new Date().toISOString().split('T')[0],
    paymentMode: 'CASH',
    isPaid: true,
    notes: '',
  });

  useEffect(() => {
    if (!expense) return;
    setForm({
      expenseTypeId: expense.expense_type_id || expense.expenseType?.id || '',
      expenseCategory: (expense.expense_category || 'INDIRECT') as 'DIRECT' | 'INDIRECT',
      amount: String(expense.amount ?? ''),
      expenseDate: (expense.expense_date || new Date().toISOString()).split('T')[0],
      paymentMode: expense.payment_mode || 'CASH',
      isPaid: expense.is_paid ?? true,
      notes: expense.notes || '',
    });
  }, [expense?.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.expenseTypeId || !form.amount) {
      toast.error(t('expenses:fill_required'));
      return;
    }
    try {
      setSaving(true);
      await expenseApi.update(expense.id, {
        expenseTypeId: form.expenseTypeId,
        expenseCategory: form.expenseCategory,
        amount: parseFloat(form.amount),
        expenseDate: form.expenseDate,
        paymentMode: form.paymentMode,
        isPaid: form.isPaid,
        notes: form.notes || undefined,
      });
      toast.success(t('expenses:updated_success'));
      onSuccess();
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('expenses:update_error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!expense} onOpenChange={(v: boolean) => !v && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t('expenses:edit_expense')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>{t('expenses:expense_type')} *</Label>
            <Select value={form.expenseTypeId} onValueChange={(val) => setForm({ ...form, expenseTypeId: val })}>
              <SelectTrigger><SelectValue placeholder={t('expenses:select_type')} /></SelectTrigger>
              <SelectContent>
                {expenseTypes.map(et => (
                  <SelectItem key={et.id} value={et.id}>{et.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t('expenses:category')} *</Label>
            <Select
              value={form.expenseCategory}
              onValueChange={(val) => setForm({ ...form, expenseCategory: val as 'DIRECT' | 'INDIRECT' })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="DIRECT">{t('expenses:direct')}</SelectItem>
                <SelectItem value="INDIRECT">{t('expenses:indirect')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('expenses:amount')} *</Label>
              <Input
                type="number" step="0.01" min="0"
                value={form.amount}
                onChange={e => setForm({ ...form, amount: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('common:date')} *</Label>
              <Input
                type="date"
                value={form.expenseDate}
                onChange={e => setForm({ ...form, expenseDate: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('expenses:payment_mode')}</Label>
              <Select value={form.paymentMode} onValueChange={(val) => setForm({ ...form, paymentMode: val })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CASH">{t('common:cash')}</SelectItem>
                  <SelectItem value="UPI">{t('common:upi')}</SelectItem>
                  <SelectItem value="BANK_TRANSFER">{t('common:bank')}</SelectItem>
                  <SelectItem value="CARD">{t('common:card')}</SelectItem>
                  <SelectItem value="CHEQUE">{t('common:cheque')}</SelectItem>
                  <SelectItem value="CREDIT">{t('common:credit')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('expenses:payment_status')}</Label>
              <Select
                value={form.isPaid.toString()}
                onValueChange={(val) => setForm({ ...form, isPaid: val === 'true' })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">{t('expenses:paid')}</SelectItem>
                  <SelectItem value="false">{t('expenses:unpaid')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t('common:notes')}</Label>
            <Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              {t('common:cancel')}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              {t('common:save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
