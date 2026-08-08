import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Package, ArrowLeft, Pencil, Trash2, TrendingUp, AlertTriangle,
  BarChart3, History, ShoppingCart, Tag, Layers,
} from 'lucide-react';
import {
  Button, Card, CardContent, CardHeader, CardTitle, Badge,
  Tabs, TabsList, TabsTrigger, TabsContent,
} from '@/components/ui';
import { DataTable } from '@/components/shared/data-table';
import { StatCard } from '@/components/shared/stat-card';
import { SectionLoader } from '@/components/shared/loading';
import { EmptyState } from '@/components/shared/empty-state';
import { ExportButton } from '@/components/shared/ExportButton';
import { EditInventoryItemDialog } from '@/components/inventory/EditInventoryItemDialog';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { inventoryApi } from '@/lib/api';
import { formatCurrency, formatDate, getStatusColor } from '@/utils';
import type { InventoryItem, Lot } from '@/types';
import toast from 'react-hot-toast';

// The real shape of GET /inventory/transactions. The previous interface —
// date / type / rate / amount / reference / party_name — matched nothing the API
// returns, so every one of those columns rendered blank and the stat cards,
// which filtered on type === 'PURCHASE', matched zero rows (the enum is
// IN/OUT/ADJUSTMENT/REVERSAL). Rate, amount and party are not carried on an
// inventory transaction at all; they live on the source purchase/sale.
interface StockTransaction {
  id: string;
  item_id: string;
  txn_type: 'IN' | 'OUT' | 'ADJUSTMENT' | 'REVERSAL';
  reference_type: string;
  reference_id: string;
  quantity: number;
  balance_after: number;
  notes?: string;
  created_at: string;
}

// No sample-data fallbacks. These used to be a full fake item ("Wheat Grade A"),
// four fake lots and seven fake transactions naming invented suppliers and
// rupee amounts — rendered identically to real stock whenever a request failed,
// with nothing on screen to say the load had not worked.

