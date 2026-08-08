import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  FlatList,
} from 'react-native';
import { useRoute } from '@react-navigation/native';
import { useTheme } from '../../theme';
import { FontSize, Spacing, BorderRadius, Shadow } from '../../theme/colors';
import { LoadingScreen, EmptyState } from '../../components/shared';
import { useToast } from '../../components/shared/Toast';
import { ledgerApi } from '../../services/api';
import { formatCurrency, formatDate } from '../../utils';
import type { BillEntry } from '../../types';

export default function PartyLedgerScreen() {
  const { colors } = useTheme();
  const toast = useToast();
  const route = useRoute<any>();
  const { partyId } = route.params;

  const [entries, setEntries] = useState<BillEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState<{ totalDebit: number; totalCredit: number; balance: number } | null>(null);

  const fetchLedger = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      const res = await ledgerApi.partyLedger(partyId, { limit: 100 });
      setEntries(res.data?.data?.entries || res.data?.data || []);
      if (res.data?.data?.summary) {
        setSummary(res.data.data.summary);
      }
    } catch {
      toast.error('Failed to load party ledger');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [partyId]);

  useEffect(() => {
    fetchLedger();
  }, [fetchLedger]);

  if (loading && entries.length === 0) return <LoadingScreen />;

  const renderItem = ({ item, index }: { item: BillEntry; index: number }) => (
    <View
      style={[
        styles.entryRow,
        { backgroundColor: colors.card, borderColor: colors.border, ...Shadow.sm },
        index === 0 && { marginTop: Spacing.sm },
      ]}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.narration, { color: colors.text }]} numberOfLines={2}>
          {item.narration || item.reference || item.type}
        </Text>
        <Text style={[styles.date, { color: colors.textTertiary }]}>
          {formatDate(item.date)} • {item.type}
        </Text>
      </View>
      <View style={styles.amountCol}>
        <Text
          style={[
            styles.amount,
            { color: item.type === 'PAYMENT' || item.type === 'RECEIPT' ? colors.success : colors.error },
          ]}
        >
          {formatCurrency(item.amount)}
        </Text>
        <Text style={[styles.balance, { color: colors.textSecondary }]}>
          Bal: {formatCurrency(item.running_balance)}
        </Text>
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Summary */}
      {summary && (
        <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Debit</Text>
            <Text style={[styles.summaryValue, { color: colors.error }]}>
              {formatCurrency(summary.totalDebit)}
            </Text>
          </View>
          <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Credit</Text>
            <Text style={[styles.summaryValue, { color: colors.success }]}>
              {formatCurrency(summary.totalCredit)}
            </Text>
          </View>
          <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Balance</Text>
            <Text
              style={[
                styles.summaryValue,
                { color: summary.balance >= 0 ? colors.success : colors.error },
              ]}
            >
              {formatCurrency(Math.abs(summary.balance))}
            </Text>
          </View>
        </View>
      )}

      <FlatList
        data={entries}
        renderItem={renderItem}
        keyExtractor={(item: BillEntry) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => fetchLedger(true)} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          <EmptyState
            icon={<Text style={{ fontSize: 48 }}>📒</Text>}
            title="No Entries"
            description="No ledger entries found for this party."
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  summaryCard: {
    flexDirection: 'row',
    margin: Spacing.lg,
    marginBottom: 0,
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryLabel: { fontSize: FontSize.xs, fontWeight: '600', marginBottom: 4 },
  summaryValue: { fontSize: FontSize.md, fontWeight: '700' },
  summaryDivider: { width: 1, marginHorizontal: Spacing.sm },
  list: { padding: Spacing.lg, paddingBottom: 100 },
  entryRow: {
    flexDirection: 'row',
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginBottom: Spacing.sm,
  },
  narration: { fontSize: FontSize.md, fontWeight: '500' },
  date: { fontSize: FontSize.xs, marginTop: 4 },
  amountCol: { alignItems: 'flex-end', marginLeft: Spacing.md },
  amount: { fontSize: FontSize.md, fontWeight: '700' },
  balance: { fontSize: FontSize.xs, marginTop: 2 },
});
