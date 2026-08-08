import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft, Truck, Calendar, User, IndianRupee, Package, CreditCard,
  Edit, Trash2, Paperclip, FileText, TrendingDown, Scissors,
  ExternalLink, Receipt, Image,
} from 'lucide-react';
import {
  Button, Card, CardContent, CardHeader, CardTitle, Badge, Separator,
} from '@/components/ui';
import { SectionLoader } from '@/components/shared/loading';
import { RecordPaymentDialog } from '@/components/shared/RecordPaymentDialog';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { ExportButton } from '@/components/shared/ExportButton';
import { purchaseApi } from '@/lib/api';
import { formatCurrency, formatDate } from '@/utils';
import type { Purchase } from '@/types';
import toast from 'react-hot-toast';

export default function PurchaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation(['purchases', 'common']);
  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [loading, setLoading] = useState(true);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    if (id) fetchPurchase();
  }, [id]);

  const fetchPurchase = async () => {
    try {
      setLoading(true);
      const { data } = await purchaseApi.get(id!);
      setPurchase(data?.data || null);
    } catch {
      setPurchase(null);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'success' | 'warning' | 'destructive'> = {
      PAID: 'success',
      PARTIAL: 'warning',
      UNPAID: 'destructive',
    };
    return <Badge variant={variants[status] || 'outline'}>{status}</Badge>;
  };

  if (loading) return <SectionLoader />;
  if (!purchase) return <div className="text-center py-16 text-muted-foreground">{t('purchases:purchase_not_found')}</div>;

  // PurchaseItem has no lot_number column — the real lot numbers live on the
  // purchase's `lots`. Match each item to its lot by item_id, consuming in
  // order so duplicate items each get their own lot.
  const lotPool = new Map<string, string[]>();
  for (const lot of purchase.lots || []) {
    const arr = lotPool.get(lot.item_id) || [];
    arr.push(lot.lot_number);
    lotPool.set(lot.item_id, arr);
  }
  const itemLotNumbers = purchase.items.map(it => lotPool.get(it.item_id)?.shift() || it.lot_number || '');

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/purchases')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold">{purchase.purchase_number}</h2>
              {getStatusBadge(purchase.payment_status)}
            </div>
            <p className="text-muted-foreground flex items-center gap-2 mt-1">
              <Calendar className="h-3.5 w-3.5" /> {formatDate(purchase.purchase_date)}
              {purchase.gadi_number && (
                <>
                  <span className="text-border">·</span>
                  <Truck className="h-3.5 w-3.5" /> {purchase.gadi_number}
                </>
              )}
              {purchase.bill_number && (
                <>
                  <span className="text-border">·</span>
                  {t('purchases:bill_label')}: {purchase.bill_number}
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <ExportButton
            data={purchase ? [purchase] : []}
            columns={['purchase_number', 'purchase_date', 'total_amount', 'paid_amount', 'balance_amount', 'payment_status']}
            filename={`purchase_${purchase?.purchase_number || 'detail'}`}
          />
          <Button variant="outline" size="sm" onClick={() => navigate(`/purchases/${id}/edit`)}>
            <Edit className="h-4 w-4 mr-2" /> {t('common:edit')}
          </Button>
          <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="h-4 w-4 mr-2" /> {t('common:delete')}
          </Button>
        </div>
      </div>

      {/* Party & Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="glass">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <User className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('purchases:supplier_label')}</p>
                <p className="font-semibold">{purchase.party?.name}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="glass">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <IndianRupee className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('purchases:total_amount_label')}</p>
                <p className="font-semibold">{formatCurrency(purchase.total_amount)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="glass">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${Number(purchase.balance_amount) > 0 ? 'bg-red-500/10' : 'bg-emerald-500/10'}`}>
                <CreditCard className={`h-5 w-5 ${Number(purchase.balance_amount) > 0 ? 'text-red-400' : 'text-emerald-400'}`} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('purchases:balance_label')}</p>
                <p className={`font-semibold ${Number(purchase.balance_amount) > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                  {formatCurrency(purchase.balance_amount)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Items Table */}
      <Card className="glass">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-5 w-5" /> {t('purchases:purchase_items')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">#</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">{t('purchases:item_col')}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">{t('purchases:lot_col')}</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">{t('purchases:qty_col')}</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">{t('purchases:rate_col')}</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">{t('purchases:amount_col')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {purchase.items.map((item, idx) => (
                  <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 text-sm text-muted-foreground">{idx + 1}</td>
                    <td className="px-4 py-3 text-sm font-medium">{item.item?.name || item.item_id}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground font-mono text-xs">
                      {itemLotNumbers[idx] || <span className="text-muted-foreground/40">—</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-right">{item.quantity} {item.unit}</td>
                    <td className="px-4 py-3 text-sm text-right">{formatCurrency(item.rate)}</td>
                    <td className="px-4 py-3 text-sm text-right font-semibold">{formatCurrency(item.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-muted/30">
                  <td colSpan={5} className="px-4 py-3 text-sm font-semibold text-right">{t('purchases:subtotal_label')}</td>
                  <td className="px-4 py-3 text-sm font-bold text-right">{formatCurrency(purchase.subtotal ?? purchase.total_amount)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Expenses */}
      {purchase.expenses && purchase.expenses.length > 0 && (
        <Card className="glass">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingDown className="h-5 w-5" /> {t('purchases:expenses_label')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {purchase.expenses.map(ex => (
                <div key={ex.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                  <div className="flex items-center gap-3 flex-wrap min-w-0">
                    <span className="font-medium text-sm">{ex.expense_type?.name || ex.expense_type_id}</span>
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${ex.expense_category === 'DIRECT' ? 'border-blue-400/50 text-blue-400' : 'border-amber-400/50 text-amber-400'}`}>
                      {ex.expense_category}
                    </Badge>
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${(ex as any).is_paid !== false ? 'border-emerald-400/50 text-emerald-500' : 'border-red-400/50 text-red-500'}`}>
                      {(ex as any).is_paid !== false ? t('common:paid') : t('common:unpaid')}
                    </Badge>
                    {(ex as any).receipt_url && (
                      <a
                        href={(ex as any).receipt_url}
                        target="_blank"
                        rel="noreferrer"
                        title={t('common:view_receipt')}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                      >
                        {/\.(jpe?g|png|gif|webp|svg)$/i.test((ex as any).receipt_url) ? (
                          <Image className="h-3.5 w-3.5" />
                        ) : (
                          <FileText className="h-3.5 w-3.5" />
                        )}
                        {t('common:receipt')}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                  <span className="font-semibold text-sm shrink-0">{formatCurrency(ex.amount)}</span>
                </div>
              ))}
              <div className="flex justify-between pt-2 text-sm font-semibold px-3">
                <span>{t('purchases:total_expenses')}</span>
                <span>{formatCurrency(purchase.expenses.reduce((s, e) => s + e.amount, 0))}</span>
              </div>
              {purchase.expenses.some(e => (e as any).is_paid === false) && (
                <div className="flex justify-between pt-1 text-sm px-3 text-red-500">
                  <span>{t('purchases:unpaid_expenses')}</span>
                  <span className="font-semibold">{formatCurrency(purchase.expenses.filter(e => (e as any).is_paid === false).reduce((s, e) => s + e.amount, 0))}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cutter Transactions */}
      {purchase.cutter_transactions && purchase.cutter_transactions.length > 0 && (
        <Card className="glass">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Scissors className="h-5 w-5" /> {t('purchases:cutter_details')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">{t('purchases:cutter_col')}</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">{t('purchases:quantity_col')}</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">{t('purchases:rate_col')}</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase">{t('common:status')}</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">{t('purchases:amount_col')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {purchase.cutter_transactions.map(ct => (
                    <tr key={ct.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium">{ct.cutter?.name || ct.cutter_id}</td>
                      <td className="px-4 py-3 text-sm text-right">{ct.quantity}</td>
                      <td className="px-4 py-3 text-sm text-right">{formatCurrency(ct.rate)}</td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-2 flex-wrap">
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${(ct as any).is_paid !== false ? 'border-emerald-400/50 text-emerald-500' : 'border-red-400/50 text-red-500'}`}>
                            {(ct as any).is_paid !== false ? t('common:paid') : t('common:unpaid')}
                          </Badge>
                          {(ct as any).receipt_url && (
                            <a
                              href={(ct as any).receipt_url}
                              target="_blank"
                              rel="noreferrer"
                              title={t('common:view_receipt')}
                              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                            >
                              {/\.(jpe?g|png|gif|webp|svg)$/i.test((ct as any).receipt_url) ? (
                                <Image className="h-3.5 w-3.5" />
                              ) : (
                                <FileText className="h-3.5 w-3.5" />
                              )}
                              {t('common:receipt')}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-semibold">{formatCurrency(ct.quantity * ct.rate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Attachments */}
      {purchase.attachments && purchase.attachments.length > 0 && (
        <Card className="glass">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Paperclip className="h-5 w-5" /> {t('purchases:bills_attachments')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {purchase.attachments.map(att => (
                <a
                  key={att.id}
                  href={att.file_url}
                  target="_blank"
                  rel="noreferrer"
                  className="group flex items-center gap-2 p-3 rounded-xl border border-border hover:border-primary/50 hover:bg-primary/5 transition-colors"
                >
                  {att.file_type.startsWith('image/') ? (
                    <img src={att.file_url} alt={att.file_name} className="h-10 w-10 rounded object-cover" />
                  ) : (
                    <div className="h-10 w-10 rounded bg-muted/50 flex items-center justify-center">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate max-w-[120px]">{att.file_name}</p>
                    <p className="text-[10px] text-muted-foreground">{(att.file_size / 1024).toFixed(0)} KB</p>
                  </div>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary ml-1 shrink-0" />
                </a>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Payment Summary */}
      <Card className="glass">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-5 w-5" /> {t('purchases:payment_details')}
          </CardTitle>
          {Number(purchase.balance_amount) > 0 && (
            <Button size="sm" onClick={() => setPaymentOpen(true)}>
              <IndianRupee className="h-4 w-4 mr-1" /> {t('purchases:record_payment')}
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Individual payment records */}
          {purchase.payments && purchase.payments.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{t('purchases:payment_records')}</p>
              <div className="space-y-2">
                {purchase.payments.map(pmt => {
                  const isImage = pmt.receipt_url && /\.(jpe?g|png|gif|webp|svg)$/i.test(pmt.receipt_url);
                  const isPdf = pmt.receipt_url && /\.pdf$/i.test(pmt.receipt_url);
                  return (
                    <div key={pmt.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border bg-muted/20 hover:bg-muted/30 transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                          <IndianRupee className="h-4 w-4 text-emerald-400" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-emerald-400">{formatCurrency(pmt.amount)}</span>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">{pmt.payment_mode}</Badge>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap mt-0.5">
                            <span className="text-xs text-muted-foreground">{formatDate(pmt.payment_date)}</span>
                            {pmt.transaction_ref && (
                              <span className="text-xs text-muted-foreground font-mono">Ref: {pmt.transaction_ref}</span>
                            )}
                            {pmt.notes && (
                              <span className="text-xs text-muted-foreground italic">{pmt.notes}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      {/* Receipt attachment */}
                      {pmt.receipt_url && (
                        <a
                          href={pmt.receipt_url}
                          target="_blank"
                          rel="noreferrer"
                          title={t('common:view_receipt')}
                          className="group flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border hover:border-primary/50 hover:bg-primary/5 transition-colors shrink-0"
                        >
                          {isImage ? (
                            <Image className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary" />
                          ) : isPdf ? (
                            <FileText className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary" />
                          ) : (
                            <Receipt className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary" />
                          )}
                          <span className="text-xs text-muted-foreground group-hover:text-primary">{t('common:receipt')}</span>
                          <ExternalLink className="h-3 w-3 text-muted-foreground group-hover:text-primary" />
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
              <Separator className="mt-4" />
            </div>
          )}

          {purchase.subtotal != null && purchase.subtotal !== purchase.total_amount && (
            <div className="flex justify-between items-center p-3 rounded-lg bg-muted/30">
              <span className="text-sm text-muted-foreground">{t('purchases:items_subtotal')}</span>
              <span className="font-medium">{formatCurrency(purchase.subtotal)}</span>
            </div>
          )}
          {(purchase.direct_expense ?? 0) > 0 && (
            <div className="flex justify-between items-center p-3 rounded-lg bg-muted/30">
              <span className="text-sm text-muted-foreground">{t('purchases:direct_expenses')}</span>
              <span className="font-medium">{formatCurrency(purchase.direct_expense!)}</span>
            </div>
          )}
          {(purchase.indirect_expense ?? 0) > 0 && (
            <div className="flex justify-between items-center p-3 rounded-lg bg-muted/30">
              <span className="text-sm text-muted-foreground">{t('purchases:indirect_expenses')}</span>
              <span className="font-medium">{formatCurrency(purchase.indirect_expense!)}</span>
            </div>
          )}
          {(purchase.cutter_cost ?? 0) > 0 && (
            <div className="flex justify-between items-center p-3 rounded-lg bg-muted/30">
              <span className="text-sm text-muted-foreground">{t('purchases:cutter_cost')}</span>
              <span className="font-medium">{formatCurrency(purchase.cutter_cost!)}</span>
            </div>
          )}
          {purchase.gst_mode && purchase.gst_mode !== 'NONE' && Number(purchase.gst_amount ?? 0) > 0 && (
            <div className="flex justify-between items-center p-3 rounded-lg bg-muted/30">
              <span className="text-sm text-muted-foreground flex items-center gap-2">
                GST
                {purchase.gst_mode === 'PERCENT' && purchase.gst_value != null && (
                  <span className="text-xs text-muted-foreground/70">({Number(purchase.gst_value)}%)</span>
                )}
              </span>
              <span className="font-medium">{formatCurrency(purchase.gst_amount!)}</span>
            </div>
          )}
          {Number((purchase as any).discount ?? 0) > 0 && (
            <div className="flex justify-between items-center p-3 rounded-lg bg-muted/30">
              <span className="text-sm text-muted-foreground">{t('purchases:discount')}</span>
              <span className="font-medium text-emerald-400">− {formatCurrency((purchase as any).discount)}</span>
            </div>
          )}
          {Number((purchase as any).round_off ?? 0) !== 0 && (
            <div className="flex justify-between items-center p-3 rounded-lg bg-muted/30">
              <span className="text-sm text-muted-foreground">Round Off</span>
              <span className="font-medium text-orange-400">{(purchase as any).round_off > 0 ? '+' : ''}{formatCurrency((purchase as any).round_off)}</span>
            </div>
          )}
          <div className="flex justify-between items-center p-3 rounded-lg bg-muted/30">
            <span className="text-sm font-semibold">{t('purchases:total_amount')}</span>
            <span className="font-semibold">{formatCurrency(purchase.total_amount)}</span>
          </div>
          <div className="flex justify-between items-center p-3 rounded-lg bg-muted/30">
            <span className="text-sm text-emerald-400">{t('purchases:paid_amount')}</span>
            <span className="font-semibold text-emerald-400">{formatCurrency(purchase.paid_amount)}</span>
          </div>
          <Separator />
          <div className="flex justify-between items-center p-3 rounded-lg border-2 border-primary/30 bg-primary/5">
            <span className="font-semibold">{t('purchases:balance_payable')}</span>
            <span className={`text-lg font-bold ${Number(purchase.balance_amount) > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
              {formatCurrency(purchase.balance_amount)}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Record Payment Dialog */}
      <RecordPaymentDialog
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        onSuccess={() => { setPaymentOpen(false); fetchPurchase(); }}
        defaultPartyId={purchase.party?.id}
        defaultType="OUT"
        referenceType="PURCHASE"
        referenceId={purchase.id}
        defaultAmount={Number(purchase.balance_amount) > 0 ? Number(purchase.balance_amount) : undefined}
      />

      {/* Delete Confirm */}
      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={async () => {
          try {
            await purchaseApi.delete(id!);
            toast.success(t('purchases:purchase_deleted'));
            navigate('/purchases');
          } catch {
            toast.error(t('purchases:purchase_delete_error'));
          }
        }}
        title={t('purchases:delete_purchase_title')}
        description={t('purchases:delete_purchase_confirm') + ` ${purchase.purchase_number}? ` + t('common:cannot_be_undone')}
        confirmLabel={t('purchases:delete_purchase_confirm')}
        variant="danger"
      />
    </div>
  );
}
