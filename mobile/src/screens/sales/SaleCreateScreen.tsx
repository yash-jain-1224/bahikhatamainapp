import React, { useState, useEffect, useCallback } from 'react';
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
import { FontSize, Spacing, BorderRadius } from '../../theme/colors';
import { Button, Input, LoadingScreen, AttachmentUpload } from '../../components/shared';
import type { Attachment } from '../../components/shared';
import { useToast } from '../../components/shared/Toast';
import { salesApi, profileApi, inventoryApi } from '../../services/api';
import { formatCurrency } from '../../utils';
import type { Party, InventoryItem } from '../../types';

// ─── Types ───────────────────────────────────────────────────────────────────

interface LotWithItem {
  id: string;
  lot_number: string;
  item_id: string;
  item_name: string;
  available_qty: number;
  purchase_rate: number;
  unit: string;
  item?: InventoryItem;
}

interface LineItem {
  _key: string;
  lot_id: string;
  lot_number: string;
  item_name: string;
  quantity: string;
  rate: string;
  unit: string;
  available_qty: number;
}

interface PaymentRow {
  _key: string;
  payment_mode: 'CASH' | 'BANK' | 'UPI' | 'CHEQUE' | 'OTHER';
  amount: string;
  transaction_ref: string;
  notes: string;
}

type GstMode = 'NONE' | 'PERCENT' | 'AMOUNT';

// ─── Helpers ─────────────────────────────────────────────────────────────────

let _keyCounter = 0;
const uid = () => `_k${++_keyCounter}`;

const blankLineItem = (): LineItem => ({
  _key: uid(),
  lot_id: '',
  lot_number: '',
  item_name: '',
  quantity: '',
  rate: '',
  unit: 'KG',
  available_qty: 0,
});

