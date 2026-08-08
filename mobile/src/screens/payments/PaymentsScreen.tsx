import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../../theme';
import { FontSize, Spacing, BorderRadius, Shadow } from '../../theme/colors';
import { StatusBadge, EmptyState, Button, DateRangeFilter, SearchBar } from '../../components/shared';
import type { DateRange } from '../../components/shared';
import { SkeletonLoader } from '../../components/shared/SkeletonLoader';
import { SwipeableRow } from '../../components/shared/SwipeableRow';
import { FloatingActionButton } from '../../components/shared/FloatingActionButton';
import { EnhancedRefreshControl } from '../../components/shared/EnhancedRefreshControl';
import { AnimatedListItem } from '../../components/shared/AnimatedComponents';
import { haptic } from '../../utils/haptics';
import { useToast } from '../../components/shared/Toast';
import { billingApi } from '../../services/api';
import { formatCurrency, formatDate } from '../../utils';
import { exportData, showExportDialog } from '../../utils/export';
import { importData, showImportResult } from '../../utils/import';

interface Payment {
  id: string;
  payment_mode: string;
  amount: number;
  payment_date: string;
  party?: { id: string; name: string };
  type?: string;
}

export default function PaymentsScreen() {
  const { colors } = useTheme();
  const toast = useToast();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange>({ startDate: null, endDate: null });
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'in' | 'out'>('all');

  const fetchPayments = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true); else setLoading(true);
      const res = await billingApi.payments({ 
        limit: 50,
        startDate: dateRange.startDate?.toISOString(),
        endDate: dateRange.endDate?.toISOString(),
      });
      setPayments(res.data?.data || []);
    } catch { toast.error('Failed to load payments'); }
    finally { setLoading(false); setRefreshing(false); }
  }, [dateRange, toast]);

  useEffect(() => { fetchPayments(); }, [dateRange]);

  const handleExport = (format: 'csv' | 'json' | 'excel') => {
    exportData({
      data: filteredPayments,
      filename: 'payments',
      format,
    });
  };

  const handleImport = async () => {
    try {
      const result = await importData<{ party_name?: string; amount: string; payment_mode?: string; payment_date?: string }>({
        requiredFields: ['amount'],
      });
      
      if (result.success && result.data.length > 0) {
        toast.success(`Imported ${result.data.length} payments`);
        showImportResult(result);
        fetchPayments(true);
      } else if (result.errors.length > 0) {
        showImportResult(result);
      }
    } catch {
      toast.error('Import failed');
    }
  };

  // Calculate totals
  const totalIn = payments.filter(p => p.type === 'IN').reduce((s, p) => s + p.amount, 0);
  const totalOut = payments.filter(p => p.type === 'OUT').reduce((s, p) => s + p.amount, 0);

  // Filter by tab and search
  const filteredPayments = useMemo(() => {
    let result = payments;
    
    // Filter by tab
    if (activeTab === 'in') {
      result = result.filter(p => p.type === 'IN');
    } else if (activeTab === 'out') {
      result = result.filter(p => p.type === 'OUT');
    }
    
    // Filter by search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(p => 
        p.party?.name?.toLowerCase().includes(q) ||
        p.payment_mode?.toLowerCase().includes(q)
      );
    }
    
    return result;
  }, [payments, activeTab, search]);

  const renderItem = ({ item, index }: { item: Payment; index: number }) => {
    const swipeActions = [
      {
        icon: 'eye',
        color: '#FFFFFF',
        backgroundColor: colors.primary,
        onPress: () => {
          haptic.light();
          navigation.navigate('PaymentDetail', { id: item.id });
        },
      },
      {
        icon: 'share-2',
        color: '#FFFFFF',
        backgroundColor: colors.success,
        onPress: () => {
          haptic.light();
          toast.info('Sharing payment receipt...');
        },
      },
    ];

    return (
      <AnimatedListItem index={index} delay={30}>
        <SwipeableRow rightActions={swipeActions}>
          <TouchableOpacity
            style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, ...Shadow.sm }]}
            onPress={() => {
              haptic.light();
              navigation.navigate('PaymentDetail', { id: item.id });
            }}
            activeOpacity={0.7}
          >
            <View style={styles.left}>
              <Text style={[styles.partyName, { color: colors.text }]}>{item.party?.name || 'N/A'}</Text>
              <Text style={[styles.mode, { color: colors.textSecondary }]}>{item.payment_mode}</Text>
              <Text style={[styles.date, { color: colors.textTertiary }]}>{formatDate(item.payment_date)}</Text>
            </View>
            <View style={styles.right}>
              <Text style={[styles.amount, { color: item.type === 'IN' ? colors.success : colors.error }]}>
                {item.type === 'IN' ? '+' : '-'}{formatCurrency(item.amount)}
              </Text>
            </View>
          </TouchableOpacity>
        </SwipeableRow>
      </AnimatedListItem>
    );
  };

  const renderSkeleton = () => (
    <View style={styles.list}>
      {[1, 2, 3, 4, 5].map((i) => (
        <View key={i} style={[styles.card, { backgroundColor: colors.card, marginBottom: Spacing.sm }]}>
          <View style={styles.left}>
            <SkeletonLoader width={120} height={16} style={{ marginBottom: 6 }} />
            <SkeletonLoader width={80} height={12} style={{ marginBottom: 4 }} />
            <SkeletonLoader width={60} height={12} />
          </View>
          <View style={styles.right}>
            <SkeletonLoader width={80} height={18} />
          </View>
        </View>
      ))}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Search Bar */}
      <View style={styles.searchRow}>
        <SearchBar
          value={search}
          onChangeText={setSearch}
          placeholder="Search payments..."
        />
      </View>

      {/* Tabs */}
      <View style={styles.tabsRow}>
        {(['all', 'in', 'out'] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[
              styles.tabBtn,
              activeTab === tab && { backgroundColor: colors.primary },
              activeTab !== tab && { backgroundColor: colors.surface },
            ]}
            onPress={() => {
              haptic.selection();
              setActiveTab(tab);
            }}
          >
            <Text
              style={[
                styles.tabText,
                { color: activeTab === tab ? '#fff' : colors.textSecondary },
              ]}
            >
              {tab === 'all' ? 'All' : tab === 'in' ? 'Received' : 'Paid'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Filters Row */}
      <View style={styles.filtersRow}>
        <DateRangeFilter value={dateRange} onChange={setDateRange} />
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
            showExportDialog({ data: filteredPayments, filename: 'payments', onExport: handleExport });
          }}
        >
          <Icon name="download" size={18} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Stats Header */}
      <View style={[styles.statsHeader, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.statItem}>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Received</Text>
          <Text style={[styles.statValue, { color: colors.success }]}>{formatCurrency(totalIn)}</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <View style={styles.statItem}>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Paid</Text>
          <Text style={[styles.statValue, { color: colors.error }]}>{formatCurrency(totalOut)}</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <View style={styles.statItem}>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Net</Text>
          <Text style={[styles.statValue, { color: colors.primary }]}>{formatCurrency(totalIn - totalOut)}</Text>
        </View>
      </View>

      {loading ? renderSkeleton() : (
        <FlatList
          data={filteredPayments}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={
            <EnhancedRefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchPayments(true)}
            />
          }
          ListEmptyComponent={
            <EmptyState 
              title="No Payments" 
              description="Payment history will appear here" 
              icon={<Text style={{ fontSize: 48 }}>💰</Text>} 
              action={
                <Button 
                  title="Record Payment" 
                  onPress={() => {
                    haptic.light();
                    navigation.navigate('RecordPayment', { type: 'IN' });
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
            navigation.navigate('RecordPayment', { type: 'IN' });
          }}
          label="Record Payment"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchRow: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  tabsRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  tabBtn: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
  },
  tabText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  filtersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statsHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    paddingVertical: Spacing.md,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: FontSize.xs,
    marginBottom: 2,
  },
  statValue: {
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  statDivider: {
    width: 1,
    marginVertical: Spacing.xs,
  },
  list: { padding: Spacing.lg, paddingBottom: 100 },
  card: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.lg, borderRadius: BorderRadius.lg, borderWidth: 1, marginBottom: Spacing.sm },
  left: { flex: 1 },
  partyName: { fontSize: FontSize.md, fontWeight: '600' },
  mode: { fontSize: FontSize.xs, marginTop: 2 },
  date: { fontSize: FontSize.xs, marginTop: 2 },
  right: { alignItems: 'flex-end' },
  amount: { fontSize: FontSize.md, fontWeight: '700' },
});
