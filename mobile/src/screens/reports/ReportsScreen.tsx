import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../theme';
import { FontSize, Spacing, BorderRadius, Shadow } from '../../theme/colors';

const reportTypes = [
  { label: 'Day Book', icon: '📅', description: 'Daily transaction summary', screen: 'DayBookReport' },
  { label: 'Trial Balance', icon: '⚖️', description: 'Debit & credit balances', screen: 'TrialBalanceReport' },
  { label: 'Profit & Loss', icon: '📈', description: 'Revenue vs expenses', screen: 'ProfitLossReport' },
  { label: 'Balance Sheet', icon: '🏦', description: 'Assets, liabilities & equity', screen: 'BalanceSheetReport' },
  { label: 'Outstanding', icon: '🔔', description: 'Pending receivables & payables', screen: 'OutstandingReport' },
];

export default function ReportsScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<any>();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, { color: colors.text }]}>Reports</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Financial reports and analytics
        </Text>
        {reportTypes.map((report) => (
          <TouchableOpacity
            key={report.label}
            style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, ...Shadow.sm }]}
            activeOpacity={0.7}
            onPress={() => navigation.navigate(report.screen)}
          >
            <Text style={styles.icon}>{report.icon}</Text>
            <View style={styles.cardInfo}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>{report.label}</Text>
              <Text style={[styles.cardDesc, { color: colors.textSecondary }]}>{report.description}</Text>
            </View>
            <Text style={{ color: colors.textTertiary, fontSize: 18 }}>›</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.lg, paddingBottom: 100 },
  title: { fontSize: FontSize.xxl, fontWeight: '700', marginBottom: 4 },
  subtitle: { fontSize: FontSize.sm, marginBottom: Spacing.xl },
  card: { flexDirection: 'row', alignItems: 'center', padding: Spacing.lg, borderRadius: BorderRadius.lg, borderWidth: 1, marginBottom: Spacing.sm },
  icon: { fontSize: 28, marginRight: Spacing.md },
  cardInfo: { flex: 1 },
  cardTitle: { fontSize: FontSize.md, fontWeight: '600' },
  cardDesc: { fontSize: FontSize.xs, marginTop: 2 },
});