const blankPayment = (): PaymentRow => ({
  _key: uid(),
  payment_mode: 'CASH',
  amount: '',
  transaction_ref: '',
  notes: '',
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

export default function SaleCreateScreen() {
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
  const [lots, setLots] = useState<LotWithItem[]>([]);

  // Modals
  const [showPartyPicker, setShowPartyPicker] = useState(false);
  const [showLotPicker, setShowLotPicker] = useState<string | null>(null);
  const [showPaymentModePicker, setShowPaymentModePicker] = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Form state
  const [partyId, setPartyId] = useState('');
  const [partyName, setPartyName] = useState('');
  const [saleDate, setSaleDate] = useState(new Date());
  const [notes, setNotes] = useState('');

  // GST
  const [gstMode, setGstMode] = useState<GstMode>('NONE');
  const [gstValue, setGstValue] = useState('');

  // Sections
  const [lineItems, setLineItems] = useState<LineItem[]>([blankLineItem()]);
  const [payments, setPayments] = useState<PaymentRow[]>([blankPayment()]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  // Collapsible sections
  const [showGst, setShowGst] = useState(false);

  // Search filters
  const [partySearch, setPartySearch] = useState('');
  const [lotSearch, setLotSearch] = useState('');

  // Inline "Add New" form states
  const [showAddPartyForm, setShowAddPartyForm] = useState(false);
  const [newPartyName, setNewPartyName] = useState('');
  const [newPartyPhone, setNewPartyPhone] = useState('');
  const [addingParty, setAddingParty] = useState(false);

  // Load master data
  useEffect(() => {
    const loadData = async () => {
      try {
        const [partiesRes, lotsRes] = await Promise.all([
          profileApi.parties({ type: 'CUSTOMER,BOTH', limit: 200 }),
          inventoryApi.listItems({ limit: 500, with_lots: true }),
        ]);
        setParties(partiesRes.data?.data || []);
        // Extract lots from items
        const allLots: LotWithItem[] = [];
        (lotsRes.data?.data || []).forEach((item: InventoryItem & { lots?: any[] }) => {
          if (item.lots?.length) {
            item.lots.forEach((lot: any) => {
              allLots.push({
                ...lot,
                item_name: item.name,
                unit: item.unit || 'KG',
              });
            });
          }
        });
        setLots(allLots);
      } catch (err) {
        console.error('Failed to load master data:', err);
      }
    };
    loadData();
  }, []);

  // Load existing sale for edit
  useEffect(() => {
    if (!editId) return;
    const loadSale = async () => {
      try {
        setLoading(true);
        const res = await salesApi.get(editId);
        const s = res.data?.data;
        if (s) {
          setPartyId(s.party?.id || '');
          setPartyName(s.party?.name || '');
          setSaleDate(s.sale_date ? new Date(s.sale_date) : new Date());
          setNotes(s.notes || '');
          setGstMode(s.gst_mode || 'NONE');
          setGstValue(String(s.gst_value || ''));

          if (s.items?.length) {
            setLineItems(
              s.items.map((item: any) => ({
                _key: uid(),
                lot_id: item.lot_id || '',
                lot_number: item.lot?.lot_number || '',
                item_name: item.lot?.item?.name || '',
                quantity: String(item.quantity || ''),
                rate: String(item.rate || ''),
                unit: item.unit || 'KG',
                available_qty: 0,
              }))
            );
          }

          if (s.payments?.length) {
            setPayments(
              s.payments.map((pay: any) => ({
                _key: uid(),
                payment_mode: pay.payment_mode || 'CASH',
                amount: String(pay.amount || ''),
                transaction_ref: pay.transaction_ref || '',
                notes: pay.notes || '',
              }))
            );
          }

          if (s.attachments?.length) {
            setAttachments(
              s.attachments.map((a: any) => ({
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
        toast.error('Failed to load sale');
        navigation.goBack();
      } finally {
        setLoading(false);
      }
    };
    loadSale();
  }, [editId]);

  // ─── Line item helpers ───────────────────────────────────────────────────────

  const updateLineItem = (key: string, field: keyof LineItem, value: string | number) => {
    setLineItems((prev) =>
      prev.map((l) => (l._key === key ? { ...l, [field]: value } : l))
    );
  };

  const addLineItem = () => setLineItems((prev) => [...prev, blankLineItem()]);

  const removeLineItem = (key: string) => {
    if (lineItems.length <= 1) {
      toast.error('At least one item is required');
      return;
    }
    setLineItems((prev) => prev.filter((l) => l._key !== key));
  };

  const selectLot = (lineKey: string, lot: LotWithItem) => {
    setLineItems((prev) =>
      prev.map((l) =>
        l._key === lineKey
          ? {
              ...l,
              lot_id: lot.id,
              lot_number: lot.lot_number || '',
              item_name: lot.item_name || lot.item?.name || '',
              unit: lot.unit || lot.item?.unit || 'KG',
              rate: String(lot.purchase_rate || ''),
              available_qty: lot.available_qty || 0,
            }
          : l
      )
    );
    setShowLotPicker(null);
    setLotSearch('');
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

  // ─── Calculations ────────────────────────────────────────────────────────────

  const itemsSubtotal = lineItems.reduce((sum, l) => {
    const qty = parseFloat(l.quantity) || 0;
    const rate = parseFloat(l.rate) || 0;
    return sum + qty * rate;
  }, 0);

  const gstAmount = (() => {
    if (gstMode === 'NONE' || !gstValue) return 0;
    if (gstMode === 'AMOUNT') return parseFloat(gstValue) || 0;
    return Math.round(itemsSubtotal * (parseFloat(gstValue) || 0) / 100 * 100) / 100;
  })();

  const totalAmount = itemsSubtotal + gstAmount;

  const totalPaid = payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);

  const balanceAmount = totalAmount - totalPaid;

  // ─── Filtered lists ──────────────────────────────────────────────────────────

  const filteredParties = parties.filter(
    (p) =>
      p.name?.toLowerCase().includes(partySearch.toLowerCase()) ||
      p.phone?.includes(partySearch)
  );

  const filteredLots = lots.filter(
    (l) =>
      l.lot_number?.toLowerCase().includes(lotSearch.toLowerCase()) ||
      l.item_name?.toLowerCase().includes(lotSearch.toLowerCase()) ||
      l.item?.name?.toLowerCase().includes(lotSearch.toLowerCase())
  );

  // ─── Submit ──────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!partyId) {
      toast.error('Please select a customer');
      return;
    }

    const validItems = lineItems.filter((l) => l.lot_id && parseFloat(l.quantity) > 0 && parseFloat(l.rate) > 0);
    if (validItems.length === 0) {
      toast.error('Please add at least one item with quantity and rate');
      return;
    }

    const validPayments = payments.filter((p) => parseFloat(p.amount) > 0);

    const payload = {
      partyId,
      saleDate: saleDate.toISOString(),
      notes: notes || undefined,
      gstMode: gstMode !== 'NONE' ? gstMode : undefined,
      gstValue: gstMode !== 'NONE' ? parseFloat(gstValue) || 0 : undefined,
      gstAmount: gstMode !== 'NONE' ? gstAmount : undefined,
      items: validItems.map((l) => ({
        lotId: l.lot_id,
        quantity: parseFloat(l.quantity),
        rate: parseFloat(l.rate),
        unit: l.unit,
      })),
      payments: validPayments.map((p) => ({
        paymentMode: p.payment_mode,
        amount: parseFloat(p.amount),
        transactionRef: p.transaction_ref || undefined,
        notes: p.notes || undefined,
      })),
    };

    try {
      setSubmitting(true);
      if (isEdit) {
        await salesApi.update(editId, payload);
        toast.success('Sale updated');
      } else {
        await salesApi.create(payload);
        toast.success('Sale created');
      }
      navigation.goBack();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to save sale');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = () => {
    Alert.alert('Delete Sale', 'Are you sure you want to delete this sale?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await salesApi.delete(editId);
            toast.success('Sale deleted');
            navigation.goBack();
          } catch (err) {
            toast.error('Failed to delete sale');
          }
        },
      },
    ]);
  };

  if (loading) return <LoadingScreen />;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* ─── Party Details ─────────────────────────────────────────────────── */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Customer Details</Text>

          <TouchableOpacity
            style={[styles.pickerBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
            onPress={() => setShowPartyPicker(true)}
          >
            <Text style={{ color: partyName ? colors.text : colors.textTertiary }}>
              {partyName || 'Select Customer...'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.pickerBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
            onPress={() => setShowDatePicker(true)}
          >
            <Text style={{ color: colors.text }}>
              {saleDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
            </Text>
          </TouchableOpacity>

          {showDatePicker && (
            <DateTimePicker
              value={saleDate}
              mode="date"
              display="default"
              onChange={(e, date) => {
                setShowDatePicker(false);
                if (date) setSaleDate(date);
              }}
            />
          )}
        </View>

        {/* ─── Items / Lots ──────────────────────────────────────────────────── */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Items</Text>
            <TouchableOpacity onPress={addLineItem}>
              <Text style={{ color: colors.primary, fontWeight: '600' }}>+ Add Item</Text>
            </TouchableOpacity>
          </View>

          {lineItems.map((item, index) => (
            <View key={item._key} style={[styles.lotCard, { borderColor: colors.borderLight }]}>
              <View style={styles.lotHeader}>
                <Text style={[styles.lotNumber, { color: colors.textSecondary }]}>Item {index + 1}</Text>
                {lineItems.length > 1 && (
                  <TouchableOpacity onPress={() => removeLineItem(item._key)}>
                    <Text style={{ color: colors.error }}>Remove</Text>
                  </TouchableOpacity>
                )}
              </View>

              <TouchableOpacity
                style={[styles.pickerBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
                onPress={() => setShowLotPicker(item._key)}
              >
                <Text style={{ color: item.item_name ? colors.text : colors.textTertiary }}>
                  {item.item_name ? `${item.item_name} - ${item.lot_number}` : 'Select Lot...'}
                </Text>
              </TouchableOpacity>

              {item.available_qty > 0 && (
                <Text style={[styles.availableText, { color: colors.textSecondary }]}>
                  Available: {item.available_qty} {item.unit}
                </Text>
              )}

              <View style={styles.lotRow}>
                <View style={{ flex: 1, marginRight: Spacing.sm }}>
                  <Input
                    label="Quantity"
                    value={item.quantity}
                    onChangeText={(v) => updateLineItem(item._key, 'quantity', v)}
                    keyboardType="decimal-pad"
                    placeholder="0"
                  />
                </View>
                <View style={{ flex: 1, marginLeft: Spacing.sm }}>
                  <Input
                    label={`Rate (per ${item.unit})`}
                    value={item.rate}
                    onChangeText={(v) => updateLineItem(item._key, 'rate', v)}
                    keyboardType="decimal-pad"
                    placeholder="0"
                  />
                </View>
              </View>

              {parseFloat(item.quantity) > 0 && parseFloat(item.rate) > 0 && (
                <Text style={[styles.lotAmount, { color: colors.primary }]}>
                  Amount: {formatCurrency(parseFloat(item.quantity) * parseFloat(item.rate))}
                </Text>
              )}
            </View>
          ))}

          <View style={[styles.subtotalRow, { borderTopColor: colors.border }]}>
            <Text style={[styles.subtotalLabel, { color: colors.textSecondary }]}>Items Subtotal</Text>
            <Text style={[styles.subtotalValue, { color: colors.text }]}>{formatCurrency(itemsSubtotal)}</Text>
          </View>
        </View>

        {/* ─── GST Section ───────────────────────────────────────────────────── */}
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
          </View>
        )}

        {/* ─── Payments ──────────────────────────────────────────────────────── */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Payments</Text>
            <TouchableOpacity onPress={addPayment}>
              <Text style={{ color: colors.primary, fontWeight: '600' }}>+ Add Payment</Text>
            </TouchableOpacity>
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

              <Input
                label="Reference (Optional)"
                value={payment.transaction_ref}
                onChangeText={(v) => updatePayment(payment._key, 'transaction_ref', v)}
                placeholder="Transaction ID / Cheque No."
              />
            </View>
          ))}
        </View>

        {/* ─── Total Summary ─────────────────────────────────────────────────── */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.totalRow, { borderBottomColor: colors.border }]}>
            <Text style={[styles.totalLabel, { color: colors.text }]}>Total Amount</Text>
            <Text style={[styles.totalValue, { color: colors.primary }]}>{formatCurrency(totalAmount)}</Text>
          </View>

          <View style={styles.balanceSummary}>
            <View style={styles.balanceRow}>
              <Text style={[styles.balanceLabel, { color: colors.textSecondary }]}>Amount Paid</Text>
              <Text style={[styles.balanceValue, { color: colors.success }]}>{formatCurrency(totalPaid)}</Text>
            </View>
            <View style={styles.balanceRow}>
              <Text style={[styles.balanceLabel, { color: colors.textSecondary }]}>Balance</Text>
              <Text style={[styles.balanceValue, { color: balanceAmount > 0 ? colors.warning : colors.success }]}>
                {formatCurrency(balanceAmount)}
              </Text>
            </View>
          </View>
        </View>

        {/* ─── Attachments ───────────────────────────────────────────────────── */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Attachments</Text>
          <AttachmentUpload
            attachments={attachments}
            onAttachmentsChange={setAttachments}
          />
        </View>

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

        {/* ─── Actions ───────────────────────────────────────────────────────── */}
        <View style={styles.actions}>
          <Button
            title={isEdit ? 'Update Sale' : 'Create Sale'}
            onPress={handleSubmit}
            loading={submitting}
            fullWidth
            size="lg"
          />
          {isEdit && (
            <TouchableOpacity style={[styles.deleteBtn, { borderColor: colors.error }]} onPress={handleDelete}>
              <Text style={{ color: colors.error, fontWeight: '600' }}>Delete Sale</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {/* ─── Party Picker Modal ──────────────────────────────────────────────── */}
      <Modal visible={showPartyPicker} animationType="slide" transparent>
        <View style={[styles.modal, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Select Customer</Text>
              <TouchableOpacity onPress={() => setShowPartyPicker(false)}>
                <Text style={{ color: colors.primary }}>Close</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={[styles.searchInput, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface }]}
              placeholder="Search customers..."
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
                <Text style={[styles.emptyText, { color: colors.textTertiary }]}>No customers found</Text>
              }
            />

            {/* ─── Inline Add New Customer Form ─────────────────────────────────── */}
            {showAddPartyForm ? (
              <View style={[styles.addNewForm, { borderColor: colors.border }]}>
                <Text style={[styles.addNewTitle, { color: colors.text }]}>Add New Customer</Text>

                <Input
                  label="Name"
                  value={newPartyName}
                  onChangeText={setNewPartyName}
                  placeholder="Customer name"
                  autoFocus
                />

                <Input
                  label="Phone (Optional)"
                  value={newPartyPhone}
                  onChangeText={setNewPartyPhone}
                  placeholder="Contact number"
                  keyboardType="phone-pad"
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
                          type: 'CUSTOMER',
                        });
                        const newParty = res.data?.data;
                        if (newParty) {
                          setParties((prev) => [...prev, newParty]);
                          setPartyId(newParty.id);
                          setPartyName(newParty.name);
                          toast.success('Customer added');
                        }
                      } catch (err) {
                        toast.error('Failed to add customer');
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
                <Text style={{ color: colors.primary, fontWeight: '600' }}>+ Add New Customer</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      {/* ─── Lot Picker Modal ────────────────────────────────────────────────── */}
      <Modal visible={showLotPicker !== null} animationType="slide" transparent>
        <View style={[styles.modal, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Select Lot</Text>
              <TouchableOpacity onPress={() => setShowLotPicker(null)}>
                <Text style={{ color: colors.primary }}>Close</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={[styles.searchInput, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface }]}
              placeholder="Search lots..."
              placeholderTextColor={colors.textTertiary}
              value={lotSearch}
              onChangeText={setLotSearch}
            />
            <FlatList
              data={filteredLots}
              keyExtractor={(item) => item.id}
              style={styles.modalList}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.modalItem, { borderBottomColor: colors.borderLight }]}
                  onPress={() => {
                    if (showLotPicker) selectLot(showLotPicker, item);
                  }}
                >
                  <Text style={[styles.modalItemText, { color: colors.text }]}>
                    {item.item_name || item.item?.name} - {item.lot_number}
                  </Text>
                  <Text style={[styles.modalItemSub, { color: colors.textTertiary }]}>
                    Available: {item.available_qty} {item.unit || item.item?.unit}
                  </Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={[styles.emptyText, { color: colors.textTertiary }]}>No lots found</Text>
              }
            />
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
  availableText: { fontSize: FontSize.xs, marginBottom: Spacing.sm },
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
  notesInput: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: FontSize.sm,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  actions: { marginTop: Spacing.md, marginBottom: Spacing.xl },
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
  modalList: { maxHeight: 300 },
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
