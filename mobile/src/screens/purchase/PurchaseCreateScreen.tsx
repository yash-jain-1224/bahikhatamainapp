import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Modal,
  FlatList,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTheme } from '../../theme';
import { FontSize, Spacing, BorderRadius, Shadow } from '../../theme/colors';
import { Button, Input, LoadingScreen, AttachmentUpload } from '../../components/shared';
import type { Attachment } from '../../components/shared';
import { useToast } from '../../components/shared/Toast';
import { purchaseApi, profileApi, inventoryApi } from '../../services/api';
import { formatCurrency } from '../../utils';
import type { Party, InventoryItem, Purchase, Cutter, ExpenseType } from '../../types';

// ─── Types ───────────────────────────────────────────────────────────────────

interface LotRow {
  _key: string;
  item_id: string;
  item_name: string;
  lot_number: string;
  quantity: string;
  rate: string;
  unit: string;
  notes: string;
}

interface ExpenseRow {
  _key: string;
  expense_type_id: string;
  expense_type_name: string;
  expense_category: 'DIRECT' | 'INDIRECT';
  amount: string;
  is_paid: boolean;
  notes: string;
}

interface CutterRow {
  _key: string;
  cutter_id: string;
  cutter_name: string;
  quantity: string;
  unit: string;
  rate: string;
  is_paid: boolean;
  notes: string;
}

interface PaymentRow {
  _key: string;
  payment_mode: 'CASH' | 'BANK' | 'UPI' | 'CHEQUE' | 'OTHER';
  amount: string;
  transaction_ref: string;
  notes: string;
}

interface ReminderRow {
  _key: string;
  remind_on: string;
  amount: string;
  note: string;
}

type GstMode = 'NONE' | 'PERCENT' | 'AMOUNT';

// ─── Helpers ─────────────────────────────────────────────────────────────────

let _keyCounter = 0;
const uid = () => `_k${++_keyCounter}`;

const blankLot = (): LotRow => ({
  _key: uid(),
  item_id: '',
  item_name: '',
  lot_number: '',
  quantity: '',
  rate: '',
  unit: 'KG',
  notes: '',
});

const blankExpense = (): ExpenseRow => ({
  _key: uid(),
  expense_type_id: '',
  expense_type_name: '',
  expense_category: 'DIRECT',
  amount: '',
  is_paid: true,
  notes: '',
});

const blankCutter = (): CutterRow => ({
  _key: uid(),
  cutter_id: '',
  cutter_name: '',
  quantity: '',
  unit: 'KG',
  rate: '',
  is_paid: true,
  notes: '',
});

const blankPayment = (): PaymentRow => ({
  _key: uid(),
  payment_mode: 'CASH',
  amount: '',
  transaction_ref: '',
  notes: '',
});

const blankReminder = (): ReminderRow => ({
  _key: uid(),
  remind_on: '',
  amount: '',
  note: '',
});

const PAYMENT_MODES = [
  { value: 'CASH', label: 'Cash' },
  { value: 'BANK', label: 'Bank Transfer' },
  { value: 'UPI', label: 'UPI' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'OTHER', label: 'Other' },
];

const GST_MODES = [
  { value: 'NONE', label: 'No GST' },
  { value: 'PERCENT', label: 'GST %' },
  { value: 'AMOUNT', label: 'GST Amount' },
];

// ─── Component ───────────────────────────────────────────────────────────────

