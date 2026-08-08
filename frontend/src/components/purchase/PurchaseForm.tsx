/**
 * PurchaseForm — reused for Create and Edit
 *
 * Supports:
 *  - Multiple Gadi per session (each gadi = one purchase record)
 *  - Multiple lots (items) per gadi
 *  - Direct & indirect expenses per gadi
 *  - Optional cutter details per gadi
 *  - Bill attachments (images / PDF) per gadi
 *  - Party search — SUPPLIER or BOTH (can buy from and sell to same party)
 *  - Full payment details with multiple modes
 *  - Edit mode: pre-fills all sections
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Plus, Trash2, Save, Truck, Calculator, ChevronDown, ChevronUp,
  Paperclip, X, FileText, Scissors,
  IndianRupee, Package, TrendingDown, Receipt, Bell,
  Eye, Download, Loader2,
} from 'lucide-react';
import {
  Button, Input, Card, CardContent,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Label, Separator, Badge,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui';
import { cn, formatCurrency } from '@/utils';
import { purchaseApi, profileApi, inventoryApi } from '@/lib/api';
import type { Party, InventoryItem, Purchase, Cutter, ExpenseType, Category } from '@/types';
import { AddPartyDialog } from '@/components/shared/AddPartyDialog';
import toast from 'react-hot-toast';

// Field-level errors for each gadi, keyed by gadi _key
type GadiErrors = Record<string, Record<string, string>>;

// ─── Types ────────────────────────────────────────────────────────────────────

interface LotRow {
  _key: string; // local uid for React keys
  item_id: string;
  item_name: string;
  lot_number: string;
  quantity: number;
  rate: number;
  unit: string;
  amount: number;
  notes: string;
}

interface ExpenseRow {
  _key: string;
  expense_type_id: string;
  expense_type_name: string;
  expense_category: 'DIRECT' | 'INDIRECT';
  amount: number;
  is_paid: boolean;
  notes: string;
  // Optional receipt attachment
  receipt_file?: File | null;
  receipt_preview?: string;   // object URL or uploaded URL
  receipt_url?: string;       // final uploaded URL
  receipt_uploading?: boolean;
  receipt_name?: string;
  receipt_type?: string;
}

interface CutterRow {
  _key: string;
  cutter_id: string;
  cutter_name: string;
  quantity: number;
  unit: string;
  rate: number;
  is_paid: boolean;
  notes: string;
  // Optional receipt attachment
  receipt_file?: File | null;
  receipt_preview?: string;
  receipt_url?: string;
  receipt_uploading?: boolean;
  receipt_name?: string;
  receipt_type?: string;
}

interface PaymentRow {
  _key: string;
  payment_mode: string;
  // Preserved from the existing payment in edit mode — without it every
  // update recreated the payments dated today.
  payment_date: string;
  amount: number;
  transaction_ref: string;
  notes: string;
  // Optional receipt attachment
  receipt_file?: File | null;
  receipt_preview?: string;  // object URL or uploaded URL
  receipt_url?: string;      // final uploaded URL
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

interface AttachmentFile {
  _key: string;
  file: File;
  preview: string; // object URL or data URL
  name: string;
  size: number;
  type: string;
  // After upload
  uploadedId?: string;
  uploadedUrl?: string;
  uploading?: boolean;
  error?: string;
}

// GST mode
type GstMode = 'NONE' | 'PERCENT' | 'AMOUNT';

// A single gadi entry
interface GadiEntry {
  _key: string;
  expanded: boolean;
  // Header
  party_id: string;
  purchase_date: string;
  gadi_number: string;
  bill_number: string;
  notes: string;
  // GST (optional)
  gst_mode: GstMode;
  gst_value: number;  // percentage or fixed amount depending on mode
  // Discount & Round-off
  discount: number;
  round_off: number;
  // Reminders (multiple)
  reminders: ReminderRow[];
  // Sections
  lots: LotRow[];
  expenses: ExpenseRow[];
  cutters: CutterRow[];
  payments: PaymentRow[];
  attachments: AttachmentFile[];
  // For edit: existing purchase id
  purchaseId?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
let _keyCounter = 0;
const uid = () => `_k${++_keyCounter}`;

const blankLot = (): LotRow => ({
  _key: uid(), item_id: '', item_name: '', lot_number: '', quantity: 0, rate: 0, unit: 'KG', amount: 0, notes: '',
});
const blankExpense = (): ExpenseRow => ({
  _key: uid(), expense_type_id: '', expense_type_name: '', expense_category: 'DIRECT', amount: 0, is_paid: true, notes: '',
  receipt_file: null, receipt_preview: undefined, receipt_url: undefined, receipt_uploading: false, receipt_name: undefined, receipt_type: undefined,
});
const blankCutter = (): CutterRow => ({
  _key: uid(), cutter_id: '', cutter_name: '', quantity: 0, unit: 'KG', rate: 0, is_paid: true, notes: '',
  receipt_file: null, receipt_preview: undefined, receipt_url: undefined, receipt_uploading: false, receipt_name: undefined, receipt_type: undefined,
});
const blankPayment = (): PaymentRow => ({
  _key: uid(), payment_mode: 'CASH', payment_date: '', amount: 0, transaction_ref: '', notes: '',
});
const blankReminder = (): ReminderRow => ({
  _key: uid(), remind_on: '', amount: 0, note: '',
});
const blankGadi = (partyId = '', date = new Date().toISOString().split('T')[0]): GadiEntry => ({
  _key: uid(), expanded: true,
  party_id: partyId, purchase_date: date, gadi_number: '', bill_number: '', notes: '',
  gst_mode: 'NONE', gst_value: 0,
  discount: 0, round_off: 0,
  reminders: [],
  lots: [blankLot()],
  expenses: [],
  cutters: [],
  payments: [blankPayment()],
  attachments: [],
});

const gadiSubtotal = (g: GadiEntry) => g.lots.reduce((s, l) => s + l.amount, 0);
const gadiDirectExp = (g: GadiEntry) => g.expenses.filter(e => e.expense_category === 'DIRECT').reduce((s, e) => s + e.amount, 0);
const gadiIndirectExp = (g: GadiEntry) => g.expenses.filter(e => e.expense_category === 'INDIRECT').reduce((s, e) => s + e.amount, 0);
const gadiCutterCost = (g: GadiEntry) => g.cutters.reduce((s, c) => s + c.quantity * c.rate, 0);
const gadiGstAmount = (g: GadiEntry) => {
  if (g.gst_mode === 'NONE' || !g.gst_value) return 0;
  if (g.gst_mode === 'AMOUNT') return g.gst_value;
  // PERCENT — calculate on subtotal
  const sub = gadiSubtotal(g);
  return Math.round(sub * g.gst_value / 100 * 100) / 100;
};
const gadiTotal = (g: GadiEntry) => gadiSubtotal(g) + gadiDirectExp(g) + gadiIndirectExp(g) + gadiCutterCost(g) + gadiGstAmount(g) - (g.discount || 0) + (g.round_off || 0);
const gadiPaid = (g: GadiEntry) => g.payments.reduce((s, p) => s + p.amount, 0);
const gadiBalance = (g: GadiEntry) => gadiTotal(g) - gadiPaid(g);

// ─── Props ────────────────────────────────────────────────────────────────────
interface PurchaseFormProps {
  /** Pass an existing purchase to enter edit mode */
  existingPurchase?: Purchase;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function PurchaseForm({ existingPurchase }: PurchaseFormProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation(['purchases', 'common']);
  const isEdit = !!existingPurchase;

  // Pre-fill partyId from ?partyId= query param (e.g. navigated from Party detail page)
  const defaultPartyId = searchParams.get('partyId') || '';

  const [gadis, setGadis] = useState<GadiEntry[]>(() => {
    if (existingPurchase) {
      // PurchaseItem has no lot_number column — the real lot numbers live on
      // the purchase's `lots`. Match each item to its lot by item_id, consuming
      // in order so duplicate items each get their own lot, otherwise the Lot #
      // box shows blank and saving regenerates new numbers.
      const lotPool = new Map<string, string[]>();
      for (const lot of existingPurchase.lots || []) {
        const arr = lotPool.get(lot.item_id) || [];
        arr.push(lot.lot_number);
        lotPool.set(lot.item_id, arr);
      }
      // Pre-fill from existing purchase
      const g: GadiEntry = {
        _key: uid(), expanded: true,
        party_id: existingPurchase.party?.id || '',
        purchase_date: existingPurchase.purchase_date?.split('T')[0] || new Date().toISOString().split('T')[0],
        gadi_number: existingPurchase.gadi_number || '',
        bill_number: existingPurchase.bill_number || '',
        notes: existingPurchase.notes || '',
        gst_mode: (existingPurchase as any).gst_mode || 'NONE',
        gst_value: (existingPurchase as any).gst_value || 0,
        discount: Number((existingPurchase as any).discount ?? 0),
        round_off: Number((existingPurchase as any).round_off ?? 0),
        reminders: ((existingPurchase as any).reminders || []).map((r: any) => ({
          _key: uid(),
          remind_on: r.remind_on ? new Date(r.remind_on).toISOString().split('T')[0] : '',
          amount: Number(r.amount ?? 0),
          note: r.note || '',
        })),
        purchaseId: existingPurchase.id,
        lots: (existingPurchase.items || []).map(it => ({
          _key: uid(),
          item_id: it.item_id,
          item_name: it.item?.name || it.item_id,
          lot_number: lotPool.get(it.item_id)?.shift() || it.lot_number || '',
          quantity: it.quantity,
          rate: it.rate,
          unit: it.unit,
          amount: it.amount,
          notes: it.notes || '',
        })),
        expenses: (existingPurchase.expenses || []).map(ex => ({
          _key: uid(),
          expense_type_id: ex.expense_type_id,
          expense_type_name: ex.expense_type?.name || '',
          expense_category: ex.expense_category,
          amount: ex.amount,
          is_paid: (ex as any).is_paid !== false,
          notes: ex.notes || '',
          receipt_url: (ex as any).receipt_url || undefined,
          receipt_preview: (ex as any).receipt_url || undefined,
          receipt_name: (ex as any).receipt_url ? (ex as any).receipt_url.split('/').pop() : undefined,
          receipt_type: (ex as any).receipt_url?.endsWith('.pdf') ? 'application/pdf' : (ex as any).receipt_url ? 'image/jpeg' : undefined,
        })),
        cutters: (existingPurchase.cutter_transactions || []).map(ct => ({
          _key: uid(),
          cutter_id: ct.cutter_id,
          cutter_name: ct.cutter?.name || '',
          quantity: ct.quantity,
          unit: ct.cutter?.unit || 'KG',
          rate: ct.rate,
          is_paid: (ct as any).is_paid !== false,
          notes: ct.notes || '',
          receipt_url: (ct as any).receipt_url || undefined,
          receipt_preview: (ct as any).receipt_url || undefined,
          receipt_name: (ct as any).receipt_url ? (ct as any).receipt_url.split('/').pop() : undefined,
          receipt_type: (ct as any).receipt_url?.endsWith('.pdf') ? 'application/pdf' : (ct as any).receipt_url ? 'image/jpeg' : undefined,
        })),
        payments: (existingPurchase.payments || []).map(p => ({
          _key: uid(),
          payment_mode: p.payment_mode,
          payment_date: p.payment_date || '',
          amount: p.amount,
          transaction_ref: p.transaction_ref || '',
          notes: p.notes || '',
          receipt_url: p.receipt_url || undefined,
          receipt_preview: p.receipt_url || undefined,
          receipt_name: p.receipt_url ? p.receipt_url.split('/').pop() : undefined,
          receipt_type: p.receipt_url?.endsWith('.pdf') ? 'application/pdf' : p.receipt_url ? 'image/jpeg' : undefined,
        })),
        attachments: (existingPurchase.attachments || []).map(a => ({
          _key: uid(), file: null as unknown as File,
          preview: a.file_url, name: a.file_name, size: a.file_size, type: a.file_type,
          uploadedId: a.id, uploadedUrl: a.file_url,
        })),
      };
      if (g.lots.length === 0) g.lots.push(blankLot());
      if (g.payments.length === 0) g.payments.push(blankPayment());
      return [g];
    }
    return [blankGadi(defaultPartyId)];
  });

  const [parties, setParties] = useState<Party[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [cutters, setCutters] = useState<Cutter[]>([]);
  const [expenseTypes, setExpenseTypes] = useState<ExpenseType[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [gadiErrors, setGadiErrors] = useState<GadiErrors>({});
  const [previewFile, setPreviewFile] = useState<{ url: string; type: string; name: string } | null>(null);
  const [showAddParty, setShowAddParty] = useState(false);
  const [showAddExpenseType, setShowAddExpenseType] = useState(false);
  const [newExpenseTypeName, setNewExpenseTypeName] = useState('');
  const [newExpenseTypeCategory, setNewExpenseTypeCategory] = useState<'DIRECT' | 'INDIRECT'>('DIRECT');
  const [addingExpenseType, setAddingExpenseType] = useState(false);
  const [showAddItem, setShowAddItem] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemUnit, setNewItemUnit] = useState('SFT');
  const [newItemCategoryId, setNewItemCategoryId] = useState('');
  const [addingItem, setAddingItem] = useState(false);
  // Add Cutter dialog state
  const [showAddCutter, setShowAddCutter] = useState(false);
  const [newCutterName, setNewCutterName] = useState('');
  const [newCutterPhone, setNewCutterPhone] = useState('');
  const [addingCutter, setAddingCutter] = useState(false);
  const pendingCutterFor = useRef<{ gadiKey: string; cutKey: string } | null>(null);
  // Per-lot item search filter (keyed by lot _key)
  const [itemSearch, setItemSearch] = useState<Record<string, string>>({});
  // Whether the Add-Item dialog is showing a custom unit text field
  const [newItemCustomUnit, setNewItemCustomUnit] = useState(false);
  // "Add Custom Unit" dialog for lot rows
  const [showAddUnit, setShowAddUnit] = useState(false);
  const [newUnitValue, setNewUnitValue] = useState('');
  const pendingUnitFor = useRef<{ gadiKey: string; lotKey: string } | null>(null);
  const pendingAddItemFor = useRef<{ gadiKey: string; lotKey: string } | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    (async () => {
      try {
        // Always seed first (idempotent — fast no-op if already seeded)
        await inventoryApi.seedDefaults();
        // NOTE: do NOT call inventoryApi.pruneSeeded() here. It hard-deletes
        // every zero-stock item that isn't named Marble/Granite — which, now
        // that seedDefaults only creates those two, means it deletes the
        // user's own catalogue entries. Opening this form was silently
        // destroying data. Pruning is a deliberate maintenance action, not a
        // side effect of rendering a form.
      } catch { /* ignore if seed fails — items may already exist */ }

      try {
        const [partiesRes, itemsRes, cuttersRes, expTypesRes, catsRes] = await Promise.all([
          profileApi.parties(),
          inventoryApi.listItems({ limit: 500 }),
          profileApi.cutters(),
          profileApi.expenseTypes(),
          inventoryApi.categories(),
        ]);
        setParties(partiesRes.data?.data || []);
        setItems(itemsRes.data?.data || []);
        setCutters(cuttersRes.data?.data || []);
        setExpenseTypes(expTypesRes.data?.data || []);
        setCategories(catsRes.data?.data || []);
      } catch {
        // silently ignore — form still usable with empty dropdowns
      }
    })();
  }, []);

  const refreshParties = useCallback(async () => {
    try {
      const res = await profileApi.parties();
      setParties(res.data?.data || []);
    } catch { /* ignore */ }
  }, []);

  const refreshExpenseTypes = useCallback(async () => {
    try {
      const res = await profileApi.expenseTypes();
      setExpenseTypes(res.data?.data || []);
    } catch { /* ignore */ }
  }, []);

  const refreshItems = useCallback(async () => {
    try {
      const [itemsRes, catsRes] = await Promise.all([inventoryApi.listItems({ limit: 200 }), inventoryApi.categories()]);
      setItems(itemsRes.data?.data || []);
      setCategories(catsRes.data?.data || []);
    } catch { /* ignore */ }
  }, []);

  const refreshCutters = useCallback(async () => {
    try {
      const res = await profileApi.cutters();
      setCutters(res.data?.data || []);
    } catch { /* ignore */ }
  }, []);

  const handleCreateCutter = async () => {
    if (!newCutterName.trim()) return;
    try {
      setAddingCutter(true);
      const res = await profileApi.createCutter({
        name: newCutterName.trim(),
        phone: newCutterPhone.trim() || undefined,
      });
      const created = res.data?.data;
      await refreshCutters();
      // If we opened the dialog from a cutter row, auto-select the new cutter
      if (created && pendingCutterFor.current) {
        const { gadiKey, cutKey } = pendingCutterFor.current;
        updateCutter(gadiKey, cutKey, {
          cutter_id: created.id,
          cutter_name: created.name,
          rate: parseFloat(created.rate_per_unit) || 0,
        });
      }
      setShowAddCutter(false);
      setNewCutterName('');
      setNewCutterPhone('');
      pendingCutterFor.current = null;
      toast.success(t('purchases:cutter_created', { name: created?.name || newCutterName.trim() }));
    } catch {
      toast.error(t('purchases:cutter_create_error'));
    } finally {
      setAddingCutter(false);
    }
  };

  const handleCreateItem = async (forLotKey?: { gadiKey: string; lotKey: string }) => {
    if (!newItemName.trim()) return;
    try {
      setAddingItem(true);
      const res = await inventoryApi.createItem({
        name: newItemName.trim(),
        unit: newItemUnit,
        ...(newItemCategoryId && { categoryId: newItemCategoryId }),
      });
      const created = res.data?.data;
      await refreshItems();
      if (created && forLotKey) {
        updateLot(forLotKey.gadiKey, forLotKey.lotKey, {
          item_id: created.id,
          item_name: created.name,
          unit: created.unit || newItemUnit,
        });
      }
      setShowAddItem(false);
      setNewItemName('');
      setNewItemUnit('SFT');
      setNewItemCategoryId('');
      setNewItemCustomUnit(false);
      toast.success(t('purchases:item_created', { name: created?.name || newItemName.trim() }));
    } catch {
      toast.error(t('purchases:item_create_error'));
    } finally {
      setAddingItem(false);
    }
  };

  const handleCreateExpenseType = async () => {
    if (!newExpenseTypeName.trim()) return;
    try {
      setAddingExpenseType(true);
      const res = await profileApi.createExpenseType({ name: newExpenseTypeName.trim(), category: newExpenseTypeCategory });
      await refreshExpenseTypes();
      setShowAddExpenseType(false);
      setNewExpenseTypeName('');
      setNewExpenseTypeCategory('DIRECT');
      toast.success(t('purchases:expense_type_created', { name: res.data?.data?.name || newExpenseTypeName.trim() }));
      return res.data?.data?.id as string | undefined;
    } catch {
      toast.error(t('purchases:expense_create_error'));
    } finally {
      setAddingExpenseType(false);
    }
  };

  // ── Gadi helpers ────────────────────────────────────────────────────────────
  const updateGadi = useCallback((key: string, patch: Partial<GadiEntry>) => {
    setGadis(prev => prev.map(g => g._key === key ? { ...g, ...patch } : g));
  }, []);

  const toggleExpand = (key: string) => {
    setGadis(prev => prev.map(g => g._key === key ? { ...g, expanded: !g.expanded } : g));
  };

  const formRef = useRef<HTMLDivElement>(null);

  const addGadi = () => {
    const last = gadis[gadis.length - 1];
    setGadis(prev => [...prev, blankGadi(last?.party_id, last?.purchase_date)]);
    // Scroll the nearest scrollable ancestor (the <main> element), not the window
    setTimeout(() => {
      const scrollContainer = formRef.current?.closest('main') || formRef.current?.closest('[class*="overflow-y-auto"]');
      if (scrollContainer) {
        scrollContainer.scrollTo({ top: scrollContainer.scrollHeight, behavior: 'smooth' });
      }
    }, 150);
  };

  const removeGadi = (key: string) => {
    if (gadis.length <= 1) return toast.error(t('purchases:at_least_one_entry'));
    setGadis(prev => prev.filter(g => g._key !== key));
  };

  // ── Lot helpers ─────────────────────────────────────────────────────────────
  const updateLot = (gadiKey: string, lotKey: string, patch: Partial<LotRow>) => {
    setGadis(prev => prev.map(g => {
      if (g._key !== gadiKey) return g;
      return {
        ...g, lots: g.lots.map(l => {
          if (l._key !== lotKey) return l;
          const updated = { ...l, ...patch };
          if ('quantity' in patch || 'rate' in patch) {
            updated.amount = updated.quantity * updated.rate;
          }
          return updated;
        }),
      };
    }));
  };

  const addLot = (gadiKey: string) => {
    setGadis(prev => prev.map(g => g._key === gadiKey ? { ...g, lots: [...g.lots, blankLot()] } : g));
  };

  const removeLot = (gadiKey: string, lotKey: string) => {
    setGadis(prev => prev.map(g => {
      if (g._key !== gadiKey) return g;
      if (g.lots.length <= 1) { toast.error(t('purchases:at_least_one_lot')); return g; }
      return { ...g, lots: g.lots.filter(l => l._key !== lotKey) };
    }));
  };

  // ── Expense helpers ──────────────────────────────────────────────────────────
  const updateExpense = (gadiKey: string, expKey: string, patch: Partial<ExpenseRow>) => {
    setGadis(prev => prev.map(g => {
      if (g._key !== gadiKey) return g;
      return { ...g, expenses: g.expenses.map(e => e._key === expKey ? { ...e, ...patch } : e) };
    }));
  };
  const addExpense = (gadiKey: string) => {
    setGadis(prev => prev.map(g => g._key === gadiKey ? { ...g, expenses: [...g.expenses, blankExpense()] } : g));
  };
  const removeExpense = (gadiKey: string, expKey: string) => {
    setGadis(prev => prev.map(g => g._key === gadiKey ? { ...g, expenses: g.expenses.filter(e => e._key !== expKey) } : g));
  };

  // ── Cutter helpers ───────────────────────────────────────────────────────────
  const updateCutter = (gadiKey: string, cutKey: string, patch: Partial<CutterRow>) => {
    setGadis(prev => prev.map(g => {
      if (g._key !== gadiKey) return g;
      return { ...g, cutters: g.cutters.map(c => c._key === cutKey ? { ...c, ...patch } : c) };
    }));
  };
  const addCutter = (gadiKey: string) => {
    setGadis(prev => prev.map(g => g._key === gadiKey ? { ...g, cutters: [...g.cutters, blankCutter()] } : g));
  };
  const removeCutter = (gadiKey: string, cutKey: string) => {
    setGadis(prev => prev.map(g => g._key === gadiKey ? { ...g, cutters: g.cutters.filter(c => c._key !== cutKey) } : g));
  };

  // ── Payment helpers ──────────────────────────────────────────────────────────
  const updatePayment = (gadiKey: string, payKey: string, patch: Partial<PaymentRow>) => {
    setGadis(prev => prev.map(g => {
      if (g._key !== gadiKey) return g;
      return { ...g, payments: g.payments.map(p => p._key === payKey ? { ...p, ...patch } : p) };
    }));
  };
  const addPayment = (gadiKey: string) => {
    setGadis(prev => prev.map(g => g._key === gadiKey ? { ...g, payments: [...g.payments, blankPayment()] } : g));
  };
  const removePayment = (gadiKey: string, payKey: string) => {
    setGadis(prev => prev.map(g => {
      if (g._key !== gadiKey) return g;
      if (g.payments.length <= 1) { toast.error(t('purchases:at_least_one_payment')); return g; }
      return { ...g, payments: g.payments.filter(p => p._key !== payKey) };
    }));
  };

  const handlePaymentReceiptPick = (gadiKey: string, payKey: string, file: File | null) => {
    if (!file) return;
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
    if (!allowed.includes(file.type)) { toast.error(t('purchases:unsupported_file', { name: file.name })); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error(t('purchases:file_too_large', { name: file.name })); return; }
    const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : '';
    updatePayment(gadiKey, payKey, {
      receipt_file: file,
      receipt_preview: preview,
      receipt_name: file.name,
      receipt_type: file.type,
      receipt_url: undefined,
    });
  };

  const removePaymentReceipt = (gadiKey: string, payKey: string) => {
    setGadis(prev => prev.map(g => {
      if (g._key !== gadiKey) return g;
      return {
        ...g,
        payments: g.payments.map(p => {
          if (p._key !== payKey) return p;
          if (p.receipt_preview && !p.receipt_url) URL.revokeObjectURL(p.receipt_preview);
          return { ...p, receipt_file: null, receipt_preview: undefined, receipt_url: undefined, receipt_name: undefined, receipt_type: undefined };
        }),
      };
    }));
  };

  // Store refs for payment receipt file inputs
  const paymentReceiptInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // ── Expense receipt helpers ──────────────────────────────────────────────────
  const handleExpenseReceiptPick = (gadiKey: string, expKey: string, file: File | null) => {
    if (!file) return;
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
    if (!allowed.includes(file.type)) { toast.error(t('purchases:unsupported_file', { name: file.name })); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error(t('purchases:file_too_large', { name: file.name })); return; }
    const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : '';
    updateExpense(gadiKey, expKey, {
      receipt_file: file,
      receipt_preview: preview,
      receipt_name: file.name,
      receipt_type: file.type,
      receipt_url: undefined,
    });
  };

  const removeExpenseReceipt = (gadiKey: string, expKey: string) => {
    setGadis(prev => prev.map(g => {
      if (g._key !== gadiKey) return g;
      return {
        ...g,
        expenses: g.expenses.map(ex => {
          if (ex._key !== expKey) return ex;
          if (ex.receipt_preview && !ex.receipt_url) URL.revokeObjectURL(ex.receipt_preview);
          return { ...ex, receipt_file: null, receipt_preview: undefined, receipt_url: undefined, receipt_name: undefined, receipt_type: undefined };
        }),
      };
    }));
  };

  // Store refs for expense receipt file inputs
  const expenseReceiptInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // ── Cutter receipt helpers ────────────────────────────────────────────────────
  const handleCutterReceiptPick = (gadiKey: string, cutKey: string, file: File | null) => {
    if (!file) return;
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
    if (!allowed.includes(file.type)) { toast.error(t('purchases:unsupported_file', { name: file.name })); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error(t('purchases:file_too_large', { name: file.name })); return; }
    const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : '';
    updateCutter(gadiKey, cutKey, {
      receipt_file: file,
      receipt_preview: preview,
      receipt_name: file.name,
      receipt_type: file.type,
      receipt_url: undefined,
    });
  };

  const removeCutterReceipt = (gadiKey: string, cutKey: string) => {
    setGadis(prev => prev.map(g => {
      if (g._key !== gadiKey) return g;
      return {
        ...g,
        cutters: g.cutters.map(c => {
          if (c._key !== cutKey) return c;
          if (c.receipt_preview && !c.receipt_url) URL.revokeObjectURL(c.receipt_preview);
          return { ...c, receipt_file: null, receipt_preview: undefined, receipt_url: undefined, receipt_name: undefined, receipt_type: undefined };
        }),
      };
    }));
  };

  // Store refs for cutter receipt file inputs
  const cutterReceiptInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // ── Attachment helpers ───────────────────────────────────────────────────────
  const handleFilePick = (gadiKey: string, files: FileList | null) => {
    if (!files) return;
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
    Array.from(files).forEach(file => {
      if (!allowed.includes(file.type)) { toast.error(t('purchases:unsupported_file', { name: file.name })); return; }
      if (file.size > 10 * 1024 * 1024) { toast.error(t('purchases:file_too_large', { name: file.name })); return; }
      const att: AttachmentFile = {
        _key: uid(), file,
        preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : '',
        name: file.name, size: file.size, type: file.type,
      };
      setGadis(prev => prev.map(g => g._key === gadiKey ? { ...g, attachments: [...g.attachments, att] } : g));
    });
  };

  // Already-persisted attachments removed in edit mode must be deleted
  // server-side on save — removing them from local state alone brings them
  // back on reload.
  const deletedAttachmentsRef = useRef<{ purchaseId: string; attachmentId: string }[]>([]);

  const removeAttachment = (gadiKey: string, attKey: string) => {
    setGadis(prev => prev.map(g => {
      if (g._key !== gadiKey) return g;
      const att = g.attachments.find(a => a._key === attKey);
      if (att?.preview && !att.uploadedUrl) URL.revokeObjectURL(att.preview);
      if (att?.uploadedId && g.purchaseId) {
        deletedAttachmentsRef.current.push({ purchaseId: g.purchaseId, attachmentId: att.uploadedId });
      }
      return { ...g, attachments: g.attachments.filter(a => a._key !== attKey) };
    }));
  };

  // ── Submit ───────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    const errs: GadiErrors = {};
    let valid = true;
    for (const g of gadis) {
      const ge: Record<string, string> = {};
      if (!g.party_id) { ge.party_id = t('purchases:select_party_validation'); valid = false; }
      if (g.lots.every(l => l.amount === 0)) { ge.lots = t('purchases:lot_amount_validation'); valid = false; }
      for (const l of g.lots.filter(l => l.item_id)) {
        if (l.quantity <= 0 || l.rate <= 0) { ge.lots = t('purchases:lot_qty_rate_validation'); valid = false; }
      }
      if (Object.keys(ge).length) errs[g._key] = ge;
    }
    if (!valid) { setGadiErrors(errs); return; }
    setGadiErrors({});

    try {
      setSubmitting(true);
      const savedPurchaseIds: string[] = [];

      for (const g of gadis) {
        const validLots = g.lots.filter(l => l.item_id && l.amount > 0);
        const validExpenses = g.expenses.filter(e => e.expense_type_id && e.amount > 0);
        const validCutters = g.cutters.filter(c => c.cutter_id && c.rate > 0 && c.quantity > 0);
        const validPayments = g.payments.filter(p => p.amount > 0);

        // Upload payment receipts first (new files only)
        for (const p of validPayments) {
          if (p.receipt_file && !p.receipt_url) {
            try {
              updatePayment(g._key, p._key, { receipt_uploading: true });
              const res = await purchaseApi.uploadPaymentReceipt(p.receipt_file);
              const url = res.data?.data?.url;
              updatePayment(g._key, p._key, { receipt_uploading: false, receipt_url: url });
              p.receipt_url = url; // also update local ref for payload below
            } catch {
              updatePayment(g._key, p._key, { receipt_uploading: false });
              toast.error(t('purchases:upload_receipt_failed'));
            }
          }
        }

        // Upload expense receipts (new files only)
        for (const ex of validExpenses) {
          if (ex.receipt_file && !ex.receipt_url) {
            try {
              updateExpense(g._key, ex._key, { receipt_uploading: true });
              const res = await purchaseApi.uploadExpenseReceipt(ex.receipt_file);
              const url = res.data?.data?.url;
              updateExpense(g._key, ex._key, { receipt_uploading: false, receipt_url: url });
              ex.receipt_url = url; // update local ref for payload below
            } catch {
              updateExpense(g._key, ex._key, { receipt_uploading: false });
              toast.error(t('purchases:upload_expense_receipt_failed'));
            }
          }
        }

        // Upload cutter receipts (new files only)
        for (const c of validCutters) {
          if (c.receipt_file && !c.receipt_url) {
            try {
              updateCutter(g._key, c._key, { receipt_uploading: true });
              const res = await purchaseApi.uploadExpenseReceipt(c.receipt_file); // reuse same endpoint
              const url = res.data?.data?.url;
              updateCutter(g._key, c._key, { receipt_uploading: false, receipt_url: url });
              c.receipt_url = url; // update local ref for payload below
            } catch {
              updateCutter(g._key, c._key, { receipt_uploading: false });
              toast.error(t('purchases:upload_cutter_receipt_failed'));
            }
          }
        }

        const payload = {
          partyId: g.party_id,
          purchaseDate: new Date(g.purchase_date).toISOString(),
          gadiNumber: g.gadi_number || undefined,
          billNumber: g.bill_number || undefined,
          notes: g.notes || undefined,
          gstMode: g.gst_mode !== 'NONE' ? g.gst_mode : undefined,
          gstValue: g.gst_mode !== 'NONE' ? g.gst_value : undefined,
          gstAmount: g.gst_mode !== 'NONE' ? gadiGstAmount(g) : undefined,
          discount: g.discount || undefined,
          roundOff: g.round_off || undefined,
          reminders: g.reminders
            .filter(r => r.remind_on)
            .map(r => ({
              remindOn: new Date(r.remind_on).toISOString(),
              amount: r.amount > 0 ? r.amount : undefined,
              note: r.note || undefined,
            })),
          items: validLots.map(l => ({
            itemId: l.item_id,
            quantity: l.quantity,
            rate: l.rate,
            unit: l.unit,
            lotNumber: l.lot_number || undefined,
            notes: l.notes || undefined,
          })),
          expenses: validExpenses.map(ex => ({
            expenseTypeId: ex.expense_type_id,
            expenseCategory: ex.expense_category,
            amount: ex.amount,
            isPaid: ex.is_paid,
            receiptUrl: ex.receipt_url || undefined,
            notes: ex.notes || undefined,
          })),
          cutterTransactions: validCutters.map(c => ({
            cutterId: c.cutter_id,
            quantity: c.quantity,
            rate: c.rate,
            isPaid: c.is_paid,
            receiptUrl: c.receipt_url || undefined,
            notes: c.notes || undefined,
          })),
          payments: validPayments.map(p => ({
            paymentMode: p.payment_mode,
            paymentDate: p.payment_date || undefined,
            amount: p.amount,
            transactionRef: p.transaction_ref || undefined,
            receiptUrl: p.receipt_url || undefined,
            notes: p.notes || undefined,
          })),
        };

        let purchaseId: string;
        if (isEdit && g.purchaseId) {
          const res = await purchaseApi.update(g.purchaseId, payload);
          purchaseId = g.purchaseId;
          const toDelete = deletedAttachmentsRef.current.filter(d => d.purchaseId === purchaseId);
          for (const d of toDelete) {
            try {
              await purchaseApi.deleteAttachment(d.purchaseId, d.attachmentId);
            } catch {
              toast.error(t('purchases:upload_attachment_failed', { name: '' }));
            }
          }
          deletedAttachmentsRef.current = deletedAttachmentsRef.current.filter(d => d.purchaseId !== purchaseId);
          toast.success(t('purchases:purchase_updated_success', { number: res.data?.data?.purchase_number || '' }));
        } else {
          const res = await purchaseApi.create(payload);
          purchaseId = res.data?.data?.id;
          toast.success(t('purchases:purchase_created_success', { number: res.data?.data?.purchase_number || '' }));
        }
        savedPurchaseIds.push(purchaseId);

        // Upload new attachments (not already uploaded)
        for (const att of g.attachments.filter(a => a.file && !a.uploadedId)) {
          try {
            setGadis(prev => prev.map(gd => gd._key === g._key ? {
              ...gd, attachments: gd.attachments.map(a => a._key === att._key ? { ...a, uploading: true } : a),
            } : gd));
            const attRes = await purchaseApi.uploadAttachment(purchaseId, att.file);
            setGadis(prev => prev.map(gd => gd._key === g._key ? {
              ...gd, attachments: gd.attachments.map(a => a._key === att._key ? {
                ...a, uploading: false, uploadedId: attRes.data?.data?.id, uploadedUrl: attRes.data?.data?.file_url,
              } : a),
            } : gd));
          } catch {
            setGadis(prev => prev.map(gd => gd._key === g._key ? {
              ...gd, attachments: gd.attachments.map(a => a._key === att._key ? { ...a, uploading: false, error: 'Upload failed' } : a),
            } : gd));
            toast.error(t('purchases:upload_attachment_failed', { name: att.name }));
          }
        }
      }

      navigate(savedPurchaseIds.length === 1 ? `/purchases/${savedPurchaseIds[0]}` : '/purchases');
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('purchases:purchase_save_error'));
    } finally {
      setSubmitting(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Render helpers
  // ─────────────────────────────────────────────────────────────────────────────

  const renderGadi = (g: GadiEntry, idx: number) => {
    const total = gadiTotal(g);
    const paid = gadiPaid(g);
    const balance = gadiBalance(g);
    const subtotal = gadiSubtotal(g);

    return (
      <motion.div
        key={g._key}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        className="border border-border rounded-2xl overflow-hidden shadow-sm"
      >
        {/* ── Gadi Header ── */}
        <div
          className={cn(
            'flex items-center justify-between p-4 cursor-pointer transition-colors',
            g.expanded ? 'bg-primary/5 border-b border-border' : 'bg-card hover:bg-muted/40',
          )}
          onClick={() => toggleExpand(g._key)}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Truck className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm">
                  {isEdit ? t('purchases:edit_purchase') : t('purchases:gadi_entry', { index: idx + 1 })}
                </span>
                {g.gadi_number && (
                  <Badge variant="outline" className="text-xs font-mono">{g.gadi_number}</Badge>
                )}
                {g.party_id && (
                  <Badge variant="outline" className="text-xs bg-muted">
                    {parties.find(p => p.id === g.party_id)?.name || g.party_id}
                  </Badge>
                )}
              </div>
              {total > 0 && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formatCurrency(total)} {t('common:total').toLowerCase()} · {formatCurrency(paid)} {t('common:paid').toLowerCase()} · <span className={balance > 0 ? 'text-red-400' : 'text-emerald-400'}>{formatCurrency(Math.abs(balance))} {balance > 0 ? t('purchases:due_label') : t('purchases:extra_label')}</span>
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!isEdit && gadis.length > 1 && (
              <Button
                type="button" variant="ghost" size="icon"
                className="h-7 w-7 text-red-400 hover:text-red-300"
                onClick={e => { e.stopPropagation(); removeGadi(g._key); }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
            {g.expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </div>
        </div>

        {/* ── Gadi Body ── */}
        <AnimatePresence initial={false}>
          {g.expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1, overflow: 'visible' }}
              exit={{ height: 0, opacity: 0, overflow: 'hidden' }}
              transition={{ duration: 0.2 }}
              style={{ overflow: 'hidden' }}
            >
              <div className="p-4 space-y-6 bg-card">

                {/* ── Section 1: Party & Header info ── */}
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">{t('purchases:purchase_details_heading')}</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {/* Party */}
                    <div className="space-y-1.5">
                      <Label>{t('purchases:party_supplier')} *</Label>
                      <Select
                        value={g.party_id}
                        onValueChange={v => {
                          if (v === '__add_new__') {
                            setShowAddParty(true);
                            return;
                          }
                          updateGadi(g._key, { party_id: v });
                          setGadiErrors(prev => { const n = { ...prev }; if (n[g._key]) { delete n[g._key].party_id; if (!Object.keys(n[g._key]).length) delete n[g._key]; } return n; });
                        }}
                      >
                        <SelectTrigger error={gadiErrors[g._key]?.party_id}>
                          <SelectValue placeholder={t('purchases:select_supplier')} />
                        </SelectTrigger>
                        <SelectContent>
                          {parties.map(p => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.name}
                              </SelectItem>
                            ))}
                          <SelectItem value="__add_new__" className="text-primary font-medium">
                            <div className="flex items-center gap-2">
                              <Plus className="h-3.5 w-3.5" />
                              <span>{t('purchases:add_new_supplier')}</span>
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {/* Date */}
                    <div className="space-y-1.5">
                      <Label>{t('purchases:purchase_date')}</Label>
                      <Input
                        type="date"
                        value={g.purchase_date}
                        onChange={e => updateGadi(g._key, { purchase_date: e.target.value })}
                      />
                    </div>
                    {/* Gadi Number */}
                    <div className="space-y-1.5">
                      <Label>{t('purchases:gadi_label')}</Label>
                      <Input
                        icon={<Truck className="h-4 w-4" />}
                        placeholder={t('purchases:gadi_placeholder')}
                        value={g.gadi_number}
                        onChange={e => updateGadi(g._key, { gadi_number: e.target.value.toUpperCase() })}
                      />
                    </div>
                    {/* Bill Number */}
                    <div className="space-y-1.5">
                      <Label>{t('purchases:bill_number')}</Label>
                      <Input
                        icon={<Receipt className="h-4 w-4" />}
                        placeholder={t('purchases:bill_placeholder')}
                        value={g.bill_number}
                        onChange={e => updateGadi(g._key, { bill_number: e.target.value })}
                      />
                    </div>
                    {/* Notes */}
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label>{t('purchases:notes_label')}</Label>
                      <Input
                        placeholder={t('purchases:notes_placeholder')}
                        value={g.notes}
                        onChange={e => updateGadi(g._key, { notes: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                <Separator />

                {/* ── Section 2: Lots (Items) ── */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-sm font-semibold flex items-center gap-2">
                      <span className="h-6 w-6 rounded-md bg-primary/10 flex items-center justify-center">
                        <Package className="h-3.5 w-3.5 text-primary" />
                      </span>
                      Lots / Items
                    </h4>
                    <Button type="button" variant="outline" size="sm" onClick={() => addLot(g._key)}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> {t('purchases:add_lot')}
                    </Button>
                  </div>
                  {gadiErrors[g._key]?.lots && (
                    <p className="text-sm text-red-500 mb-3 flex items-center gap-1.5">
                      <X className="h-3.5 w-3.5" />{gadiErrors[g._key].lots}
                    </p>
                  )}

                  {/* Column headers */}
                  <div className="grid grid-cols-[2fr_1.2fr_0.8fr_0.6fr_0.9fr_0.9fr_1.5fr_2rem] gap-3 px-1 mb-1.5 border-b border-border pb-1.5">
                    {['Item *', 'Lot #', 'Qty', 'Unit', 'Rate ₹', 'Amount', 'Notes', ''].map(h => (
                      <span key={h} className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{h}</span>
                    ))}
                  </div>

                  <div className="divide-y divide-border">
                    {g.lots.map((l) => (
                      <div key={l._key} className="grid grid-cols-[2fr_1.2fr_0.8fr_0.6fr_0.9fr_0.9fr_1.5fr_2rem] gap-3 items-center py-2 px-1">
                        {/* Item */}
                        <Select
                          value={l.item_id}
                          onValueChange={v => {
                            if (v === '__add_item__') {
                              pendingAddItemFor.current = { gadiKey: g._key, lotKey: l._key };
                              setNewItemName(itemSearch[l._key] || '');
                              // Pre-select first category (prefer Marble)
                              const defaultCat = categories.find(c => c.name.toLowerCase() === 'marble') || categories[0];
                              setNewItemCategoryId(defaultCat?.id || '');
                              setShowAddItem(true);
                              return;
                            }
                            const it = items.find(i => i.id === v);
                            updateLot(g._key, l._key, { item_id: v, item_name: it?.name || v, unit: it?.unit || l.unit });
                            setItemSearch(prev => ({ ...prev, [l._key]: '' }));
                          }}
                          onOpenChange={open => { if (!open) setItemSearch(prev => ({ ...prev, [l._key]: '' })); }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={t('purchases:select_item')} />
                          </SelectTrigger>
                          <SelectContent>
                            {/* Inline search */}
                            <div className="px-2 pt-1.5 pb-1 sticky top-0 bg-popover z-10">
                              <input
                                className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
                                placeholder={t('purchases:search_items')}
                                value={itemSearch[l._key] || ''}
                                onChange={e => setItemSearch(prev => ({ ...prev, [l._key]: e.target.value }))}
                                onKeyDown={e => e.stopPropagation()}
                                onClick={e => e.stopPropagation()}
                                autoComplete="off"
                              />
                            </div>
                            {(() => {
                              const filtered = items.filter(i => !itemSearch[l._key] || i.name.toLowerCase().includes(itemSearch[l._key].toLowerCase()));
                              if (filtered.length === 0) return (
                                <div className="px-2 py-1.5 text-xs text-muted-foreground text-center">{t('purchases:no_items_found')}</div>
                              );
                              // Group by category NAME (not id) to merge duplicate category records
                              const grouped = new Map<string, { label: string; items: InventoryItem[] }>();
                              for (const it of filtered) {
                                const catLabel = it.category?.name || 'Other';
                                const catKey = catLabel.toLowerCase();
                                if (!grouped.has(catKey)) grouped.set(catKey, { label: catLabel, items: [] });
                                grouped.get(catKey)!.items.push(it);
                              }
                              return Array.from(grouped.entries()).map(([catKey, { label, items: catItems }]) => {
                                // Sort: generic item (name === category label) first, rest alphabetically
                                const sorted = [...catItems].sort((a, b) => {
                                  const aIsGeneric = a.name.toLowerCase() === label.toLowerCase();
                                  const bIsGeneric = b.name.toLowerCase() === label.toLowerCase();
                                  if (aIsGeneric) return -1;
                                  if (bIsGeneric) return 1;
                                  return a.name.localeCompare(b.name);
                                });
                                return (
                                  <div key={catKey}>
                                    <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/40">{label}</div>
                                    {sorted.map(i => {
                                      const isGeneric = i.name.toLowerCase() === label.toLowerCase();
                                      return (
                                        <SelectItem key={i.id} value={i.id}>
                                          <span className={isGeneric ? 'font-semibold' : ''}>{i.name}</span>
                                          {isGeneric && (
                                            <span className="ml-1.5 text-[10px] text-muted-foreground">{t('purchases:generic_label')}</span>
                                          )}
                                          {i.unit && !isGeneric && (
                                            <span className="ml-1.5 text-[10px] text-muted-foreground">/{i.unit}</span>
                                          )}
                                        </SelectItem>
                                      );
                                    })}
                                  </div>
                                );
                              });
                            })()}
                            <SelectItem value="__add_item__" className="text-primary font-medium border-t border-border mt-1">
                              <span className="flex items-center gap-2">
                                <Plus className="h-3.5 w-3.5" />
                                {itemSearch[l._key] ? t('purchases:add_item_with_name', { name: itemSearch[l._key] }) : t('purchases:add_new_item')}
                              </span>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        {/* Lot # */}
                        <Input
                          placeholder={t('common:auto')}
                          value={l.lot_number}
                          onChange={e => updateLot(g._key, l._key, { lot_number: e.target.value })}
                        />
                        {/* Qty */}
                        <Input
                          type="number" min={0} step="0.01"
                          placeholder="0"
                          value={l.quantity || ''}
                          onChange={e => updateLot(g._key, l._key, { quantity: parseFloat(e.target.value) || 0 })}
                        />
                        {/* Unit */}
                        <Select
                          value={['SFT', 'Ton', 'KG'].includes(l.unit) ? l.unit : (l.unit ? '__custom__' : '')}
                          onValueChange={v => {
                            if (v === '__custom__') {
                              pendingUnitFor.current = { gadiKey: g._key, lotKey: l._key };
                              setNewUnitValue('');
                              setShowAddUnit(true);
                            } else {
                              updateLot(g._key, l._key, { unit: v });
                            }
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={t('inventory:unit')}>
                              {/* Show custom unit value inline when one is set */}
                              {!['SFT', 'Ton', 'KG', ''].includes(l.unit) ? l.unit : undefined}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="SFT">{t('common:unit_sqft')}</SelectItem>
                            <SelectItem value="Ton">{t('common:unit_ton')}</SelectItem>
                            <SelectItem value="KG">{t('common:unit_kg')}</SelectItem>
                            <SelectItem value="__custom__" className="text-primary font-medium">
                              <span className="flex items-center gap-1.5">
                                <Plus className="h-3 w-3" /> {t('common:add_custom_unit')}
                              </span>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        {/* Rate */}
                        <Input
                          type="number" min={0} step="0.01"
                          placeholder="0"
                          value={l.rate || ''}
                          onChange={e => updateLot(g._key, l._key, { rate: parseFloat(e.target.value) || 0 })}
                        />
                        {/* Amount */}
                        <div className="h-9 flex items-center justify-center rounded-md bg-primary/5 border border-primary/20 px-2">
                          <span className="text-sm font-semibold text-primary">{formatCurrency(l.amount)}</span>
                        </div>
                        {/* Notes */}
                        <Input
                          placeholder={t('purchases:notes_line_placeholder')}
                          value={l.notes}
                          onChange={e => updateLot(g._key, l._key, { notes: e.target.value })}
                        />
                        {/* Remove */}
                        <button
                          type="button"
                          onClick={() => removeLot(g._key, l._key)}
                          className="h-9 w-9 rounded-lg flex items-center justify-center text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Subtotal */}
                  <div className="mt-3 flex justify-end">
                    <div className="flex items-center gap-3 rounded-xl bg-primary/5 border border-primary/20 px-5 py-3">
                      <span className="text-sm text-muted-foreground font-medium">{t('purchases:subtotal_label')}</span>
                      <span className="text-lg font-bold text-primary">{formatCurrency(subtotal)}</span>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* ── Section 3: Expenses ── */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-sm font-semibold flex items-center gap-2">
                      <span className="h-6 w-6 rounded-md bg-amber-500/10 flex items-center justify-center">
                        <TrendingDown className="h-3.5 w-3.5 text-amber-500" />
                      </span>
                      Expenses
                      <span className="text-xs font-normal text-muted-foreground">{t('purchases:expenses_hint')}</span>
                    </h4>
                    <Button type="button" variant="outline" size="sm" onClick={() => addExpense(g._key)}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> {t('purchases:add_expense')}
                    </Button>
                  </div>

                  {g.expenses.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
                      {t('purchases:no_expenses_yet')}
                    </div>
                  ) : (
                    <div>
                      {/* Column headers */}
                      <div className="grid grid-cols-[2fr_1fr_1fr_1fr_auto_2fr_2rem] gap-3 px-1 mb-1.5 border-b border-border pb-1.5">
                        {['Expense Type', 'Category', 'Amount ₹', 'Status', 'Receipt', 'Notes', ''].map(h => (
                          <span key={h} className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{h}</span>
                        ))}
                      </div>                        <div className="divide-y divide-border">
                        {g.expenses.map(ex => (
                          <div key={ex._key} className="grid grid-cols-[2fr_1fr_1fr_1fr_auto_2fr_2rem] gap-3 items-center py-2 px-1">
                            <Select
                              value={ex.expense_type_id}
                              onValueChange={v => {
                                if (v === '__add_custom__') {
                                  setShowAddExpenseType(true);
                                  return;
                                }
                                const et = expenseTypes.find(e => e.id === v);
                                updateExpense(g._key, ex._key, { expense_type_id: v, expense_type_name: et?.name || v });
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder={t('purchases:select_expense_type')} />
                              </SelectTrigger>
                              <SelectContent>
                                {expenseTypes.map(et => (
                                  <SelectItem key={et.id} value={et.id}>{et.name}</SelectItem>
                                ))}
                                <SelectItem value="__add_custom__" className="text-primary font-medium">
                                  <span className="flex items-center gap-2">
                                    <Plus className="h-3.5 w-3.5" />
                                    {t('purchases:add_custom_type')}
                                  </span>
                                </SelectItem>
                              </SelectContent>
                            </Select>
                            <Select
                              value={ex.expense_category}
                              onValueChange={v => updateExpense(g._key, ex._key, { expense_category: v as 'DIRECT' | 'INDIRECT' })}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="DIRECT">
                                  <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-blue-500 inline-block" />{t('purchases:direct_label')}</span>
                                </SelectItem>
                                <SelectItem value="INDIRECT">
                                  <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-amber-500 inline-block" />{t('purchases:indirect_label')}</span>
                                </SelectItem>
                              </SelectContent>
                            </Select>
                            <Input
                              type="number" min={0} step="0.01"
                              placeholder="0.00"
                              value={ex.amount || ''}
                              onChange={e => updateExpense(g._key, ex._key, { amount: parseFloat(e.target.value) || 0 })}
                            />
                            {/* Paid / Unpaid toggle */}
                            <button
                              type="button"
                              onClick={() => updateExpense(g._key, ex._key, { is_paid: !ex.is_paid })}
                              className={`h-9 w-full rounded-lg text-xs font-semibold border transition-all flex items-center justify-center gap-1.5 ${
                                ex.is_paid
                                  ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/20'
                                  : 'bg-red-500/10 text-red-500 border-red-500/30 hover:bg-red-500/20'
                              }`}
                            >
                              <span className={`h-1.5 w-1.5 rounded-full ${ex.is_paid ? 'bg-emerald-500' : 'bg-red-500'}`} />
                              {ex.is_paid ? t('common:paid') : t('common:unpaid')}
                            </button>
                            {/* Expense receipt attachment */}
                            <div className="flex items-center gap-1.5 min-w-[80px]">
                              {(ex.receipt_preview || ex.receipt_url) ? (
                                <div className="relative group h-9 w-14 rounded-lg border border-border overflow-hidden bg-muted/30 flex items-center justify-center shrink-0">
                                  {ex.receipt_type?.startsWith('image/') ? (
                                    <img
                                      src={ex.receipt_preview || ex.receipt_url}
                                      alt="Receipt"
                                      className="h-full w-full object-cover cursor-pointer"
                                      onClick={() => setPreviewFile({ url: (ex.receipt_url || ex.receipt_preview)!, type: ex.receipt_type || 'image/jpeg', name: ex.receipt_name || 'receipt' })}
                                    />
                                  ) : (
                                    <FileText
                                      className="h-4 w-4 text-muted-foreground cursor-pointer"
                                      onClick={() => setPreviewFile({ url: (ex.receipt_url || ex.receipt_preview)!, type: ex.receipt_type || 'application/pdf', name: ex.receipt_name || 'receipt' })}
                                    />
                                  )}
                                  {ex.receipt_uploading && (
                                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                      <Loader2 className="h-3 w-3 text-white animate-spin" />
                                    </div>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => removeExpenseReceipt(g._key, ex._key)}
                                    className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                  >
                                    <X className="h-2.5 w-2.5" />
                                  </button>
                                </div>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => expenseReceiptInputRefs.current[ex._key]?.click()}
                                    className="h-9 px-2 rounded-lg border border-dashed border-border text-muted-foreground hover:border-primary/50 hover:text-primary hover:bg-primary/5 transition-colors flex items-center gap-1 text-xs"
                                    title={t('common:attach_receipt_photo')}
                                  >
                                    <Paperclip className="h-3.5 w-3.5" />
                                    <span className="hidden sm:inline">{t('common:attach')}</span>
                                  </button>
                                  <input
                                    ref={el => { expenseReceiptInputRefs.current[ex._key] = el; }}
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
                                    className="hidden"
                                    onChange={e => { handleExpenseReceiptPick(g._key, ex._key, e.target.files?.[0] || null); e.target.value = ''; }}
                                  />
                                </>
                              )}
                            </div>
                            <Input
                              placeholder={t('purchases:description_placeholder')}
                              value={ex.notes}
                              onChange={e => updateExpense(g._key, ex._key, { notes: e.target.value })}
                            />
                            <button
                              type="button"
                              onClick={() => removeExpense(g._key, ex._key)}
                              className="h-9 w-9 rounded-lg flex items-center justify-center text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-6 justify-end pt-2 text-sm">
                        <span className="text-muted-foreground">Direct: <strong className="text-foreground">{formatCurrency(gadiDirectExp(g))}</strong></span>
                        <span className="text-muted-foreground">Indirect: <strong className="text-foreground">{formatCurrency(gadiIndirectExp(g))}</strong></span>
                        {g.expenses.some(e => !e.is_paid) && (
                          <span className="text-red-500">Unpaid: <strong>{formatCurrency(g.expenses.filter(e => !e.is_paid).reduce((s, e) => s + e.amount, 0))}</strong></span>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <Separator />

                {/* ── Section 4: Cutter (optional) ── */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-sm font-semibold flex items-center gap-2">
                      <span className="h-6 w-6 rounded-md bg-purple-500/10 flex items-center justify-center">
                        <Scissors className="h-3.5 w-3.5 text-purple-500" />
                      </span>
                      {t('purchases:cutter_section')}
                      <Badge variant="outline" className="text-xs px-2 py-0 font-normal">{t('common:optional')}</Badge>
                    </h4>
                    <Button type="button" variant="outline" size="sm" onClick={() => addCutter(g._key)}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> {t('purchases:add_cutter')}
                    </Button>
                  </div>

                  {g.cutters.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
                      {t('purchases:no_cutter_yet')}
                    </div>
                  ) : (
                    <div>
                      {/* Column headers */}
                      <div className="grid grid-cols-[2fr_0.8fr_0.7fr_1fr_1fr_0.9fr_auto_1.5fr_2rem] gap-3 px-1 mb-1.5 border-b border-border pb-1.5">
                        {['Cutter', 'Qty', 'Unit', 'Rate ₹', 'Amount', 'Status', 'Receipt', 'Notes', ''].map(h => (
                          <span key={h} className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{h}</span>
                        ))}
                      </div>
                      <div className="divide-y divide-border">
                        {g.cutters.map(c => (
                          <div key={c._key} className="grid grid-cols-[2fr_0.8fr_0.7fr_1fr_1fr_0.9fr_auto_1.5fr_2rem] gap-3 items-center py-2 px-1">
                            <Select
                              value={c.cutter_id}
                              onValueChange={v => {
                                if (v === '__add_cutter__') {
                                  pendingCutterFor.current = { gadiKey: g._key, cutKey: c._key };
                                  setNewCutterName('');
                                  setNewCutterPhone('');
                                  setShowAddCutter(true);
                                  return;
                                }
                                const ct = cutters.find(x => x.id === v);
                                updateCutter(g._key, c._key, {
                                  cutter_id: v,
                                  cutter_name: ct?.name || v,
                                  rate: ct?.rate_per_unit ? parseFloat(String(ct.rate_per_unit)) : c.rate,
                                  unit: ct?.unit || c.unit || 'KG',
                                });
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder={t('purchases:select_cutter')} />
                              </SelectTrigger>
                              <SelectContent>
                                {cutters.length === 0 && (
                                  <div className="px-2 py-1.5 text-xs text-muted-foreground text-center">{t('purchases:no_cutters_yet')}</div>
                                )}
                                {cutters.map(ct => (
                                  <SelectItem key={ct.id} value={ct.id}>
                                    {ct.name}{ct.phone ? ` (${ct.phone})` : ''}{ct.rate_per_unit ? ` — ₹${ct.rate_per_unit}/${ct.unit || 'KG'}` : ''}
                                  </SelectItem>
                                ))}
                                <SelectItem value="__add_cutter__" className="text-primary font-medium border-t border-border mt-1">
                                  <span className="flex items-center gap-2">
                                    <Plus className="h-3.5 w-3.5" /> {t('purchases:add_new_cutter')}
                                  </span>
                                </SelectItem>
                              </SelectContent>
                            </Select>
                            <Input
                              type="number" min={0} step="0.01" placeholder="0"
                              value={c.quantity || ''}
                              onChange={e => updateCutter(g._key, c._key, { quantity: parseFloat(e.target.value) || 0 })}
                            />
                            <Select
                              value={c.unit}
                              onValueChange={v => updateCutter(g._key, c._key, { unit: v })}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="KG">{t('common:unit_kg')}</SelectItem>
                                <SelectItem value="PCS">{t('common:unit_pcs')}</SelectItem>
                                <SelectItem value="BOX">{t('common:unit_box')}</SelectItem>
                                <SelectItem value="BAG">{t('common:unit_bag')}</SelectItem>
                                <SelectItem value="BUNDLE">{t('common:unit_bundle')}</SelectItem>
                                <SelectItem value="TON">{t('common:unit_ton')}</SelectItem>
                                <SelectItem value="QUINTAL">{t('common:unit_quintal')}</SelectItem>
                              </SelectContent>
                            </Select>
                            <Input
                              type="number" min={0} step="0.01" placeholder="0"
                              value={c.rate || ''}
                              onChange={e => updateCutter(g._key, c._key, { rate: parseFloat(e.target.value) || 0 })}
                            />
                            <div className="h-9 flex items-center justify-center rounded-md bg-primary/5 border border-primary/20 px-2">
                              <span className="text-sm font-semibold text-primary">{formatCurrency(c.quantity * c.rate)}</span>
                            </div>
                            {/* Paid / Unpaid toggle */}
                            <button
                              type="button"
                              onClick={() => updateCutter(g._key, c._key, { is_paid: !c.is_paid })}
                              className={`h-9 w-full rounded-lg text-xs font-semibold border transition-all flex items-center justify-center gap-1.5 ${
                                c.is_paid
                                  ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/20'
                                  : 'bg-red-500/10 text-red-500 border-red-500/30 hover:bg-red-500/20'
                              }`}
                            >
                              <span className={`h-1.5 w-1.5 rounded-full ${c.is_paid ? 'bg-emerald-500' : 'bg-red-500'}`} />
                              {c.is_paid ? t('common:paid') : t('common:unpaid')}
                            </button>
                            {/* Cutter receipt attachment */}
                            <div className="flex items-center gap-1.5 min-w-[80px]">
                              {(c.receipt_preview || c.receipt_url) ? (
                                <div className="relative group h-9 w-14 rounded-lg border border-border overflow-hidden bg-muted/30 flex items-center justify-center shrink-0">
                                  {c.receipt_type?.startsWith('image/') ? (
                                    <img
                                      src={c.receipt_preview || c.receipt_url}
                                      alt="Receipt"
                                      className="h-full w-full object-cover cursor-pointer"
                                      onClick={() => setPreviewFile({ url: (c.receipt_url || c.receipt_preview)!, type: c.receipt_type || 'image/jpeg', name: c.receipt_name || 'receipt' })}
                                    />
                                  ) : (
                                    <FileText
                                      className="h-4 w-4 text-muted-foreground cursor-pointer"
                                      onClick={() => setPreviewFile({ url: (c.receipt_url || c.receipt_preview)!, type: c.receipt_type || 'application/pdf', name: c.receipt_name || 'receipt' })}
                                    />
                                  )}
                                  {c.receipt_uploading && (
                                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                      <Loader2 className="h-3 w-3 text-white animate-spin" />
                                    </div>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => removeCutterReceipt(g._key, c._key)}
                                    className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                  >
                                    <X className="h-2.5 w-2.5" />
                                  </button>
                                </div>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => cutterReceiptInputRefs.current[c._key]?.click()}
                                    className="h-9 px-2 rounded-lg border border-dashed border-border text-muted-foreground hover:border-primary/50 hover:text-primary hover:bg-primary/5 transition-colors flex items-center gap-1 text-xs"
                                    title={t('common:attach_receipt_photo')}
                                  >
                                    <Paperclip className="h-3.5 w-3.5" />
                                    <span className="hidden sm:inline">{t('common:attach')}</span>
                                  </button>
                                  <input
                                    ref={el => { cutterReceiptInputRefs.current[c._key] = el; }}
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
                                    className="hidden"
                                    onChange={e => { handleCutterReceiptPick(g._key, c._key, e.target.files?.[0] || null); e.target.value = ''; }}
                                  />
                                </>
                              )}
                            </div>
                            <Input
                              placeholder={t('purchases:notes_line_placeholder')}
                              value={c.notes}
                              onChange={e => updateCutter(g._key, c._key, { notes: e.target.value })}
                            />
                            <button
                              type="button"
                              onClick={() => removeCutter(g._key, c._key)}
                              className="h-9 w-9 rounded-lg flex items-center justify-center text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                      <div className="flex justify-end text-sm pt-2 gap-6">
                        <span className="text-muted-foreground">{t('purchases:total_cutter_cost')}: <strong className="text-foreground">{formatCurrency(gadiCutterCost(g))}</strong></span>
                        {g.cutters.some(c => !c.is_paid) && (
                          <span className="text-red-500">Unpaid: <strong>{formatCurrency(g.cutters.filter(c => !c.is_paid).reduce((s, c) => s + c.quantity * c.rate, 0))}</strong></span>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <Separator />

                {/* ── Section 5: Attachments (bills, PDFs, images) ── */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <Paperclip className="h-3.5 w-3.5" /> {t('purchases:bills_attachments')}
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">Images / PDF</Badge>
                    </h4>
                    <Button
                      type="button" variant="outline" size="sm"
                      onClick={() => fileInputRefs.current[g._key]?.click()}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" /> {t('purchases:attach_bills')}
                    </Button>
                    <input
                      ref={el => { fileInputRefs.current[g._key] = el; }}
                      type="file"
                      multiple
                      accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
                      className="hidden"
                      onChange={e => { handleFilePick(g._key, e.target.files); e.target.value = ''; }}
                    />
                  </div>

                  {g.attachments.length === 0 ? (
                    <div
                      className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
                      onClick={() => fileInputRefs.current[g._key]?.click()}
                    >
                      <Paperclip className="h-6 w-6 mx-auto mb-2 text-muted-foreground/50" />
                      {t('purchases:drop_files')}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-3">
                      {g.attachments.map(att => (
                        <div
                          key={att._key}
                          className="relative group w-24 rounded-xl border border-border bg-muted/30 overflow-hidden"
                        >
                          {/* Thumbnail */}
                          <div className="h-20 w-full flex items-center justify-center bg-muted/50">
                            {att.type.startsWith('image/') ? (
                              <img
                                src={att.preview || att.uploadedUrl}
                                alt={att.name}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <FileText className="h-8 w-8 text-muted-foreground" />
                            )}
                          </div>
                          {/* Name */}
                          <p className="text-[10px] truncate px-1 py-1 text-muted-foreground">{att.name}</p>
                          {/* Overlay actions */}
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                            {(att.uploadedUrl || att.preview) && (
                              <button
                                type="button"
                                title={t('common:preview_label')}
                                onClick={() => setPreviewFile({ url: att.uploadedUrl || att.preview, type: att.type, name: att.name })}
                                className="text-white hover:text-blue-300 transition-colors"
                              >
                                <Eye className="h-4 w-4" />
                              </button>
                            )}
                            {att.uploadedUrl && (
                              <a
                                href={att.uploadedUrl}
                                download={att.name}
                                target="_blank"
                                rel="noreferrer"
                                className="text-white hover:text-green-300 transition-colors"
                                title={t('common:download_label')}
                                onClick={e => e.stopPropagation()}
                              >
                                <Download className="h-4 w-4" />
                              </a>
                            )}
                            <button
                              type="button"
                              title={t('common:remove_label')}
                              onClick={() => removeAttachment(g._key, att._key)}
                              className="text-white hover:text-red-400 transition-colors"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                          {/* Upload status */}
                          {att.uploading && (
                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                              <Loader2 className="h-5 w-5 text-white animate-spin" />
                            </div>
                          )}
                          {att.error && (
                            <div className="absolute bottom-0 left-0 right-0 bg-red-500/80 text-white text-[9px] text-center py-0.5">
                              Failed
                            </div>
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

                {/* ── Section 6: Payment ── */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-sm font-semibold flex items-center gap-2">
                      <span className="h-6 w-6 rounded-md bg-emerald-500/10 flex items-center justify-center">
                        <IndianRupee className="h-3.5 w-3.5 text-emerald-500" />
                      </span>
                      {t('purchases:payments_section')}
                    </h4>
                    <Button type="button" variant="outline" size="sm" onClick={() => addPayment(g._key)}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> {t('purchases:split_payment')}
                    </Button>
                  </div>

                  <div>
                    {/* Column headers */}
                    <div className="grid grid-cols-[1.2fr_1fr_1.2fr_1.2fr_auto_2rem] gap-3 px-1 mb-1.5 border-b border-border pb-1.5">
                      {['Payment Mode', 'Amount ₹', 'Ref / UTR / Cheque No.', 'Notes', 'Receipt', ''].map(h => (
                        <span key={h} className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{h}</span>
                      ))}
                    </div>
                    <div className="divide-y divide-border">
                      {g.payments.map(p => (
                        <div key={p._key} className="grid grid-cols-[1.2fr_1fr_1.2fr_1.2fr_auto_2rem] gap-3 items-center py-2 px-1">
                          <Select
                            value={p.payment_mode}
                            onValueChange={v => updatePayment(g._key, p._key, { payment_mode: v })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
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
                            value={p.amount || ''}
                            onChange={e => updatePayment(g._key, p._key, { amount: parseFloat(e.target.value) || 0 })}
                          />
                          <Input
                            placeholder={t('purchases:reference_placeholder')}
                            value={p.transaction_ref}
                            onChange={e => updatePayment(g._key, p._key, { transaction_ref: e.target.value })}
                          />
                          <Input
                            placeholder={t('purchases:notes_line_placeholder')}
                            value={p.notes}
                            onChange={e => updatePayment(g._key, p._key, { notes: e.target.value })}
                          />
                          {/* Receipt attachment */}
                          <div className="flex items-center gap-1.5 min-w-[80px]">
                            {(p.receipt_preview || p.receipt_url) ? (
                              <div className="relative group h-9 w-14 rounded-lg border border-border overflow-hidden bg-muted/30 flex items-center justify-center shrink-0">
                                {p.receipt_type?.startsWith('image/') ? (
                                  <img
                                    src={p.receipt_preview || p.receipt_url}
                                    alt="Receipt"
                                    className="h-full w-full object-cover cursor-pointer"
                                    onClick={() => setPreviewFile({ url: (p.receipt_url || p.receipt_preview)!, type: p.receipt_type || 'image/jpeg', name: p.receipt_name || 'receipt' })}
                                  />
                                ) : (
                                  <FileText
                                    className="h-4 w-4 text-muted-foreground cursor-pointer"
                                    onClick={() => setPreviewFile({ url: (p.receipt_url || p.receipt_preview)!, type: p.receipt_type || 'application/pdf', name: p.receipt_name || 'receipt' })}
                                  />
                                )}
                                {p.receipt_uploading && (
                                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                    <Loader2 className="h-3 w-3 text-white animate-spin" />
                                  </div>
                                )}
                                <button
                                  type="button"
                                  onClick={() => removePaymentReceipt(g._key, p._key)}
                                  className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <X className="h-2.5 w-2.5" />
                                </button>
                              </div>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => paymentReceiptInputRefs.current[p._key]?.click()}
                                  className="h-9 px-2 rounded-lg border border-dashed border-border text-muted-foreground hover:border-primary/50 hover:text-primary hover:bg-primary/5 transition-colors flex items-center gap-1 text-xs"
                                  title={t('common:attach_receipt_photo')}
                                >
                                  <Paperclip className="h-3.5 w-3.5" />
                                  <span className="hidden sm:inline">{t('common:attach')}</span>
                                </button>
                                <input
                                  ref={el => { paymentReceiptInputRefs.current[p._key] = el; }}
                                  type="file"
                                  accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
                                  className="hidden"
                                  onChange={e => { handlePaymentReceiptPick(g._key, p._key, e.target.files?.[0] || null); e.target.value = ''; }}
                                />
                              </>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => removePayment(g._key, p._key)}
                            disabled={g.payments.length <= 1}
                            className="h-9 w-9 rounded-lg flex items-center justify-center text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-30 disabled:pointer-events-none"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Summary */}
                  <div className="mt-4 rounded-xl bg-muted/30 border border-border p-5 space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{t('purchases:items_subtotal')}</span>
                      <span className="font-medium">{formatCurrency(subtotal)}</span>
                    </div>
                    {gadiDirectExp(g) > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{t('purchases:direct_expenses')}</span>
                        <span className="font-medium">{formatCurrency(gadiDirectExp(g))}</span>
                      </div>
                    )}
                    {gadiIndirectExp(g) > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{t('purchases:indirect_expenses')}</span>
                        <span className="font-medium">{formatCurrency(gadiIndirectExp(g))}</span>
                      </div>
                    )}
                    {gadiCutterCost(g) > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{t('purchases:cutter_cost')}</span>
                        <span className="font-medium">{formatCurrency(gadiCutterCost(g))}</span>
                      </div>
                    )}

                    {/* GST (optional) */}
                    <div className="flex items-center gap-2 pt-1">
                      <span className="text-sm text-muted-foreground whitespace-nowrap">{t('purchases:gst_section')}</span>
                      <select
                        value={g.gst_mode}
                        onChange={e => {
                          const mode = e.target.value as GstMode;
                          setGadis(prev => prev.map(gd => gd._key === g._key ? { ...gd, gst_mode: mode, gst_value: mode === 'NONE' ? 0 : gd.gst_value } : gd));
                        }}
                        className="h-8 rounded-md border border-border bg-background px-2 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        <option value="NONE">{t('purchases:none')}</option>
                        <option value="PERCENT">%</option>
                        <option value="AMOUNT">₹ Fixed</option>
                      </select>
                      {g.gst_mode !== 'NONE' && (
                        <div className="relative flex-1 max-w-[140px]">
                          <Input
                            type="number"
                            min={0}
                            step={g.gst_mode === 'PERCENT' ? '0.01' : '1'}
                            placeholder={g.gst_mode === 'PERCENT' ? 'e.g. 18' : 'Amount'}
                            value={g.gst_value || ''}
                            onChange={e => {
                              const val = parseFloat(e.target.value) || 0;
                              setGadis(prev => prev.map(gd => gd._key === g._key ? { ...gd, gst_value: val } : gd));
                            }}
                            className="h-8 text-xs pr-8"
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                            {g.gst_mode === 'PERCENT' ? '%' : '₹'}
                          </span>
                        </div>
                      )}
                      {g.gst_mode !== 'NONE' && gadiGstAmount(g) > 0 && (
                        <span className="ml-auto text-sm font-medium text-blue-400">
                          +{formatCurrency(gadiGstAmount(g))}
                        </span>
                      )}
                    </div>

                    {/* Discount & Round-off */}
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2 flex-1">
                        <span className="text-sm text-muted-foreground whitespace-nowrap">{t('purchases:discount')}</span>
                        <div className="relative flex-1 max-w-[140px]">
                          <Input
                            type="number" min={0} step="0.01"
                            placeholder="0"
                            value={g.discount || ''}
                            onChange={e => setGadis(prev => prev.map(gd => gd._key === g._key ? { ...gd, discount: parseFloat(e.target.value) || 0 } : gd))}
                            className="h-8 text-xs pr-6"
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">₹</span>
                        </div>
                        {(g.discount || 0) > 0 && <span className="text-sm font-medium text-emerald-500">-{formatCurrency(g.discount)}</span>}
                      </div>
                      <div className="flex items-center gap-2 flex-1">
                        <span className="text-sm text-muted-foreground whitespace-nowrap">{t('purchases:round_off')}</span>
                        <div className="relative flex-1 max-w-[140px]">
                          <Input
                            type="number" step="0.01"
                            placeholder="0"
                            value={g.round_off || ''}
                            onChange={e => setGadis(prev => prev.map(gd => gd._key === g._key ? { ...gd, round_off: parseFloat(e.target.value) || 0 } : gd))}
                            className="h-8 text-xs pr-6"
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">₹</span>
                        </div>
                        {(g.round_off || 0) !== 0 && (
                          <span className={cn("text-sm font-medium", g.round_off > 0 ? 'text-orange-500' : 'text-emerald-500')}>
                            {g.round_off > 0 ? '+' : ''}{formatCurrency(g.round_off)}
                          </span>
                        )}
                      </div>
                    </div>

                    <Separator />
                    <div className="flex justify-between font-semibold text-base">
                      <span>{t('common:total')}</span>
                      <span className="text-primary">{formatCurrency(total)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-emerald-500">{t('purchases:paid_amount')}</span>
                      <span className="font-medium text-emerald-500">{formatCurrency(paid)}</span>
                    </div>
                    <div className={cn(
                      'flex justify-between font-bold text-base rounded-xl px-4 py-3',
                      balance > 0 ? 'bg-red-500/10 text-red-500' : 'bg-emerald-500/10 text-emerald-500',
                    )}>
                      <span>{balance > 0 ? t('purchases:balance_payable') : t('purchases:advance_paid')}</span>
                      <span>{formatCurrency(Math.abs(balance))}</span>
                    </div>
                  </div>

                  {/* ── Payment Reminder ── */}
                  <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <Bell className="h-4 w-4 text-amber-500" />
                        <span className="text-sm font-semibold text-amber-600 dark:text-amber-400">{t('purchases:reminders_section')} ({t('common:optional')})</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setGadis(prev => prev.map(gd =>
                          gd._key === g._key ? { ...gd, reminders: [...gd.reminders, blankReminder()] } : gd,
                        ))}
                        className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 hover:text-amber-700 font-medium"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        {t('purchases:add_reminder')}
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t('purchases:reminder_hint')}
                    </p>

                    {g.reminders.length === 0 && (
                      <button
                        type="button"
                        onClick={() => setGadis(prev => prev.map(gd =>
                          gd._key === g._key ? { ...gd, reminders: [blankReminder()] } : gd,
                        ))}
                        className="w-full border border-dashed border-amber-400/50 rounded-lg py-2.5 text-xs text-amber-600/70 hover:text-amber-600 hover:border-amber-400 transition-colors flex items-center justify-center gap-1.5"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        {t('purchases:add_reminder_hint')}
                      </button>
                    )}

                    {g.reminders.map((r, rIdx) => (
                      <div key={r._key} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
                        <div>
                          <Label className="text-xs text-muted-foreground mb-1 block">
                            {t('purchases:remind_on')} {g.reminders.length > 1 && <span className="text-amber-500">#{rIdx + 1}</span>}
                          </Label>
                          <Input
                            type="date"
                            value={r.remind_on}
                            min={new Date().toISOString().split('T')[0]}
                            onChange={e => setGadis(prev => prev.map(gd =>
                              gd._key === g._key
                                ? { ...gd, reminders: gd.reminders.map(rm => rm._key === r._key ? { ...rm, remind_on: e.target.value } : rm) }
                                : gd,
                            ))}
                            className="h-9 text-sm"
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground mb-1 block">
                            {t('common:amount')} ₹ <span className="opacity-60">(0 = {t('purchases:full_balance')})</span>
                          </Label>
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            placeholder={balance > 0 ? balance.toFixed(2) : '0.00'}
                            value={r.amount || ''}
                            onChange={e => setGadis(prev => prev.map(gd =>
                              gd._key === g._key
                                ? { ...gd, reminders: gd.reminders.map(rm => rm._key === r._key ? { ...rm, amount: parseFloat(e.target.value) || 0 } : rm) }
                                : gd,
                            ))}
                            className="h-9 text-sm"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => setGadis(prev => prev.map(gd =>
                            gd._key === g._key ? { ...gd, reminders: gd.reminders.filter(rm => rm._key !== r._key) } : gd,
                          ))}
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

  // ─────────────────────────────────────────────────────────────────────────────

  const grandTotal = gadis.reduce((s, g) => s + gadiTotal(g), 0);
  const grandPaid = gadis.reduce((s, g) => s + gadiPaid(g), 0);
  const grandBalance = grandTotal - grandPaid;

  return (
    <div ref={formRef} className="max-w-5xl mx-auto space-y-6 pb-10">
      {/* Page Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/purchases')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h2 className="text-2xl font-bold">{isEdit ? t('purchases:edit_purchase') : t('purchases:new_purchase')}</h2>
          <p className="text-muted-foreground text-sm">
            {isEdit
              ? t('purchases:edit_purchase_desc')
              : t('purchases:new_purchase_desc')}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <AnimatePresence>
          {gadis.map((g, idx) => renderGadi(g, idx))}
        </AnimatePresence>

        {/* Add another Gadi (create mode only) */}
        {!isEdit && (
          <button
            type="button"
            onClick={addGadi}
            className="w-full rounded-2xl border-2 border-dashed border-border hover:border-primary/50 hover:bg-primary/5 transition-colors p-4 flex items-center justify-center gap-2 text-sm font-medium text-muted-foreground hover:text-primary"
          >
            <Plus className="h-4 w-4" />
            {t('purchases:add_another_gadi')} {gadis[0]?.party_id ? (parties.find(p => p.id === gadis[0].party_id)?.name || '') : ''}
          </button>
        )}

        {/* Grand total bar */}
        {gadis.length > 1 && (
          <Card className="glass border-primary/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2">
                  <Calculator className="h-5 w-5 text-primary" />
                  <span className="font-semibold">{t('purchases:session_total', { count: gadis.length })}</span>
                </div>
                <div className="flex gap-6 text-sm">
                  <span className="text-muted-foreground">Total: <strong className="text-foreground">{formatCurrency(grandTotal)}</strong></span>
                  <span className="text-emerald-500">Paid: <strong>{formatCurrency(grandPaid)}</strong></span>
                  <span className={grandBalance > 0 ? 'text-red-400' : 'text-emerald-400'}>
                    Balance: <strong>{formatCurrency(grandBalance)}</strong>
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Action Buttons */}
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={() => navigate('/purchases')}>
            {t('common:cancel')}
          </Button>
          <Button type="submit" loading={submitting}>
            <Save className="h-4 w-4 mr-2" />
            {submitting ? t('purchases:saving_purchase') : isEdit ? t('purchases:update_purchase') : t('purchases:save_purchase')}
          </Button>
        </div>
      </form>

      {/* ── File Preview Modal ── */}
      <AnimatePresence>
        {previewFile && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] bg-black/80 flex items-center justify-center p-4"
            onClick={() => setPreviewFile(null)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="relative max-w-2xl w-full bg-card rounded-2xl overflow-hidden shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <span className="text-sm font-medium truncate">{previewFile.name}</span>
                <button onClick={() => setPreviewFile(null)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="max-h-[70vh] overflow-auto flex items-center justify-center p-4 bg-muted/20">
                {previewFile.type.startsWith('image/') ? (
                  <img src={previewFile.url} alt={previewFile.name} className="max-w-full max-h-[60vh] rounded-xl object-contain" />
                ) : (
                  <iframe src={previewFile.url} title={previewFile.name} className="w-full h-[60vh] rounded-xl" />
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Add Party Dialog ── */}
      <AddPartyDialog
        open={showAddParty}
        onClose={() => setShowAddParty(false)}
        onSuccess={refreshParties}
      />

      {/* ── Add Cutter Dialog ── */}
      <Dialog open={showAddCutter} onOpenChange={open => { if (!open) { setShowAddCutter(false); setNewCutterName(''); setNewCutterPhone(''); pendingCutterFor.current = null; } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('purchases:add_new_cutter_title')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>{t('purchases:cutter_name_label')} *</Label>
              <Input
                placeholder={t('purchases:cutter_name_placeholder')}
                value={newCutterName}
                onChange={e => setNewCutterName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCreateCutter(); } }}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('purchases:cutter_phone_label')}</Label>
              <Input
                placeholder={t('purchases:cutter_phone_placeholder')}
                type="tel"
                value={newCutterPhone}
                onChange={e => setNewCutterPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCreateCutter(); } }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { setShowAddCutter(false); setNewCutterName(''); setNewCutterPhone(''); pendingCutterFor.current = null; }}>
              {t('common:cancel')}
            </Button>
            <Button
              type="button"
              loading={addingCutter}
              disabled={!newCutterName.trim() || addingCutter}
              onClick={handleCreateCutter}
            >
              <Plus className="h-4 w-4 mr-1.5" /> {t('purchases:add_cutter')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add Custom Expense Type Dialog ── */}
      <Dialog open={showAddExpenseType} onOpenChange={open => { if (!open) { setShowAddExpenseType(false); setNewExpenseTypeName(''); setNewExpenseTypeCategory('DIRECT'); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('purchases:add_expense_type_title')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>{t('purchases:expense_name_label')} *</Label>
              <Input
                placeholder={t('common:expense_type_placeholder')}
                value={newExpenseTypeName}
                onChange={e => setNewExpenseTypeName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCreateExpenseType(); } }}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('purchases:expense_category_label')}</Label>
              <Select value={newExpenseTypeCategory} onValueChange={v => setNewExpenseTypeCategory(v as 'DIRECT' | 'INDIRECT')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DIRECT">
                    <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-blue-500 inline-block" />{t('purchases:direct_label')}</span>
                  </SelectItem>
                  <SelectItem value="INDIRECT">
                    <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-amber-500 inline-block" />{t('purchases:indirect_label')}</span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { setShowAddExpenseType(false); setNewExpenseTypeName(''); setNewExpenseTypeCategory('DIRECT'); }}>
              {t('common:cancel')}
            </Button>
            <Button
              type="button"
              loading={addingExpenseType}
              disabled={!newExpenseTypeName.trim() || addingExpenseType}
              onClick={handleCreateExpenseType}
            >
              <Plus className="h-4 w-4 mr-1.5" /> {t('purchases:add_type')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add Item Dialog ── */}
      <Dialog open={showAddItem} onOpenChange={open => { if (!open) { setShowAddItem(false); setNewItemName(''); setNewItemUnit('SFT'); setNewItemCategoryId(''); setNewItemCustomUnit(false); pendingAddItemFor.current = null; } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('purchases:add_item_title')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>{t('purchases:add_item_name_label')} *</Label>
              <Input
                placeholder={t('purchases:item_name_placeholder')}
                value={newItemName}
                onChange={e => setNewItemName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCreateItem(pendingAddItemFor.current || undefined); } }}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('purchases:add_item_category_label')}</Label>
              {/* Quick-pick category badges */}
              {categories.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {categories.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setNewItemCategoryId(c.id)}
                      className={cn(
                        'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                        newItemCategoryId === c.id
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-muted text-muted-foreground border-border hover:border-primary/50 hover:text-foreground',
                      )}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
              <Select value={newItemCategoryId} onValueChange={setNewItemCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('purchases:select_category')} />
                </SelectTrigger>
                <SelectContent>
                  {categories.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('purchases:add_item_unit_label')}</Label>
              <Select
                value={newItemCustomUnit ? '__custom__' : (newItemUnit || 'SFT')}
                onValueChange={v => {
                  if (v === '__custom__') {
                    setNewItemCustomUnit(true);
                    setNewItemUnit('');
                  } else {
                    setNewItemCustomUnit(false);
                    setNewItemUnit(v);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('purchases:select_unit')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SFT">{t('common:unit_sqft_full')}</SelectItem>
                  <SelectItem value="Ton">{t('common:unit_ton')}</SelectItem>
                  <SelectItem value="KG">{t('common:unit_kg')}</SelectItem>
                  <SelectItem value="__custom__" className="text-primary font-medium">
                    <span className="flex items-center gap-1.5">
                      <Plus className="h-3 w-3" /> {t('common:add_custom_unit')}
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
              {newItemCustomUnit && (
                <div className="flex gap-2 mt-1.5">
                  <Input
                    placeholder={t('common:unit_example_placeholder')}
                    value={newItemUnit}
                    onChange={e => setNewItemUnit(e.target.value.toUpperCase())}
                    autoFocus
                  />
                  <button
                    type="button"
                    title={t('common:back_to_list')}
                    onClick={() => { setNewItemCustomUnit(false); setNewItemUnit('SFT'); }}
                    className="h-9 w-9 shrink-0 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors border border-border"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { setShowAddItem(false); setNewItemName(''); setNewItemUnit('SFT'); setNewItemCategoryId(''); setNewItemCustomUnit(false); pendingAddItemFor.current = null; }}>
              Cancel
            </Button>
            <Button
              type="button"
              loading={addingItem}
              disabled={!newItemName.trim() || addingItem}
              onClick={() => handleCreateItem(pendingAddItemFor.current || undefined)}
            >
              <Plus className="h-4 w-4 mr-1.5" /> {t('common:add_item')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add Custom Unit Dialog ── */}
      <Dialog
        open={showAddUnit}
        onOpenChange={open => {
          if (!open) {
            setShowAddUnit(false);
            setNewUnitValue('');
            pendingUnitFor.current = null;
          }
        }}
      >
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>{t('common:add_custom_unit_title')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>{t('common:unit_name')}</Label>
              <Input
                placeholder={t('common:unit_placeholder')}
                value={newUnitValue}
                onChange={e => setNewUnitValue(e.target.value.toUpperCase())}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (!newUnitValue.trim() || !pendingUnitFor.current) return;
                    updateLot(pendingUnitFor.current.gadiKey, pendingUnitFor.current.lotKey, { unit: newUnitValue.trim() });
                    setShowAddUnit(false);
                    setNewUnitValue('');
                    pendingUnitFor.current = null;
                  }
                }}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowAddUnit(false);
                setNewUnitValue('');
                pendingUnitFor.current = null;
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!newUnitValue.trim()}
              onClick={() => {
                if (!newUnitValue.trim() || !pendingUnitFor.current) return;
                updateLot(pendingUnitFor.current.gadiKey, pendingUnitFor.current.lotKey, { unit: newUnitValue.trim() });
                setShowAddUnit(false);
                setNewUnitValue('');
                pendingUnitFor.current = null;
              }}
            >
              <Plus className="h-4 w-4 mr-1.5" /> {t('common:set_unit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
