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
import { formatCurrency } from '../../utils';

interface OutstandingRow {
  id: string;
  party_name: string;
  phone?: string;
  type: 'RECEIVABLE' | 'PAYABLE';
  amount: number;
  days_overdue?: number;
}

export default function OutstandingReportScreen() {
  const { colors } = useTheme();
  const toast = useToast();
  const navigation = useNavigation<any>();

  const [data, setData] = useState<OutstandingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'RECEIVABLE' | 'PAYABLE'>('all');
  const [totals, setTotals] = useState({ receivable: 0, payable: 0 });

  const fetchData = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      const res = await ledgerApi.outstanding({});
      const od = res.data?.data;
      
      if (Array.isArray(od)) {
        setData(od);
        setTotals({
          receivable: od.filter((r: any) => r.type === 'RECEIVABLE').reduce((s: number, r: any) => s + r.amount, 0),
          payable: od.filter((r: any) => r.type === 'PAYABLE').reduce((s: number, r: any) => s + r.amount, 0),
        });
      } else if (od && typeof od === 'object') {
        if (Array.isArray(od.parties)) {
          const rows: OutstandingRow[] = od.parties
            .filter((p: any) => Number(p.balance) !== 0)
            .map((p: any) => ({
              id: p.id,
              party_name: p.name,
              phone: p.phone,
              type: Number(p.balance) > 0 ? 'RECEIVABLE' : 'PAYABLE',
              amount: Math.abs(Number(p.balance)),
              days_overdue: 0,
            }));
          setData(rows);
          setTotals({
            receivable: Number(od.totalReceivable ?? 0),
            payable: Number(od.totalPayable ?? 0),
          });
        } else {
          setData([]);
        }
      }
    } catch {
      toast.error('Failed to load outstanding report');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredData = filter === 'all' ? data : data.filter((r) => r.type === filter);

  const renderItem = ({ item }: { item: OutstandingRow }) => (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={() => navigation.navigate('PartyLedger', { partyId: item.id })}
      activeOpacity={0.7}
    >
      <View style={styles.cardLeft}>
        <View style={[styles.avatar, { backgroundColor: colors.primary + '20' }]}>
          <Text style={[styles.avatarText, { color: colors.primary }]}>
            {item.party_name?.charAt(0)?.toUpperCase() || '?'}
          </Text>
        </View>
        <View style={styles.cardInfo}>
          <Text style={[styles.partyName, { color: colors.text }]} numberOfLines={1}>
            {item.party_name}
          </Text>
          {item.phone && (
            <Text style={[styles.phone, { color: colors.textTertiary }]}>{item.phone}</Text>
          )}
          {item.days_overdue && item.days_overdue > 0 && (
            <Text style={[styles.overdue, { color: colors.warning }]}>
              {item.days_overdue} days overdue
            </Text>
          )}
        </View>
      </View>
      <View style={styles.cardRight}>
        <Text
          style={[
            styles.amount,
            { color: item.type === 'RECEIVABLE' ? colors.success : colors.error },
          ]}
        >
          {formatCurrency(item.amount)}
        </Text>
        <Text
          style={[
            styles.typeBadge,
            {
              backgroundColor: item.type === 'RECEIVABLE' ? colors.success + '15' : colors.error + '15',
              color: item.type === 'RECEIVABLE' ? colors.success : colors.error,
            },
          ]}
        >
          {item.type === 'RECEIVABLE' ? 'To Receive' : 'To Pay'}
        </Text>
      </View>
    </TouchableOpacity>
  );

  if (loading) return <LoadingScreen />;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Summary Header */}
      <View style={[styles.summaryHeader, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <TouchableOpacity
          style={[
            styles.summaryItem,
            filter === 'RECEIVABLE' && { backgroundColor: colors.success + '10' },
          ]}
          onPress={() => setFilter(filter === 'RECEIVABLE' ? 'all' : 'RECEIVABLE')}
        >
          <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>To Receive</Text>
          <Text style={[styles.summaryValue, { color: colors.success }]}>
            {formatCurrency(totals.receivable)}
          </Text>
        </TouchableOpacity>
        <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
        <TouchableOpacity
          style={[
            styles.summaryItem,
            filter === 'PAYABLE' && { backgroundColor: colors.error + '10' },
          ]}
          onPress={() => setFilter(filter === 'PAYABLE' ? 'all' : 'PAYABLE')}
        >
          <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>To Pay</Text>
          <Text style={[styles.summaryValue, { color: colors.error }]}>
            {formatCurrency(totals.payable)}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Net Balance */}
      <View style={[styles.netBalance, { backgroundColor: colors.primary + '10' }]}>
        <Text style={[styles.netLabel, { color: colors.textSecondary }]}>Net Balance</Text>
        <Text
          style={[
            styles.netValue,
            { color: totals.receivable - totals.payable >= 0 ? colors.success : colors.error },
          ]}
        >
          {totals.receivable - totals.payable >= 0 ? '+' : ''}
          {formatCurrency(totals.receivable - totals.payable)}
        </Text>
      </View>

      <FlatList
        data={filteredData}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => fetchData(true)} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          <EmptyState
            title="No Outstanding"
            description={filter === 'all' ? 'No outstanding balances' : `No ${filter.toLowerCase()} amounts`}
            icon={<Text style={{ fontSize: 48 }}>🔔</Text>}
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
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.lg,
  },
  summaryLabel: { fontSize: FontSize.xs, marginBottom: 4 },
  summaryValue: { fontSize: FontSize.lg, fontWeight: '700' },
  summaryDivider: { width: 1, marginVertical: Spacing.sm },
  netBalance: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  netLabel: { fontSize: FontSize.sm },
  netValue: { fontSize: FontSize.md, fontWeight: '700' },
  list: { padding: Spacing.lg, paddingBottom: 100 },
  card: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    ...Shadow.sm,
  },
  cardLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { fontSize: FontSize.md, fontWeight: '700' },
  cardInfo: { flex: 1, marginLeft: Spacing.md },
  partyName: { fontSize: FontSize.sm, fontWeight: '600' },
  phone: { fontSize: FontSize.xs, marginTop: 2 },
  overdue: { fontSize: FontSize.xs, marginTop: 2 },
  cardRight: { alignItems: 'flex-end' },
  amount: { fontSize: FontSize.md, fontWeight: '700' },
  typeBadge: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    marginTop: 4,
    overflow: 'hidden',
  },
});