export default function PurchaseCreateScreen() {
  const { colors } = useTheme();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const editId = route.params?.id;
  const isEdit = !!editId;

  const [loading, setLoading] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);

  // Master data
  const [parties, setParties] = useState<Party[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [cutters, setCutters] = useState<Cutter[]>([]);
  const [expenseTypes, setExpenseTypes] = useState<ExpenseType[]>([]);

  // Modals
  const [showPartyPicker, setShowPartyPicker] = useState(false);
  const [showItemPicker, setShowItemPicker] = useState<string | null>(null); // lot _key
  const [showCutterPicker, setShowCutterPicker] = useState<string | null>(null); // cutter _key
  const [showExpenseTypePicker, setShowExpenseTypePicker] = useState<string | null>(null); // expense _key
  const [showPaymentModePicker, setShowPaymentModePicker] = useState<string | null>(null); // payment _key
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showReminderDatePicker, setShowReminderDatePicker] = useState<string | null>(null);

  // Form state - Header
  const [partyId, setPartyId] = useState('');
  const [partyName, setPartyName] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(new Date());
  const [gadiNumber, setGadiNumber] = useState('');
  const [billNumber, setBillNumber] = useState('');
  const [notes, setNotes] = useState('');

  // GST
  const [gstMode, setGstMode] = useState<GstMode>('NONE');
  const [gstValue, setGstValue] = useState('');

  // Sections
  const [lots, setLots] = useState<LotRow[]>([blankLot()]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [cutterRows, setCutterRows] = useState<CutterRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([blankPayment()]);
  const [reminders, setReminders] = useState<ReminderRow[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  // Collapsible sections
  const [showExpenses, setShowExpenses] = useState(false);
  const [showCutters, setShowCutters] = useState(false);
  const [showGst, setShowGst] = useState(false);
  const [showReminders, setShowReminders] = useState(false);

  // Search filters for pickers
  const [partySearch, setPartySearch] = useState('');
  const [itemSearch, setItemSearch] = useState('');

  // Inline "Add New" form states
  const [showAddPartyForm, setShowAddPartyForm] = useState(false);
  const [newPartyName, setNewPartyName] = useState('');
  const [newPartyPhone, setNewPartyPhone] = useState('');
  const [addingParty, setAddingParty] = useState(false);

  const [showAddItemForm, setShowAddItemForm] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemUnit, setNewItemUnit] = useState('KG');
  const [addingItem, setAddingItem] = useState(false);

  const [showAddExpenseTypeForm, setShowAddExpenseTypeForm] = useState(false);
  const [newExpenseTypeName, setNewExpenseTypeName] = useState('');
  const [newExpenseTypeCategory, setNewExpenseTypeCategory] = useState<'DIRECT' | 'INDIRECT'>('DIRECT');
  const [addingExpenseType, setAddingExpenseType] = useState(false);

  const [showAddCutterForm, setShowAddCutterForm] = useState(false);
  const [newCutterName, setNewCutterName] = useState('');
  const [newCutterPhone, setNewCutterPhone] = useState('');
  const [newCutterRate, setNewCutterRate] = useState('');
  const [addingCutter, setAddingCutter] = useState(false);

  // Load master data
  useEffect(() => {
    const loadData = async () => {
      try {
        const [partiesRes, itemsRes, cuttersRes, expTypesRes] = await Promise.all([
          profileApi.parties({ type: 'SUPPLIER,BOTH', limit: 200 }),
          inventoryApi.listItems({ limit: 500 }),
          profileApi.cutters?.() || Promise.resolve({ data: { data: [] } }),
          profileApi.expenseTypes?.() || Promise.resolve({ data: { data: [] } }),
        ]);
        setParties(partiesRes.data?.data || []);
        setItems(itemsRes.data?.data || []);
        setCutters(cuttersRes.data?.data || []);
        setExpenseTypes(expTypesRes.data?.data || []);
      } catch (err) {
        console.error('Failed to load master data:', err);
      }
    };
    loadData();
  }, []);

  // Load existing purchase for edit
  useEffect(() => {
    if (!editId) return;
    const loadPurchase = async () => {
      try {
        setLoading(true);
        const res = await purchaseApi.get(editId);
        const p: Purchase = res.data?.data;
        if (p) {
          setPartyId(p.party?.id || '');
          setPartyName(p.party?.name || '');
          setPurchaseDate(p.purchase_date ? new Date(p.purchase_date) : new Date());
          setGadiNumber(p.gadi_number || '');
          setBillNumber((p as any).bill_number || '');
          setNotes(p.notes || '');
          setGstMode((p as any).gst_mode || 'NONE');
          setGstValue(String((p as any).gst_value || ''));

          // Lots
          if (p.items?.length) {
            setLots(
              p.items.map((item) => ({
                _key: uid(),
                item_id: item.item_id || '',
                item_name: item.item?.name || '',
                lot_number: (item as any).lot_number || '',
                quantity: String(item.quantity || ''),
                rate: String(item.rate || ''),
                unit: item.unit || 'KG',
                notes: (item as any).notes || '',
              }))
            );
          }

          // Expenses
          if ((p as any).expenses?.length) {
            setExpenses(
              (p as any).expenses.map((ex: any) => ({
                _key: uid(),
                expense_type_id: ex.expense_type_id || '',
                expense_type_name: ex.expense_type?.name || '',
                expense_category: ex.expense_category || 'DIRECT',
                amount: String(ex.amount || ''),
                is_paid: ex.is_paid !== false,
                notes: ex.notes || '',
              }))
            );
            setShowExpenses(true);
          }

          // Cutters
          if ((p as any).cutter_transactions?.length) {
            setCutterRows(
              (p as any).cutter_transactions.map((ct: any) => ({
                _key: uid(),
                cutter_id: ct.cutter_id || '',
                cutter_name: ct.cutter?.name || '',
                quantity: String(ct.quantity || ''),
                unit: ct.cutter?.unit || 'KG',
                rate: String(ct.rate || ''),
                is_paid: ct.is_paid !== false,
                notes: ct.notes || '',
              }))
            );
            setShowCutters(true);
          }

          // Payments
          if (p.payments?.length) {
            setPayments(
              p.payments.map((pay) => ({
                _key: uid(),
                payment_mode: (pay.payment_mode || 'CASH') as PaymentRow['payment_mode'],
                amount: String(pay.amount || ''),
                transaction_ref: pay.transaction_ref || '',
                notes: pay.notes || '',
              }))
            );
          }

          // Reminders
          if ((p as any).reminders?.length) {
            setReminders(
              (p as any).reminders.map((r: any) => ({
                _key: uid(),
                remind_on: r.remind_on ? new Date(r.remind_on).toISOString().split('T')[0] : '',
                amount: String(r.amount || ''),
                note: r.note || '',
              }))
            );
            setShowReminders(true);
          }

          // Attachments
          if (p.attachments?.length) {
            setAttachments(
              p.attachments.map((a) => ({
                id: a.id,
                uri: a.file_url,
                name: a.file_name,
                type: a.file_type,
                size: a.file_size,
              }))
            );
          }
        }
      } catch (err) {
        toast.error('Failed to load purchase');
        navigation.goBack();
      } finally {
        setLoading(false);
      }
    };
    loadPurchase();
  }, [editId]);

  // ─── Lot helpers ─────────────────────────────────────────────────────────────

  const updateLot = (key: string, field: keyof LotRow, value: string | boolean) => {
    setLots((prev) =>
      prev.map((l) => (l._key === key ? { ...l, [field]: value } : l))
    );
  };

  const addLot = () => setLots((prev) => [...prev, blankLot()]);

  const removeLot = (key: string) => {
    if (lots.length <= 1) {
      toast.error('At least one item is required');
      return;
    }
    setLots((prev) => prev.filter((l) => l._key !== key));
  };

  const selectItem = (lotKey: string, item: InventoryItem) => {
    updateLot(lotKey, 'item_id', item.id);
    updateLot(lotKey, 'item_name', item.name);
    updateLot(lotKey, 'unit', item.unit || 'KG');
    setShowItemPicker(null);
  };

  // ─── Expense helpers ─────────────────────────────────────────────────────────

  const updateExpense = (key: string, field: keyof ExpenseRow, value: string | boolean) => {
    setExpenses((prev) =>
      prev.map((e) => (e._key === key ? { ...e, [field]: value } : e))
    );
  };

  const addExpense = () => {
    setExpenses((prev) => [...prev, blankExpense()]);
    setShowExpenses(true);
  };

  const removeExpense = (key: string) => {
    setExpenses((prev) => prev.filter((e) => e._key !== key));
  };

  const selectExpenseType = (expKey: string, et: ExpenseType) => {
    setExpenses((prev) =>
      prev.map((e) =>
        e._key === expKey
          ? { 
              ...e, 
              expense_type_id: et.id, 
              expense_type_name: et.name, 
              expense_category: (et.category === 'INDIRECT' ? 'INDIRECT' : 'DIRECT') as 'DIRECT' | 'INDIRECT',
            }
          : e
      )
    );
    setShowExpenseTypePicker(null);
  };

  // ─── Cutter helpers ──────────────────────────────────────────────────────────

  const updateCutterRow = (key: string, field: keyof CutterRow, value: string | boolean) => {
    setCutterRows((prev) =>
      prev.map((c) => (c._key === key ? { ...c, [field]: value } : c))
    );
  };

  const addCutterRow = () => {
    setCutterRows((prev) => [...prev, blankCutter()]);
    setShowCutters(true);
  };

  const removeCutterRow = (key: string) => {
    setCutterRows((prev) => prev.filter((c) => c._key !== key));
  };

  const selectCutter = (cutKey: string, cutter: Cutter) => {
    setCutterRows((prev) =>
      prev.map((c) =>
        c._key === cutKey
          ? {
              ...c,
              cutter_id: cutter.id,
              cutter_name: cutter.name,
              rate: String(cutter.rate_per_unit || ''),
              unit: cutter.unit || 'KG',
            }
          : c
      )
    );
    setShowCutterPicker(null);
  };

  // ─── Payment helpers ─────────────────────────────────────────────────────────

  const updatePayment = (key: string, field: keyof PaymentRow, value: string) => {
    setPayments((prev) =>
      prev.map((p) => (p._key === key ? { ...p, [field]: value } : p))
    );
  };

  const addPayment = () => setPayments((prev) => [...prev, blankPayment()]);

  const removePayment = (key: string) => {
    if (payments.length <= 1) {
      toast.error('At least one payment entry is required');
      return;
    }
    setPayments((prev) => prev.filter((p) => p._key !== key));
  };

  const selectPaymentMode = (payKey: string, mode: PaymentRow['payment_mode']) => {
    updatePayment(payKey, 'payment_mode', mode);
    setShowPaymentModePicker(null);
  };

  // ─── Reminder helpers ────────────────────────────────────────────────────────

  const updateReminder = (key: string, field: keyof ReminderRow, value: string) => {
    setReminders((prev) =>
      prev.map((r) => (r._key === key ? { ...r, [field]: value } : r))
    );
  };

  const addReminder = () => {
    setReminders((prev) => [...prev, blankReminder()]);
    setShowReminders(true);
  };

  const removeReminder = (key: string) => {
    setReminders((prev) => prev.filter((r) => r._key !== key));
  };

  // ─── Calculations ────────────────────────────────────────────────────────────

  const lotsSubtotal = lots.reduce((sum, l) => {
    const qty = parseFloat(l.quantity) || 0;
    const rate = parseFloat(l.rate) || 0;
    return sum + qty * rate;
  }, 0);

  const directExpenses = expenses
    .filter((e) => e.expense_category === 'DIRECT')
    .reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);

  const indirectExpenses = expenses
    .filter((e) => e.expense_category === 'INDIRECT')
    .reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);

  const cutterCost = cutterRows.reduce((sum, c) => {
    const qty = parseFloat(c.quantity) || 0;
    const rate = parseFloat(c.rate) || 0;
    return sum + qty * rate;
  }, 0);

  const gstAmount = (() => {
    if (gstMode === 'NONE' || !gstValue) return 0;
    if (gstMode === 'AMOUNT') return parseFloat(gstValue) || 0;
    // PERCENT
    return Math.round(lotsSubtotal * (parseFloat(gstValue) || 0) / 100 * 100) / 100;
  })();

  const totalAmount = lotsSubtotal + directExpenses + indirectExpenses + cutterCost + gstAmount;

  const totalPaid = payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);

  const balanceAmount = totalAmount - totalPaid;

  // ─── Submit ──────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    // Validation
    if (!partyId) {
      toast.error('Please select a party');
      return;
    }

    const validLots = lots.filter((l) => l.item_id && parseFloat(l.quantity) > 0 && parseFloat(l.rate) > 0);
    if (validLots.length === 0) {
      toast.error('Please add at least one item with quantity and rate');
      return;
    }

    const validExpenses = expenses.filter((e) => e.expense_type_id && parseFloat(e.amount) > 0);
    const validCutters = cutterRows.filter((c) => c.cutter_id && parseFloat(c.quantity) > 0 && parseFloat(c.rate) > 0);
    const validPayments = payments.filter((p) => parseFloat(p.amount) > 0);
    const validReminders = reminders.filter((r) => r.remind_on);

    const payload = {
      partyId,
      purchaseDate: purchaseDate.toISOString(),
      gadiNumber: gadiNumber || undefined,
      billNumber: billNumber || undefined,
      notes: notes || undefined,
      gstMode: gstMode !== 'NONE' ? gstMode : undefined,
      gstValue: gstMode !== 'NONE' ? parseFloat(gstValue) || 0 : undefined,
      gstAmount: gstMode !== 'NONE' ? gstAmount : undefined,
      items: validLots.map((l) => ({
        itemId: l.item_id,
        quantity: parseFloat(l.quantity),
        rate: parseFloat(l.rate),
        unit: l.unit,
        lotNumber: l.lot_number || undefined,
        notes: l.notes || undefined,
      })),
      expenses: validExpenses.map((e) => ({
        expenseTypeId: e.expense_type_id,
        expenseCategory: e.expense_category,
        amount: parseFloat(e.amount),
        isPaid: e.is_paid,
        notes: e.notes || undefined,
      })),
      cutters: validCutters.map((c) => ({
        cutterId: c.cutter_id,
        quantity: parseFloat(c.quantity),
        rate: parseFloat(c.rate),
        isPaid: c.is_paid,
        notes: c.notes || undefined,
      })),
      payments: validPayments.map((p) => ({
        paymentMode: p.payment_mode,
        amount: parseFloat(p.amount),
        transactionRef: p.transaction_ref || undefined,
        notes: p.notes || undefined,
      })),
      reminders: validReminders.map((r) => ({
        remindOn: new Date(r.remind_on).toISOString(),
        amount: parseFloat(r.amount) || undefined,
        note: r.note || undefined,
      })),
      totalAmount,
      paidAmount: totalPaid,
      balanceAmount,
      paymentStatus: totalPaid >= totalAmount ? 'PAID' : totalPaid > 0 ? 'PARTIAL' : 'UNPAID',
    };

    try {
      setSubmitting(true);
      let purchaseId: string;

      if (isEdit) {
        await purchaseApi.update(editId, payload);
        purchaseId = editId;
        toast.success('Purchase updated successfully');
      } else {
        const response = await purchaseApi.create(payload);
        purchaseId = response.data?.data?.id;
        toast.success('Purchase created successfully');
      }

      // Upload attachments
      if (attachments.length > 0 && purchaseId) {
        for (const attachment of attachments) {
          if (attachment.id) continue; // Already uploaded
          try {
            const formData = new FormData();
            formData.append('file', {
              uri: attachment.uri,
              name: attachment.name,
              type: attachment.type,
            } as any);
            await purchaseApi.uploadAttachment(purchaseId, formData);
          } catch (attachErr) {
            console.error('Failed to upload attachment:', attachErr);
          }
        }
      }

      navigation.goBack();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to save purchase');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = () => {
    Alert.alert('Delete Purchase', 'Are you sure you want to delete this purchase? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            setSubmitting(true);
            await purchaseApi.delete(editId);
            toast.success('Purchase deleted');
            navigation.goBack();
          } catch (err: any) {
            toast.error(err.response?.data?.message || 'Failed to delete');
          } finally {
            setSubmitting(false);
          }
        },
      },
    ]);
  };

  // ─── Filter parties ──────────────────────────────────────────────────────────

  const filteredParties = partySearch
    ? parties.filter(
        (p) =>
          p.name.toLowerCase().includes(partySearch.toLowerCase()) ||
          p.phone?.includes(partySearch)
      )
    : parties;

  const filteredItems = itemSearch
    ? items.filter((i) => i.name.toLowerCase().includes(itemSearch.toLowerCase()))
    : items;

  // ─── Render ──────────────────────────────────────────────────────────────────

  if (loading) return <LoadingScreen message="Loading purchase..." />;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ─── Party & Basic Details ─────────────────────────────────────────── */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Party Details</Text>

          <TouchableOpacity
            style={[styles.pickerBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
            onPress={() => setShowPartyPicker(true)}
          >
            <Text style={{ color: partyName ? colors.text : colors.textTertiary }}>
              {partyName || 'Select Supplier...'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.pickerBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
            onPress={() => setShowDatePicker(true)}
          >
            <Text style={{ color: colors.text }}>
              {purchaseDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
            </Text>
          </TouchableOpacity>
          {showDatePicker && (
            <DateTimePicker
              value={purchaseDate}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={(event, date) => {
                setShowDatePicker(Platform.OS === 'ios');
                if (date) setPurchaseDate(date);
              }}
            />
          )}

          <Input
            label="Vehicle Number (Gadi)"
            value={gadiNumber}
            onChangeText={setGadiNumber}
            placeholder="e.g., MH12AB1234"
            autoCapitalize="characters"
          />

          <Input
            label="Bill Number"
            value={billNumber}
            onChangeText={setBillNumber}
            placeholder="Invoice/Bill number"
          />
        </View>

        {/* ─── Items / Lots ──────────────────────────────────────────────────── */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Items</Text>
            <TouchableOpacity onPress={addLot}>
              <Text style={{ color: colors.primary, fontWeight: '600' }}>+ Add Item</Text>
            </TouchableOpacity>
          </View>

          {lots.map((lot, index) => (
            <View key={lot._key} style={[styles.lotCard, { borderColor: colors.borderLight }]}>
              <View style={styles.lotHeader}>
                <Text style={[styles.lotNumber, { color: colors.textSecondary }]}>Item {index + 1}</Text>
                {lots.length > 1 && (
                  <TouchableOpacity onPress={() => removeLot(lot._key)}>
                    <Text style={{ color: colors.error }}>Remove</Text>
                  </TouchableOpacity>
                )}
              </View>

              <TouchableOpacity
                style={[styles.pickerBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
                onPress={() => setShowItemPicker(lot._key)}
              >
                <Text style={{ color: lot.item_name ? colors.text : colors.textTertiary }}>
                  {lot.item_name || 'Select Item...'}
                </Text>
              </TouchableOpacity>

              <Input
                label="Lot Number (Optional)"
                value={lot.lot_number}
                onChangeText={(v) => updateLot(lot._key, 'lot_number', v)}
                placeholder="e.g., LOT-001"
              />

              <View style={styles.lotRow}>
                <View style={{ flex: 1, marginRight: Spacing.sm }}>
                  <Input
                    label="Quantity"
                    value={lot.quantity}
                    onChangeText={(v) => updateLot(lot._key, 'quantity', v)}
                    keyboardType="decimal-pad"
                    placeholder="0"
                  />
                </View>
                <View style={{ flex: 1, marginLeft: Spacing.sm }}>
                  <Input
                    label={`Rate (per ${lot.unit})`}
                    value={lot.rate}
                    onChangeText={(v) => updateLot(lot._key, 'rate', v)}
                    keyboardType="decimal-pad"
                    placeholder="0"
                  />
                </View>
              </View>

              {parseFloat(lot.quantity) > 0 && parseFloat(lot.rate) > 0 && (
                <Text style={[styles.lotAmount, { color: colors.primary }]}>
                  Amount: {formatCurrency(parseFloat(lot.quantity) * parseFloat(lot.rate))}
                </Text>
              )}
            </View>
          ))}

          <View style={[styles.subtotalRow, { borderTopColor: colors.border }]}>
            <Text style={[styles.subtotalLabel, { color: colors.textSecondary }]}>Items Subtotal</Text>
            <Text style={[styles.subtotalValue, { color: colors.text }]}>{formatCurrency(lotsSubtotal)}</Text>
          </View>
        </View>

        {/* ─── Expenses Section (Collapsible) ────────────────────────────────── */}
        <TouchableOpacity
          style={[styles.sectionToggle, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => setShowExpenses(!showExpenses)}
        >
          <Text style={[styles.sectionToggleText, { color: colors.text }]}>
            Expenses {expenses.length > 0 && `(${expenses.length})`}
          </Text>
          <Text style={{ color: colors.primary }}>{showExpenses ? '▲' : '▼'}</Text>
        </TouchableOpacity>

        {showExpenses && (
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, marginTop: -1 }]}>
            {expenses.map((expense, index) => (
              <View key={expense._key} style={[styles.lotCard, { borderColor: colors.borderLight }]}>
                <View style={styles.lotHeader}>
                  <Text style={[styles.lotNumber, { color: colors.textSecondary }]}>Expense {index + 1}</Text>
                  <TouchableOpacity onPress={() => removeExpense(expense._key)}>
                    <Text style={{ color: colors.error }}>Remove</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={[styles.pickerBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
                  onPress={() => setShowExpenseTypePicker(expense._key)}
                >
                  <Text style={{ color: expense.expense_type_name ? colors.text : colors.textTertiary }}>
                    {expense.expense_type_name || 'Select Expense Type...'}
                  </Text>
                </TouchableOpacity>

                <View style={styles.lotRow}>
                  <View style={{ flex: 1, marginRight: Spacing.sm }}>
                    <Input
                      label="Amount"
                      value={expense.amount}
                      onChangeText={(v) => updateExpense(expense._key, 'amount', v)}
                      keyboardType="decimal-pad"
                      placeholder="0"
                    />
                  </View>
                  <View style={{ flex: 1, marginLeft: Spacing.sm }}>
                    <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Category</Text>
                    <View style={styles.toggleRow}>
                      <TouchableOpacity
                        style={[
                          styles.toggleBtn,
                          expense.expense_category === 'DIRECT' && { backgroundColor: colors.primary },
                        ]}
                        onPress={() => updateExpense(expense._key, 'expense_category', 'DIRECT')}
                      >
                        <Text
                          style={{
                            color: expense.expense_category === 'DIRECT' ? '#fff' : colors.text,
                            fontSize: FontSize.xs,
                          }}
                        >
                          Direct
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.toggleBtn,
                          expense.expense_category === 'INDIRECT' && { backgroundColor: colors.primary },
                        ]}
                        onPress={() => updateExpense(expense._key, 'expense_category', 'INDIRECT')}
                      >
                        <Text
                          style={{
                            color: expense.expense_category === 'INDIRECT' ? '#fff' : colors.text,
                            fontSize: FontSize.xs,
                          }}
                        >
                          Indirect
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.checkRow}
                  onPress={() => updateExpense(expense._key, 'is_paid', !expense.is_paid)}
                >
                  <View style={[styles.checkbox, expense.is_paid && { backgroundColor: colors.primary }]}>
                    {expense.is_paid && <Text style={{ color: '#fff', fontSize: 12 }}>✓</Text>}
                  </View>
                  <Text style={{ color: colors.text, marginLeft: Spacing.sm }}>Paid</Text>
                </TouchableOpacity>
              </View>
            ))}

            <TouchableOpacity style={styles.addRowBtn} onPress={addExpense}>
              <Text style={{ color: colors.primary, fontWeight: '600' }}>+ Add Expense</Text>
            </TouchableOpacity>

            {expenses.length > 0 && (
              <View style={[styles.subtotalRow, { borderTopColor: colors.border }]}>
                <Text style={[styles.subtotalLabel, { color: colors.textSecondary }]}>
                  Expenses Total (Direct: {formatCurrency(directExpenses)}, Indirect: {formatCurrency(indirectExpenses)})
                </Text>
                <Text style={[styles.subtotalValue, { color: colors.text }]}>
                  {formatCurrency(directExpenses + indirectExpenses)}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* ─── Cutters Section (Collapsible) ─────────────────────────────────── */}
        <TouchableOpacity
          style={[styles.sectionToggle, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => setShowCutters(!showCutters)}
        >
          <Text style={[styles.sectionToggleText, { color: colors.text }]}>
            Cutters {cutterRows.length > 0 && `(${cutterRows.length})`}
          </Text>
          <Text style={{ color: colors.primary }}>{showCutters ? '▲' : '▼'}</Text>
        </TouchableOpacity>

        {showCutters && (
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, marginTop: -1 }]}>
            {cutterRows.map((cutter, index) => (
              <View key={cutter._key} style={[styles.lotCard, { borderColor: colors.borderLight }]}>
                <View style={styles.lotHeader}>
                  <Text style={[styles.lotNumber, { color: colors.textSecondary }]}>Cutter {index + 1}</Text>
                  <TouchableOpacity onPress={() => removeCutterRow(cutter._key)}>
                    <Text style={{ color: colors.error }}>Remove</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={[styles.pickerBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
                  onPress={() => setShowCutterPicker(cutter._key)}
                >
                  <Text style={{ color: cutter.cutter_name ? colors.text : colors.textTertiary }}>
                    {cutter.cutter_name || 'Select Cutter...'}
                  </Text>
                </TouchableOpacity>

                <View style={styles.lotRow}>
                  <View style={{ flex: 1, marginRight: Spacing.sm }}>
                    <Input
                      label={`Quantity (${cutter.unit})`}
                      value={cutter.quantity}
                      onChangeText={(v) => updateCutterRow(cutter._key, 'quantity', v)}
                      keyboardType="decimal-pad"
                      placeholder="0"
                    />
                  </View>
                  <View style={{ flex: 1, marginLeft: Spacing.sm }}>
                    <Input
                      label={`Rate (per ${cutter.unit})`}
                      value={cutter.rate}
                      onChangeText={(v) => updateCutterRow(cutter._key, 'rate', v)}
                      keyboardType="decimal-pad"
                      placeholder="0"
                    />
                  </View>
                </View>

                {parseFloat(cutter.quantity) > 0 && parseFloat(cutter.rate) > 0 && (
                  <Text style={[styles.lotAmount, { color: colors.primary }]}>
                    Cost: {formatCurrency(parseFloat(cutter.quantity) * parseFloat(cutter.rate))}
                  </Text>
                )}

                <TouchableOpacity
                  style={styles.checkRow}
                  onPress={() => updateCutterRow(cutter._key, 'is_paid', !cutter.is_paid)}
                >
                  <View style={[styles.checkbox, cutter.is_paid && { backgroundColor: colors.primary }]}>
                    {cutter.is_paid && <Text style={{ color: '#fff', fontSize: 12 }}>✓</Text>}
                  </View>
                  <Text style={{ color: colors.text, marginLeft: Spacing.sm }}>Paid</Text>
                </TouchableOpacity>
              </View>
            ))}

            <TouchableOpacity style={styles.addRowBtn} onPress={addCutterRow}>
              <Text style={{ color: colors.primary, fontWeight: '600' }}>+ Add Cutter</Text>
            </TouchableOpacity>

            {cutterRows.length > 0 && (
              <View style={[styles.subtotalRow, { borderTopColor: colors.border }]}>
                <Text style={[styles.subtotalLabel, { color: colors.textSecondary }]}>Cutters Total</Text>
                <Text style={[styles.subtotalValue, { color: colors.text }]}>{formatCurrency(cutterCost)}</Text>
              </View>
            )}
          </View>
        )}

        {/* ─── GST Section (Collapsible) ─────────────────────────────────────── */}
        <TouchableOpacity
          style={[styles.sectionToggle, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => setShowGst(!showGst)}
        >
          <Text style={[styles.sectionToggleText, { color: colors.text }]}>
            GST {gstMode !== 'NONE' && `(${gstMode === 'PERCENT' ? `${gstValue}%` : formatCurrency(gstAmount)})`}
          </Text>
          <Text style={{ color: colors.primary }}>{showGst ? '▲' : '▼'}</Text>
        </TouchableOpacity>

        {showGst && (
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, marginTop: -1 }]}>
            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>GST Mode</Text>
            <View style={styles.toggleRow}>
              {GST_MODES.map((mode) => (
                <TouchableOpacity
                  key={mode.value}
                  style={[
                    styles.toggleBtn,
                    { flex: 1 },
                    gstMode === mode.value && { backgroundColor: colors.primary },
                  ]}
                  onPress={() => setGstMode(mode.value as GstMode)}
                >
                  <Text
                    style={{
                      color: gstMode === mode.value ? '#fff' : colors.text,
                      fontSize: FontSize.xs,
                      textAlign: 'center',
                    }}
                  >
                    {mode.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {gstMode !== 'NONE' && (
              <Input
                label={gstMode === 'PERCENT' ? 'GST Percentage' : 'GST Amount'}
                value={gstValue}
                onChangeText={setGstValue}
                keyboardType="decimal-pad"
                placeholder={gstMode === 'PERCENT' ? 'e.g., 18' : '0'}
              />
            )}

            {gstAmount > 0 && (
              <View style={[styles.subtotalRow, { borderTopColor: colors.border }]}>
                <Text style={[styles.subtotalLabel, { color: colors.textSecondary }]}>GST Amount</Text>
                <Text style={[styles.subtotalValue, { color: colors.text }]}>{formatCurrency(gstAmount)}</Text>
              </View>
            )}
          </View>
        )}

        {/* ─── Payments Section ──────────────────────────────────────────────── */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Payments</Text>
            <TouchableOpacity onPress={addPayment}>
              <Text style={{ color: colors.primary, fontWeight: '600' }}>+ Add Payment</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.totalRow, { borderColor: colors.border }]}>
            <Text style={[styles.totalLabel, { color: colors.text }]}>Total Amount</Text>
            <Text style={[styles.totalValue, { color: colors.primary }]}>{formatCurrency(totalAmount)}</Text>
          </View>

          {payments.map((payment, index) => (
            <View key={payment._key} style={[styles.lotCard, { borderColor: colors.borderLight }]}>
              <View style={styles.lotHeader}>
                <Text style={[styles.lotNumber, { color: colors.textSecondary }]}>Payment {index + 1}</Text>
                {payments.length > 1 && (
                  <TouchableOpacity onPress={() => removePayment(payment._key)}>
                    <Text style={{ color: colors.error }}>Remove</Text>
                  </TouchableOpacity>
                )}
              </View>

              <TouchableOpacity
                style={[styles.pickerBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
                onPress={() => setShowPaymentModePicker(payment._key)}
              >
                <Text style={{ color: colors.text }}>
                  {PAYMENT_MODES.find((m) => m.value === payment.payment_mode)?.label || 'Cash'}
                </Text>
              </TouchableOpacity>

              <Input
                label="Amount"
                value={payment.amount}
                onChangeText={(v) => updatePayment(payment._key, 'amount', v)}
                keyboardType="decimal-pad"
                placeholder="0"
              />

              {payment.payment_mode !== 'CASH' && (
                <Input
                  label="Transaction Reference"
                  value={payment.transaction_ref}
                  onChangeText={(v) => updatePayment(payment._key, 'transaction_ref', v)}
                  placeholder="e.g., UTR number"
                />
              )}
            </View>
          ))}

          <View style={styles.balanceSummary}>
            <View style={styles.balanceRow}>
              <Text style={[styles.balanceLabel, { color: colors.textSecondary }]}>Total Paid</Text>
              <Text style={[styles.balanceValue, { color: colors.success }]}>{formatCurrency(totalPaid)}</Text>
            </View>
            <View style={styles.balanceRow}>
              <Text style={[styles.balanceLabel, { color: colors.textSecondary }]}>Balance Due</Text>
              <Text style={[styles.balanceValue, { color: balanceAmount > 0 ? colors.error : colors.success }]}>
                {formatCurrency(balanceAmount)}
              </Text>
            </View>
          </View>
        </View>

        {/* ─── Reminders Section (Collapsible) ───────────────────────────────── */}
        <TouchableOpacity
          style={[styles.sectionToggle, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => setShowReminders(!showReminders)}
        >
          <Text style={[styles.sectionToggleText, { color: colors.text }]}>
            Payment Reminders {reminders.length > 0 && `(${reminders.length})`}
          </Text>
          <Text style={{ color: colors.primary }}>{showReminders ? '▲' : '▼'}</Text>
        </TouchableOpacity>

        {showReminders && (
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, marginTop: -1 }]}>
            {reminders.map((reminder, index) => (
              <View key={reminder._key} style={[styles.lotCard, { borderColor: colors.borderLight }]}>
                <View style={styles.lotHeader}>
                  <Text style={[styles.lotNumber, { color: colors.textSecondary }]}>Reminder {index + 1}</Text>
                  <TouchableOpacity onPress={() => removeReminder(reminder._key)}>
                    <Text style={{ color: colors.error }}>Remove</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={[styles.pickerBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
                  onPress={() => setShowReminderDatePicker(reminder._key)}
                >
                  <Text style={{ color: reminder.remind_on ? colors.text : colors.textTertiary }}>
                    {reminder.remind_on
                      ? new Date(reminder.remind_on).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })
                      : 'Select Reminder Date...'}
                  </Text>
                </TouchableOpacity>
                {showReminderDatePicker === reminder._key && (
                  <DateTimePicker
                    value={reminder.remind_on ? new Date(reminder.remind_on) : new Date()}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    minimumDate={new Date()}
                    onChange={(event, date) => {
                      setShowReminderDatePicker(null);
                      if (date) {
                        updateReminder(reminder._key, 'remind_on', date.toISOString().split('T')[0]);
                      }
                    }}
                  />
                )}

                <Input
                  label="Amount (0 = Full Balance)"
                  value={reminder.amount}
                  onChangeText={(v) => updateReminder(reminder._key, 'amount', v)}
                  keyboardType="decimal-pad"
                  placeholder="0"
                />

                <Input
                  label="Note"
                  value={reminder.note}
                  onChangeText={(v) => updateReminder(reminder._key, 'note', v)}
                  placeholder="Optional note"
                />
              </View>
            ))}

            <TouchableOpacity style={styles.addRowBtn} onPress={addReminder}>
              <Text style={{ color: colors.primary, fontWeight: '600' }}>+ Add Reminder</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ─── Notes ─────────────────────────────────────────────────────────── */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Notes (Optional)</Text>
          <TextInput
            style={[styles.notesInput, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface }]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Any additional notes..."
            placeholderTextColor={colors.textTertiary}
            multiline
            numberOfLines={3}
          />
        </View>

        {/* ─── Attachments ───────────────────────────────────────────────────── */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Attachments (Optional)</Text>
          <Text style={[styles.sectionHint, { color: colors.textTertiary }]}>
            Add bills, receipts, or other documents
          </Text>
          <AttachmentUpload
            attachments={attachments}
            onAttachmentsChange={setAttachments}
            maxAttachments={5}
            allowedTypes={['image', 'pdf', 'document']}
          />
        </View>

        {/* ─── Actions ───────────────────────────────────────────────────────── */}
        <View style={styles.actions}>
          <Button
            title={isEdit ? 'Update Purchase' : 'Create Purchase'}
            onPress={handleSubmit}
            loading={submitting}
            fullWidth
            size="lg"
          />
          {isEdit && (
            <TouchableOpacity style={[styles.deleteBtn, { borderColor: colors.error }]} onPress={handleDelete}>
              <Text style={{ color: colors.error, fontWeight: '600' }}>Delete Purchase</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {/* ─── Party Picker Modal ──────────────────────────────────────────────── */}
      <Modal visible={showPartyPicker} animationType="slide" transparent>
        <View style={[styles.modal, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Select Supplier</Text>
              <TouchableOpacity onPress={() => setShowPartyPicker(false)}>
                <Text style={{ color: colors.primary }}>Close</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={[styles.searchInput, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface }]}
              placeholder="Search parties..."
              placeholderTextColor={colors.textTertiary}
              value={partySearch}
              onChangeText={setPartySearch}
            />
            <FlatList
              data={filteredParties}
              keyExtractor={(item) => item.id}
              style={styles.modalList}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.modalItem, { borderBottomColor: colors.borderLight }]}
                  onPress={() => {
                    setPartyId(item.id);
                    setPartyName(item.name);
                    setShowPartyPicker(false);
                    setPartySearch('');
                  }}
                >
                  <Text style={[styles.modalItemText, { color: colors.text }]}>{item.name}</Text>
                  <Text style={[styles.modalItemSub, { color: colors.textTertiary }]}>{item.phone}</Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={[styles.emptyText, { color: colors.textTertiary }]}>No suppliers found</Text>
              }
            />

            {/* ─── Inline Add New Party Form ────────────────────────────────────── */}
            {showAddPartyForm ? (
              <View style={[styles.addNewForm, { borderColor: colors.border }]}>
                <Text style={[styles.addNewTitle, { color: colors.text }]}>Add New Supplier</Text>

                <Input
                  label="Name"
                  value={newPartyName}
                  onChangeText={setNewPartyName}
                  placeholder="Supplier name"
                  autoFocus
                />

                <Input
                  label="Phone (Optional)"
                  value={newPartyPhone}
                  onChangeText={setNewPartyPhone}
                  placeholder="Contact number"
                />

                <View style={styles.addNewActions}>
                  <Button
                    title="Save"
                    onPress={async () => {
                      if (!newPartyName) {
                        toast.error('Name is required');
                        return;
                      }
                      try {
                        setAddingParty(true);
                        const res = await profileApi.createParty({
                          name: newPartyName,
                          phone: newPartyPhone || undefined,
                          type: 'SUPPLIER',
                        });
                        const newParty = res.data?.data;
                        if (newParty) {
                          setParties((prev) => [...prev, newParty]);
                          setPartyId(newParty.id);
                          setPartyName(newParty.name);
                          toast.success('Supplier added');
                        }
                      } catch (err) {
                        toast.error('Failed to add supplier');
                      } finally {
                        setAddingParty(false);
                        setShowAddPartyForm(false);
                        setNewPartyName('');
                        setNewPartyPhone('');
                      }
                    }}
                    loading={addingParty}
                    size="sm"
                  />
                  <TouchableOpacity
                    style={styles.cancelAddBtn}
                    onPress={() => {
                      setShowAddPartyForm(false);
                      setNewPartyName('');
                      setNewPartyPhone('');
                    }}
                  >
                    <Text style={{ color: colors.primary }}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.addNewButton}
                onPress={() => setShowAddPartyForm(true)}
              >
                <Text style={{ color: colors.primary, fontWeight: '600' }}>+ Add New Supplier</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      {/* ─── Item Picker Modal ───────────────────────────────────────────────── */}
      <Modal visible={showItemPicker !== null} animationType="slide" transparent>
        <View style={[styles.modal, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Select Item</Text>
              <TouchableOpacity onPress={() => setShowItemPicker(null)}>
                <Text style={{ color: colors.primary }}>Close</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={[styles.searchInput, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface }]}
              placeholder="Search items..."
              placeholderTextColor={colors.textTertiary}
              value={itemSearch}
              onChangeText={setItemSearch}
            />
            <FlatList
              data={filteredItems}
              keyExtractor={(item) => item.id}
              style={styles.modalList}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.modalItem, { borderBottomColor: colors.borderLight }]}
                  onPress={() => {
                    if (showItemPicker) selectItem(showItemPicker, item);
                    setItemSearch('');
                  }}
                >
                  <Text style={[styles.modalItemText, { color: colors.text }]}>{item.name}</Text>
                  <Text style={[styles.modalItemSub, { color: colors.textTertiary }]}>
                    Stock: {item.current_stock} {item.unit}
                  </Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={[styles.emptyText, { color: colors.textTertiary }]}>No items found</Text>
              }
            />

            {/* ─── Inline Add New Item Form ──────────────────────────────────────── */}
            {showAddItemForm ? (
              <View style={[styles.addNewForm, { borderColor: colors.border }]}>
                <Text style={[styles.addNewTitle, { color: colors.text }]}>Add New Item</Text>

                <Input
                  label="Name"
                  value={newItemName}
                  onChangeText={setNewItemName}
                  placeholder="Item name"
                  autoFocus
                />

                <View style={styles.lotRow}>
                  <View style={{ flex: 1, marginRight: Spacing.sm }}>
                    <Input
                      label="Quantity"
                      value={lots[0]?.quantity}
                      onChangeText={(v) => updateLot(lots[0]?._key, 'quantity', v)}
                      keyboardType="decimal-pad"
                      placeholder="0"
                    />
                  </View>
                  <View style={{ flex: 1, marginLeft: Spacing.sm }}>
                    <Input
                      label={`Rate (per ${lots[0]?.unit})`}
                      value={lots[0]?.rate}
                      onChangeText={(v) => updateLot(lots[0]?._key, 'rate', v)}
                      keyboardType="decimal-pad"
                      placeholder="0"
                    />
                  </View>
                </View>

                <View style={styles.addNewActions}>
                  <Button
                    title="Save"
                    onPress={async () => {
                      if (!newItemName) {
                        toast.error('Name is required');
                        return;
                      }
                      try {
                        setAddingItem(true);
                        const res = await inventoryApi.createItem({
                          name: newItemName,
                          unit: newItemUnit,
                          rate: parseFloat(lots[0]?.rate) || 0,
                          stock: parseFloat(lots[0]?.quantity) || 0,
                        });
                        const newItem = res.data?.data;
                        if (newItem) {
                          setItems((prev) => [...prev, newItem]);
                          selectItem(lots[0]?._key, newItem);
                          toast.success('Item added');
                        }
                      } catch (err) {
                        toast.error('Failed to add item');
                      } finally {
                        setAddingItem(false);
                        setShowAddItemForm(false);
                        setNewItemName('');
                        setNewItemUnit('KG');
                      }
                    }}
                    loading={addingItem}
                    size="sm"
                  />
                  <TouchableOpacity
                    style={styles.cancelAddBtn}
                    onPress={() => {
                      setShowAddItemForm(false);
                      setNewItemName('');
                      setNewItemUnit('KG');
                    }}
                  >
                    <Text style={{ color: colors.primary }}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.addNewButton}
                onPress={() => setShowAddItemForm(true)}
              >
                <Text style={{ color: colors.primary, fontWeight: '600' }}>+ Add New Item</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      {/* ─── Expense Type Picker Modal ───────────────────────────────────────── */}
      <Modal visible={showExpenseTypePicker !== null} animationType="slide" transparent>
        <View style={[styles.modal, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Select Expense Type</Text>
              <TouchableOpacity onPress={() => setShowExpenseTypePicker(null)}>
                <Text style={{ color: colors.primary }}>Close</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={expenseTypes}
              keyExtractor={(item) => item.id}
              style={styles.modalList}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.modalItem, { borderBottomColor: colors.borderLight }]}
                  onPress={() => {
                    if (showExpenseTypePicker) selectExpenseType(showExpenseTypePicker, item);
                  }}
                >
                  <Text style={[styles.modalItemText, { color: colors.text }]}>{item.name}</Text>
                  <Text style={[styles.modalItemSub, { color: colors.textTertiary }]}>{item.category}</Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={[styles.emptyText, { color: colors.textTertiary }]}>No expense types found</Text>
              }
            />

            {/* ─── Inline Add New Expense Type Form ───────────────────────────────── */}
            {showAddExpenseTypeForm ? (
              <View style={[styles.addNewForm, { borderColor: colors.border }]}>
                <Text style={[styles.addNewTitle, { color: colors.text }]}>Add New Expense Type</Text>

                <Input
                  label="Name"
                  value={newExpenseTypeName}
                  onChangeText={setNewExpenseTypeName}
                  placeholder="Expense type name"
                  autoFocus
                />

                <View style={styles.toggleRow}>
                  <TouchableOpacity
                    style={[
                      styles.toggleBtn,
                      newExpenseTypeCategory === 'DIRECT' && { backgroundColor: colors.primary },
                    ]}
                    onPress={() => setNewExpenseTypeCategory('DIRECT')}
                  >
                    <Text
                      style={{
                        color: newExpenseTypeCategory === 'DIRECT' ? '#fff' : colors.text,
                        fontSize: FontSize.xs,
                        textAlign: 'center',
                      }}
                    >
                      Direct
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.toggleBtn,
                      newExpenseTypeCategory === 'INDIRECT' && { backgroundColor: colors.primary },
                    ]}
                    onPress={() => setNewExpenseTypeCategory('INDIRECT')}
                  >
                    <Text
                      style={{
                        color: newExpenseTypeCategory === 'INDIRECT' ? '#fff' : colors.text,
                        fontSize: FontSize.xs,
                        textAlign: 'center',
                      }}
                    >
                      Indirect
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.addNewActions}>
                  <Button
                    title="Save"
                    onPress={async () => {
                      if (!newExpenseTypeName) {
                        toast.error('Name is required');
                        return;
                      }
                      try {
                        setAddingExpenseType(true);
                        const res = await profileApi.createExpenseType({
                          name: newExpenseTypeName,
                          category: newExpenseTypeCategory,
                        });
                        const newExpenseType = res.data?.data;
                        if (newExpenseType) {
                          setExpenseTypes((prev) => [...prev, newExpenseType]);
                          toast.success('Expense type added');
                        }
                      } catch (err) {
                        toast.error('Failed to add expense type');
                      } finally {
                        setAddingExpenseType(false);
                        setShowAddExpenseTypeForm(false);
                        setNewExpenseTypeName('');
                        setNewExpenseTypeCategory('DIRECT');
                      }
                    }}
                    loading={addingExpenseType}
                    size="sm"
                  />
                  <TouchableOpacity
                    style={styles.cancelAddBtn}
                    onPress={() => {
                      setShowAddExpenseTypeForm(false);
                      setNewExpenseTypeName('');
                      setNewExpenseTypeCategory('DIRECT');
                    }}
                  >
                    <Text style={{ color: colors.primary }}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.addNewButton}
                onPress={() => setShowAddExpenseTypeForm(true)}
              >
                <Text style={{ color: colors.primary, fontWeight: '600' }}>+ Add New Expense Type</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      {/* ─── Cutter Picker Modal ─────────────────────────────────────────────── */}
      <Modal visible={showCutterPicker !== null} animationType="slide" transparent>
        <View style={[styles.modal, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Select Cutter</Text>
              <TouchableOpacity onPress={() => setShowCutterPicker(null)}>
                <Text style={{ color: colors.primary }}>Close</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={cutters}
              keyExtractor={(item) => item.id}
              style={styles.modalList}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.modalItem, { borderBottomColor: colors.borderLight }]}
                  onPress={() => {
                    if (showCutterPicker) selectCutter(showCutterPicker, item);
                  }}
                >
                  <Text style={[styles.modalItemText, { color: colors.text }]}>{item.name}</Text>
                  <Text style={[styles.modalItemSub, { color: colors.textTertiary }]}>
                    Rate: {formatCurrency(item.rate_per_unit || 0)} / {item.unit || 'KG'}
                  </Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={[styles.emptyText, { color: colors.textTertiary }]}>No cutters found</Text>
              }
            />

            {/* ─── Inline Add New Cutter Form ─────────────────────────────────────── */}
            {showAddCutterForm ? (
              <View style={[styles.addNewForm, { borderColor: colors.border }]}>
                <Text style={[styles.addNewTitle, { color: colors.text }]}>Add New Cutter</Text>

                <Input
                  label="Name"
                  value={newCutterName}
                  onChangeText={setNewCutterName}
                  placeholder="Cutter name"
                  autoFocus
                />

                <Input
                  label="Phone (Optional)"
                  value={newCutterPhone}
                  onChangeText={setNewCutterPhone}
                  placeholder="Contact number"
                />

                <View style={styles.lotRow}>
                  <View style={{ flex: 1, marginRight: Spacing.sm }}>
                    <Input
                      label="Rate"
                      value={newCutterRate}
                      onChangeText={setNewCutterRate}
                      keyboardType="decimal-pad"
                      placeholder="0"
                    />
                  </View>
                  <View style={{ flex: 1, marginLeft: Spacing.sm }}>
                    <Input
                      label="Unit"
                      value={newCutterRate}
                      onChangeText={setNewCutterRate}
                      placeholder="e.g., KG"
                    />
                  </View>
                </View>

                <View style={styles.addNewActions}>
                  <Button
                    title="Save"
                    onPress={async () => {
                      if (!newCutterName) {
                        toast.error('Name is required');
                        return;
                      }
                      try {
                        setAddingCutter(true);
                        const res = await profileApi.createCutter({
                          name: newCutterName,
                          phone: newCutterPhone || undefined,
                          rate_per_unit: parseFloat(newCutterRate) || 0,
                          unit: newCutterRate || 'KG',
                        });
                        const newCutter = res.data?.data;
                        if (newCutter) {
                          setCutters((prev) => [...prev, newCutter]);
                          toast.success('Cutter added');
                        }
                      } catch (err) {
                        toast.error('Failed to add cutter');
                      } finally {
                        setAddingCutter(false);
                        setShowAddCutterForm(false);
                        setNewCutterName('');
                        setNewCutterPhone('');
                        setNewCutterRate('');
                      }
                    }}
                    loading={addingCutter}
                    size="sm"
                  />
                  <TouchableOpacity
                    style={styles.cancelAddBtn}
                    onPress={() => {
                      setShowAddCutterForm(false);
                      setNewCutterName('');
                      setNewCutterPhone('');
                      setNewCutterRate('');
                    }}
                  >
                    <Text style={{ color: colors.primary }}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.addNewButton}
                onPress={() => setShowAddCutterForm(true)}
              >
                <Text style={{ color: colors.primary, fontWeight: '600' }}>+ Add New Cutter</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      {/* ─── Payment Mode Picker Modal ───────────────────────────────────────── */}
      <Modal visible={showPaymentModePicker !== null} animationType="slide" transparent>
        <View style={[styles.modal, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Select Payment Mode</Text>
              <TouchableOpacity onPress={() => setShowPaymentModePicker(null)}>
                <Text style={{ color: colors.primary }}>Close</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={PAYMENT_MODES}
              keyExtractor={(item) => item.value}
              style={styles.modalList}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.modalItem, { borderBottomColor: colors.borderLight }]}
                  onPress={() => {
                    if (showPaymentModePicker) selectPaymentMode(showPaymentModePicker, item.value as PaymentRow['payment_mode']);
                  }}
                >
                  <Text style={[styles.modalItemText, { color: colors.text }]}>{item.label}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.lg },
  section: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  sectionTitle: { fontSize: FontSize.md, fontWeight: '700', marginBottom: Spacing.md },
  sectionHint: { fontSize: FontSize.xs, marginBottom: Spacing.md },
  sectionToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  sectionToggleText: { fontSize: FontSize.md, fontWeight: '600' },
  pickerBtn: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  lotCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  lotHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  lotNumber: { fontSize: FontSize.sm, fontWeight: '600' },
  lotRow: { flexDirection: 'row' },
  lotAmount: { fontSize: FontSize.sm, fontWeight: '600', marginTop: Spacing.xs, textAlign: 'right' },
  subtotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    marginTop: Spacing.sm,
  },
  subtotalLabel: { fontSize: FontSize.sm },
  subtotalValue: { fontSize: FontSize.md, fontWeight: '600' },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    marginBottom: Spacing.md,
  },
  totalLabel: { fontSize: FontSize.md, fontWeight: '600' },
  totalValue: { fontSize: FontSize.xl, fontWeight: '700' },
  balanceSummary: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  balanceLabel: { fontSize: FontSize.sm },
  balanceValue: { fontSize: FontSize.md, fontWeight: '600' },
  inputLabel: { fontSize: FontSize.xs, fontWeight: '500', marginBottom: Spacing.xs },
  toggleRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  toggleBtn: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addRowBtn: {
    padding: Spacing.md,
    alignItems: 'center',
  },
  notesInput: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: FontSize.sm,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  actions: { marginTop: Spacing.md },
  deleteBtn: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  modal: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    maxHeight: '80%',
    padding: Spacing.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  modalTitle: { fontSize: FontSize.lg, fontWeight: '700' },
  modalList: { maxHeight: 400 },
  modalItem: {
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  modalItemText: { fontSize: FontSize.md, fontWeight: '500' },
  modalItemSub: { fontSize: FontSize.xs, marginTop: 2 },
  emptyText: { textAlign: 'center', padding: Spacing.xl },
  searchInput: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: FontSize.sm,
    marginBottom: Spacing.md,
  },
  addNewForm: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.md,
  },
  addNewTitle: {
    fontSize: FontSize.md,
    fontWeight: '600',
    marginBottom: Spacing.md,
  },
  addNewButton: {
    padding: Spacing.md,
    alignItems: 'center',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#ccc',
    marginTop: Spacing.md,
  },
  addNewActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  cancelAddBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
});