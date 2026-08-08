/**
 * SaleCreatePage — reused for Create and Edit
 *
 * Supports:
 *  - Multiple Sale entries per session (each entry = one sale record)
 *  - Multiple lots (items) per entry
 *  - Bill attachments (images / PDF) per entry
 *  - Split payments with receipts per entry
 *  - GST (percent or fixed) per entry
 *  - Optional collection reminder per entry
 *  - Unit conversion between stock and sell units
 *  - Edit mode: pre-fills all sections (single entry)
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Plus, Trash2, Save, Calculator, Package,
  AlertTriangle, ArrowRightLeft, Paperclip, FileText,
  Eye, Download, Loader2, IndianRupee, X, Bell,
  ChevronDown, ChevronUp, ShoppingCart,
} from 'lucide-react';
import {
  Button, Input, Card, CardContent,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Label, Separator, Badge,
} from '@/components/ui';
import { salesApi, profileApi } from '@/lib/api';
import { cn, formatCurrency } from '@/utils';
import type { Party, Lot } from '@/types';
import { AddPartyDialog } from '@/components/shared/AddPartyDialog';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SaleLineItem {
  _key: string;
  lot_id: string;
  lot_number: string;
  item_name: string;
  stock_qty: number;
  stock_unit: string;
  sell_unit: string;
  available_display: number;
  quantity: number;
  qty_in_stock_unit: number;
  rate: number;
  amount: number;
}

interface AttachmentFile {
  _key: string;
  file?: File;
  name: string;
  size: number;
  type: string;
  preview: string;
  uploading?: boolean;
  uploadedId?: string;
  uploadedUrl?: string;
  error?: string;
}

interface PaymentRow {
  _key: string;
  payment_mode: string;
  amount: number;
  transaction_ref: string;
  notes: string;
  receipt_file?: File | null;
  receipt_preview?: string;
  receipt_url?: string;
  receipt_uploading?: boolean;
  receipt_name?: string;
  receipt_type?: string;
}

interface ReminderRow {
  _key: string;
  remind_on: string;  // YYYY-MM-DD
  amount: number;     // 0 = full balance
  note: string;
}

// A single sale entry (can have multiple per session)
interface SaleEntry {
  _key: string;
  expanded: boolean;
  party_id: string;
  sale_date: string;
  notes: string;
  gst_mode: 'NONE' | 'PERCENT' | 'AMOUNT';
  gst_value: number;
  discount: number;
  round_off: number;
  reminders: ReminderRow[];
  lineItems: SaleLineItem[];
  payments: PaymentRow[];
  attachments: AttachmentFile[];
  saleId?: string; // present in edit mode
}

// ─── Unit conversion ──────────────────────────────────────────────────────────

const TO_KG: Record<string, number> = {
  Kg: 1, KG: 1, kg: 1,
  Ton: 1000, ton: 1000, TON: 1000,
  Quintal: 100, quintal: 100, QUINTAL: 100, Qtl: 100,
  Gram: 0.001, gram: 0.001, GRAM: 0.001, gm: 0.001,
};

function normaliseUnit(u: string) {
  if (!u) return u;
  const map: Record<string, string> = {
    kg: 'Kg', KG: 'Kg',
    ton: 'Ton', TON: 'Ton',
    quintal: 'Quintal', QUINTAL: 'Quintal', qtl: 'Quintal', Qtl: 'Quintal',
    gram: 'Gram', GRAM: 'Gram', gm: 'Gram',
  };
  return map[u] ?? u;
}

function canConvert(from: string, to: string): boolean {
  const f = normaliseUnit(from);
  const t = normaliseUnit(to);
  return f === t || (f in TO_KG && t in TO_KG);
}

function convertQty(qty: number, from: string, to: string): number {
  const f = normaliseUnit(from);
  const t = normaliseUnit(to);
  if (f === t) return qty;
  const inKg = qty * (TO_KG[f] ?? 1);
  return parseFloat((inKg / (TO_KG[t] ?? 1)).toFixed(6));
}

const WEIGHT_UNITS = ['Kg', 'Ton', 'Quintal', 'Gram'];
const AREA_UNITS = ['SFT', 'SQM', 'RFT'];
function sellUnitOptions(stockUnit: string): string[] {
  const norm = normaliseUnit(stockUnit);
  if (WEIGHT_UNITS.includes(norm)) return WEIGHT_UNITS;
  if (AREA_UNITS.map(u => u.toUpperCase()).includes(norm.toUpperCase())) return AREA_UNITS;
  return [norm];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
let _keyCounter = 0;
const uid = () => `_k${++_keyCounter}`;

const blankLineItem = (): SaleLineItem => ({
  _key: uid(), lot_id: '', lot_number: '', item_name: '',
  stock_qty: 0, stock_unit: '', sell_unit: '',
  available_display: 0, quantity: 0, qty_in_stock_unit: 0,
  rate: 0, amount: 0,
});

const blankPayment = (): PaymentRow => ({
  _key: uid(), payment_mode: 'CASH', amount: 0, transaction_ref: '', notes: '',
});

const blankReminder = (): ReminderRow => ({
  _key: uid(), remind_on: '', amount: 0, note: '',
});

const blankEntry = (partyId = '', date = new Date().toISOString().split('T')[0]): SaleEntry => ({
  _key: uid(), expanded: true,
  party_id: partyId, sale_date: date, notes: '',
  gst_mode: 'NONE', gst_value: 0,
  discount: 0, round_off: 0,
  reminders: [],
  lineItems: [blankLineItem()],
  payments: [blankPayment()],
  attachments: [],
});

// Per-entry computed totals
const entrySubtotal = (e: SaleEntry) => e.lineItems.reduce((s, i) => s + i.amount, 0);
const entryGstAmount = (e: SaleEntry) => {
  if (e.gst_mode === 'NONE' || !e.gst_value) return 0;
  if (e.gst_mode === 'AMOUNT') return e.gst_value;
  return Math.round(entrySubtotal(e) * e.gst_value / 100 * 100) / 100;
};
const entryTotal = (e: SaleEntry) => entrySubtotal(e) + entryGstAmount(e) - (e.discount || 0) + (e.round_off || 0);
const entryPaid = (e: SaleEntry) => e.payments.reduce((s, p) => s + p.amount, 0);
const entryBalance = (e: SaleEntry) => entryTotal(e) - entryPaid(e);

// ─── Unit-change warning dialog ───────────────────────────────────────────────
interface UnitChangeDialog { entryKey: string; lotKey: string; oldStockUnit: string; newLot: Lot; }

function UnitWarningDialog({ dialog, onSwitch, onCancel }: {
  dialog: UnitChangeDialog;
  onSwitch: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation(['sales', 'common']);
  const { oldStockUnit, newLot } = dialog;
  const newUnit = normaliseUnit(newLot.unit || newLot.item?.unit || 'Kg');
  const newAvail = newLot.available_qty;
  const convertible = canConvert(newUnit, normaliseUnit(oldStockUnit));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5"
      >
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
            <AlertTriangle className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <h3 className="font-bold text-base">{t('sales:lot_unit_changed')}</h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              Previous row used <span className="font-semibold text-foreground">{normaliseUnit(oldStockUnit)}</span>.
              This lot's stock unit is <span className="font-semibold text-foreground">{newUnit}</span>.
            </p>
          </div>
        </div>
        <div className="rounded-xl bg-muted/40 border border-border p-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t('sales:available_in_lot')}</span>
            <span className="font-semibold">{newAvail} {newUnit}</span>
          </div>
          {convertible && normaliseUnit(oldStockUnit) !== newUnit && (
            <div className="flex justify-between text-xs text-muted-foreground/80">
              <span>= in {normaliseUnit(oldStockUnit)}</span>
              <span>{convertQty(newAvail, newUnit, normaliseUnit(oldStockUnit))} {normaliseUnit(oldStockUnit)}</span>
            </div>
          )}
        </div>
        <div className="space-y-2">
          <Button className="w-full" onClick={onSwitch}>
            <ArrowRightLeft className="h-4 w-4 mr-2" />
            {t('sales:use_this_lot', { unit: newUnit })}
          </Button>
          <Button variant="ghost" className="w-full text-muted-foreground" onClick={onCancel}>
            {t('common:cancel')}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SaleCreatePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { id: editId } = useParams<{ id: string }>();
  const isEditMode = Boolean(editId);
  const defaultPartyId = searchParams.get('partyId') || '';
  const { t } = useTranslation(['sales', 'common']);

  const [loading, setLoading] = useState(false);
  const [parties, setParties] = useState<Party[]>([]);
  const [lots, setLots] = useState<Lot[]>([]);
  const [unitWarning, setUnitWarning] = useState<UnitChangeDialog | null>(null);
  const [showAddParty, setShowAddParty] = useState(false);

  const [entries, setEntries] = useState<SaleEntry[]>(() => [blankEntry(defaultPartyId)]);
  const [masterDataDone, setMasterDataDone] = useState(false);

  const formRef = useRef<HTMLDivElement>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const paymentReceiptInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const prefillDone = useRef(false);

  useEffect(() => { fetchMasterData(); }, []);

  // Prefill must not be gated on the lots list being non-empty: if the
  // master-data request failed, the edit page rendered a BLANK form whose
  // entries had no saleId, and saving created a duplicate sale instead of
  // updating. Gate on master data having settled (success or failure) so the
  // prefill's injected lots are not wiped by fetchMasterData's setLots.
  useEffect(() => {
    if (editId && masterDataDone && !prefillDone.current) {
      prefillDone.current = true;
      prefillSale();
    }
  }, [editId, masterDataDone]);

  const fetchMasterData = async () => {
    try {
      const [partiesRes, lotsRes] = await Promise.all([
        profileApi.parties(),
        // Server pages to 20 by default — most stock would be unselectable.
        salesApi.lots({ limit: 500 }),
      ]);
      setParties(partiesRes.data?.data || []);
      setLots(lotsRes.data?.data || []);
    } catch {
      setLots([]);
    } finally {
      setMasterDataDone(true);
    }
  };

  const refreshParties = useCallback(async () => {
    try {
      const res = await profileApi.parties();
      setParties(res.data?.data || []);
    } catch { /* ignore */ }
  }, []);

  // ─── Prefill for edit mode ─────────────────────────────────────────────────

  const prefillSale = async () => {
    if (!editId) return;
    try {
      const { data } = await salesApi.get(editId);
      const sale = data?.data;
      if (!sale) return;

      // Inject sale's lots so the dropdown can show them
      if (sale.sale_lots?.length > 0) {
        const saleLotObjects: Lot[] = sale.sale_lots
          .map((sl: any) => sl.lot)
          .filter(Boolean)
          .map((l: any) => ({ ...l, available_qty: Number(l.available_qty ?? 0), status: l.status || 'PARTIAL' }));
        setLots(prev => {
          const existingIds = new Set(prev.map((l: Lot) => l.id));
          const toAdd = saleLotObjects.filter((l: Lot) => !existingIds.has(l.id));
          return toAdd.length > 0 ? [...prev, ...toAdd] : prev;
        });
      }

      const prefillLots: SaleLineItem[] = (sale.sale_lots || []).map((sl: any) => {
        const lot = sl.lot || lots.find((l: Lot) => l.id === sl.lot_id);
        const stockUnit = normaliseUnit(lot?.unit || lot?.item?.unit || 'Kg');
        const qty = Number(sl.quantity_sold);
        const rate = Number(sl.rate);
        const originalAvailable = qty + Number(lot?.available_qty ?? 0);
        return {
          _key: uid(),
          lot_id: sl.lot_id,
          lot_number: lot?.lot_number || sl.lot_id,
          item_name: lot?.item?.name || '',
          stock_qty: originalAvailable,
          stock_unit: stockUnit,
          sell_unit: stockUnit,
          available_display: originalAvailable,
          quantity: qty,
          qty_in_stock_unit: qty,
          rate,
          amount: qty * rate,
        };
      });

      const prefillPayments: PaymentRow[] = (sale.payments || [])
        .filter((p: any) => Number(p.amount) > 0)
        .map((p: any) => ({
          _key: uid(),
          payment_mode: p.payment_mode || 'CASH',
          amount: Number(p.amount),
          transaction_ref: p.transaction_ref || '',
          notes: p.notes || '',
          receipt_url: p.receipt_url || undefined,
          receipt_preview: p.receipt_url || undefined,
          receipt_name: p.receipt_url ? p.receipt_url.split('/').pop() : undefined,
          receipt_type: p.receipt_url?.endsWith('.pdf') ? 'application/pdf' : p.receipt_url ? 'image/jpeg' : undefined,
        }));
      if (prefillPayments.length === 0 && Number(sale.paid_amount) > 0) {
        prefillPayments.push({ _key: uid(), payment_mode: 'CASH', amount: Number(sale.paid_amount), transaction_ref: '', notes: '' });
      }

      const entry: SaleEntry = {
        _key: uid(), expanded: true,
        party_id: sale.party_id || sale.party?.id || '',
        sale_date: sale.sale_date ? new Date(sale.sale_date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        notes: sale.notes || '',
        gst_mode: (sale.gst_mode as 'NONE' | 'PERCENT' | 'AMOUNT') || 'NONE',
        gst_value: Number(sale.gst_value ?? 0),
        discount: Number((sale as any).discount ?? 0),
        round_off: Number((sale as any).round_off ?? 0),
        reminders: ((sale as any).reminders || []).map((r: any) => ({
          _key: uid(),
          remind_on: r.remind_on ? new Date(r.remind_on).toISOString().split('T')[0] : '',
          amount: Number(r.amount ?? 0),
          note: r.note || '',
        })),
        lineItems: prefillLots.length > 0 ? prefillLots : [blankLineItem()],
        payments: prefillPayments.length > 0 ? prefillPayments : [blankPayment()],
        attachments: (sale.attachments || []).map((a: any) => ({
          _key: uid(),
          preview: a.file_url, name: a.file_name || a.file_url?.split('/').pop() || 'file',
          size: a.file_size || 0, type: a.file_type || '',
          uploadedId: a.id, uploadedUrl: a.file_url,
        })),
        saleId: editId,
      };
      setEntries([entry]);
    } catch {
      toast.error(t('sales:load_error'));
    }
  };

  // ─── Entry helpers ─────────────────────────────────────────────────────────

  const updateEntry = useCallback((key: string, patch: Partial<SaleEntry>) => {
    setEntries(prev => prev.map(e => e._key === key ? { ...e, ...patch } : e));
  }, []);

  const toggleExpand = (key: string) => {
    setEntries(prev => prev.map(e => e._key === key ? { ...e, expanded: !e.expanded } : e));
  };

  const addEntry = () => {
    const last = entries[entries.length - 1];
    setEntries(prev => [...prev, blankEntry(last?.party_id, last?.sale_date)]);
    setTimeout(() => {
      const scrollContainer = formRef.current?.closest('main') || formRef.current?.closest('[class*="overflow-y-auto"]');
      if (scrollContainer) scrollContainer.scrollTo({ top: scrollContainer.scrollHeight, behavior: 'smooth' });
    }, 150);
  };

  const removeEntry = (key: string) => {
    if (entries.length <= 1) return toast.error(t('sales:at_least_one_entry'));
    setEntries(prev => prev.filter(e => e._key !== key));
  };

  // ─── Line item helpers ─────────────────────────────────────────────────────

  const recomputeRow = (row: SaleLineItem): SaleLineItem => {
    const avail = canConvert(row.stock_unit, row.sell_unit)
      ? convertQty(row.stock_qty, row.stock_unit, row.sell_unit)
      : row.stock_qty;
    const qtyInStock = canConvert(row.sell_unit, row.stock_unit)
      ? convertQty(row.quantity, row.sell_unit, row.stock_unit)
      : row.quantity;
    return { ...row, available_display: avail, qty_in_stock_unit: qtyInStock, amount: row.quantity * row.rate };
  };

  const applyLot = (entryKey: string, lotKey: string, lot: Lot, sellUnit: string) => {
    const stockUnit = normaliseUnit(lot.unit || lot.item?.unit || 'Kg');
    const norm = normaliseUnit(sellUnit);
    const avail = canConvert(stockUnit, norm) ? convertQty(lot.available_qty, stockUnit, norm) : lot.available_qty;
    setEntries(prev => prev.map(e => {
      if (e._key !== entryKey) return e;
      return {
        ...e, lineItems: e.lineItems.map(row => {
          if (row._key !== lotKey) return row;
          return recomputeRow({
            ...row,
            lot_id: lot.id, lot_number: lot.lot_number, item_name: lot.item?.name || '',
            stock_qty: lot.available_qty, stock_unit: stockUnit, sell_unit: norm,
            available_display: avail, quantity: 0, qty_in_stock_unit: 0,
            rate: lot.purchase_rate, amount: 0,
          });
        }),
      };
    }));
  };

  const handleLotChange = (entryKey: string, lotKey: string, lotId: string) => {
    const lot = lots.find(l => l.id === lotId);
    if (!lot) return;
    const lotUnit = normaliseUnit(lot.unit || lot.item?.unit || 'Kg');
    const entry = entries.find(e => e._key === entryKey);
    const row = entry?.lineItems.find(r => r._key === lotKey);
    const currentStockUnit = row?.stock_unit || '';
    if (!currentStockUnit || currentStockUnit === lotUnit) {
      applyLot(entryKey, lotKey, lot, row?.sell_unit || lotUnit);
      return;
    }
    setUnitWarning({ entryKey, lotKey, oldStockUnit: currentStockUnit, newLot: lot });
  };

  const handleSellUnitChange = (entryKey: string, lotKey: string, newSellUnit: string) => {
    setEntries(prev => prev.map(e => {
      if (e._key !== entryKey) return e;
      return {
        ...e, lineItems: e.lineItems.map(row => {
          if (row._key !== lotKey) return row;
          return recomputeRow({ ...row, sell_unit: newSellUnit, quantity: 0, amount: 0 });
        }),
      };
    }));
  };

  const handleQtyChange = (entryKey: string, lotKey: string, rawVal: string) => {
    const qty = parseFloat(rawVal) || 0;
    setEntries(prev => prev.map(e => {
      if (e._key !== entryKey) return e;
      return {
        ...e, lineItems: e.lineItems.map(row => {
          if (row._key !== lotKey) return row;
          const qtyInStock = canConvert(row.sell_unit, row.stock_unit)
            ? convertQty(qty, row.sell_unit, row.stock_unit) : qty;
          const cappedStock = Math.min(qtyInStock, row.stock_qty);
          const cappedQty = canConvert(row.stock_unit, row.sell_unit)
            ? convertQty(cappedStock, row.stock_unit, row.sell_unit) : cappedStock;
          return { ...row, quantity: cappedQty, qty_in_stock_unit: cappedStock, amount: cappedQty * row.rate };
        }),
      };
    }));
  };

  const handleRateChange = (entryKey: string, lotKey: string, rawVal: string) => {
    const rate = parseFloat(rawVal) || 0;
    setEntries(prev => prev.map(e => {
      if (e._key !== entryKey) return e;
      return {
        ...e, lineItems: e.lineItems.map(row => {
          if (row._key !== lotKey) return row;
          return { ...row, rate, amount: row.quantity * rate };
        }),
      };
    }));
  };

  const addLineItem = (entryKey: string) => {
    setEntries(prev => prev.map(e => e._key === entryKey ? { ...e, lineItems: [...e.lineItems, blankLineItem()] } : e));
  };

  const removeLineItem = (entryKey: string, lotKey: string) => {
    setEntries(prev => prev.map(e => {
      if (e._key !== entryKey) return e;
      if (e.lineItems.length <= 1) { toast.error(t('sales:at_least_one_lot')); return e; }
      return { ...e, lineItems: e.lineItems.filter(r => r._key !== lotKey) };
    }));
  };

  // ─── Payment helpers ───────────────────────────────────────────────────────

  const updatePayment = (entryKey: string, payKey: string, patch: Partial<PaymentRow>) => {
    setEntries(prev => prev.map(e => {
      if (e._key !== entryKey) return e;
      return { ...e, payments: e.payments.map(p => p._key === payKey ? { ...p, ...patch } : p) };
    }));
  };

  const addPayment = (entryKey: string) => {
    setEntries(prev => prev.map(e => e._key === entryKey ? { ...e, payments: [...e.payments, blankPayment()] } : e));
  };

  const removePayment = (entryKey: string, payKey: string) => {
    setEntries(prev => prev.map(e => {
      if (e._key !== entryKey) return e;
      if (e.payments.length <= 1) { toast.error(t('sales:at_least_one_payment')); return e; }
      return { ...e, payments: e.payments.filter(p => p._key !== payKey) };
    }));
  };

  const handlePaymentReceiptPick = (entryKey: string, payKey: string, file: File | null) => {
    if (!file) return;
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
    if (!allowed.includes(file.type)) { toast.error(t('sales:unsupported_file', { name: file.name })); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error(t('sales:file_too_large', { name: file.name })); return; }
    const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : '';
    updatePayment(entryKey, payKey, {
      receipt_file: file, receipt_preview: preview,
      receipt_name: file.name, receipt_type: file.type, receipt_url: undefined,
    });
  };

  const removePaymentReceipt = (entryKey: string, payKey: string) => {
    setEntries(prev => prev.map(e => {
      if (e._key !== entryKey) return e;
      return {
        ...e, payments: e.payments.map(p => {
          if (p._key !== payKey) return p;
          if (p.receipt_preview && !p.receipt_url) URL.revokeObjectURL(p.receipt_preview);
          return { ...p, receipt_file: null, receipt_preview: undefined, receipt_url: undefined, receipt_name: undefined, receipt_type: undefined };
        }),
      };
    }));
  };

  // ─── Attachment helpers ────────────────────────────────────────────────────

  const handleFilePick = (entryKey: string, files: FileList | null) => {
    if (!files) return;
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
    Array.from(files).forEach(file => {
      if (!allowed.includes(file.type)) { toast.error(t('sales:unsupported_file', { name: file.name })); return; }
      if (file.size > 10 * 1024 * 1024) { toast.error(t('sales:file_too_large', { name: file.name })); return; }
      const att: AttachmentFile = {
        _key: uid(), file,
        preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : '',
        name: file.name, size: file.size, type: file.type,
      };
      setEntries(prev => prev.map(e => e._key === entryKey ? { ...e, attachments: [...e.attachments, att] } : e));
    });
  };

  // Already-persisted attachments removed in edit mode must be deleted
  // server-side on save — removing them from local state alone brings them
  // back on reload.
  const deletedAttachmentsRef = useRef<{ saleId: string; attachmentId: string }[]>([]);

  const removeAttachment = (entryKey: string, attKey: string) => {
    setEntries(prev => prev.map(e => {
      if (e._key !== entryKey) return e;
      const att = e.attachments.find(a => a._key === attKey);
      if (att?.preview && !att.uploadedUrl) URL.revokeObjectURL(att.preview);
      if (att?.uploadedId && e.saleId) {
        deletedAttachmentsRef.current.push({ saleId: e.saleId, attachmentId: att.uploadedId });
      }
      return { ...e, attachments: e.attachments.filter(a => a._key !== attKey) };
    }));
  };

  // ─── Submit ────────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate all entries
    let valid = true;
    for (const entry of entries) {
      if (!entry.party_id) { toast.error(t('sales:select_party_error')); valid = false; break; }
      if (entry.lineItems.every(i => i.amount === 0)) { toast.error(t('sales:add_lot_with_amount')); valid = false; break; }
    }
    if (!valid) return;

    try {
      setLoading(true);
      const savedIds: string[] = [];

      for (const entry of entries) {
        const validItems = entry.lineItems.filter(i => i.amount > 0);
        const validPayments = entry.payments.filter(p => p.amount > 0);

        // 1. Upload payment receipts
        for (const p of validPayments) {
          if (p.receipt_file && !p.receipt_url) {
            try {
              updatePayment(entry._key, p._key, { receipt_uploading: true });
              const res = await salesApi.uploadPaymentReceipt(p.receipt_file);
              const url = res.data?.data?.url;
              updatePayment(entry._key, p._key, { receipt_uploading: false, receipt_url: url });
              p.receipt_url = url;
            } catch {
              updatePayment(entry._key, p._key, { receipt_uploading: false });
              toast.error(t('sales:receipt_upload_failed'));
            }
          }
        }

        const payload = {
          partyId: entry.party_id,
          saleDate: entry.sale_date ? new Date(entry.sale_date).toISOString() : undefined,
          notes: entry.notes || undefined,
          // Edit mode sends EXPLICIT values: the backend treats an absent key
          // as "keep the old value", so `undefined` for a cleared discount or
          // GST switched to NONE made the correction impossible through the UI.
          ...(isEditMode
            ? {
                gstMode: entry.gst_mode,
                gstValue: entry.gst_mode === 'NONE' ? 0 : entry.gst_value,
                gstAmount: entry.gst_mode === 'NONE' ? 0 : entryGstAmount(entry),
                discount: entry.discount || 0,
                roundOff: entry.round_off || 0,
              }
            : {
                gstMode: entry.gst_mode !== 'NONE' ? entry.gst_mode : undefined,
                gstValue: entry.gst_mode !== 'NONE' ? entry.gst_value : undefined,
                gstAmount: entry.gst_mode !== 'NONE' ? entryGstAmount(entry) : undefined,
                discount: entry.discount || undefined,
                roundOff: entry.round_off || undefined,
              }),
          reminders: entry.reminders
            .filter(r => r.remind_on)
            .map(r => ({
              remindOn: new Date(r.remind_on).toISOString(),
              amount: r.amount > 0 ? r.amount : undefined,
              note: r.note || undefined,
            })),
          // PATCH /sales/:id ignores saleLots/payments entirely — sending
          // them from the edit form implied changes were saved when they were
          // silently discarded. The lot/payment sections are read-only in
          // edit mode; only create sends them.
          ...(!isEditMode && {
            saleLots: validItems.map(i => {
              const l = lots.find(lo => lo.id === i.lot_id);
              return {
                lotId: i.lot_id,
                itemId: l?.item_id || (l?.item as any)?.id || '',
                quantitySold: i.qty_in_stock_unit,
                rate: i.rate,
              };
            }),
            expenses: [],
            payments: validPayments.map(p => ({
              paymentMode: p.payment_mode,
              amount: p.amount,
              transactionRef: p.transaction_ref || undefined,
              receiptUrl: p.receipt_url || undefined,
              notes: p.notes || undefined,
            })),
          }),
        };

        // 2. Create or update sale. In edit mode a missing saleId means the
        // prefill failed — falling through to create would insert a DUPLICATE
        // sale (deducting stock again) while the sale being edited stays
        // untouched. Refuse instead.
        let saleId: string;
        if (isEditMode) {
          if (!entry.saleId) {
            toast.error(t('sales:load_error'));
            return;
          }
          await salesApi.update(entry.saleId, payload);
          saleId = entry.saleId;
          // Persist attachment removals made in the form — local-state removal
          // alone brings them back on reload.
          const toDelete = deletedAttachmentsRef.current.filter(d => d.saleId === saleId);
          for (const d of toDelete) {
            try {
              await salesApi.deleteAttachment(d.saleId, d.attachmentId);
            } catch {
              toast.error(t('purchases:upload_attachment_failed', { name: '' }));
            }
          }
          deletedAttachmentsRef.current = deletedAttachmentsRef.current.filter(d => d.saleId !== saleId);
          toast.success(t('sales:sale_updated'));
        } else {
          const res = await salesApi.create(payload);
          saleId = res.data?.data?.id;
          toast.success(t('sales:sale_created'));
        }
        savedIds.push(saleId);

        // 3. Upload bill attachments
        const newAttachments = entry.attachments.filter(a => a.file && !a.uploadedId);
        for (const att of newAttachments) {
          try {
            setEntries(prev => prev.map(en => en._key === entry._key ? {
              ...en, attachments: en.attachments.map(a => a._key === att._key ? { ...a, uploading: true } : a),
            } : en));
            const res = await salesApi.uploadAttachment(saleId, att.file!);
            setEntries(prev => prev.map(en => en._key === entry._key ? {
              ...en, attachments: en.attachments.map(a => a._key === att._key ? {
                ...a, uploading: false, uploadedId: res.data?.data?.id, uploadedUrl: res.data?.data?.file_url,
              } : a),
            } : en));
          } catch {
            setEntries(prev => prev.map(en => en._key === entry._key ? {
              ...en, attachments: en.attachments.map(a => a._key === att._key ? { ...a, uploading: false, error: 'Upload failed' } : a),
            } : en));
            toast.error(t('purchases:upload_attachment_failed', { name: att.name }));
          }
        }
      }

      navigate(savedIds.length === 1 ? `/sales/${savedIds[0]}` : '/sales');
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('sales:sale_save_error', 'Failed to save sale'));
    } finally {
      setLoading(false);
    }
  };

  // ─── Render a single entry card ────────────────────────────────────────────

  const renderEntry = (entry: SaleEntry, idx: number) => {
    const total = entryTotal(entry);
    const paid = entryPaid(entry);
    const balance = entryBalance(entry);
    const subtotal = entrySubtotal(entry);
    const gstAmt = entryGstAmount(entry);

    return (
      <motion.div
        key={entry._key}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        className="border border-border rounded-2xl overflow-hidden shadow-sm"
      >
        {/* ── Entry Header ── */}
        <div
          className={cn(
            'flex items-center justify-between p-4 cursor-pointer transition-colors',
            entry.expanded ? 'bg-primary/5 border-b border-border' : 'bg-card hover:bg-muted/40',
          )}
          onClick={() => toggleExpand(entry._key)}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
              <ShoppingCart className="h-4 w-4 text-emerald-500" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm">
                  {isEditMode ? t('sales:edit_sale') : t('sales:sale_entry', { index: idx + 1 })}
                </span>
                {entry.party_id && (
                  <Badge variant="outline" className="text-xs bg-muted">
                    {parties.find(p => p.id === entry.party_id)?.name || entry.party_id}
                  </Badge>
                )}
                {entry.sale_date && (
                  <Badge variant="outline" className="text-xs font-mono text-muted-foreground">
                    {entry.sale_date}
                  </Badge>
                )}
              </div>
              {total > 0 && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formatCurrency(total)} total · {formatCurrency(paid)} received ·{' '}
                  <span className={balance > 0 ? 'text-amber-400' : 'text-emerald-400'}>
                    {formatCurrency(Math.abs(balance))} {balance > 0 ? 'due' : 'advance'}
                  </span>
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!isEditMode && entries.length > 1 && (
              <Button
                type="button" variant="ghost" size="icon"
                className="h-7 w-7 text-red-400 hover:text-red-300"
                onClick={e => { e.stopPropagation(); removeEntry(entry._key); }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
            {entry.expanded
              ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
              : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </div>
        </div>

        {/* ── Entry Body ── */}
        <AnimatePresence initial={false}>
          {entry.expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1, overflow: 'visible' }}
              exit={{ height: 0, opacity: 0, overflow: 'hidden' }}
              transition={{ duration: 0.2 }}
              style={{ overflow: 'hidden' }}
            >
              <div className="p-4 space-y-6 bg-card">

                {/* ── Sale Details ── */}
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">{t('sales:sale_details_heading')}</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>{t('sales:party_customer_label')} *</Label>
                      <Select
                        value={entry.party_id}
                        onValueChange={v => {
                          if (v === '__add_new__') { setShowAddParty(true); return; }
                          updateEntry(entry._key, { party_id: v });
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t('sales:select_customer')} />
                        </SelectTrigger>
                        <SelectContent>
                          {parties.map(p => (
                            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                          ))}
                          <SelectItem value="__add_new__" className="text-primary font-medium">
                            <div className="flex items-center gap-2">
                              <Plus className="h-3.5 w-3.5" />
                              <span>{t('sales:add_new_customer')}</span>
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>{t('sales:sale_date_label')}</Label>
                      <Input
                        type="date"
                        value={entry.sale_date}
                        onChange={e => updateEntry(entry._key, { sale_date: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label>{t('sales:notes_label')}</Label>
                      <Input
                        placeholder={t('sales:notes_placeholder')}
                        value={entry.notes}
                        onChange={e => updateEntry(entry._key, { notes: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                <Separator />

                {/* ── Lots ── */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                      <Package className="h-4 w-4" /> {t('sales:lots_items')}
                    </h4>
                    <Button type="button" variant="outline" size="sm" disabled={isEditMode} onClick={() => addLineItem(entry._key)}>
                      <Plus className="h-4 w-4 mr-1" /> {t('sales:add_lot')}
                    </Button>
                  </div>

                  {isEditMode && (
                    <p className="text-xs text-muted-foreground mb-2">
                      {t('sales:edit_lots_locked', 'Lots, quantities and payments cannot be changed after a sale is recorded. To change them, delete this sale and create it again.')}
                    </p>
                  )}

                  <div className="hidden sm:grid grid-cols-[1fr_120px_160px_110px_90px_36px] gap-3 text-xs text-muted-foreground uppercase tracking-wider px-1 pb-2">
                    <div>{t('sales:lot_col')}</div><div>{t('sales:available_col')}</div><div>{t('sales:sell_qty_unit')}</div><div>{t('sales:rate_inr')}</div><div>{t('sales:amount_col')}</div><div></div>
                  </div>

                  {entry.lineItems.map(item => {
                    const unitOpts = item.stock_unit ? sellUnitOptions(item.stock_unit) : ['SFT', 'Kg', 'Ton'];
                    const crossUnit = item.sell_unit && item.stock_unit && normaliseUnit(item.sell_unit) !== normaliseUnit(item.stock_unit);
                    return (
                      <motion.div
                        key={item._key}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="grid grid-cols-[1fr_120px_160px_110px_90px_36px] gap-3 items-start py-2 border-b border-border/40 last:border-0"
                      >
                        <div>
                          <Select value={item.lot_id} disabled={isEditMode} onValueChange={v => handleLotChange(entry._key, item._key, v)}>
                            <SelectTrigger>
                              <SelectValue placeholder={t('sales:select_lot')} />
                            </SelectTrigger>
                            <SelectContent>
                              {/* A partially-sold lot (status PARTIAL) still has stock —
                                  filtering to AVAILABLE only made every lot unsellable
                                  after its first sale. */}
                              {lots.filter(l =>
                                (Number(l.available_qty) > 0 && !['SOLD_OUT', 'CANCELLED', 'EXPIRED'].includes(l.status)) ||
                                (isEditMode && entry.lineItems.some(li => li.lot_id === l.id))
                              ).map(l => (
                                <SelectItem key={l.id} value={l.id}>
                                  {l.lot_number} — {l.item?.name} ({l.available_qty} {normaliseUnit(l.unit || l.item?.unit || 'Kg')})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <div className="h-10 flex items-center px-3 rounded-md bg-muted/50 text-sm">
                            {item.lot_id ? (
                              <span>
                                <span className="font-semibold text-foreground">{item.stock_qty}</span>
                                <span className="ml-1 text-xs text-muted-foreground">{item.stock_unit}</span>
                                {crossUnit && canConvert(item.stock_unit, item.sell_unit) && (
                                  <span className="block text-[10px] text-primary/70 leading-tight">
                                    ≈ {item.available_display} {item.sell_unit}
                                  </span>
                                )}
                              </span>
                            ) : (
                              <span className="text-xs italic text-muted-foreground/50">—</span>
                            )}
                          </div>
                        </div>

                        <div className="space-y-1">
                          <div className="flex gap-1.5">
                            <div className="relative flex-1">
                              <Input
                                type="number" placeholder={t('sales:qty_placeholder')}
                                disabled={!item.lot_id || isEditMode}
                                value={item.quantity || ''}
                                onChange={e => handleQtyChange(entry._key, item._key, e.target.value)}
                              />
                            </div>
                            <Select
                              value={item.sell_unit || item.stock_unit}
                              disabled={!item.lot_id || isEditMode}
                              onValueChange={v => handleSellUnitChange(entry._key, item._key, v)}
                            >
                              <SelectTrigger className="w-[80px] h-10 text-xs font-semibold">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {unitOpts.map(u => (
                                  <SelectItem key={u} value={u} className="text-xs">
                                    {u}
                                    {u !== item.stock_unit && (
                                      <span className="ml-1 text-muted-foreground text-[10px]">(convert)</span>
                                    )}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          {crossUnit && item.quantity > 0 && (
                            <p className="text-[10px] text-primary/80 pl-1">
                              = {item.qty_in_stock_unit} {item.stock_unit} deducted from stock
                            </p>
                          )}
                        </div>

                        <div>
                          <Input
                            type="number" placeholder={t('sales:rate_placeholder')}
                            disabled={!item.lot_id || isEditMode}
                            value={item.rate || ''}
                            onChange={e => handleRateChange(entry._key, item._key, e.target.value)}
                          />
                        </div>

                        <div className="h-10 flex items-center text-sm font-semibold">
                          {item.amount > 0
                            ? formatCurrency(item.amount)
                            : <span className="text-muted-foreground">₹0</span>}
                        </div>

                        <div>
                          <Button
                            type="button" variant="ghost" size="icon"
                            onClick={() => removeLineItem(entry._key, item._key)}
                            disabled={entry.lineItems.length <= 1 || isEditMode}
                            className="text-red-400 hover:text-red-300 h-10 w-10"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>

                <Separator />

                {/* ── Bills & Attachments ── */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                      <Paperclip className="h-4 w-4" /> {t('sales:bills_attachments_section')}
                    </h4>
                    <Button type="button" variant="outline" size="sm"
                      onClick={() => fileInputRefs.current[entry._key]?.click()}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> {t('sales:attach_bills')}
                    </Button>
                    <input
                      ref={el => { fileInputRefs.current[entry._key] = el; }}
                      type="file" multiple
                      accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
                      className="hidden"
                      onChange={e => { handleFilePick(entry._key, e.target.files); e.target.value = ''; }}
                    />
                  </div>
                  {entry.attachments.length === 0 ? (
                    <div
                      className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
                      onClick={() => fileInputRefs.current[entry._key]?.click()}
                    >
                      <Paperclip className="h-6 w-6 mx-auto mb-2 text-muted-foreground/40" />
                      Click to attach invoices, bills or PDFs (max 10 MB each)
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-3">
                      {entry.attachments.map(att => (
                        <div key={att._key} className="relative group w-24 rounded-xl border border-border bg-muted/30 overflow-hidden">
                          <div className="h-20 w-full flex items-center justify-center bg-muted/50">
                            {att.type.startsWith('image/') ? (
                              <img src={att.preview || att.uploadedUrl} alt={att.name} className="h-full w-full object-cover" />
                            ) : (
                              <FileText className="h-8 w-8 text-muted-foreground" />
                            )}
                          </div>
                          <p className="text-[10px] truncate px-1 py-1 text-muted-foreground">{att.name}</p>
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                            {(att.uploadedUrl || att.preview) && (
                              <button type="button" title={t('sales:preview')}
                                onClick={() => window.open(att.uploadedUrl || att.preview, '_blank')}
                                className="text-white hover:text-blue-300 transition-colors">
                                <Eye className="h-4 w-4" />
                              </button>
                            )}
                            {att.uploadedUrl && (
                              <a href={att.uploadedUrl} download={att.name} target="_blank" rel="noreferrer"
                                className="text-white hover:text-green-300 transition-colors" title={t('purchases:download')}
                                onClick={e => e.stopPropagation()}>
                                <Download className="h-4 w-4" />
                              </a>
                            )}
                            <button type="button" title={t('sales:remove')}
                              onClick={() => removeAttachment(entry._key, att._key)}
                              className="text-white hover:text-red-400 transition-colors">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                          {att.uploading && (
                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                              <Loader2 className="h-5 w-5 text-white animate-spin" />
                            </div>
                          )}
                          {att.error && (
                            <div className="absolute bottom-0 left-0 right-0 bg-red-500/80 text-white text-[9px] text-center py-0.5">Failed</div>
                          )}
                          {att.uploadedId && !att.uploading && (
                            <div className="absolute top-1 right-1 h-4 w-4 rounded-full bg-emerald-500 flex items-center justify-center">
                              <span className="text-[9px] text-white">✓</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <Separator />

                {/* ── Payment Summary ── */}
                <div className="space-y-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <Calculator className="h-4 w-4" /> {t('sales:payment_details')}
                  </h4>

                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">{t('sales:items_subtotal')}</span>
                    <span className="font-medium">{formatCurrency(subtotal)}</span>
                  </div>

                  {/* GST */}
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground whitespace-nowrap">{t('sales:gst_section')}</span>
                    <select
                      value={entry.gst_mode}
                      onChange={e => updateEntry(entry._key, {
                        gst_mode: e.target.value as 'NONE' | 'PERCENT' | 'AMOUNT',
                        gst_value: e.target.value === 'NONE' ? 0 : entry.gst_value,
                      })}
                      className="h-8 rounded-md border border-border bg-background px-2 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value="NONE">{t('sales:none')}</option>
                      <option value="PERCENT">%</option>
                      <option value="AMOUNT">₹ Fixed</option>
                    </select>
                    {entry.gst_mode !== 'NONE' && (
                      <div className="relative flex-1 max-w-[140px]">
                        <Input
                          type="number" min={0}
                          step={entry.gst_mode === 'PERCENT' ? '0.01' : '1'}
                          placeholder={entry.gst_mode === 'PERCENT' ? 'e.g. 18' : 'Amount'}
                          value={entry.gst_value || ''}
                          onChange={e => updateEntry(entry._key, { gst_value: parseFloat(e.target.value) || 0 })}
                          className="h-8 text-xs pr-8"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                          {entry.gst_mode === 'PERCENT' ? '%' : '₹'}
                        </span>
                      </div>
                    )}
                    {entry.gst_mode !== 'NONE' && gstAmt > 0 && (
                      <span className="ml-auto text-sm font-medium text-blue-400">
                        +{formatCurrency(gstAmt)}
                      </span>
                    )}
                  </div>

                  {/* Discount & Round-off */}
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 flex-1">
                      <span className="text-sm text-muted-foreground whitespace-nowrap">Discount</span>
                      <div className="relative flex-1 max-w-[140px]">
                        <Input
                          type="number" min={0} step="0.01" placeholder="0"
                          value={entry.discount || ''}
                          onChange={e => updateEntry(entry._key, { discount: parseFloat(e.target.value) || 0 })}
                          className="h-8 text-xs pr-6"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">₹</span>
                      </div>
                      {(entry.discount || 0) > 0 && <span className="text-sm font-medium text-emerald-500">-{formatCurrency(entry.discount)}</span>}
                    </div>
                    <div className="flex items-center gap-2 flex-1">
                      <span className="text-sm text-muted-foreground whitespace-nowrap">Round Off</span>
                      <div className="relative flex-1 max-w-[140px]">
                        <Input
                          type="number" step="0.01" placeholder="0"
                          value={entry.round_off || ''}
                          onChange={e => updateEntry(entry._key, { round_off: parseFloat(e.target.value) || 0 })}
                          className="h-8 text-xs pr-6"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">₹</span>
                      </div>
                      {(entry.round_off || 0) !== 0 && (
                        <span className={cn("text-sm font-medium", entry.round_off > 0 ? 'text-orange-500' : 'text-emerald-500')}>
                          {entry.round_off > 0 ? '+' : ''}{formatCurrency(entry.round_off)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Total */}
                  <div className="flex justify-between items-center p-3 rounded-lg bg-muted/30">
                    <span className="text-sm font-medium">{t('sales:total_amount')}</span>
                    <span className="text-xl font-bold text-emerald-400">{formatCurrency(total)}</span>
                  </div>

                  {/* Split Payments */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-semibold flex items-center gap-2">
                        <span className="h-5 w-5 rounded-md bg-emerald-500/10 flex items-center justify-center">
                          <IndianRupee className="h-3 w-3 text-emerald-500" />
                        </span>
                        Payments Received
                      </h4>
                      <Button type="button" variant="outline" size="sm" disabled={isEditMode} onClick={() => addPayment(entry._key)}>
                        <Plus className="h-3.5 w-3.5 mr-1" /> {t('sales:add_payment')}
                      </Button>
                    </div>

                    <div className="grid grid-cols-[1.2fr_1fr_1.2fr_1.2fr_auto_2rem] gap-2 px-1 mb-1 border-b border-border pb-1">
                      {[t('sales:mode_label'), t('sales:amount_inr'), t('sales:ref_placeholder'), t('sales:notes_label'), t('common:receipt'), ''].map(h => (
                        <span key={h} className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{h}</span>
                      ))}
                    </div>

                    <div className="divide-y divide-border">
                      {entry.payments.map(p => (
                        <div key={p._key} className="grid grid-cols-[1.2fr_1fr_1.2fr_1.2fr_auto_2rem] gap-2 items-center py-2 px-1">
                          <Select value={p.payment_mode} disabled={isEditMode} onValueChange={v => updatePayment(entry._key, p._key, { payment_mode: v })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="CASH">{t('common:mode_cash')}</SelectItem>
                              <SelectItem value="UPI">{t('common:mode_upi')}</SelectItem>
                              <SelectItem value="BANK_TRANSFER">{t('common:mode_bank_transfer')}</SelectItem>
                              <SelectItem value="CARD">{t('common:mode_card')}</SelectItem>
                              <SelectItem value="CHEQUE">{t('common:mode_cheque')}</SelectItem>
                              <SelectItem value="CREDIT">{t('common:mode_credit')}</SelectItem>
                            </SelectContent>
                          </Select>

                          <Input
                            type="number" min={0} step="0.01" placeholder="0.00"
                            disabled={isEditMode}
                            value={p.amount || ''}
                            onChange={e => updatePayment(entry._key, p._key, { amount: parseFloat(e.target.value) || 0 })}
                          />

                          <Input
                            placeholder={t('sales:ref_placeholder')}
                            disabled={isEditMode}
                            value={p.transaction_ref}
                            onChange={e => updatePayment(entry._key, p._key, { transaction_ref: e.target.value })}
                          />

                          <Input
                            placeholder={t('sales:payment_notes_placeholder')}
                            disabled={isEditMode}
                            value={p.notes}
                            onChange={e => updatePayment(entry._key, p._key, { notes: e.target.value })}
                          />

                          <div className="flex items-center gap-1 min-w-[72px]">
                            {(p.receipt_preview || p.receipt_url) ? (
                              <div className="relative group h-9 w-14 rounded-lg border border-border overflow-hidden bg-muted/30 flex items-center justify-center shrink-0">
                                {p.receipt_type?.startsWith('image/') ? (
                                  <img
                                    src={p.receipt_preview || p.receipt_url}
                                    alt={t('sales:receipt_alt')}
                                    className="h-full w-full object-cover cursor-pointer"
                                    onClick={() => window.open(p.receipt_url || p.receipt_preview, '_blank')}
                                  />
                                ) : (
                                  <FileText
                                    className="h-4 w-4 text-muted-foreground cursor-pointer"
                                    onClick={() => window.open(p.receipt_url || p.receipt_preview, '_blank')}
                                  />
                                )}
                                {p.receipt_uploading && (
                                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                    <Loader2 className="h-3 w-3 text-white animate-spin" />
                                  </div>
                                )}
                                <button
                                  type="button"
                                  onClick={() => removePaymentReceipt(entry._key, p._key)}
                                  className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <X className="h-2.5 w-2.5" />
                                </button>
                              </div>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => paymentReceiptInputRefs.current[`${entry._key}_${p._key}`]?.click()}
                                  className="h-9 px-2 rounded-lg border border-dashed border-border text-muted-foreground hover:border-primary/50 hover:text-primary hover:bg-primary/5 transition-colors flex items-center gap-1 text-xs"
                                  title={t('sales:attach_receipt')}
                                >
                                  <Paperclip className="h-3.5 w-3.5" />
                                  <span className="hidden sm:inline">Attach</span>
                                </button>
                                <input
                                  ref={el => { paymentReceiptInputRefs.current[`${entry._key}_${p._key}`] = el; }}
                                  type="file"
                                  accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
                                  className="hidden"
                                  onChange={e => { handlePaymentReceiptPick(entry._key, p._key, e.target.files?.[0] || null); e.target.value = ''; }}
                                />
                              </>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => removePayment(entry._key, p._key)}
                            disabled={entry.payments.length <= 1 || isEditMode}
                            className="h-9 w-9 rounded-lg flex items-center justify-center text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-30 disabled:pointer-events-none"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <Separator />

                  {/* Paid & Balance */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-emerald-500 font-medium">{t('sales:received_amount')}</span>
                      <span className="font-semibold text-emerald-500">{formatCurrency(paid)}</span>
                    </div>
                    <div className={cn(
                      'flex justify-between items-center p-3 rounded-lg font-bold text-base',
                      balance > 0 ? 'bg-amber-500/10 text-amber-500' : 'bg-emerald-500/10 text-emerald-500',
                    )}>
                      <span>{balance > 0 ? t('sales:balance_receivable') : t('sales:advance_received')}</span>
                      <span>{formatCurrency(Math.abs(balance))}</span>
                    </div>
                  </div>

                  {/* Collection Reminders */}
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <Bell className="h-4 w-4 text-amber-500" />
                        <span className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                          Collection Reminders (Optional)
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => updateEntry(entry._key, { reminders: [...entry.reminders, blankReminder()] })}
                        className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 hover:text-amber-700 font-medium"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        {t('sales:add_reminder')}
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Set one or more dates to receive an in-app &amp; WhatsApp reminder to collect this payment.
                    </p>

                    {entry.reminders.length === 0 && (
                      <button
                        type="button"
                        onClick={() => updateEntry(entry._key, { reminders: [blankReminder()] })}
                        className="w-full border border-dashed border-amber-400/50 rounded-lg py-2.5 text-xs text-amber-600/70 hover:text-amber-600 hover:border-amber-400 transition-colors flex items-center justify-center gap-1.5"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add a reminder (e.g. partial on 15th, full on 30th)
                      </button>
                    )}

                    {entry.reminders.map((r, rIdx) => (
                      <div key={r._key} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
                        <div>
                          <Label className="text-xs text-muted-foreground mb-1 block">
                            Remind on Date {entry.reminders.length > 1 && <span className="text-amber-500">#{rIdx + 1}</span>}
                          </Label>
                          <Input
                            type="date"
                            value={r.remind_on}
                            min={new Date().toISOString().split('T')[0]}
                            onChange={e => updateEntry(entry._key, {
                              reminders: entry.reminders.map(rm => rm._key === r._key ? { ...rm, remind_on: e.target.value } : rm),
                            })}
                            className="h-9 text-sm"
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground mb-1 block">
                            {t('sales:amount_inr')} <span className="opacity-60">(0 = {t('sales:full_balance')})</span>
                          </Label>
                          <Input
                            type="number" min={0} step="0.01"
                            placeholder={balance > 0 ? balance.toFixed(2) : '0.00'}
                            value={r.amount || ''}
                            onChange={e => updateEntry(entry._key, {
                              reminders: entry.reminders.map(rm => rm._key === r._key ? { ...rm, amount: parseFloat(e.target.value) || 0 } : rm),
                            })}
                            className="h-9 text-sm"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => updateEntry(entry._key, {
                            reminders: entry.reminders.filter(rm => rm._key !== r._key),
                          })}
                          className="h-9 w-9 flex items-center justify-center rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  };

  // ─── Main render ───────────────────────────────────────────────────────────

  return (
    <>
      {unitWarning && (
        <UnitWarningDialog
          dialog={unitWarning}
          onSwitch={() => {
            applyLot(unitWarning.entryKey, unitWarning.lotKey, unitWarning.newLot, unitWarning.newLot.unit || unitWarning.newLot.item?.unit || 'Kg');
            setUnitWarning(null);
          }}
          onCancel={() => setUnitWarning(null)}
        />
      )}

      <div ref={formRef} className="max-w-4xl mx-auto space-y-6">
        {/* Page header */}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost" size="icon"
            onClick={() => navigate(isEditMode && editId ? `/sales/${editId}` : '/sales')}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h2 className="text-2xl font-bold">{isEditMode ? t('sales:edit_sale') : t('sales:new_sale')}</h2>
            <p className="text-muted-foreground">
              {isEditMode
                ? t('sales:update_sale_details')
                : t('sales:record_sales_desc')}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Entry cards */}
          <AnimatePresence>
            {entries.map((entry, idx) => renderEntry(entry, idx))}
          </AnimatePresence>

          {/* Add another sale entry (create mode only) */}
          {!isEditMode && (
            <Card className="glass border-dashed border-2 border-border hover:border-primary/40 transition-colors">
              <CardContent className="p-4">
                <button
                  type="button"
                  onClick={addEntry}
                  className="w-full flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors py-2"
                >
                  <Plus className="h-4 w-4" />
                  <span className="font-medium">{t('sales:add_another_sale')}</span>
                </button>
              </CardContent>
            </Card>
          )}

          {/* Session Summary (shown when multiple entries) */}
          {entries.length > 1 && (
            <Card className="glass border-emerald-500/20">
              <CardContent className="p-4">
                <h4 className="text-sm font-semibold text-emerald-500 mb-3 flex items-center gap-2">
                  <Calculator className="h-4 w-4" />
                  Session Summary ({entries.length} sales)
                </h4>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">{t('common:total_value')}</p>
                    <p className="font-bold text-emerald-400">
                      {formatCurrency(entries.reduce((s, e) => s + entryTotal(e), 0))}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">{t('common:total_received')}</p>
                    <p className="font-bold text-emerald-400">
                      {formatCurrency(entries.reduce((s, e) => s + entryPaid(e), 0))}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">{t('common:total_balance')}</p>
                    <p className="font-bold text-amber-400">
                      {formatCurrency(entries.reduce((s, e) => s + Math.max(0, entryBalance(e)), 0))}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Submit row */}
          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button" variant="outline"
              onClick={() => navigate(isEditMode && editId ? `/sales/${editId}` : '/sales')}
            >
              {t('common:cancel')}
            </Button>
            <Button type="submit" variant="success" loading={loading}>
              <Save className="h-4 w-4 mr-2" />
              {isEditMode
                ? t('sales:update_sale')
                : entries.length > 1
                  ? t('sales:save_count_sales', { count: entries.length })
                  : t('sales:save_sale')}
            </Button>
          </div>
        </form>
      </div>

      {/* Add Party Dialog */}
      <AddPartyDialog
        open={showAddParty}
        onClose={() => setShowAddParty(false)}
        onSuccess={refreshParties}
      />
    </>
  );
}
