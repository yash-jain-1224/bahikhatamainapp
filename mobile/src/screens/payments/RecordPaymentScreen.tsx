import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme';
import { FontSize, Spacing, BorderRadius, Shadow } from '../../theme/colors';
import { Input, Button, SearchBar, LoadingScreen } from '../../components/shared';
import AttachmentUpload, { Attachment } from '../../components/shared/AttachmentUpload';
import { useToast } from '../../components/shared/Toast';
import { billingApi, profileApi } from '../../services/api';
import { formatCurrency, formatDate } from '../../utils';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import Icon from 'react-native-vector-icons/Feather';

interface Party {
  id: string;
  name: string;
  phone?: string;
  type: string;
}

interface OutstandingBill {
  id: string;
  ref: string;
  date: string;
  total: number;
  paid: number;
  balance: number;
  status: string;
  type: 'SALE' | 'PURCHASE';
}

const PAYMENT_MODES = [
  { value: 'CASH', label: 'Cash', icon: '💵' },
  { value: 'UPI', label: 'UPI', icon: '📱' },
  { value: 'BANK_TRANSFER', label: 'Bank Transfer', icon: '🏦' },
  { value: 'CHEQUE', label: 'Cheque', icon: '📝' },
];

export default function RecordPaymentScreen() {
  const { colors } = useTheme();
  const toast = useToast();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const defaultType = route.params?.type || 'IN';

  const [loading, setLoading] = useState(false);
  const [fetchingParties, setFetchingParties] = useState(true);
  const [parties, setParties] = useState<Party[]>([]);
  const [search, setSearch] = useState('');
  const [showPartyPicker, setShowPartyPicker] = useState(false);

  // Outstanding Bills & Allocations
  const [bills, setBills] = useState<OutstandingBill[]>([]);
  const [billsLoading, setBillsLoading] = useState(false);
  const [showBills, setShowBills] = useState(true);
  const [allocations, setAllocations] = useState<Record<string, number>>({});

  // Receipt attachment
  const [receiptAttachments, setReceiptAttachments] = useState<Attachment[]>([]);

  // Date picker
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [form, setForm] = useState({
    party_id: route.params?.partyId || '',
    partyName: route.params?.partyName || '',
    type: defaultType as 'IN' | 'OUT',
    amount: '',
    payment_mode: 'CASH',
    reference: '',
    notes: '',
    payment_date: new Date().toISOString().split('T')[0],
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchParties();
  }, []);

  // Fetch outstanding bills when party or type changes
  useEffect(() => {
    if (form.party_id) {
      fetchBills(form.party_id, form.type);
    } else {
      setBills([]);
      setAllocations({});
    }
  }, [form.party_id, form.type]);

  // If opened with a specific referenceId, pre-fill as a single allocation
  useEffect(() => {
    const referenceId = route.params?.referenceId;
    const defaultAmount = route.params?.defaultAmount;
    if (referenceId && defaultAmount && defaultAmount > 0) {
      setAllocations({ [referenceId]: defaultAmount });
    }
  }, [route.params]);

  const fetchBills = async (partyId: string, type: 'IN' | 'OUT') => {
    try {
      setBillsLoading(true);
      const { data } = await billingApi.partyOutstandingBills(partyId, type);
      const fetched: OutstandingBill[] = data?.data || [];
      setBills(fetched);
      // Clear allocations unless we have a specific reference
      if (!route.params?.referenceId) {
        setAllocations({});
      }
    } catch {
      setBills([]);
    } finally {
      setBillsLoading(false);
    }
  };

  const fetchParties = async () => {
    try {
      setFetchingParties(true);
      const res = await profileApi.parties({});
      setParties(res.data?.data || []);
    } catch {
      // Continue without parties list
    } finally {
      setFetchingParties(false);
    }
  };

  const filteredParties = parties.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.phone && p.phone.includes(search))
  );

  // Total allocated across all bills
  const totalAllocated = Object.values(allocations).reduce((s, v) => s + (v || 0), 0);

  // Effective amount: if bills exist use totalAllocated, else use form.amount
  const effectiveAmount = bills.length > 0 ? totalAllocated : parseFloat(form.amount) || 0;

  // Handle allocation change for a bill
  const handleAllocationChange = useCallback((billId: string, value: string) => {
    const num = parseFloat(value) || 0;
    const bill = bills.find(b => b.id === billId);
    const capped = bill ? Math.min(num, bill.balance) : num;
    setAllocations(prev => ({ ...prev, [billId]: capped }));
    if (errors.amount) setErrors(prev => ({ ...prev, amount: '' }));
  }, [bills, errors.amount]);

  // "Pay full balance" for a single bill
  const allocateFull = (bill: OutstandingBill) => {
    setAllocations(prev => ({ ...prev, [bill.id]: bill.balance }));
    if (errors.amount) setErrors(prev => ({ ...prev, amount: '' }));
  };

  // Toggle bill in/out of allocations
  const toggleBill = (bill: OutstandingBill) => {
    setAllocations(prev => {
      if (prev[bill.id] !== undefined) {
        const next = { ...prev };
        delete next[bill.id];
        return next;
      }
      return { ...prev, [bill.id]: bill.balance };
    });
    if (errors.amount) setErrors(prev => ({ ...prev, amount: '' }));
  };

  // Handle date change from date picker
  const handleDateChange = (_event: DateTimePickerEvent, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setForm(prev => ({ ...prev, payment_date: selectedDate.toISOString().split('T')[0] }));
    }
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!form.party_id) newErrors.party = 'Please select a party';
    if (effectiveAmount <= 0) newErrors.amount = 'Please enter or allocate a valid amount';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    try {
      setLoading(true);
      
      let paymentId: string | null = null;
      
      // Case 1: Allocations across multiple bills
      if (bills.length > 0 && totalAllocated > 0) {
        const allocationList = Object.entries(allocations)
          .filter(([, amt]) => amt > 0)
          .map(([billId, amount]) => {
            const bill = bills.find(b => b.id === billId)!;
            return { referenceId: billId, referenceType: bill.type, amount };
          });

        if (allocationList.length === 0) {
          toast.error('Please allocate amount to at least one bill');
          return;
        }

        const { data } = await billingApi.createBulkPayment({
          type: form.type,
          party_id: form.party_id,
          mode: form.payment_mode,
          date: form.payment_date,
          reference: form.reference.trim() || undefined,
          notes: form.notes.trim() || undefined,
          allocations: allocationList,
        });

        paymentId = data?.data?.payments?.[0]?.id;
      }
      // Case 2: Quick payment without bills
      else {
        const { data } = await billingApi.createPayment({
          party_id: form.party_id,
          type: form.type,
          amount: parseFloat(form.amount),
          payment_mode: form.payment_mode,
          reference: form.reference.trim() || undefined,
          notes: form.notes.trim() || undefined,
          payment_date: form.payment_date,
        });
        paymentId = data?.data?.id;
      }

      // Upload receipt if attached
      if (paymentId && receiptAttachments.length > 0) {
        try {
          for (const attachment of receiptAttachments) {
            const formData = new FormData();
            formData.append('file', {
              uri: attachment.uri,
              type: attachment.type,
              name: attachment.name,
            } as any);
            await billingApi.uploadReceipt(paymentId, formData);
          }
        } catch {
          // Non-fatal - payment was created
        }
      }

      toast.success(`Payment ${form.type === 'IN' ? 'received' : 'recorded'} successfully`);
      navigation.goBack();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to record payment');
    } finally {
      setLoading(false);
    }
  };

  const selectedParty = parties.find((p) => p.id === form.party_id);
  const hasBills = bills.length > 0;
  const allocatedBillIds = new Set(Object.keys(allocations).filter(k => (allocations[k] || 0) > 0));

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Payment Type Toggle */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.typeToggle}>
              <TouchableOpacity
                style={[
                  styles.typeBtn,
                  {
                    backgroundColor: form.type === 'IN' ? colors.success + '15' : 'transparent',
                    borderColor: form.type === 'IN' ? colors.success : colors.border,
                  },
                ]}
                onPress={() => setForm({ ...form, type: 'IN' })}
              >
                <Text style={{ fontSize: 24 }}>📥</Text>
                <Text
                  style={[
                    styles.typeBtnText,
                    { color: form.type === 'IN' ? colors.success : colors.text },
                  ]}
                >
                  Payment Received
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.typeBtn,
                  {
                    backgroundColor: form.type === 'OUT' ? colors.error + '15' : 'transparent',
                    borderColor: form.type === 'OUT' ? colors.error : colors.border,
                  },
                ]}
                onPress={() => setForm({ ...form, type: 'OUT' })}
              >
                <Text style={{ fontSize: 24 }}>📤</Text>
                <Text
                  style={[
                    styles.typeBtnText,
                    { color: form.type === 'OUT' ? colors.error : colors.text },
                  ]}
                >
                  Payment Made
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Party Selection */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.cardHeader}>
              <Text style={{ fontSize: 20 }}>👤</Text>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Party</Text>
            </View>

            {!form.party_id ? (
              <>
                <SearchBar
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search parties..."
                />
                {fetchingParties ? (
                  <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
                    Loading parties...
                  </Text>
                ) : (
                  <View style={styles.partyList}>
                    {filteredParties.slice(0, 5).map((party) => (
                      <TouchableOpacity
                        key={party.id}
                        style={[styles.partyOption, { borderColor: colors.border }]}
                        onPress={() => {
                          setForm({ ...form, party_id: party.id, partyName: party.name });
                          if (errors.party) setErrors({ ...errors, party: '' });
                        }}
                      >
                        <View
                          style={[styles.partyAvatar, { backgroundColor: colors.primary + '20' }]}
                        >
                          <Text style={[styles.partyInitial, { color: colors.primary }]}>
                            {party.name.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <View style={styles.partyInfo}>
                          <Text style={[styles.partyName, { color: colors.text }]}>
                            {party.name}
                          </Text>
                          {party.phone && (
                            <Text style={[styles.partyPhone, { color: colors.textTertiary }]}>
                              {party.phone}
                            </Text>
                          )}
                        </View>
                      </TouchableOpacity>
                    ))}
                    {filteredParties.length === 0 && !fetchingParties && (
                      <Text style={[styles.noParties, { color: colors.textSecondary }]}>
                        No parties found
                      </Text>
                    )}
                  </View>
                )}
                {errors.party && (
                  <Text style={[styles.errorText, { color: colors.error }]}>{errors.party}</Text>
                )}
              </>
            ) : (
              <View
                style={[
                  styles.selectedParty,
                  { backgroundColor: colors.primary + '10', borderColor: colors.primary + '30' },
                ]}
              >
                <View
                  style={[styles.partyAvatar, { backgroundColor: colors.primary + '20' }]}
                >
                  <Text style={[styles.partyInitial, { color: colors.primary }]}>
                    {form.partyName?.charAt(0)?.toUpperCase() || selectedParty?.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.partyInfo}>
                  <Text style={[styles.partyName, { color: colors.text }]}>
                    {form.partyName || selectedParty?.name}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.changeBtn, { backgroundColor: colors.surface }]}
                  onPress={() => setForm({ ...form, party_id: '', partyName: '' })}
                >
                  <Text style={[styles.changeBtnText, { color: colors.primary }]}>Change</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Outstanding Bills Section */}
          {form.party_id && (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <TouchableOpacity 
                style={styles.cardHeader}
                onPress={() => setShowBills(!showBills)}
              >
                <Text style={{ fontSize: 20 }}>📋</Text>
                <Text style={[styles.cardTitle, { color: colors.text }]}>
                  Outstanding Bills
                  {hasBills && (
                    <Text style={[styles.billsBadge, { backgroundColor: colors.warning + '20', color: colors.warning }]}>
                      {' '}{bills.length}
                    </Text>
                  )}
                </Text>
                <View style={{ flex: 1 }} />
                <Icon 
                  name={showBills ? 'chevron-up' : 'chevron-down'} 
                  size={20} 
                  color={colors.textSecondary} 
                />
              </TouchableOpacity>

              {showBills && (
                <View style={styles.billsContainer}>
                  {billsLoading ? (
                    <View style={styles.loadingContainer}>
                      <ActivityIndicator size="small" color={colors.primary} />
                      <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
                        Loading bills...
                      </Text>
                    </View>
                  ) : !hasBills ? (
                    <View style={styles.emptyBills}>
                      <Text style={[styles.emptyBillsText, { color: colors.textSecondary }]}>
                        {form.type === 'IN' 
                          ? 'No outstanding sales for this party' 
                          : 'No outstanding purchases for this party'}
                      </Text>
                    </View>
                  ) : (
                    <>
                      {bills.map((bill) => {
                        const isSelected = allocatedBillIds.has(bill.id);
                        const alloc = allocations[bill.id] ?? 0;
                        
                        return (
                          <View 
                            key={bill.id}
                            style={[
                              styles.billRow,
                              { 
                                backgroundColor: isSelected ? colors.primary + '08' : 'transparent',
                                borderColor: colors.border,
                              },
                            ]}
                          >
                            {/* Bill info with checkbox */}
                            <TouchableOpacity 
                              style={styles.billInfo}
                              onPress={() => toggleBill(bill)}
                            >
                              <Icon 
                                name={isSelected ? 'check-square' : 'square'} 
                                size={20} 
                                color={isSelected ? colors.primary : colors.textSecondary} 
                              />
                              <View style={styles.billDetails}>
                                <Text style={[styles.billRef, { color: colors.text }]} numberOfLines={1}>
                                  {bill.ref}
                                </Text>
                                <Text style={[styles.billDate, { color: colors.textTertiary }]}>
                                  {formatDate(bill.date)}
                                </Text>
                              </View>
                            </TouchableOpacity>

                            {/* Balance */}
                            <View style={styles.billBalance}>
                              <Text style={[styles.billBalanceAmount, { color: colors.warning }]}>
                                {formatCurrency(bill.balance)}
                              </Text>
                              <Text style={[styles.billBalanceLabel, { color: colors.textTertiary }]}>
                                of {formatCurrency(bill.total)}
                              </Text>
                            </View>

                            {/* Allocation Input */}
                            <View style={styles.billAllocation}>
                              <Input
                                value={alloc > 0 ? alloc.toString() : ''}
                                onChangeText={(text) => handleAllocationChange(bill.id, text)}
                                placeholder="0"
                                keyboardType="numeric"
                                style={styles.allocationInput}
                              />
                            </View>

                            {/* Pay Full Button */}
                            <TouchableOpacity
                              style={[styles.payFullBtn, { backgroundColor: colors.primary + '15' }]}
                              onPress={() => allocateFull(bill)}
                            >
                              <Text style={[styles.payFullBtnText, { color: colors.primary }]}>Full</Text>
                            </TouchableOpacity>
                          </View>
                        );
                      })}

                      {/* Total Allocated */}
                      {totalAllocated > 0 && (
                        <View style={[styles.totalAllocated, { backgroundColor: colors.primary + '10' }]}>
                          <Text style={[styles.totalAllocatedLabel, { color: colors.primary }]}>
                            Total Allocated
                          </Text>
                          <Text style={[styles.totalAllocatedAmount, { color: colors.primary }]}>
                            {formatCurrency(totalAllocated)}
                          </Text>
                        </View>
                      )}
                    </>
                  )}
                </View>
              )}
            </View>
          )}

          {/* Amount Card - only show when no bills or no allocation */}
          {(!hasBills || totalAllocated === 0) && (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.cardHeader}>
              <Text style={{ fontSize: 20 }}>💰</Text>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Amount</Text>
            </View>

            <Input
              label="Amount *"
              placeholder="Enter amount"
              value={form.amount}
              onChangeText={(text) => {
                setForm({ ...form, amount: text.replace(/[^0-9.]/g, '') });
                if (errors.amount) setErrors({ ...errors, amount: '' });
              }}
              keyboardType="numeric"
              error={errors.amount}
            />

            {form.amount && (
              <View
                style={[
                  styles.amountPreview,
                  {
                    backgroundColor:
                      form.type === 'IN' ? colors.success + '10' : colors.error + '10',
                  },
                ]}
              >
                <Text
                  style={[
                    styles.amountPreviewText,
                    { color: form.type === 'IN' ? colors.success : colors.error },
                  ]}
                >
                  {form.type === 'IN' ? '+' : '-'} {formatCurrency(parseFloat(form.amount) || 0)}
                </Text>
              </View>
            )}
          </View>
          )}

          {/* Payment Mode */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.cardHeader}>
              <Text style={{ fontSize: 20 }}>💳</Text>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Payment Mode</Text>
            </View>

            <View style={styles.modeGrid}>
              {PAYMENT_MODES.map((mode) => (
                <TouchableOpacity
                  key={mode.value}
                  style={[
                    styles.modeOption,
                    {
                      borderColor:
                        form.payment_mode === mode.value ? colors.primary : colors.border,
                      backgroundColor:
                        form.payment_mode === mode.value ? colors.primary + '10' : 'transparent',
                    },
                  ]}
                  onPress={() => setForm({ ...form, payment_mode: mode.value })}
                >
                  <Text style={styles.modeIcon}>{mode.icon}</Text>
                  <Text
                    style={[
                      styles.modeLabel,
                      {
                        color:
                          form.payment_mode === mode.value ? colors.primary : colors.text,
                      },
                    ]}
                  >
                    {mode.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Additional Details */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.cardHeader}>
              <Text style={{ fontSize: 20 }}>📋</Text>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Additional Details</Text>
            </View>

            {/* Date Picker */}
            <View style={{ marginBottom: Spacing.md }}>
              <Text style={[styles.receiptLabel, { color: colors.text }]}>Payment Date</Text>
              <TouchableOpacity
                style={[styles.datePickerBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
                onPress={() => setShowDatePicker(true)}
              >
                <Icon name="calendar" size={18} color={colors.primary} />
                <Text style={[styles.datePickerText, { color: colors.text }]}>
                  {formatDate(form.payment_date)}
                </Text>
                <Icon name="chevron-down" size={16} color={colors.textSecondary} />
              </TouchableOpacity>
              {showDatePicker && (
                <DateTimePicker
                  value={new Date(form.payment_date)}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={handleDateChange}
                  maximumDate={new Date()}
                />
              )}
            </View>

            <Input
              label="Reference Number"
              placeholder="e.g., Transaction ID, Cheque No."
              value={form.reference}
              onChangeText={(text) => setForm({ ...form, reference: text })}
            />

            <Input
              label="Notes"
              placeholder="Any additional notes..."
              value={form.notes}
              onChangeText={(text) => setForm({ ...form, notes: text })}
              multiline
              numberOfLines={2}
            />

            {/* Receipt Upload */}
            <View style={styles.receiptSection}>
              <Text style={[styles.receiptLabel, { color: colors.text }]}>
                Payment Receipt <Text style={{ color: colors.textSecondary }}>(Optional)</Text>
              </Text>
              <AttachmentUpload
                attachments={receiptAttachments}
                onAttachmentsChange={setReceiptAttachments}
                maxAttachments={1}
                allowedTypes={['image', 'pdf']}
              />
            </View>
          </View>

          {/* Submit Button */}
          <Button
            title={
              hasBills && totalAllocated > 0
                ? `${form.type === 'IN' ? 'Receive' : 'Pay'} ${formatCurrency(totalAllocated)}`
                : form.type === 'IN' ? 'Record Payment Received' : 'Record Payment Made'
            }
            onPress={handleSubmit}
            loading={loading}
            fullWidth
            size="lg"
          />
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.lg, paddingBottom: 100 },
  card: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.xl,
    marginBottom: Spacing.lg,
    ...Shadow.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  cardTitle: {
    fontSize: FontSize.md,
    fontWeight: '600',
    marginLeft: Spacing.sm,
  },
  typeToggle: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  typeBtn: {
    flex: 1,
    alignItems: 'center',
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
  },
  typeBtnText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    marginTop: Spacing.sm,
  },
  partyList: {
    marginTop: Spacing.md,
  },
  partyOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  partyAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  partyInitial: {
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  partyInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  partyName: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  partyPhone: {
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  loadingText: {
    textAlign: 'center',
    paddingVertical: Spacing.lg,
    fontSize: FontSize.sm,
  },
  noParties: {
    textAlign: 'center',
    paddingVertical: Spacing.xl,
    fontSize: FontSize.sm,
  },
  selectedParty: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  changeBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  changeBtnText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  errorText: {
    fontSize: FontSize.xs,
    marginTop: Spacing.sm,
  },
  amountPreview: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  amountPreviewText: {
    fontSize: FontSize.xl,
    fontWeight: '700',
  },
  modeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  modeOption: {
    width: '48%',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
  },
  modeIcon: {
    fontSize: 24,
    marginBottom: Spacing.xs,
  },
  modeLabel: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  // Outstanding Bills styles
  billsBadge: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    paddingHorizontal: Spacing.xs,
    borderRadius: BorderRadius.sm,
    marginLeft: Spacing.xs,
  },
  billsContainer: {
    marginTop: Spacing.sm,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  emptyBills: {
    padding: Spacing.lg,
    alignItems: 'center',
  },
  emptyBillsText: {
    fontSize: FontSize.sm,
    textAlign: 'center',
  },
  billRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xs,
    borderBottomWidth: 1,
    gap: Spacing.sm,
  },
  billInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: Spacing.sm,
  },
  billDetails: {
    flex: 1,
    minWidth: 0,
  },
  billRef: {
    fontSize: FontSize.sm,
    fontWeight: '500',
  },
  billDate: {
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  billBalance: {
    alignItems: 'flex-end',
    minWidth: 60,
  },
  billBalanceAmount: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  billBalanceLabel: {
    fontSize: 10,
  },
  billAllocation: {
    width: 70,
  },
  allocationInput: {
    height: 32,
    fontSize: FontSize.xs,
    textAlign: 'right',
    paddingHorizontal: Spacing.xs,
  },
  payFullBtn: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  payFullBtnText: {
    fontSize: 10,
    fontWeight: '600',
  },
  totalAllocated: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.sm,
  },
  totalAllocatedLabel: {
    fontSize: FontSize.sm,
    fontWeight: '500',
  },
  totalAllocatedAmount: {
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  // Date picker styles
  datePickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    gap: Spacing.sm,
  },
  datePickerText: {
    fontSize: FontSize.sm,
    fontWeight: '500',
    flex: 1,
  },
  // Receipt attachment styles
  receiptSection: {
    marginTop: Spacing.md,
  },
  receiptLabel: {
    fontSize: FontSize.sm,
    fontWeight: '500',
    marginBottom: Spacing.sm,
  },
});
