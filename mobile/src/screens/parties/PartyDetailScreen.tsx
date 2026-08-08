import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme';
import { FontSize, Spacing, BorderRadius, Shadow } from '../../theme/colors';
import { Avatar, LoadingScreen, Button, StatusBadge } from '../../components/shared';
import { ConfirmDialog } from '../../components/shared/ConfirmDialog';
import { useToast } from '../../components/shared/Toast';
import { profileApi, notificationApi } from '../../services/api';
import { formatCurrency } from '../../utils';
import { haptic } from '../../utils/haptics';
import type { Party } from '../../types';

export default function PartyDetailScreen() {
  const { colors } = useTheme();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { partyId } = route.params;

  const [party, setParty] = useState<Party | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sendingReminder, setSendingReminder] = useState(false);
  const [showReminderConfirm, setShowReminderConfirm] = useState(false);

  const fetchParty = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      const res = await profileApi.getParty(partyId);
      setParty(res.data?.data || null);
    } catch {
      toast.error('Failed to load party');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [partyId]);

  useEffect(() => {
    fetchParty();
  }, [fetchParty]);

  const handleSendReminder = async () => {
    if (!party) return;
    setShowReminderConfirm(false);
    try {
      setSendingReminder(true);
      haptic.light();
      await notificationApi.sendReminder(party.id);
      toast.success('Payment reminder sent!');
      haptic.success();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to send reminder');
      haptic.error();
    } finally {
      setSendingReminder(false);
    }
  };

  if (loading && !party) return <LoadingScreen />;

  if (!party) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.errorText, { color: colors.textSecondary }]}>Party not found.</Text>
      </View>
    );
  }

  const balanceColor = party.balance >= 0 ? colors.success : colors.error;
  const balanceLabel = party.balance >= 0 ? 'To Receive' : 'To Pay';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => fetchParty(true)} tintColor={colors.primary} />
        }
      >
        {/* Header */}
        <View style={[styles.headerCard, { backgroundColor: colors.card, borderColor: colors.border, ...Shadow.md }]}>
          <Avatar name={party.name} size={72} fontSize={28} />
          <Text style={[styles.partyName, { color: colors.text }]}>{party.name}</Text>
          <View style={[styles.typeBadge, { backgroundColor: colors.primary + '15' }]}>
            <Text style={[styles.typeText, { color: colors.primary }]}>{party.type}</Text>
          </View>

          {/* Balance */}
          <View style={[styles.balanceWrap, { backgroundColor: balanceColor + '12' }]}>
            <Text style={[styles.balanceLabel, { color: balanceColor }]}>{balanceLabel}</Text>
            <Text style={[styles.balanceAmount, { color: balanceColor }]}>
              {formatCurrency(Math.abs(party.balance))}
            </Text>
          </View>
        </View>

        {/* Contact Info */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, ...Shadow.md }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Contact Information</Text>

          {party.phone && (
            <TouchableOpacity
              style={styles.contactRow}
              onPress={() => Linking.openURL(`tel:${party.phone}`)}
            >
              <Text style={styles.contactIcon}>📞</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.contactLabel, { color: colors.textSecondary }]}>Phone</Text>
                <Text style={[styles.contactValue, { color: colors.primary }]}>{party.phone}</Text>
              </View>
            </TouchableOpacity>
          )}

          {party.whatsapp && (
            <TouchableOpacity
              style={styles.contactRow}
              onPress={() => Linking.openURL(`https://wa.me/${party.whatsapp}`)}
            >
              <Text style={styles.contactIcon}>💬</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.contactLabel, { color: colors.textSecondary }]}>WhatsApp</Text>
                <Text style={[styles.contactValue, { color: colors.primary }]}>{party.whatsapp}</Text>
              </View>
            </TouchableOpacity>
          )}

          {party.email && (
            <TouchableOpacity
              style={styles.contactRow}
              onPress={() => Linking.openURL(`mailto:${party.email}`)}
            >
              <Text style={styles.contactIcon}>📧</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.contactLabel, { color: colors.textSecondary }]}>Email</Text>
                <Text style={[styles.contactValue, { color: colors.primary }]}>{party.email}</Text>
              </View>
            </TouchableOpacity>
          )}

          {party.address && (
            <View style={styles.contactRow}>
              <Text style={styles.contactIcon}>📍</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.contactLabel, { color: colors.textSecondary }]}>Address</Text>
                <Text style={[styles.contactValue, { color: colors.text }]}>
                  {[party.address, party.city, party.state, party.pincode].filter(Boolean).join(', ')}
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Business Details */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, ...Shadow.md }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Business Details</Text>

          {party.gst_number && (
            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>GST Number</Text>
              <Text style={[styles.detailValue, { color: colors.text }]}>{party.gst_number}</Text>
            </View>
          )}

          {party.gst_registration_type && (
            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Registration</Text>
              <Text style={[styles.detailValue, { color: colors.text }]}>{party.gst_registration_type}</Text>
            </View>
          )}

          {party.pan_number && (
            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>PAN</Text>
              <Text style={[styles.detailValue, { color: colors.text }]}>{party.pan_number}</Text>
            </View>
          )}

          {party.credit_limit != null && (
            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Credit Limit</Text>
              <Text style={[styles.detailValue, { color: colors.text }]}>
                {formatCurrency(party.credit_limit)}
              </Text>
            </View>
          )}

          {party.credit_period_days != null && (
            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Credit Period</Text>
              <Text style={[styles.detailValue, { color: colors.text }]}>
                {party.credit_period_days} days
              </Text>
            </View>
          )}
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: colors.primary }]}
            onPress={() => navigation.navigate('PartyEdit', { partyId: party.id })}
          >
            <Text style={styles.actionBtnText}>✏️ Edit Party</Text>
          </TouchableOpacity>
          <View style={{ height: Spacing.sm }} />
          <Button
            title="📒 View Ledger"
            onPress={() => navigation.navigate('PartyLedger', { partyId: party.id })}
            fullWidth
            size="lg"
            variant="outline"
          />
          <View style={{ height: Spacing.sm }} />
          <Button
            title="💰 Record Payment"
            onPress={() => navigation.navigate('RecordPayment', { partyId: party.id, partyName: party.name })}
            fullWidth
            size="lg"
            variant="outline"
          />
          {/* Show Send Reminder button if party has outstanding balance */}
          {party.balance !== 0 && party.phone && (
            <>
              <View style={{ height: Spacing.sm }} />
              <Button
                title={sendingReminder ? '⏳ Sending...' : '📤 Send Payment Reminder'}
                onPress={() => setShowReminderConfirm(true)}
                fullWidth
                size="lg"
                variant="outline"
                disabled={sendingReminder}
              />
            </>
          )}
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* Send Reminder Confirmation Dialog */}
      <ConfirmDialog
        visible={showReminderConfirm}
        title="Send Payment Reminder"
        message={`Send a payment reminder to ${party.name} via WhatsApp/SMS for the outstanding amount of ${formatCurrency(Math.abs(party.balance))}?`}
        confirmText="Send"
        cancelText="Cancel"
        onConfirm={handleSendReminder}
        onCancel={() => setShowReminderConfirm(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.lg, paddingBottom: 100 },
  errorText: { textAlign: 'center', marginTop: 100, fontSize: FontSize.md },
  headerCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.xxl,
    marginBottom: Spacing.lg,
    alignItems: 'center',
  },
  partyName: { fontSize: FontSize.xxl, fontWeight: '700', marginTop: Spacing.md, textAlign: 'center' },
  typeBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    marginTop: Spacing.sm,
  },
  typeText: { fontSize: FontSize.sm, fontWeight: '600' },
  balanceWrap: {
    width: '100%',
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    marginTop: Spacing.xl,
    alignItems: 'center',
  },
  balanceLabel: { fontSize: FontSize.sm, fontWeight: '600', marginBottom: 4 },
  balanceAmount: { fontSize: FontSize.xxl, fontWeight: '700' },
  card: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  sectionTitle: { fontSize: FontSize.lg, fontWeight: '700', marginBottom: Spacing.lg },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: Spacing.sm,
  },
  contactIcon: { fontSize: 18, marginRight: Spacing.md, marginTop: 2, width: 24, textAlign: 'center' },
  contactLabel: { fontSize: FontSize.xs, fontWeight: '500' },
  contactValue: { fontSize: FontSize.md, fontWeight: '500', marginTop: 2 },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  detailLabel: { fontSize: FontSize.md },
  detailValue: { fontSize: FontSize.md, fontWeight: '600' },
  actions: { marginTop: Spacing.sm },
  actionBtn: {
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  actionBtnText: { color: '#fff', fontWeight: '600', fontSize: FontSize.md },
});
