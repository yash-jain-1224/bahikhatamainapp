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
import { useRoute } from '@react-navigation/native';
import { useTheme } from '../../theme';
import { FontSize, Spacing, BorderRadius, Shadow } from '../../theme/colors';
import { LoadingScreen, StatusBadge } from '../../components/shared';
import { useToast } from '../../components/shared/Toast';
import { profileApi } from '../../services/api';
import { formatCurrency, formatDate } from '../../utils';
import type { Cutter, CutterTransaction } from '../../types';

export default function CutterDetailScreen() {
  const { colors } = useTheme();
  const toast = useToast();
  const route = useRoute<any>();
  const { cutterId } = route.params;

  const [cutter, setCutter] = useState<Cutter | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchCutter = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      const res = await profileApi.getCutter(cutterId);
      setCutter(res.data?.data || null);
    } catch {
      toast.error('Failed to load cutter details');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [cutterId]);

  useEffect(() => {
    fetchCutter();
  }, [fetchCutter]);

  if (loading && !cutter) return <LoadingScreen />;

  if (!cutter) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.errorText, { color: colors.textSecondary }]}>Cutter not found.</Text>
      </View>
    );
  }

  const totalAmount = cutter.transactions?.reduce((sum, t) => sum + t.amount, 0) || 0;
  const paidAmount = cutter.transactions?.filter((t) => t.is_paid).reduce((sum, t) => sum + t.amount, 0) || 0;
  const pendingAmount = totalAmount - paidAmount;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => fetchCutter(true)} tintColor={colors.primary} />
        }
      >
        {/* Header */}
        <View style={[styles.headerCard, { backgroundColor: colors.card, borderColor: colors.border, ...Shadow.md }]}>
          <View style={[styles.iconWrap, { backgroundColor: colors.primary + '15' }]}>
            <Text style={styles.icon}>✂️</Text>
          </View>
          <Text style={[styles.cutterName, { color: colors.text }]}>{cutter.name}</Text>
          {cutter.phone && (
            <TouchableOpacity onPress={() => Linking.openURL(`tel:${cutter.phone}`)}>
              <Text style={[styles.phone, { color: colors.primary }]}>📞 {cutter.phone}</Text>
            </TouchableOpacity>
          )}
          {cutter.rate_per_unit != null && (
            <Text style={[styles.rate, { color: colors.textSecondary }]}>
              Rate: {formatCurrency(cutter.rate_per_unit)} / {cutter.unit || 'unit'}
            </Text>
          )}
        </View>

        {/* Summary */}
        <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border, ...Shadow.md }]}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Total</Text>
              <Text style={[styles.summaryValue, { color: colors.text }]}>{formatCurrency(totalAmount)}</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Paid</Text>
              <Text style={[styles.summaryValue, { color: colors.success }]}>{formatCurrency(paidAmount)}</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Pending</Text>
              <Text style={[styles.summaryValue, { color: pendingAmount > 0 ? colors.error : colors.success }]}>
                {formatCurrency(pendingAmount)}
              </Text>
            </View>
          </View>
        </View>

        {/* Transactions */}
        {cutter.transactions && cutter.transactions.length > 0 && (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, ...Shadow.md }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Transactions ({cutter.transactions.length})
            </Text>
            {cutter.transactions.map((txn, index) => (
              <View
                key={txn.id}
                style={[
                  styles.txnRow,
                  index > 0 && { borderTopWidth: 1, borderTopColor: colors.borderLight },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.txnPurchase, { color: colors.text }]}>
                    {txn.purchase?.purchase_number
                      ? `#${txn.purchase.purchase_number}`
                      : `Transaction`}
                  </Text>
                  <Text style={[styles.txnDetail, { color: colors.textSecondary }]}>
                    {txn.quantity} × {formatCurrency(txn.rate)}
                  </Text>
                  {txn.created_at && (
                    <Text style={[styles.txnDate, { color: colors.textTertiary }]}>
                      {formatDate(txn.created_at)}
                    </Text>
                  )}
                </View>
                <View style={styles.txnRight}>
                  <Text style={[styles.txnAmount, { color: colors.text }]}>
                    {formatCurrency(txn.amount)}
                  </Text>
                  <View
                    style={[
                      styles.paidBadge,
                      { backgroundColor: txn.is_paid ? colors.successLight : colors.warningLight },
                    ]}
                  >
                    <Text
                      style={[
                        styles.paidText,
                        { color: txn.is_paid ? colors.success : colors.warning },
                      ]}
                    >
                      {txn.is_paid ? 'Paid' : 'Pending'}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
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
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  icon: { fontSize: 28 },
  cutterName: { fontSize: FontSize.xxl, fontWeight: '700' },
  phone: { fontSize: FontSize.md, fontWeight: '500', marginTop: Spacing.sm },
  rate: { fontSize: FontSize.sm, marginTop: Spacing.xs },
  summaryCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  summaryRow: { flexDirection: 'row' },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryLabel: { fontSize: FontSize.xs, fontWeight: '600', marginBottom: 4 },
  summaryValue: { fontSize: FontSize.lg, fontWeight: '700' },
  card: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  sectionTitle: { fontSize: FontSize.lg, fontWeight: '700', marginBottom: Spacing.lg },
  txnRow: { flexDirection: 'row', paddingVertical: Spacing.md },
  txnPurchase: { fontSize: FontSize.md, fontWeight: '600' },
  txnDetail: { fontSize: FontSize.sm, marginTop: 2 },
  txnDate: { fontSize: FontSize.xs, marginTop: 2 },
  txnRight: { alignItems: 'flex-end', marginLeft: Spacing.md },
  txnAmount: { fontSize: FontSize.md, fontWeight: '700' },
  paidBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: BorderRadius.sm, marginTop: 4 },
  paidText: { fontSize: FontSize.xs, fontWeight: '600' },
});
