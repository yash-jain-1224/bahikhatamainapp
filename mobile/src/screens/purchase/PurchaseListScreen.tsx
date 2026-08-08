import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../../theme';
import { FontSize, Spacing, BorderRadius, Shadow } from '../../theme/colors';
import { SearchBar, StatusBadge, EmptyState, Button, DateRangeFilter } from '../../components/shared';
import type { DateRange } from '../../components/shared';
import { SkeletonLoader } from '../../components/shared/SkeletonLoader';
import { SwipeableRow } from '../../components/shared/SwipeableRow';
import { FloatingActionButton } from '../../components/shared/FloatingActionButton';
import { EnhancedRefreshControl } from '../../components/shared/EnhancedRefreshControl';
import { AnimatedListItem } from '../../components/shared/AnimatedComponents';
import { haptic } from '../../utils/haptics';
import { useToast } from '../../components/shared/Toast';
import { purchaseApi } from '../../services/api';
import { formatCurrency, formatDate } from '../../utils';
import { exportData, showExportDialog } from '../../utils/export';
import { importData, showImportResult } from '../../utils/import';
import type { Purchase } from '../../types';

export default function PurchaseListScreen() {
  const { colors } = useTheme();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();

  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange>({ startDate: null, endDate: null });

  const fetchPurchases = useCallback(async (pageNum: number = 1, isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else if (pageNum === 1) setLoading(true);
      const res = await purchaseApi.list({ 
        page: pageNum, 
        limit: 20, 
        search,
        startDate: dateRange.startDate?.toISOString(),
        endDate: dateRange.endDate?.toISOString(),
      });
      const data = res.data?.data || [];
      if (pageNum === 1) {
        setPurchases(data);
      } else {
        setPurchases(prev => [...prev, ...data]);
      }
      setHasMore(res.data?.meta?.hasNext ?? false);
      setPage(pageNum);
    } catch {
      toast.error('Failed to load purchases');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [search, dateRange]);

  useEffect(() => {
    fetchPurchases(1);
  }, [search, dateRange]);

  const handleExport = (format: 'csv' | 'json' | 'excel') => {
    exportData({
      data: purchases,
      filename: 'purchases',
      format,
    });
  };

  const handleImport = async () => {
    try {
      const result = await importData({
        requiredFields: ['party_name', 'total_amount'],
      });
      
      if (result.success && result.data.length > 0) {
        toast.success(`Imported ${result.data.length} purchases`);
        showImportResult(result);
        fetchPurchases(1, true);
      } else if (result.errors.length > 0) {
        showImportResult(result);
      }
    } catch {
      toast.error('Import failed');
    }
  };

  const renderItem = ({ item, index }: { item: Purchase; index: number }) => {
    const swipeActions = [
      {
        icon: 'eye',
        color: '#FFFFFF',
        backgroundColor: colors.primary,
        onPress: () => {
          haptic.light();
          navigation.navigate('PurchaseDetail', { id: item.id });
        },
      },
      {
        icon: 'dollar-sign',
        color: '#FFFFFF',
        backgroundColor: colors.success,
        onPress: () => {
          haptic.light();
          navigation.navigate('RecordPayment', { purchaseId: item.id, type: 'purchase' });
        },
      },
      {
        icon: 'printer',
        color: '#FFFFFF',
        backgroundColor: colors.warning,
        onPress: () => {
          haptic.light();
          toast.info('Printing invoice...');
        },
      },
    ];

    return (
      <AnimatedListItem index={index} delay={30}>
        <SwipeableRow rightActions={swipeActions}>
          <TouchableOpacity
            style={[
              styles.card,
              { backgroundColor: colors.card, borderColor: colors.border, ...Shadow.sm },
            ]}
            onPress={() => {
              haptic.light();
              navigation.navigate('PurchaseDetail', { id: item.id });
            }}
            activeOpacity={0.7}
          >
            <View style={styles.cardTop}>
              <View style={styles.cardLeft}>
                <Text style={[styles.cardNumber, { color: colors.primary }]}>
                  #{item.purchase_number}
                </Text>
                <Text style={[styles.partyName, { color: colors.text }]} numberOfLines={1}>
                  {item.party?.name || 'Unknown'}
                </Text>
                <Text style={[styles.cardDate, { color: colors.textTertiary }]}>
                  {formatDate(item.purchase_date)}
                </Text>
              </View>
              <View style={styles.cardRight}>
                <Text style={[styles.cardAmount, { color: colors.text }]}>
                  {formatCurrency(item.total_amount)}
                </Text>
                <StatusBadge status={item.payment_status} size="sm" />
              </View>
            </View>
            {item.balance_amount > 0 && (
              <View style={[styles.balanceRow, { borderTopColor: colors.borderLight }]}>
                <Text style={[styles.balanceLabel, { color: colors.textTertiary }]}>Balance:</Text>
                <Text style={[styles.balanceValue, { color: colors.error }]}>
                  {formatCurrency(item.balance_amount)}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </SwipeableRow>
      </AnimatedListItem>
    );
  };

  const renderSkeleton = () => (
    <View style={styles.list}>
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <View key={i} style={[styles.card, { backgroundColor: colors.card, marginBottom: Spacing.sm }]}>
          <View style={styles.cardTop}>
            <View style={styles.cardLeft}>
              <SkeletonLoader width={70} height={12} style={{ marginBottom: 6 }} />
              <SkeletonLoader width={130} height={16} style={{ marginBottom: 4 }} />
              <SkeletonLoader width={90} height={12} />
            </View>
            <View style={styles.cardRight}>
              <SkeletonLoader width={85} height={18} style={{ marginBottom: 6 }} />
              <SkeletonLoader width={65} height={20} borderRadius={10} />
            </View>
          </View>
        </View>
      ))}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <Text style={[styles.title, { color: colors.text }]}>Purchases</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={[styles.iconBtn, { backgroundColor: colors.surfaceSecondary }]}
            onPress={() => {
              haptic.light();
              handleImport();
            }}
          >
            <Icon name="upload" size={18} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.iconBtn, { backgroundColor: colors.surfaceSecondary }]}
            onPress={() => {
              haptic.light();
              showExportDialog({ data: purchases, filename: 'purchases', onExport: handleExport });
            }}
          >
            <Icon name="download" size={18} color={colors.primary} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.filtersRow}>
        <View style={styles.searchContainer}>
          <SearchBar
            value={search}
            onChangeText={setSearch}
            placeholder="Search purchases..."
          />
        </View>
        <DateRangeFilter value={dateRange} onChange={setDateRange} />
      </View>

      {loading ? renderSkeleton() : (
        <FlatList
          data={purchases}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={
            <EnhancedRefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchPurchases(1, true)}
            />
          }
          onEndReached={() => {
            if (hasMore && !loading) fetchPurchases(page + 1);
          }}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={
            <EmptyState
              title="No Purchases"
              description="Start by creating your first purchase entry"
              icon={<Text style={{ fontSize: 48 }}>📥</Text>}
              action={
                <Button
                  title="Create Purchase"
                  onPress={() => {
                    haptic.light();
                    navigation.navigate('PurchaseCreate');
                  }}
                />
              }
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Floating Action Button */}
      <View style={{ position: 'absolute', bottom: 20 + insets.bottom, right: 0, left: 0 }}>
        <FloatingActionButton
          icon="plus"
          onPress={() => {
            haptic.medium();
            navigation.navigate('PurchaseCreate');
          }}
          label="New Purchase"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.sm,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: { fontSize: FontSize.xxl, fontWeight: '700' },
  filtersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  searchContainer: {
    flex: 1,
  },
  list: {
    padding: Spacing.lg,
    paddingBottom: 100,
  },
  card: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cardLeft: { flex: 1, marginRight: Spacing.md },
  cardNumber: { fontSize: FontSize.xs, fontWeight: '600', marginBottom: 2 },
  partyName: { fontSize: FontSize.md, fontWeight: '600', marginBottom: 2 },
  cardDate: { fontSize: FontSize.xs, marginTop: 2 },
  cardRight: { alignItems: 'flex-end' },
  cardAmount: { fontSize: FontSize.md, fontWeight: '700', marginBottom: 4 },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
  },
  balanceLabel: { fontSize: FontSize.xs },
  balanceValue: { fontSize: FontSize.sm, fontWeight: '600' },
});
