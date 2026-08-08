import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, Search, Package, AlertTriangle, ArrowUpDown, Trash2, Pencil, Upload, Download } from 'lucide-react';
import { Button, Input, Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui';
import { BulkSelectDataTable } from '@/components/shared/BulkSelectDataTable';
import { StatCard } from '@/components/shared/stat-card';
import { EmptyState } from '@/components/shared/empty-state';
import { AdvancedFilters, type FilterField } from '@/components/shared/AdvancedFilters';
import { ExportButton } from '@/components/shared/ExportButton';
import { ImportDataDialog } from '@/components/shared/ImportDataDialog';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { EditInventoryItemDialog } from '@/components/inventory/EditInventoryItemDialog';
import { inventoryApi } from '@/lib/api';
import type { InventoryItem } from '@/types';
import toast from 'react-hot-toast';

// The list was hard-capped at the API's default of 20 with no control to reach
// the rest, so anything past the twentieth item was simply unreachable.
const PAGE_SIZE = 50;

export default function InventoryPage() {
  const navigate = useNavigate();
  const { t } = useTranslation(['inventory', 'common']);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  // The dashboard's low-stock alert links here as /inventory?filter=low-stock.
  // That parameter was never read, so the card landed the user on "All items"
  // with no sign of which ones were actually low — the alert led nowhere.
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState(searchParams.get('filter') === 'low-stock' ? 'low-stock' : 'all');
  const [filters, setFilters] = useState<Record<string, any>>({});
  const [deleteItem, setDeleteItem] = useState<InventoryItem | null>(null);
  const [editItem, setEditItem] = useState<InventoryItem | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState<{ total: number; totalPages: number; hasNext?: boolean } | null>(null);
  const [totals, setTotals] = useState<{ totalItems: number; lowStockCount: number; totalValue: number } | null>(null);
  const [loadError, setLoadError] = useState(false);

  // Reset to the first page whenever the query changes, or the user can land on
  // a page number that no longer exists for the new filter.
  useEffect(() => { setPage(1); }, [search, filters, tab]);
  useEffect(() => { fetchItems(); }, [search, filters, tab, page]);
  useEffect(() => { fetchTotals(); }, []);

  const fetchItems = async () => {
    try {
      setLoading(true);
      // The Low stock tab is now a server-side query. It used to filter the
      // current page client-side, so it could only ever surface low-stock items
      // that happened to fall within the first 20 rows.
      const { data } = await inventoryApi.listItems({
        search,
        ...filters,
        ...(tab === 'low-stock' ? { lowStock: 'true' } : {}),
        page,
        limit: PAGE_SIZE,
      });
      setItems(data?.data || []);
      setMeta(data?.meta || null);
      setLoadError(false);
    } catch {
      // No sample data. This used to fall back to five invented products
      // ("Wheat Grade A", "Rice Basmati", …) that rendered exactly like real
      // stock, so a failed load looked like a stocked warehouse.
      setItems([]);
      setMeta(null);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  // Business-wide counts for the tiles and the tab label. Deriving these from
  // the current page made them wrong for any business with more than one page.
  const fetchTotals = async () => {
    try {
      const { data } = await inventoryApi.dashboard();
      setTotals({
        totalItems: Number(data?.data?.totalItems ?? 0),
        lowStockCount: Number(data?.data?.lowStockCount ?? 0),
        totalValue: Number(data?.data?.totalValue ?? 0),
      });
    } catch {
      setTotals(null);
    }
  };

  const handleDeleteItem = async () => {
    if (!deleteItem) return;
    try {
      // `is_deleted` is not a field on InventoryItem and the service never read
      // it, so this "delete" used to 200 and change nothing. Deactivating is the
      // real soft-delete, and the list now hides inactive items.
      await inventoryApi.updateItem(deleteItem.id, { isActive: false });
      toast.success(t('inventory:item_deleted'));
      setDeleteItem(null);
      fetchItems();
    } catch {
      toast.error(t('inventory:item_delete_error'));
    }
  };

  // `min_stock > 0` mirrors the dashboard's low-stock query. Without it, any
  // item left at the default reorder level of 0 with no stock counted as "low",
  // so this tile and the dashboard alert reported different numbers.
  // The server already scoped the query to the selected tab, so no second
  // client-side filter is needed — and doing one here would re-introduce the
  // "only what is on this page" bug.
  const displayItems = items;

  const filterFields: FilterField[] = [
    {
      key: 'category', label: t('inventory:category'), type: 'select',
      options: [...new Set(items.map(i => i.category?.name).filter(Boolean))].map(c => ({ value: c!, label: c! })),
    },
    { key: 'stock', label: t('inventory:stock_range'), type: 'number-range' },
  ];

  const columns = [
    { key: 'name', header: t('inventory:item_name'), render: (i: InventoryItem) => (
      <div>
        <p className="font-medium">{i.name}</p>
        <p className="text-xs text-muted-foreground">{i.sku} · {i.category?.name}</p>
      </div>
    )},
    { key: 'current_stock', header: t('inventory:stock'), render: (i: InventoryItem) => (
      <div className="flex items-center gap-2">
        <span className={`font-semibold ${i.current_stock <= i.min_stock ? 'text-red-400' : 'text-foreground'}`}>
          {i.current_stock}
        </span>
        <span className="text-xs text-muted-foreground">{i.unit}</span>
        {i.current_stock <= i.min_stock && <AlertTriangle className="h-3 w-3 text-red-400" />}
      </div>
    )},
    { key: 'min_stock', header: t('inventory:min_stock'), render: (i: InventoryItem) => <span className="text-muted-foreground">{i.min_stock} {i.unit}</span> },
    { key: 'avg_purchase_rate', header: t('inventory:avg_rate'), render: (i: InventoryItem) => (
      <span className="text-sm text-muted-foreground">
        {(i as any).avg_purchase_rate != null ? `₹${Number((i as any).avg_purchase_rate).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
      </span>
    )},
    { key: 'unit', header: t('inventory:unit') },
    { key: 'actions', header: '', render: (i: InventoryItem) => (
      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditItem(i)}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-300" onClick={() => setDeleteItem(i)}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    )},
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{t('inventory:title')}</h2>
          <p className="text-muted-foreground">{t('inventory:subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <ExportButton
            data={items}
            columns={['name', 'sku', 'unit', 'current_stock', 'min_stock']}
            filename="inventory"
          />
          <Button variant="outline" onClick={() => setShowImport(true)}>
            <Upload className="h-4 w-4 mr-2" /> {t('common:import')}
          </Button>
          <Button variant="outline" onClick={() => navigate('/inventory/adjust')}>
            <ArrowUpDown className="h-4 w-4 mr-2" /> {t('inventory:adjust_stock')}
          </Button>
          <Button onClick={() => navigate('/inventory/new')}>
            <Plus className="h-4 w-4 mr-2" /> {t('inventory:new_item')}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title={t('inventory:total_items')} value={totals?.totalItems ?? meta?.total ?? items.length} icon={Package} iconColor="text-blue-400" />
        <StatCard title={t('inventory:low_stock_items')} value={totals?.lowStockCount ?? 0} icon={AlertTriangle} iconColor="text-red-400" />
        <StatCard title={t('inventory:category')} value={new Set(items.map(i => i.category?.name)).size} icon={Package} iconColor="text-purple-400" />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="all">{t('inventory:tab_all')} ({totals?.totalItems ?? meta?.total ?? items.length})</TabsTrigger>
              <TabsTrigger value="low-stock">{t('inventory:tab_low_stock')} ({totals?.lowStockCount ?? 0})</TabsTrigger>
            </TabsList>
            <Input icon={<Search className="h-4 w-4" />} placeholder={t('common:search_placeholder')} value={search} onChange={(e) => setSearch(e.target.value)} className="w-64" />
          </div>
          <AdvancedFilters
            fields={filterFields}
            values={filters}
            onChange={setFilters}
            onReset={() => setFilters({})}
          />
        </div>

        <TabsContent value={tab}>
          {loadError && (
            <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-600 dark:text-amber-400">
              {t('inventory:load_failed')}
            </div>
          )}
          {displayItems.length === 0 && !loading ? (
            <EmptyState
              icon={<Package className="h-16 w-16 text-muted-foreground" />}
              title={tab === 'low-stock' ? t('inventory:empty_title') : t('inventory:empty_title')}
              description={tab === 'low-stock' ? t('inventory:empty_description') : t('inventory:empty_description')}
              action={tab !== 'low-stock' ? { label: t('inventory:empty_action'), onClick: () => navigate('/inventory/new') } : undefined}
            />
          ) : (
            <BulkSelectDataTable
              columns={columns}
              data={displayItems}
              loading={loading}
              onRowClick={(i) => navigate(`/inventory/${i.id}`)}
              bulkActions={[
                {
                  label: t('common:export_selected'),
                  icon: <Download className="h-3.5 w-3.5" />,
                  onClick: (items) => {
                    const csv = ['Name,SKU,Unit,Stock,Min Stock', ...items.map(i => `${i.name},${i.sku || ''},${i.unit},${i.current_stock},${i.min_stock}`)].join('\n');
                    const blob = new Blob([csv], { type: 'text/csv' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a'); a.href = url; a.download = 'selected_inventory.csv'; a.click();
                    URL.revokeObjectURL(url);
                    toast.success(t('inventory:exported_count', { count: items.length }));
                  },
                },
                {
                  label: t('common:delete_selected'),
                  icon: <Trash2 className="h-3.5 w-3.5" />,
                  variant: 'destructive',
                  // Was a bare success toast with no API call at all — the same
                  // lie the Ledger page told. Deactivating is this app's soft
                  // delete (see handleDeleteItem).
                  onClick: async (selected) => {
                    const results = await Promise.allSettled(
                      selected.map((i) => inventoryApi.updateItem(i.id, { isActive: false })),
                    );
                    const ok = results.filter((r) => r.status === 'fulfilled').length;
                    const failed = results.length - ok;
                    if (ok > 0) toast.success(t('inventory:deleted_count', { count: ok }));
                    if (failed > 0) toast.error(t('inventory:item_delete_error'));
                    fetchItems();
                    fetchTotals();
                  },
                },
              ]}
            />
          )}

          {/* Pagination. Without this the list stopped at the API's default of
              20 rows and the rest of the catalogue was simply unreachable. */}
          {meta && meta.totalPages > 1 && (
            <div className="flex items-center justify-between pt-4">
              <p className="text-sm text-muted-foreground">
                {t('common:showing_page', { page, totalPages: meta.totalPages, total: meta.total })}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  {t('common:previous')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= meta.totalPages || loading}
                  onClick={() => setPage((p) => p + 1)}
                >
                  {t('common:next')}
                </Button>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteItem}
        onClose={() => setDeleteItem(null)}
        onConfirm={handleDeleteItem}
        title={t('inventory:delete_item_title')}
        description={t('inventory:delete_item_desc', { name: deleteItem?.name })}
        confirmLabel={t('common:delete')}
        variant="danger"
      />

      {/* Edit Item Dialog */}
      {editItem && (
        <EditInventoryItemDialog
          open={!!editItem}
          item={editItem}
          onClose={() => setEditItem(null)}
          onSuccess={() => { setEditItem(null); fetchItems(); }}
        />
      )}

      {/* Import Dialog */}
      <ImportDataDialog
        open={showImport}
        onClose={() => setShowImport(false)}
        onSuccess={() => { setShowImport(false); fetchItems(); }}
        defaultModule="inventory"
      />
    </div>
  );
}
