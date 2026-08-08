import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Save, Package, Plus } from 'lucide-react';
import { Button, Input, Card, CardContent, CardHeader, CardTitle, Select, SelectTrigger, SelectValue, SelectContent, SelectItem, Label, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui';
import { inventoryApi } from '@/lib/api';
import { useFormErrors } from '@/hooks';
import type { Category } from '@/types';
import toast from 'react-hot-toast';

export default function InventoryCreatePage() {
  const navigate = useNavigate();
  const { t } = useTranslation(['inventory', 'common']);
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [creatingCategory, setCreatingCategory] = useState(false);
  const { errors, clearError, validate } = useFormErrors<'name' | 'unit'>();

  const [form, setForm] = useState({
    name: '',
    sku: '',
    unit: 'Kg',
    category_id: '',
    min_stock: 0,
    current_stock: 0,
  });

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      const { data } = await inventoryApi.categories();
      setCategories(data?.data || []);
    } catch {
      // No sample data (see InventoryPage): the old fallback offered invented
      // categories whose ids would be submitted as real categoryIds.
      setCategories([]);
    }
  };

  const handleCreateCategory = async () => {
    const name = newCategoryName.trim();
    if (name.length < 2) return; // service requires name >= 2 chars
    try {
      setCreatingCategory(true);
      const { data } = await inventoryApi.createCategory({ name });
      const created = data?.data;
      await fetchCategories();
      if (created?.id) setForm(p => ({ ...p, category_id: created.id }));
      setShowNewCategory(false);
      setNewCategoryName('');
      toast.success(t('inventory:category_created'));
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('inventory:category_create_error'));
    } finally {
      setCreatingCategory(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = validate({
      name: [!form.name.trim(), t('inventory:item_name_required')],
      unit: [!form.unit, t('inventory:unit_required')],
    });
    if (!ok) return;

    try {
      setLoading(true);
      // The API contract is camelCase (see PurchaseForm's add-item call). Sending
      // the raw snake_case form state meant category, min stock and opening
      // stock were silently dropped by the service on every create.
      await inventoryApi.createItem({
        name: form.name,
        sku: form.sku || undefined,
        unit: form.unit,
        categoryId: form.category_id || undefined,
        minStock: Number(form.min_stock) || 0,
        openingStock: Number(form.current_stock) || 0,
      });
      toast.success(t('inventory:item_created'));
      navigate('/inventory');
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('inventory:item_create_error'));
    } finally {
      setLoading(false);
    }
  };

  const units = ['Kg', 'Quintal', 'Ton', 'Litre', 'Piece', 'Box', 'Bag', 'Packet', 'Dozen', 'Meter'];

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/inventory')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h2 className="text-2xl font-bold">{t('inventory:add_item_title')}</h2>
          <p className="text-muted-foreground">{t('inventory:add_item_subtitle')}</p>
        </div>
      </div>

      <Card className="glass">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-5 w-5" /> {t('inventory:item_details')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <Label>{t('inventory:item_name_label')} *</Label>
                <Input
                  className="mt-1.5"
                  placeholder={t('inventory:item_name_example')}
                  value={form.name}
                  onChange={(e) => { setForm(p => ({ ...p, name: e.target.value })); clearError('name'); }}
                  error={errors.name}
                  autoFocus
                />
              </div>

              <div>
                <Label>{t('inventory:sku_code')}</Label>
                <Input
                  className="mt-1.5"
                  placeholder={t('inventory:sku_example')}
                  value={form.sku}
                  onChange={(e) => setForm(p => ({ ...p, sku: e.target.value.toUpperCase() }))}
                />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <Label>{t('inventory:category')}</Label>
                  <button
                    type="button"
                    onClick={() => setShowNewCategory(true)}
                    className="text-xs text-primary hover:underline flex items-center gap-0.5"
                  >
                    <Plus className="h-3 w-3" /> {t('inventory:new_category')}
                  </button>
                </div>
                <Select value={form.category_id} onValueChange={(val) => setForm(p => ({ ...p, category_id: val }))}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder={t('inventory:select_category')} />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>{t('inventory:unit_label')} *</Label>
                <Select value={form.unit} onValueChange={(val) => { setForm(p => ({ ...p, unit: val })); clearError('unit'); }}>
                  <SelectTrigger className="mt-1.5" error={errors.unit}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {units.map(u => (
                      <SelectItem key={u} value={u}>{u}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>{t('inventory:min_stock_label')}</Label>
                <Input
                  type="number"
                  className="mt-1.5"
                  placeholder="0"
                  value={form.min_stock || ''}
                  onChange={(e) => setForm(p => ({ ...p, min_stock: parseInt(e.target.value) || 0 }))}
                />
                <p className="text-xs text-muted-foreground mt-1">{t('inventory:min_stock_hint')}</p>
              </div>

              <div>
                <Label>{t('inventory:opening_stock')}</Label>
                <Input
                  type="number"
                  className="mt-1.5"
                  placeholder="0"
                  value={form.current_stock || ''}
                  onChange={(e) => setForm(p => ({ ...p, current_stock: parseInt(e.target.value) || 0 }))}
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => navigate('/inventory')}>{t('common:cancel')}</Button>
              <Button type="submit" loading={loading}>
                <Save className="h-4 w-4 mr-2" /> {t('inventory:save_item')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* New Category Dialog */}
      <Dialog open={showNewCategory} onOpenChange={(val) => { if (!val) { setShowNewCategory(false); setNewCategoryName(''); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('inventory:new_category_title')}</DialogTitle>
          </DialogHeader>
          <div>
            <Label>{t('inventory:category_name_label')}</Label>
            <Input
              className="mt-1.5"
              placeholder={t('inventory:category_name_placeholder')}
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreateCategory(); } }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => { setShowNewCategory(false); setNewCategoryName(''); }}
              disabled={creatingCategory}
            >
              {t('common:cancel')}
            </Button>
            <Button
              type="button"
              onClick={handleCreateCategory}
              loading={creatingCategory}
              disabled={newCategoryName.trim().length < 2}
            >
              {t('common:save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
