import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { useTheme } from '../../theme';
import { FontSize, Spacing, BorderRadius, Shadow } from '../../theme/colors';
import { LoadingScreen } from '../../components/shared';
import { useToast } from '../../components/shared/Toast';
import { ledgerApi } from '../../services/api';
import { formatCurrency } from '../../utils';

interface ProfitLossData {
  sales: number;
  purchases: number;
  grossProfit: number;
  expenses: number;
  otherIncome: number;
  netProfit: number;
}

export default function ProfitLossReportScreen() {
  const { colors } = useTheme();
  const toast = useToast();

  const [data, setData] = useState<ProfitLossData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      const res = await ledgerApi.profitLoss({});
      const plData = res.data?.data;
      
      if (plData && typeof plData === 'object') {
        setData({
          sales: Number(plData.sales ?? 0),
          purchases: Number(plData.purchases ?? 0),
          grossProfit: Number(plData.grossProfit ?? 0),
          expenses: Number(plData.expenses ?? 0),
          otherIncome: Number(plData.otherIncome ?? 0),
          netProfit: Number(plData.netProfit ?? 0),
        });
      }
    } catch {
      toast.error('Failed to load profit & loss');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) return <LoadingScreen />;

  const grossProfit = (data?.sales || 0) - (data?.purchases || 0);
  const netProfit = grossProfit + (data?.otherIncome || 0) - (data?.expenses || 0);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => fetchData(true)} tintColor={colors.primary} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Income Section */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.success }]}>📈 Income</Text>
          </View>
          
          <View style={styles.row}>
            <Text style={[styles.rowLabel, { color: colors.text }]}>Sales Revenue</Text>
            <Text style={[styles.rowValue, { color: colors.success }]}>
              {formatCurrency(data?.sales || 0)}
            </Text>
          </View>
          
          <View style={styles.row}>
            <Text style={[styles.rowLabel, { color: colors.text }]}>Other Income</Text>
            <Text style={[styles.rowValue, { color: colors.success }]}>
              {formatCurrency(data?.otherIncome || 0)}
            </Text>
          </View>
          
          <View style={[styles.totalRow, { borderTopColor: colors.border }]}>
            <Text style={[styles.totalLabel, { color: colors.text }]}>Total Income</Text>
            <Text style={[styles.totalValue, { color: colors.success }]}>
              {formatCurrency((data?.sales || 0) + (data?.otherIncome || 0))}
            </Text>
          </View>
        </View>

        {/* Expenses Section */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.error }]}>📉 Expenses</Text>
          </View>
          
          <View style={styles.row}>
            <Text style={[styles.rowLabel, { color: colors.text }]}>Cost of Goods (Purchases)</Text>
            <Text style={[styles.rowValue, { color: colors.error }]}>
              {formatCurrency(data?.purchases || 0)}
            </Text>
          </View>
          
          <View style={styles.row}>
            <Text style={[styles.rowLabel, { color: colors.text }]}>Operating Expenses</Text>
            <Text style={[styles.rowValue, { color: colors.error }]}>
              {formatCurrency(data?.expenses || 0)}
            </Text>
          </View>
          
          <View style={[styles.totalRow, { borderTopColor: colors.border }]}>
            <Text style={[styles.totalLabel, { color: colors.text }]}>Total Expenses</Text>
            <Text style={[styles.totalValue, { color: colors.error }]}>
              {formatCurrency((data?.purchases || 0) + (data?.expenses || 0))}
            </Text>
          </View>
        </View>

        {/* Gross Profit */}
        <View style={[styles.summaryCard, { backgroundColor: colors.primary + '10', borderColor: colors.primary + '30' }]}>
          <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Gross Profit</Text>
          <Text style={[styles.summaryValue, { color: grossProfit >= 0 ? colors.success : colors.error }]}>
            {formatCurrency(grossProfit)}
          </Text>
          <Text style={[styles.summaryFormula, { color: colors.textTertiary }]}>
            Sales - Purchases
          </Text>
        </View>

        {/* Net Profit */}
        <View style={[
          styles.netProfitCard,
          {
            backgroundColor: netProfit >= 0 ? colors.success + '15' : colors.error + '15',
            borderColor: netProfit >= 0 ? colors.success + '30' : colors.error + '30',
          },
        ]}>
          <Text style={[styles.netProfitLabel, { color: colors.text }]}>
            {netProfit >= 0 ? '🎉 Net Profit' : '📉 Net Loss'}
          </Text>
          <Text style={[styles.netProfitValue, { color: netProfit >= 0 ? colors.success : colors.error }]}>
            {formatCurrency(Math.abs(netProfit))}
          </Text>
          <Text style={[styles.summaryFormula, { color: colors.textTertiary }]}>
            Gross Profit + Other Income - Expenses
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.lg, paddingBottom: 100 },
  section: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    ...Shadow.sm,
  },
  sectionHeader: {
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  rowLabel: {
    fontSize: FontSize.sm,
  },
  rowValue: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Spacing.md,
    marginTop: Spacing.sm,
    borderTopWidth: 1,
  },
  totalLabel: {
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  totalValue: {
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  summaryCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.xl,
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  summaryLabel: {
    fontSize: FontSize.sm,
    marginBottom: Spacing.xs,
  },
  summaryValue: {
    fontSize: FontSize.xxl,
    fontWeight: '700',
  },
  summaryFormula: {
    fontSize: FontSize.xs,
    marginTop: Spacing.xs,
  },
  netProfitCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.xxl,
    alignItems: 'center',
  },
  netProfitLabel: {
    fontSize: FontSize.md,
    fontWeight: '600',
    marginBottom: Spacing.sm,
  },
  netProfitValue: {
    fontSize: 36,
    fontWeight: '700',
  },
});