export default function InventoryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation(['inventory', 'common']);
  const [loading, setLoading] = useState(true);
  const [item, setItem] = useState<InventoryItem | null>(null);
  const [lots, setLots] = useState<Lot[]>([]);
  const [transactions, setTransactions] = useState<StockTransaction[]>([]);
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [tab, setTab] = useState('overview');

  useEffect(() => {
    fetchData();
  }, [id]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [itemRes, txRes] = await Promise.all([
        inventoryApi.getItem(id!),
        // itemId, not item_id: the service reads `query.itemId`, so this filter
        // was ignored and the page listed the entire business's stock movements
        // under a single item's history.
        inventoryApi.transactions({ itemId: id, limit: 100 }),
      ]);
      if (itemRes.data?.data) {
        setItem(itemRes.data.data);
        // getItem already includes the lots; the page fetched them and then
        // never stored them, so the Lots tab was permanently empty.
        setLots(itemRes.data.data.lots || []);
      }
      if (txRes.data?.data) setTransactions(txRes.data.data);
    } catch {
      setItem(null);
      setLots([]);
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    try {
      // See InventoryPage: `is_deleted` was never a real field. Deactivate instead.
      await inventoryApi.updateItem(id!, { isActive: false });
      toast.success(t('inventory:item_deleted'));
      navigate('/inventory');
    } catch {
      toast.error(t('inventory:item_delete_error'));
    }
  };

  if (loading) return <SectionLoader />;
  if (!item) {
    return (
      <EmptyState
        title={t('inventory:item_not_found')}
        description={t('inventory:item_not_found_desc')}
        action={{ label: t('inventory:back_to_inventory'), onClick: () => navigate('/inventory') }}
      />
    );
  }

  // Match the dashboard's definition so the two screens agree.
  const isLowStock = Number(item.min_stock) > 0 && Number(item.current_stock) <= Number(item.min_stock);

  // Quantities come off the transactions; value comes off the lots, which are
  // the only place a purchase rate is recorded. The old code derived both from
  // `t.amount` / `t.rate`, neither of which exists on an inventory transaction —
  // so every one of these tiles read 0.
  const totalIn = transactions.filter(t => t.txn_type === 'IN').reduce((s, t) => s + Number(t.quantity), 0);
  const totalOut = transactions.filter(t => t.txn_type === 'OUT').reduce((s, t) => s + Math.abs(Number(t.quantity)), 0);
  const lotValue = lots.reduce((s, l) => s + Number(l.available_qty) * Number(l.purchase_rate), 0);
  const lotQty = lots.reduce((s, l) => s + Number(l.available_qty), 0);
  const avgPurchaseRate = lotQty > 0 ? lotValue / lotQty : 0;
  const stockValue = lotValue;

  const typeColors: Record<string, string> = {
    IN: 'text-blue-400 bg-blue-500/10',
    OUT: 'text-emerald-400 bg-emerald-500/10',
    ADJUSTMENT: 'text-amber-400 bg-amber-500/10',
    REVERSAL: 'text-purple-400 bg-purple-500/10',
  };

  const lotColumns = [
    { key: 'lot_number', header: t('inventory:lot_number'), render: (l: Lot) => <span className="font-mono font-medium">{l.lot_number}</span> },
    { key: 'initial_qty', header: t('inventory:initial'), render: (l: Lot) => `${l.initial_qty} ${item.unit}` },
    { key: 'available_qty', header: t('inventory:available'), render: (l: Lot) => (
      <span className={l.available_qty === 0 ? 'text-muted-foreground' : 'font-semibold'}>{l.available_qty} {item.unit}</span>
    ) },
    { key: 'sold_qty', header: t('inventory:sold'), render: (l: Lot) => `${l.sold_qty} ${item.unit}` },
    { key: 'purchase_rate', header: t('purchases:rate'), render: (l: Lot) => formatCurrency(l.purchase_rate) },
    { key: 'status', header: t('common:status'), render: (l: Lot) => (
      <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(l.status)}`}>{l.status.replace('_', ' ')}</span>
    ) },
  ];

  // Columns now match what the API actually returns. Rate, amount and party are
  // gone: an inventory transaction carries none of them, so those columns could
  // only ever render an em dash.
  const txColumns = [
    { key: 'created_at', header: t('common:date'), render: (t2: StockTransaction) => formatDate(t2.created_at) },
    { key: 'txn_type', header: t('common:type'), render: (t2: StockTransaction) => (
      <span className={`px-2 py-1 rounded text-xs font-medium ${typeColors[t2.txn_type] || ''}`}>{t2.txn_type}</span>
    ) },
    { key: 'quantity', header: t('inventory:quantity_label'), render: (t2: StockTransaction) => {
      const q = Number(t2.quantity);
      return (
        <span className={`font-semibold ${t2.txn_type === 'OUT' ? 'text-red-400' : 'text-emerald-400'}`}>
          {t2.txn_type === 'OUT' ? '-' : '+'}{Math.abs(q)} {item.unit}
        </span>
      );
    } },
    { key: 'balance_after', header: t('inventory:stock_after'), render: (t2: StockTransaction) => (
      <span className="font-medium">{Number(t2.balance_after)} {item.unit}</span>
    ) },
    { key: 'reference_type', header: t('payments:reference'), render: (t2: StockTransaction) => (
      <span className="font-mono text-xs">{t2.reference_type}</span>
    ) },
    { key: 'notes', header: t('common:notes'), render: (t2: StockTransaction) => t2.notes || '—' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/inventory')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold">{item.name}</h2>
            {isLowStock && (
              <Badge variant="destructive" className="flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> {t('inventory:low_stock_alert')}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground mt-0.5">
            {item.sku && <span className="font-mono">{item.sku}</span>}
            {item.category && <><span>·</span><span>{item.category.name}</span></>}
            <span>·</span>
            <span>{t('inventory:unit_label')}: {item.unit}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton
            data={transactions}
            columns={['created_at', 'txn_type', 'quantity', 'balance_after', 'reference_type', 'notes']}
            filename={`inventory_${item.sku || item.name}`}
          />
          <Button variant="outline" size="sm" onClick={() => setShowEdit(true)}>
            <Pencil className="h-4 w-4 mr-2" /> {t('common:edit')}
          </Button>
          <Button variant="outline" size="sm" className="text-red-400 border-red-400/30 hover:bg-red-400/10" onClick={() => setShowDelete(true)}>
            <Trash2 className="h-4 w-4 mr-2" /> {t('common:delete')}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title={t('inventory:current_stock')}
          value={`${item.current_stock} ${item.unit}`}
          icon={Package}
          iconColor={isLowStock ? 'text-red-400' : 'text-emerald-400'}
        />
        <StatCard
          title={t('inventory:stock_value')}
          value={formatCurrency(stockValue)}
          icon={BarChart3}
          iconColor="text-blue-400"
        />
        <StatCard
          title={t('inventory:total_purchased')}
          value={`${totalIn} ${item.unit}`}
          icon={ShoppingCart}
          iconColor="text-purple-400"
        />
        <StatCard
          title={t('inventory:total_sold')}
          value={`${totalOut} ${item.unit}`}
          icon={TrendingUp}
          iconColor="text-amber-400"
        />
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">
            <Layers className="h-4 w-4 mr-1.5" /> {t('inventory:lots')}
          </TabsTrigger>
          <TabsTrigger value="transactions">
            <History className="h-4 w-4 mr-1.5" /> {t('inventory:transactions')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Layers className="h-4 w-4" />
                {t('inventory:stock_lots')} ({lots.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {lots.length === 0 ? (
                <EmptyState title={t('inventory:no_lots')} description={t('inventory:no_lots_desc')} />
              ) : (
                <DataTable columns={lotColumns} data={lots} />
              )}
            </CardContent>
          </Card>

          {/* Item Details Card */}
          <Card className="mt-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Tag className="h-4 w-4" />
                {t('inventory:item_details')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">{t('inventory:sku')}</p>
                  <p className="font-medium font-mono">{item.sku || t('inventory:na')}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t('inventory:category')}</p>
                  <p className="font-medium">{item.category?.name || t('inventory:uncategorized')}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t('inventory:unit_label')}</p>
                  <p className="font-medium">{item.unit}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t('inventory:min_stock_alert_detail')}</p>
                  <p className="font-medium">{item.min_stock} {item.unit}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t('inventory:avg_purchase_rate')}</p>
                  <p className="font-medium">{formatCurrency(avgPurchaseRate)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t('inventory:total_stock_value')}</p>
                  <p className="font-medium">{formatCurrency(stockValue)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transactions" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <History className="h-4 w-4" />
                {t('inventory:stock_transactions')} ({transactions.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {transactions.length === 0 ? (
                <EmptyState title={t('inventory:no_transactions')} description={t('inventory:no_transactions_desc')} />
              ) : (
                <DataTable columns={txColumns} data={transactions} />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Dialog */}
      {showEdit && item && (
        <EditInventoryItemDialog
          open={showEdit}
          item={item}
          onClose={() => setShowEdit(false)}
          onSuccess={() => { setShowEdit(false); fetchData(); }}
        />
      )}

      {/* Delete Confirm */}
      <ConfirmDialog
        open={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={handleDelete}
        title={t('inventory:delete_item_title')}
        description={t('inventory:delete_item_desc', { name: item.name })}
        confirmLabel={t('common:delete')}
        variant="danger"
      />
    </div>
  );
}
