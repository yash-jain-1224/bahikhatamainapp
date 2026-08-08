import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowUpDown, Save, Plus, Minus } from 'lucide-react';
import { Button, Input, Card, CardContent, CardHeader, CardTitle, Select, SelectTrigger, SelectValue, SelectContent, SelectItem, Label, Textarea } from '@/components/ui';
import { inventoryApi } from '@/lib/api';
import { useFormErrors } from '@/hooks';
import type { InventoryItem } from '@/types';
import toast from 'react-hot-toast';

export default function StockAdjustPage() {
  const navigate = useNavigate();
  const { t } = useTranslation(['inventory', 'common']);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const { errors, clearError, validate } = useFormErrors<'item_id' | 'quantity' | 'reason'>();

  const [form, setForm] = useState({
    item_id: '',
    type: 'ADD' as 'ADD' | 'REMOVE',
    quantity: 0,
    reason: '',
    notes: '',
  });

  useEffect(() => {
    fetchItems();
  }, []);

  const fetchItems = async () => {
    try {
      // Without an explicit limit this dropdown showed only the first 20 items,
      // so anything beyond that could not be adjusted at all.
      const { data } = await inventoryApi.listItems({ limit: 500 });
      setItems(data?.data || []);
    } catch {
      // No sample data (see InventoryPage): the old fallback offered invented
      // items whose ids would be submitted as real itemIds.
      setItems([]);
      toast.error(t('inventory:load_failed'));
    }
  };

  const selectedItem = items.find(i => i.id === form.item_id);
  const newStock = selectedItem
    ? form.type === 'ADD'
      ? selectedItem.current_stock + form.quantity
      : selectedItem.current_stock - form.quantity
    : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = validate({
      item_id: [!form.item_id, t('inventory:select_item_error')],
      quantity: [form.quantity <= 0, t('inventory:quantity_error')],
      reason: [!form.reason, t('inventory:reason_error')],
    });
    if (!ok) return;
    if (form.type === 'REMOVE' && selectedItem && form.quantity > selectedItem.current_stock) {
      return toast.error(t('inventory:remove_exceeds_stock'));
    }

    try {
      setLoading(true);
      // The service reads data.itemId; posting the raw snake_case form state
      // meant itemId was undefined and every adjustment failed with a 500.
      await inventoryApi.adjustStock({
        itemId: form.item_id,
        type: form.type,
        quantity: Number(form.quantity),
        reason: form.reason,
        notes: form.notes || undefined,
      });
      toast.success(t('inventory:stock_adjusted'));
      navigate('/inventory');
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('inventory:stock_adjust_error'));
    } finally {
      setLoading(false);
    }
  };

  const reasons = [
    t('inventory:reason_purchase_return'),
    t('inventory:reason_sale_return'),
    t('inventory:reason_damage'),
    t('inventory:reason_manual_count'),
    t('inventory:reason_opening_stock'),
    t('inventory:reason_transfer'),
    t('inventory:reason_other'),
  ];

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/inventory')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h2 className="text-2xl font-bold">{t('inventory:adjust_stock_title')}</h2>
          <p className="text-muted-foreground">{t('inventory:adjust_stock_subtitle')}</p>
        </div>
      </div>

      <Card className="glass">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ArrowUpDown className="h-5 w-5" /> {t('inventory:stock_adjustment')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Item Select */}
            <div>
              <Label>{t('inventory:select_item')} *</Label>
              <Select value={form.item_id} onValueChange={(val) => { setForm(p => ({ ...p, item_id: val })); clearError('item_id'); }}>
                <SelectTrigger className="mt-1.5" error={errors.item_id}>
                  <SelectValue placeholder={t('inventory:select_inventory_item')} />
                </SelectTrigger>
                <SelectContent>
                  {items.map(item => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name} ({item.current_stock} {item.unit})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Current Stock Display */}
            {selectedItem && (
              <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/30 border border-border">
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground">{t('inventory:current_stock_label')}</p>
                  <p className="text-xl font-bold">{selectedItem.current_stock} {selectedItem.unit}</p>
                </div>
                <div className="text-2xl text-muted-foreground">→</div>
                <div className="flex-1 text-right">
                  <p className="text-xs text-muted-foreground">{t('inventory:new_stock_label')}</p>
                  <p className={`text-xl font-bold ${newStock < 0 ? 'text-red-400' : newStock <= selectedItem.min_stock ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {form.quantity > 0 ? newStock : selectedItem.current_stock} {selectedItem.unit}
                  </p>
                </div>
              </div>
            )}

            {/* Adjustment Type */}
            <div>
              <Label>{t('inventory:adjustment_type')} *</Label>
              <div className="grid grid-cols-2 gap-3 mt-1.5">
                <button
                  type="button"
                  onClick={() => setForm(p => ({ ...p, type: 'ADD' }))}
                  className={`flex items-center justify-center gap-2 p-3 rounded-lg border text-sm font-medium transition-all ${
                    form.type === 'ADD'
                      ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                      : 'border-border hover:bg-muted'
                  }`}
                >
                  <Plus className="h-4 w-4" /> {t('inventory:add_stock')}
                </button>
                <button
                  type="button"
                  onClick={() => setForm(p => ({ ...p, type: 'REMOVE' }))}
                  className={`flex items-center justify-center gap-2 p-3 rounded-lg border text-sm font-medium transition-all ${
                    form.type === 'REMOVE'
                      ? 'border-red-500 bg-red-500/10 text-red-400'
                      : 'border-border hover:bg-muted'
                  }`}
                >
                  <Minus className="h-4 w-4" /> {t('inventory:remove_stock')}
                </button>
              </div>
            </div>

            {/* Quantity */}
            <div>
              <Label>{t('inventory:quantity_label')} *</Label>
              <Input
                type="number"
                className="mt-1.5"
                placeholder={t('inventory:enter_quantity')}
                value={form.quantity || ''}
                onChange={(e) => { setForm(p => ({ ...p, quantity: parseFloat(e.target.value) || 0 })); clearError('quantity'); }}
                error={errors.quantity}
              />
            </div>

            {/* Reason */}
            <div>
              <Label>{t('inventory:reason_label')} *</Label>
              <Select value={form.reason} onValueChange={(val) => { setForm(p => ({ ...p, reason: val })); clearError('reason'); }}>
                <SelectTrigger className="mt-1.5" error={errors.reason}>
                  <SelectValue placeholder={t('inventory:select_reason')} />
                </SelectTrigger>
                <SelectContent>
                  {reasons.map(r => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Notes */}
            <div>
              <Label>{t('inventory:notes_optional')}</Label>
              <Textarea
                className="mt-1.5"
                placeholder={t('inventory:notes_placeholder')}
                value={form.notes}
                onChange={(e) => setForm(p => ({ ...p, notes: e.target.value }))}
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => navigate('/inventory')}>{t('common:cancel')}</Button>
              <Button type="submit" loading={loading}>
                <Save className="h-4 w-4 mr-2" /> {t('inventory:adjust_stock')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
