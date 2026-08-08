import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { useTheme } from '../../theme';
import { FontSize, Spacing, BorderRadius, Shadow } from '../../theme/colors';
import { format } from 'date-fns';

interface BalanceSheetItem {
  name: string;
  amount: number;
}

interface BalanceSheetData {
  asOnDate: string;
  assets: {
    currentAssets: BalanceSheetItem[];
    totalCurrentAssets: number;
  };
  liabilities: {
    currentLiabilities: BalanceSheetItem[];
    totalCurrentLiabilities: number;
  };
  equity: {
    items: BalanceSheetItem[];
    totalEquity: number;
  };
  totalAssets: number;
  totalLiabilitiesAndEquity: number;
}

const defaultBalanceSheet: BalanceSheetData = {
  asOnDate: new Date().toISOString(),
  assets: { currentAssets: [], totalCurrentAssets: 0 },
  liabilities: { currentLiabilities: [], totalCurrentLiabilities: 0 },
  equity: { items: [], totalEquity: 0 },
  totalAssets: 0,
  totalLiabilitiesAndEquity: 0,
};

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
};

export default function BalanceSheetReportScreen() {
  const { colors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<BalanceSheetData>(defaultBalanceSheet);
  const [asOnDate, setAsOnDate] = useState(new Date().toISOString().split('T')[0]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // TODO: Replace with actual API call
      // const response = await ledgerApi.balanceSheet({ asOnDate });
      // setData(response.data?.data ?? defaultBalanceSheet);
      
      // Mock data for demonstration
      setTimeout(() => {
        setData({
          asOnDate,
          assets: {
            currentAssets: [
              { name: 'Cash in Hand', amount: 50000 },
              { name: 'Bank Balance', amount: 150000 },
              { name: 'Accounts Receivable', amount: 75000 },
              { name: 'Inventory', amount: 120000 },
            ],
            totalCurrentAssets: 395000,
          },
          liabilities: {
            currentLiabilities: [
              { name: 'Accounts Payable', amount: 45000 },
              { name: 'Short-term Loans', amount: 30000 },
            ],
            totalCurrentLiabilities: 75000,
          },
          equity: {
            items: [
              { name: 'Owner\'s Capital', amount: 250000 },
              { name: 'Retained Earnings', amount: 70000 },
            ],
            totalEquity: 320000,
          },
          totalAssets: 395000,
          totalLiabilitiesAndEquity: 395000,
        });
        setLoading(false);
      }, 500);
    } catch (error) {
      setData(defaultBalanceSheet);
      setLoading(false);
    }
  }, [asOnDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const renderSection = (
    title: string,
    items: BalanceSheetItem[],
    total: number,
    color: string
  ) => (
    <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.sectionHeader, { borderBottomColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color }]}>{title}</Text>
      </View>
      {items.length > 0 ? (
        <>
          {items.map((item, idx) => (
            <View
              key={idx}
              style={[
                styles.row,
                { borderBottomColor: colors.border },
                idx === items.length - 1 && styles.lastRow,
              ]}
            >
              <Text style={[styles.itemName, { color: colors.text }]}>{item.name}</Text>
              <Text style={[styles.itemAmount, { color: colors.text }]}>
                {formatCurrency(item.amount)}
              </Text>
            </View>
          ))}
          <View style={[styles.totalRow, { backgroundColor: colors.surfaceSecondary }]}>
            <Text style={[styles.totalLabel, { color: colors.textSecondary }]}>Total</Text>
            <Text style={[styles.totalAmount, { color }]}>{formatCurrency(total)}</Text>
          </View>
        </>
      ) : (
        <View style={styles.emptySection}>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No items</Text>
        </View>
      )}
    </View>
  );

  if (loading && !refreshing) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
          Loading balance sheet...
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {/* Date Header */}
        <View style={[styles.dateCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.dateLabel, { color: colors.textSecondary }]}>As on Date</Text>
          <TouchableOpacity
            style={[styles.dateButton, { backgroundColor: colors.surfaceSecondary }]}
            onPress={() => {
              // TODO: Show date picker
            }}
          >
            <Text style={[styles.dateValue, { color: colors.text }]}>
              {format(new Date(asOnDate), 'dd MMM yyyy')}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Assets Section */}
        {renderSection(
          '📦 Assets',
          data.assets.currentAssets,
          data.assets.totalCurrentAssets,
          colors.success
        )}

        {/* Liabilities Section */}
        {renderSection(
          '💳 Liabilities',
          data.liabilities.currentLiabilities,
          data.liabilities.totalCurrentLiabilities,
          colors.error
        )}

        {/* Equity Section */}
        {renderSection(
          '🏦 Equity',
          data.equity.items,
          data.equity.totalEquity,
          colors.primary
        )}

        {/* Summary Card */}
        <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.summaryTitle, { color: colors.text }]}>Summary</Text>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Total Assets</Text>
            <Text style={[styles.summaryValue, { color: colors.success }]}>
              {formatCurrency(data.totalAssets)}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>
              Total Liabilities + Equity
            </Text>
            <Text style={[styles.summaryValue, { color: colors.primary }]}>
              {formatCurrency(data.totalLiabilitiesAndEquity)}
            </Text>
          </View>
          <View
            style={[
              styles.balanceIndicator,
              {
                backgroundColor:
                  data.totalAssets === data.totalLiabilitiesAndEquity
                    ? colors.success + '20'
                    : colors.error + '20',
              },
            ]}
          >
            <Text
              style={[
                styles.balanceText,
                {
                  color:
                    data.totalAssets === data.totalLiabilitiesAndEquity
                      ? colors.success
                      : colors.error,
                },
              ]}
            >
              {data.totalAssets === data.totalLiabilitiesAndEquity
                ? '✓ Balance Sheet is Balanced'
                : '⚠ Balance Sheet is Not Balanced'}
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.lg, paddingBottom: 100 },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: Spacing.md,
    fontSize: FontSize.sm,
  },
  dateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginBottom: Spacing.lg,
    ...Shadow.sm,
  },
  dateLabel: {
    fontSize: FontSize.sm,
    fontWeight: '500',
  },
  dateButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  dateValue: {
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  section: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginBottom: Spacing.md,
    overflow: 'hidden',
    ...Shadow.sm,
  },
  sectionHeader: {
    padding: Spacing.md,
    borderBottomWidth: 1,
  },
  sectionTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
  },
  lastRow: {
    borderBottomWidth: 0,
  },
  itemName: {
    fontSize: FontSize.sm,
  },
  itemAmount: {
    fontSize: FontSize.sm,
    fontWeight: '500',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  totalLabel: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  totalAmount: {
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  emptySection: {
    padding: Spacing.lg,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: FontSize.sm,
    fontStyle: 'italic',
  },
  summaryCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.lg,
    marginTop: Spacing.sm,
    ...Shadow.sm,
  },
  summaryTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  summaryLabel: {
    fontSize: FontSize.sm,
  },
  summaryValue: {
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  balanceIndicator: {
    marginTop: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  balanceText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
});
