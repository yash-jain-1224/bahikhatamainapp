import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme';
import { FontSize, Spacing, BorderRadius, Shadow } from '../../theme/colors';
import { Input, Button, LoadingScreen } from '../../components/shared';
import { useToast } from '../../components/shared/Toast';
import { profileApi } from '../../services/api';

const PARTY_TYPES = [
  { value: 'SUPPLIER', label: 'Supplier', icon: '📦', description: 'Buy goods from them' },
  { value: 'CUSTOMER', label: 'Customer', icon: '🛒', description: 'Sell goods to them' },
  { value: 'BOTH', label: 'Both', icon: '🔄', description: 'Buy & sell' },
];

export default function PartyCreateScreen() {
  const { colors } = useTheme();
  const toast = useToast();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const editId = route.params?.partyId;
  const isEdit = !!editId;

  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(isEdit);

  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    gstin: '',
    address: '',
    type: 'BOTH',
    opening_balance: '0',
    balance_type: 'NEUTRAL' as 'RECEIVABLE' | 'PAYABLE' | 'NEUTRAL',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isEdit) {
      fetchParty();
    }
  }, []);

  const fetchParty = async () => {
    try {
      setFetching(true);
      const res = await profileApi.getParty(editId);
      const party = res.data?.data;
      if (party) {
        setForm({
          name: party.name || '',
          phone: party.phone || '',
          email: party.email || '',
          gstin: party.gstin || '',
          address: party.address || '',
          type: party.type || 'BOTH',
          opening_balance: String(Math.abs(party.opening_balance || 0)),
          balance_type: party.opening_balance > 0 ? 'RECEIVABLE' : party.opening_balance < 0 ? 'PAYABLE' : 'NEUTRAL',
        });
      }
    } catch {
      toast.error('Failed to load party');
      navigation.goBack();
    } finally {
      setFetching(false);
    }
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!form.name.trim()) newErrors.name = 'Party name is required';
    if (form.phone && !/^\d{10}$/.test(form.phone.replace(/\D/g, ''))) {
      newErrors.phone = 'Please enter a valid 10-digit phone number';
    }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      newErrors.email = 'Please enter a valid email';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    try {
      setLoading(true);
      let openingBalance = parseFloat(form.opening_balance) || 0;
      if (form.balance_type === 'PAYABLE') {
        openingBalance = -openingBalance;
      } else if (form.balance_type === 'NEUTRAL') {
        openingBalance = 0;
      }

      const payload = {
        name: form.name.trim(),
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        gstin: form.gstin.trim() || undefined,
        address: form.address.trim() || undefined,
        type: form.type,
        opening_balance: openingBalance,
      };

      if (isEdit) {
        await profileApi.updateParty(editId, payload);
        toast.success('Party updated successfully');
      } else {
        await profileApi.createParty(payload);
        toast.success('Party created successfully');
      }
      navigation.goBack();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to save party');
    } finally {
      setLoading(false);
    }
  };

  if (fetching) return <LoadingScreen />;

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
          {/* Party Type */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.cardHeader}>
              <Text style={{ fontSize: 20 }}>🏷️</Text>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Party Type</Text>
            </View>

            <View style={styles.typeGrid}>
              {PARTY_TYPES.map((type) => (
                <TouchableOpacity
                  key={type.value}
                  style={[
                    styles.typeOption,
                    {
                      borderColor: form.type === type.value ? colors.primary : colors.border,
                      backgroundColor: form.type === type.value ? colors.primary + '10' : 'transparent',
                    },
                  ]}
                  onPress={() => setForm({ ...form, type: type.value })}
                >
                  <Text style={styles.typeIcon}>{type.icon}</Text>
                  <Text
                    style={[
                      styles.typeLabel,
                      { color: form.type === type.value ? colors.primary : colors.text },
                    ]}
                  >
                    {type.label}
                  </Text>
                  <Text style={[styles.typeDesc, { color: colors.textTertiary }]}>
                    {type.description}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Basic Info */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.cardHeader}>
              <Text style={{ fontSize: 20 }}>👤</Text>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Basic Information</Text>
            </View>

            <Input
              label="Party Name *"
              placeholder="Enter party name"
              value={form.name}
              onChangeText={(text) => {
                setForm({ ...form, name: text });
                if (errors.name) setErrors({ ...errors, name: '' });
              }}
              error={errors.name}
              autoFocus={!isEdit}
            />

            <Input
              label="Phone Number"
              placeholder="10-digit mobile number"
              value={form.phone}
              onChangeText={(text) => {
                setForm({ ...form, phone: text.replace(/\D/g, '').slice(0, 10) });
                if (errors.phone) setErrors({ ...errors, phone: '' });
              }}
              keyboardType="phone-pad"
              error={errors.phone}
            />

            <Input
              label="Email"
              placeholder="email@example.com"
              value={form.email}
              onChangeText={(text) => {
                setForm({ ...form, email: text });
                if (errors.email) setErrors({ ...errors, email: '' });
              }}
              keyboardType="email-address"
              autoCapitalize="none"
              error={errors.email}
            />

            <Input
              label="GSTIN"
              placeholder="22-character GST number"
              value={form.gstin}
              onChangeText={(text) => setForm({ ...form, gstin: text.toUpperCase() })}
              autoCapitalize="characters"
            />

            <Input
              label="Address"
              placeholder="Full address"
              value={form.address}
              onChangeText={(text) => setForm({ ...form, address: text })}
              multiline
              numberOfLines={2}
            />
          </View>

          {/* Opening Balance */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.cardHeader}>
              <Text style={{ fontSize: 20 }}>💰</Text>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Opening Balance</Text>
            </View>

            <Input
              label="Amount"
              placeholder="Enter opening balance"
              value={form.opening_balance}
              onChangeText={(text) =>
                setForm({ ...form, opening_balance: text.replace(/[^0-9.]/g, '') })
              }
              keyboardType="numeric"
            />

            <Text style={[styles.balanceTypeLabel, { color: colors.textSecondary }]}>
              Balance Type
            </Text>
            <View style={styles.balanceTypeGrid}>
              {[
                { value: 'NEUTRAL', label: 'No Balance', color: colors.textSecondary },
                { value: 'RECEIVABLE', label: 'They Owe You', color: colors.success },
                { value: 'PAYABLE', label: 'You Owe Them', color: colors.error },
              ].map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.balanceTypeBtn,
                    {
                      borderColor: form.balance_type === opt.value ? opt.color : colors.border,
                      backgroundColor: form.balance_type === opt.value ? opt.color + '10' : 'transparent',
                    },
                  ]}
                  onPress={() => setForm({ ...form, balance_type: opt.value as any })}
                >
                  <Text
                    style={[
                      styles.balanceTypeText,
                      { color: form.balance_type === opt.value ? opt.color : colors.text },
                    ]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Submit Button */}
          <Button
            title={isEdit ? 'Update Party' : 'Add Party'}
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
  typeGrid: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  typeOption: {
    flex: 1,
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
  },
  typeIcon: {
    fontSize: 28,
    marginBottom: Spacing.xs,
  },
  typeLabel: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  typeDesc: {
    fontSize: FontSize.xs,
    marginTop: 2,
    textAlign: 'center',
  },
  balanceTypeLabel: {
    fontSize: FontSize.sm,
    fontWeight: '500',
    marginBottom: Spacing.sm,
  },
  balanceTypeGrid: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  balanceTypeBtn: {
    flex: 1,
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
  },
  balanceTypeText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    textAlign: 'center',
  },
});
