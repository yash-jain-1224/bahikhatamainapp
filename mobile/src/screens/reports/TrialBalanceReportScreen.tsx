import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
} from 'react-native';
import { useTheme } from '../../theme';
import { FontSize, Spacing, BorderRadius, Shadow } from '../../theme/colors';
import { LoadingScreen, EmptyState } from '../../components/shared';
import { useToast } from '../../components/shared/Toast';
import { ledgerApi } from '../../services/api';
import { formatCurrency } from '../../utils';

interface TrialBalanceRow {
  account: string;
  debit: number;
  credit: number;
}

export default function TrialBalanceReportScreen() {
  const { colors } = useTheme();
  const toast = useToast();

  const [rows, setRows] = useState<TrialBalanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      const res = await ledgerApi.trialBalance({});
      const data = res.data?.data;
      
      if (Array.isArray(data)) {
        setRows(data);
      } else if (data && Array.isArray(data.accounts)) {
        const formatted: TrialBalanceRow[] = data.accounts.map((a: any) => ({
          account: a.accountType ?? a.account,
          debit: Number(a.debit ?? 0),
          credit: Number(a.credit ?? 0),
        }));
        setRows(formatted);
      } else {
        setRows([]);
      }
    } catch {
      toast.error('Failed to load trial balance');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const totals = rows.reduce(
    (acc, r) => ({
      debit: acc.debit + r.debit,
      credit: acc.credit + r.credit,
    }),
    { debit: 0, credit: 0 }
  );

  const renderItem = ({ item }: { item: TrialBalanceRow }) => (
    <View style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.accountName, { color: colors.text }]} numberOfLines={1}>
        {item.account}
      </Text>
      <Text style={[styles.amount, { color: item.debit > 0 ? colors.error : colors.textTertiary }]}>
        {item.debit > 0 ? formatCurrency(item.debit) : '-'}
      </Text>
      <Text style={[styles.amount, { color: item.credit > 0 ? colors.success : colors.textTertiary }]}>
        {item.credit > 0 ? formatCurrency(item.credit) : '-'}
      </Text>
    </View>
  );

  if (loading) return <LoadingScreen />;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header Row */}
      <View style={[styles.headerRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.headerText, { color: colors.textSecondary, flex: 2 }]}>Account</Text>
        <Text style={[styles.headerText, { color: colors.error }]}>Debit</Text>
        <Text style={[styles.headerText, { color: colors.success }]}>Credit</Text>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(item, idx) => item.account + idx}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => fetchData(true)} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          <EmptyState
            title="No Data"
            description="No trial balance data available"
            icon={<Text style={{ fontSize: 48 }}>⚖️</Text>}
          />
        }
        ListFooterComponent={
          rows.length > 0 ? (
            <View style={[styles.totalRow, { backgroundColor: colors.primary + '10', borderColor: colors.primary + '30' }]}>
              <Text style={[styles.totalLabel, { color: colors.text }]}>Total</Text>
              <Text style={[styles.totalAmount, { color: colors.error }]}>
                {formatCurrency(totals.debit)}
              </Text>
              <Text style={[styles.totalAmount, { color: colors.success }]}>
                {formatCurrency(totals.credit)}
              </Text>
            </View>
          ) : null
        }
        showsVerticalScrollIndicator={false}
      />

      {/* Balance Check */}
      {rows.length > 0 && (
        <View style={[styles.balanceCheck, { backgroundColor: totals.debit === totals.credit ? colors.success + '15' : colors.error + '15' }]}>
          <Text style={[styles.balanceCheckText, { color: totals.debit === totals.credit ? colors.success : colors.error }]}>
            {totals.debit === totals.credit ? '✓ Trial Balance is Balanced' : '✗ Trial Balance is NOT Balanced'}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: {
    flexDirection: 'row',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: 1,
  },
  headerText: {
    flex: 1,
    fontSize: FontSize.xs,
    fontWeight: '600',
    textAlign: 'right',
  },
  list: { padding: Spacing.lg, paddingBottom: 100 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginBottom: Spacing.xs,
  },
  accountName: {
    flex: 2,
    fontSize: FontSize.sm,
    fontWeight: '500',
  },
  amount: {
    flex: 1,
    fontSize: FontSize.sm,
    fontWeight: '600',
    textAlign: 'right',
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginTop: Spacing.md,
  },
  totalLabel: {
    flex: 2,
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  totalAmount: {
    flex: 1,
    fontSize: FontSize.sm,
    fontWeight: '700',
    textAlign: 'right',
  },
  balanceCheck: {
    padding: Spacing.md,
    alignItems: 'center',
  },
  balanceCheckText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
});
