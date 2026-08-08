import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../theme';
import { FontSize, Spacing, BorderRadius, Shadow } from '../../theme/colors';
import { LoadingScreen, EmptyState } from '../../components/shared';
import { useToast } from '../../components/shared/Toast';
import { ledgerApi } from '../../services/api';
import { formatCurrency, formatDate } from '../../utils';

interface DayBookEntry {
  id: string;
  date: string;
  narration: string;
  debit: number;
  credit: number;
  type: string;
  party_name?: string;
}

export default function DayBookReportScreen() {
  const { colors } = useTheme();
  const toast = useToast();
  const navigation = useNavigation<any>();

  const [entries, setEntries] = useState<DayBookEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dateRange, setDateRange] = useState({
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0],
  });

  const fetchData = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      const res = await ledgerApi.dayBook({ from: dateRange.from, to: dateRange.to });
      const data = res.data?.data;
      setEntries(Array.isArray(data) ? data : []);
    } catch {
      toast.error('Failed to load day book');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dateRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const totals = entries.reduce(
    (acc, e) => ({
      debit: acc.debit + (e.debit || 0),
      credit: acc.credit + (e.credit || 0),
    }),
    { debit: 0, credit: 0 }
  );

  const renderItem = ({ item }: { item: DayBookEntry }) => (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.cardHeader}>
        <Text style={[styles.date, { color: colors.textSecondary }]}>{formatDate(item.date)}</Text>
        <View style={[styles.typeBadge, { backgroundColor: item.debit > 0 ? colors.error + '15' : colors.success + '15' }]}>
          <Text style={[styles.typeText, { color: item.debit > 0 ? colors.error : colors.success }]}>
            {item.type}
          </Text>
        </View>
      </View>
      <Text style={[styles.narration, { color: colors.text }]} numberOfLines={2}>
        {item.narration}
      </Text>
      {item.party_name && (
        <Text style={[styles.partyName, { color: colors.textTertiary }]}>
          {item.party_name}
        </Text>
      )}
      <View style={styles.amounts}>
        {item.debit > 0 && (
          <View style={styles.amountItem}>
            <Text style={[styles.amountLabel, { color: colors.textSecondary }]}>Debit</Text>
            <Text style={[styles.amountValue, { color: colors.error }]}>
              {formatCurrency(item.debit)}
            </Text>
          </View>
        )}
        {item.credit > 0 && (
          <View style={styles.amountItem}>
            <Text style={[styles.amountLabel, { color: colors.textSecondary }]}>Credit</Text>
            <Text style={[styles.amountValue, { color: colors.success }]}>
              {formatCurrency(item.credit)}
            </Text>
          </View>
        )}
      </View>
    </View>
  );

  if (loading) return <LoadingScreen />;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Summary Header */}
      <View style={[styles.summaryHeader, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Total Debit</Text>
          <Text style={[styles.summaryValue, { color: colors.error }]}>{formatCurrency(totals.debit)}</Text>
        </View>
        <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Total Credit</Text>
          <Text style={[styles.summaryValue, { color: colors.success }]}>{formatCurrency(totals.credit)}</Text>
        </View>
      </View>

      <FlatList
        data={entries}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => fetchData(true)} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          <EmptyState
            title="No Entries"
            description="No day book entries found for this period"
            icon={<Text style={{ fontSize: 48 }}>📅</Text>}
          />
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  summaryHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.xl,
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryLabel: { fontSize: FontSize.xs, marginBottom: 4 },
  summaryValue: { fontSize: FontSize.lg, fontWeight: '700' },
  summaryDivider: { width: 1, marginVertical: -Spacing.sm },
  list: { padding: Spacing.lg, paddingBottom: 100 },
  card: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
    ...Shadow.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  date: { fontSize: FontSize.xs },
  typeBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  typeText: { fontSize: FontSize.xs, fontWeight: '600' },
  narration: { fontSize: FontSize.sm, fontWeight: '500', marginBottom: 4 },
  partyName: { fontSize: FontSize.xs, marginBottom: Spacing.sm },
  amounts: { flexDirection: 'row', gap: Spacing.xl, marginTop: Spacing.sm },
  amountItem: {},
  amountLabel: { fontSize: FontSize.xs },
  amountValue: { fontSize: FontSize.md, fontWeight: '600' },
});
