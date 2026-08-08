import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Input, Label, Select, SelectTrigger, SelectValue, SelectContent, SelectItem, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui';
import { inventoryApi } from '@/lib/api';
import { Package } from 'lucide-react';
import type { InventoryItem } from '@/types';
import toast from 'react-hot-toast';

interface EditInventoryItemDialogProps {
  open: boolean;
  item: InventoryItem;
  onClose: () => void;
  onSuccess?: () => void;
}

export function EditInventoryItemDialog({ open, item, onClose, onSuccess }: EditInventoryItemDialogProps) {
  const { t } = useTranslation(['inventory', 'common']);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: item.name,
    sku: item.sku || '',
    unit: item.unit,
    min_stock: item.min_stock,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error(t('common:name_required'));

    try {
      setLoading(true);
      // camelCase — the service reads data.minStock, so min_stock was ignored.
      await inventoryApi.updateItem(item.id, {
        name: form.name,
        sku: form.sku || undefined,
        unit: form.unit,
        minStock: Number(form.min_stock) || 0,
      });
      toast.success(t('inventory:item_updated'));
      onSuccess?.();
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('inventory:item_update_error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-primary/10 text-primary shrink-0">
              <Package className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle>{t('inventory:edit_item_title')}</DialogTitle>
              <DialogDescription>{t('inventory:edit_item_desc')}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>{t('common:name')} *</Label>
            <Input
              className="mt-1.5"
              placeholder={t('inventory:item_name_placeholder')}
              value={form.name}
              onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>{t('inventory:sku')}</Label>
              <Input
                className="mt-1.5"
                placeholder={t('inventory:sku_placeholder')}
                value={form.sku}
                onChange={(e) => setForm(p => ({ ...p, sku: e.target.value }))}
              />
            </div>
            <div>
              <Label>{t('inventory:unit_label')} *</Label>
              <Select value={form.unit} onValueChange={(val) => setForm(p => ({ ...p, unit: val }))}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Kg">{t('inventory:unit_kg')}</SelectItem>
                  <SelectItem value="Quintal">{t('inventory:unit_quintal')}</SelectItem>
                  <SelectItem value="Ton">{t('inventory:unit_ton')}</SelectItem>
                  <SelectItem value="Litre">{t('inventory:unit_litre')}</SelectItem>
                  <SelectItem value="Piece">{t('inventory:unit_piece')}</SelectItem>
                  <SelectItem value="Bag">{t('inventory:unit_bag')}</SelectItem>
                  <SelectItem value="Box">{t('inventory:unit_box')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>{t('inventory:min_stock_alert_label')}</Label>
            <Input
              className="mt-1.5"
              type="number"
              placeholder={t('inventory:min_stock_level')}
              value={form.min_stock}
              onChange={(e) => setForm(p => ({ ...p, min_stock: Number(e.target.value) }))}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>{t('common:cancel')}</Button>
            <Button type="submit" loading={loading}>{t('common:save_changes')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
