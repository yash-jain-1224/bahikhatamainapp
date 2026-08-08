import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Save, Upload, Loader2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Button, Input, Label, Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui';
import { expenseApi } from '@/lib/api';
import type { ExpenseType } from '@/types';
import toast from 'react-hot-toast';

interface CreateExpenseDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  expenseTypes: ExpenseType[];
}

export function CreateExpenseDialog({ open, onClose, onSuccess, expenseTypes }: CreateExpenseDialogProps) {
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
    receiptFile: null as File | null,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.expenseTypeId || !form.amount) {
      toast.error(t('expenses:fill_required'));
      return;
    }

    try {
      setSaving(true);
      let receiptUrl: string | undefined;

      // Upload receipt if provided
      if (form.receiptFile) {
        const { data } = await expenseApi.uploadReceipt(form.receiptFile);
        receiptUrl = data?.data?.url;
      }

      await expenseApi.create({
        expenseTypeId: form.expenseTypeId,
        expenseCategory: form.expenseCategory,
        amount: parseFloat(form.amount),
        expenseDate: form.expenseDate,
        paymentMode: form.paymentMode,
        isPaid: form.isPaid,
        receiptUrl,
        notes: form.notes || undefined,
      });

      toast.success(t('expenses:created_success'));
      setForm({
        expenseTypeId: '',
        expenseCategory: 'INDIRECT',
        amount: '',
        expenseDate: new Date().toISOString().split('T')[0],
        paymentMode: 'CASH',
        isPaid: true,
        notes: '',
        receiptFile: null,
      });
      onSuccess();
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('expenses:create_error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t('expenses:new_expense')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="expenseTypeId">{t('expenses:expense_type')} *</Label>
            <Select value={form.expenseTypeId} onValueChange={(val) => setForm({...form, expenseTypeId: val})}>
              <SelectTrigger>
                <SelectValue placeholder={t('expenses:select_type')} />
              </SelectTrigger>
              <SelectContent>
                {expenseTypes.map(et => (
                  <SelectItem key={et.id} value={et.id}>{et.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="expenseCategory">{t('expenses:category')} *</Label>
            <Select value={form.expenseCategory} onValueChange={(val) => setForm({...form, expenseCategory: val as 'DIRECT' | 'INDIRECT'})}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DIRECT">{t('expenses:direct')}</SelectItem>
                <SelectItem value="INDIRECT">{t('expenses:indirect')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="amount">{t('expenses:amount')} *</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0"
                value={form.amount}
                onChange={e => setForm({...form, amount: e.target.value})}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="expenseDate">{t('common:date')} *</Label>
              <Input
                id="expenseDate"
                type="date"
                value={form.expenseDate}
                onChange={e => setForm({...form, expenseDate: e.target.value})}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="paymentMode">{t('expenses:payment_mode')}</Label>
              <Select value={form.paymentMode} onValueChange={(val) => setForm({...form, paymentMode: val})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
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
              <Label htmlFor="isPaid">{t('expenses:payment_status')}</Label>
              <Select value={form.isPaid.toString()} onValueChange={(val) => setForm({...form, isPaid: val === 'true'})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">{t('expenses:paid')}</SelectItem>
                  <SelectItem value="false">{t('expenses:unpaid')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="receipt">{t('expenses:receipt')}</Label>
            <div className="flex gap-2">
              <Input
                id="receipt"
                type="file"
                accept="image/*,application/pdf"
                onChange={e => setForm({...form, receiptFile: e.target.files?.[0] || null})}
              />
              {form.receiptFile && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setForm({...form, receiptFile: null})}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">{t('common:notes')}</Label>
            <Input
              id="notes"
              value={form.notes}
              onChange={e => setForm({...form, notes: e.target.value})}
              placeholder={t('expenses:notes_placeholder')}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              {t('common:cancel')}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              {t('common:save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
