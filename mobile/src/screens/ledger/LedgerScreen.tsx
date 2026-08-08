import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { useTheme } from '../../theme';
import { FontSize, Spacing, BorderRadius, Shadow } from '../../theme/colors';
import { EmptyState, SearchBar } from '../../components/shared';
import { SkeletonLoader } from '../../components/shared/SkeletonLoader';
import { EnhancedRefreshControl } from '../../components/shared/EnhancedRefreshControl';
import { AnimatedListItem } from '../../components/shared/AnimatedComponents';
import { useToast } from '../../components/shared/Toast';
import { ledgerApi } from '../../services/api';
import { formatCurrency, formatDate } from '../../utils';
import type { LedgerEntry } from '../../types';

export default function LedgerScreen() {
  const { colors } = useTheme();
  const toast = useToast();
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  const fetchEntries = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true); else setLoading(true);
      const res = await ledgerApi.entries({ limit: 50, search });
      setEntries(res.data?.data || []);
    } catch { toast.error('Failed to load ledger'); }
    finally { setLoading(false); setRefreshing(false); }
  }, [search, toast]);

  useEffect(() => { fetchEntries(); }, [search, fetchEntries]);

  const filteredEntries = entries.filter(e => 
    !search.trim() || 
    e.narration?.toLowerCase().includes(search.toLowerCase()) ||
    e.party?.name?.toLowerCase().includes(search.toLowerCase())
  );

  const renderItem = ({ item, index }: { item: LedgerEntry; index: number }) => (
    <AnimatedListItem index={index} delay={30}>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, ...Shadow.sm }]}>
        <View style={[styles.entryIndicator, { backgroundColor: item.entry_type === 'CREDIT' ? colors.success : colors.error }]} />
        <View style={styles.left}>
          <Text style={[styles.narration, { color: colors.text }]} numberOfLines={2}>
            {item.narration || item.account_type}
          </Text>
          {item.party && <Text style={[styles.party, { color: colors.textSecondary }]}>{item.party.name}</Text>}
          <Text style={[styles.date, { color: colors.textTertiary }]}>{formatDate(item.entry_date)}</Text>
        </View>
        <View style={styles.right}>
          <Text style={[
            styles.amount,
            { color: item.entry_type === 'CREDIT' ? colors.success : colors.error },
          ]}>
            {item.entry_type === 'CREDIT' ? '+' : '-'}{formatCurrency(item.amount)}
          </Text>
          <View style={[styles.typeBadge, { backgroundColor: item.entry_type === 'CREDIT' ? colors.successLight : colors.errorLight }]}>
            <Text style={[styles.typeText, { color: item.entry_type === 'CREDIT' ? colors.success : colors.error }]}>
              {item.entry_type}
            </Text>
          </View>
        </View>
      </View>
    </AnimatedListItem>
  );

  const renderSkeleton = () => (
    <View style={styles.list}>
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <View key={i} style={[styles.card, { backgroundColor: colors.card, marginBottom: Spacing.sm }]}>
          <View style={styles.left}>
            <SkeletonLoader width={180} height={14} style={{ marginBottom: 6 }} />
            <SkeletonLoader width={100} height={12} style={{ marginBottom: 4 }} />
            <SkeletonLoader width={70} height={12} />
          </View>
          <View style={styles.right}>
            <SkeletonLoader width={80} height={18} style={{ marginBottom: 6 }} />
            <SkeletonLoader width={50} height={16} borderRadius={8} />
          </View>
        </View>
      ))}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.searchContainer}>
        <SearchBar value={search} onChangeText={setSearch} placeholder="Search ledger entries..." />
      </View>
      
      {loading ? renderSkeleton() : (
        <FlatList
          data={filteredEntries}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={
            <EnhancedRefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchEntries(true)}
            />
          }
          ListEmptyComponent={
            <EmptyState 
              title="No Entries" 
              description="Ledger entries will appear here" 
              icon={<Text style={{ fontSize: 48 }}>📒</Text>} 
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchContainer: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm },
  list: { padding: Spacing.lg, paddingBottom: 100 },
  card: { flexDirection: 'row', justifyContent: 'space-between', padding: Spacing.lg, borderRadius: BorderRadius.lg, borderWidth: 1, marginBottom: Spacing.sm, overflow: 'hidden' },
  entryIndicator: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  left: { flex: 1, marginRight: Spacing.md },
  narration: { fontSize: FontSize.sm, fontWeight: '600' },
  party: { fontSize: FontSize.xs, marginTop: 2 },
  date: { fontSize: FontSize.xs, marginTop: 4 },
  right: { alignItems: 'flex-end' },
  amount: { fontSize: FontSize.md, fontWeight: '700' },
  typeBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: BorderRadius.sm, marginTop: 4 },
  typeText: { fontSize: FontSize.xs, fontWeight: '600' },
});
