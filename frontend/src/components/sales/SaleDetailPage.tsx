import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft, Calendar, User, IndianRupee, CreditCard,
  Edit, Trash2, Package, Paperclip, Upload, X, FileText, Image as ImageIcon, ExternalLink,
} from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle, Badge, Separator } from '@/components/ui';
import { SectionLoader } from '@/components/shared/loading';
import { RecordPaymentDialog } from '@/components/shared/RecordPaymentDialog';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { ExportButton } from '@/components/shared/ExportButton';
import { salesApi } from '@/lib/api';
import { formatCurrency, formatDate } from '@/utils';
import type { Sale } from '@/types';
import toast from 'react-hot-toast';

export default function SaleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation(['sales', 'common']);
  const [sale, setSale] = useState<Sale | null>(null);
  const [loading, setLoading] = useState(true);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingAttachmentId, setDeletingAttachmentId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (id) fetchSale();
  }, [id]);

  const fetchSale = async () => {
    try {
      setLoading(true);
      const { data } = await salesApi.get(id!);
      setSale(data?.data || null);
    } catch {
      setSale(null);
    } finally {
      setLoading(false);
    }
  };

  const handleUploadAttachment = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    try {
      setUploading(true);
      await salesApi.uploadAttachment(id, file);
      toast.success(t('sales:bill_uploaded'));
      fetchSale();
    } catch {
      toast.error(t('sales:bill_upload_error'));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    if (!id) return;
    try {
      setDeletingAttachmentId(attachmentId);
      await salesApi.deleteAttachment(id, attachmentId);
      toast.success(t('sales:attachment_deleted'));
      fetchSale();
    } catch {
      toast.error(t('sales:attachment_delete_error'));
    } finally {
      setDeletingAttachmentId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'success' | 'warning' | 'destructive'> = {
      PAID: 'success', PARTIAL: 'warning', UNPAID: 'destructive',
    };
    return <Badge variant={variants[status] || 'outline'}>{status}</Badge>;
  };

  if (loading) return <SectionLoader />;
  if (!sale) return <div className="text-center py-16 text-muted-foreground">{t('sales:sale_not_found')}</div>;

  const hasBreakdown = sale.subtotal != null && Number(sale.subtotal) !== Number(sale.total_amount);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/sales')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold">{sale.sale_number}</h2>
              {getStatusBadge(sale.payment_status)}
            </div>
            <p className="text-muted-foreground flex items-center gap-2 mt-1">
              <Calendar className="h-3.5 w-3.5" /> {formatDate(sale.sale_date)}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <ExportButton
            data={sale ? [sale] : []}
            columns={['sale_number', 'sale_date', 'total_amount', 'paid_amount', 'balance_amount', 'payment_status']}
            filename={`sale_${sale?.sale_number || 'detail'}`}
          />
          <Button variant="outline" size="sm" onClick={() => navigate(`/sales/${id}/edit`)}>
            <Edit className="h-4 w-4 mr-2" /> {t('common:edit')}
          </Button>
          <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="h-4 w-4 mr-2" /> {t('common:delete')}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="glass">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <User className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('sales:party_label')}</p>
                <p className="font-semibold">{sale.party?.name}</p>
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
                <p className="text-xs text-muted-foreground">{t('sales:total_amount_label')}</p>
                <p className="font-semibold text-emerald-400">{formatCurrency(sale.total_amount)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="glass">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${Number(sale.balance_amount) > 0 ? 'bg-amber-500/10' : 'bg-emerald-500/10'}`}>
                <CreditCard className={`h-5 w-5 ${Number(sale.balance_amount) > 0 ? 'text-amber-400' : 'text-emerald-400'}`} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('sales:balance_receivable')}</p>
                <p className={`font-semibold ${Number(sale.balance_amount) > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {formatCurrency(sale.balance_amount)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sale Lots / Items Table */}
      {sale.sale_lots && sale.sale_lots.length > 0 && (
        <Card className="glass">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="h-5 w-5" /> {t('sales:sale_items')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">#</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Item</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Lot #</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Qty</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Rate</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {sale.sale_lots.map((sl: any, idx: number) => (
                    <tr key={sl.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 text-sm text-muted-foreground">{idx + 1}</td>
                      <td className="px-4 py-3 text-sm font-medium">{sl.lot?.item?.name || sl.lot?.item_id || '—'}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground font-mono text-xs">{sl.lot?.lot_number || '—'}</td>
                      <td className="px-4 py-3 text-sm text-right">{Number(sl.quantity_sold)}</td>
                      <td className="px-4 py-3 text-sm text-right">{formatCurrency(sl.rate)}</td>
                      <td className="px-4 py-3 text-sm text-right font-semibold">{formatCurrency(sl.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border bg-muted/30">
                    <td colSpan={5} className="px-4 py-3 text-sm font-semibold text-right">{t('sales:subtotal_label')}</td>
                    <td className="px-4 py-3 text-sm font-bold text-right">{formatCurrency(sale.subtotal ?? sale.total_amount)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Attachments (Bills) */}
      <Card className="glass">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Paperclip className="h-5 w-5" /> {t('sales:bills_attachments')}
          </CardTitle>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={handleUploadAttachment}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              <Upload className="h-4 w-4 mr-1.5" />
              {uploading ? t('sales:uploading') : t('sales:upload_bill')}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {sale.attachments && sale.attachments.length > 0 ? (
            <div className="space-y-2">
              {(sale.attachments as any[]).map((att) => {
                const isImage = att.file_type?.startsWith('image/');
                return (
                  <div key={att.id} className="flex items-center justify-between p-3 rounded-xl border border-border bg-muted/20 group">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-9 w-9 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                        {isImage
                          ? <ImageIcon className="h-4 w-4 text-blue-400" />
                          : <FileText className="h-4 w-4 text-blue-400" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{att.file_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {att.file_size ? `${Math.round(att.file_size / 1024)} KB` : ''} · {formatDate(att.created_at)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={() => window.open(att.file_url, '_blank')}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-red-400 hover:text-red-300"
                        disabled={deletingAttachmentId === att.id}
                        onClick={() => handleDeleteAttachment(att.id)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Paperclip className="h-8 w-8 text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">{t('sales:no_bills_yet')}</p>
              <p className="text-xs text-muted-foreground/60 mt-0.5">{t('sales:no_bills_hint')}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payment Card */}
      <Card className="glass">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-5 w-5" /> {t('sales:payment_details')}
          </CardTitle>
          {Number(sale.balance_amount) > 0 && (
            <Button size="sm" variant="success" onClick={() => setPaymentOpen(true)}>
              <IndianRupee className="h-4 w-4 mr-1" /> {t('sales:record_payment')}
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Payment records */}
          {sale.payments && sale.payments.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{t('sales:payment_records')}</p>
              <div className="space-y-2">
                {sale.payments.map((pmt: any) => (
                  <div key={pmt.id} className="flex items-center justify-between p-3 rounded-xl border border-border bg-muted/20">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                        <IndianRupee className="h-4 w-4 text-emerald-400" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-emerald-400">{formatCurrency(pmt.amount)}</span>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">{pmt.payment_mode}</Badge>
                        </div>
                        <span className="text-xs text-muted-foreground">{formatDate(pmt.payment_date)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <Separator className="mt-4" />
            </div>
          )}

          {/* Breakdown */}
          {hasBreakdown && (
            <div className="flex justify-between items-center p-3 rounded-lg bg-muted/30">
              <span className="text-sm text-muted-foreground">{t('sales:items_subtotal')}</span>
              <span className="font-medium">{formatCurrency(sale.subtotal!)}</span>
            </div>
          )}
          {Number(sale.direct_expense ?? 0) > 0 && (
            <div className="flex justify-between items-center p-3 rounded-lg bg-muted/30">
              <span className="text-sm text-muted-foreground">{t('sales:direct_expenses')}</span>
              <span className="font-medium">{formatCurrency(sale.direct_expense!)}</span>
            </div>
          )}
          {Number(sale.indirect_expense ?? 0) > 0 && (
            <div className="flex justify-between items-center p-3 rounded-lg bg-muted/30">
              <span className="text-sm text-muted-foreground">{t('sales:indirect_expenses')}</span>
              <span className="font-medium">{formatCurrency(sale.indirect_expense!)}</span>
            </div>
          )}
          {sale.gst_mode && sale.gst_mode !== 'NONE' && Number(sale.gst_amount ?? 0) > 0 && (
            <div className="flex justify-between items-center p-3 rounded-lg bg-muted/30">
              <span className="text-sm text-muted-foreground flex items-center gap-2">
                GST
                {sale.gst_mode === 'PERCENT' && sale.gst_value != null && (
                  <span className="text-xs text-muted-foreground/70">({Number(sale.gst_value)}%)</span>
                )}
              </span>
              <span className="font-medium">{formatCurrency(sale.gst_amount!)}</span>
            </div>
          )}
          {Number(sale.discount ?? 0) > 0 && (
            <div className="flex justify-between items-center p-3 rounded-lg bg-muted/30">
              <span className="text-sm text-muted-foreground">{t('sales:discount')}</span>
              <span className="font-medium text-emerald-400">− {formatCurrency(sale.discount!)}</span>
            </div>
          )}
          {Number((sale as any).round_off ?? 0) !== 0 && (
            <div className="flex justify-between items-center p-3 rounded-lg bg-muted/30">
              <span className="text-sm text-muted-foreground">Round Off</span>
              <span className="font-medium text-orange-400">{(sale as any).round_off > 0 ? '+' : ''}{formatCurrency((sale as any).round_off)}</span>
            </div>
          )}
          <div className="flex justify-between items-center p-3 rounded-lg bg-muted/30">
            <span className="text-sm font-semibold">{t('sales:total_amount')}</span>
            <span className="font-semibold">{formatCurrency(sale.total_amount)}</span>
          </div>
          <div className="flex justify-between items-center p-3 rounded-lg bg-muted/30">
            <span className="text-sm text-emerald-400">{t('sales:received_amount')}</span>
            <span className="font-semibold text-emerald-400">{formatCurrency(sale.paid_amount)}</span>
          </div>
          <Separator />
          <div className="flex justify-between items-center p-3 rounded-lg border-2 border-primary/30 bg-primary/5">
            <span className="font-semibold">{t('sales:balance_receivable')}</span>
            <span className={`text-lg font-bold ${Number(sale.balance_amount) > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
              {formatCurrency(sale.balance_amount)}
            </span>
          </div>
        </CardContent>
      </Card>

      <RecordPaymentDialog
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        onSuccess={() => { setPaymentOpen(false); fetchSale(); }}
        defaultPartyId={sale.party?.id}
        defaultType="IN"
        referenceType="SALE"
        referenceId={sale.id}
        defaultAmount={Number(sale.balance_amount) > 0 ? Number(sale.balance_amount) : undefined}
      />

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={async () => {
          try {
            await salesApi.delete(id!);
            toast.success(t('sales:sale_deleted'));
            navigate('/sales');
          } catch {
            toast.error(t('sales:sale_delete_error'));
          }
        }}
        title={t('sales:delete_sale_title')}
        description={t('sales:delete_sale_desc', { number: sale.sale_number })}
        confirmLabel={t('sales:delete_sale_confirm')}
        variant="danger"
      />
    </div>
  );
}
