import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme';
import { FontSize, Spacing, BorderRadius, Shadow } from '../../theme/colors';
import { StatCard, Avatar, BusinessAvatar } from '../../components/shared';
import { SkeletonLoader } from '../../components/shared/SkeletonLoader';
import { haptic } from '../../utils/haptics';
import { useToast } from '../../components/shared/Toast';
import { businessApi } from '../../services/api';
import { useAppSelector } from '../../hooks';
import { formatCurrency } from '../../utils';
import type { DashboardStats } from '../../types';

const { width } = Dimensions.get('window');
const cardWidth = (width - Spacing.lg * 3) / 2;

type DatePreset = 'today' | 'last_week' | 'last_month' | 'last_year';

const PRESETS: { id: DatePreset; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'last_week', label: '7 Days' },
  { id: 'last_month', label: '30 Days' },
  { id: 'last_year', label: 'Year' },
];

function getPresetRange(preset: DatePreset): { from: string; to: string } {
  const fmt = (d: Date) => d.toISOString().split('T')[0];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  switch (preset) {
    case 'today':
      return { from: fmt(today), to: fmt(today) };
    case 'last_week': {
      const from = new Date(today);
      from.setDate(from.getDate() - 6);
      return { from: fmt(from), to: fmt(today) };
    }
    case 'last_month': {
      const from = new Date(today);
      from.setDate(from.getDate() - 29);
      return { from: fmt(from), to: fmt(today) };
    }
    case 'last_year': {
      const from = new Date(today);
      from.setFullYear(from.getFullYear() - 1);
      return { from: fmt(from), to: fmt(today) };
    }
    default:
      return { from: fmt(today), to: fmt(today) };
  }
}

export default function DashboardScreen() {
  const { colors } = useTheme();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const user = useAppSelector((s) => s.auth.user);
  const business = useAppSelector((s) => s.business.currentBusiness);
  const trialInfo = useAppSelector((s) => s.auth.trialInfo);

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activePreset, setActivePreset] = useState<DatePreset>('today');

  const fetchDashboard = useCallback(async (preset: DatePreset = 'today') => {
    try {
      const { from, to } = getPresetRange(preset);
      const res = await businessApi.dashboard({ from, to });
      if (res.data?.data) {
        setStats(res.data.data);
      }
    } catch {
      toast.error('Failed to load dashboard');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchDashboard(activePreset);
  }, [fetchDashboard, activePreset]);

  const onRefresh = () => {
    haptic.light();
    setRefreshing(true);
    fetchDashboard(activePreset);
  };

  const handlePresetChange = (preset: DatePreset) => {
    haptic.selection();
    setActivePreset(preset);
  };

  const quickActions = [
    { label: 'New Purchase', icon: '📥', screen: 'PurchasesTab', params: { screen: 'PurchaseCreate' } },
    { label: 'New Sale', icon: '📤', screen: 'SalesTab', params: { screen: 'SaleCreate' } },
    { label: 'Parties', icon: '👥', screen: 'MoreTab', params: { screen: 'Parties' } },
    { label: 'Ledger', icon: '📒', screen: 'MoreTab', params: { screen: 'Ledger' } },
    { label: 'Payments', icon: '💰', screen: 'MoreTab', params: { screen: 'Payments' } },
    { label: 'Reports', icon: '📊', screen: 'MoreTab', params: { screen: 'Reports' } },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + Spacing.sm,
            backgroundColor: colors.primary,
          },
        ]}
      >
        <View style={styles.headerContent}>
          <TouchableOpacity 
            style={styles.headerLeft}
            onPress={() => navigation.navigate('MoreTab', { screen: 'BusinessSettings', params: { id: business?.id } })}
            activeOpacity={0.7}
          >
            <BusinessAvatar
              name={business?.name || 'B'}
              logoUrl={business?.logo_url}
              size={42}
            />
            <View style={styles.headerTextContainer}>
              <Text style={styles.greeting}>
                {getGreeting()}, {user?.name?.split(' ')[0] || 'there'}!
              </Text>
              <Text style={styles.businessName} numberOfLines={1}>
                {business?.name || 'No Business'}
              </Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.navigate('MoreTab', { screen: 'Profile' })}
          >
            <Avatar
              name={user?.name || 'U'}
              imageUrl={user?.avatar_url}
              size={42}
            />
          </TouchableOpacity>
        </View>

        {/* Trial Banner */}
        {trialInfo && !trialInfo.expired && trialInfo.daysRemaining !== null && trialInfo.daysRemaining <= 7 && (
          <TouchableOpacity
            style={[styles.trialBanner, { backgroundColor: 'rgba(255,255,255,0.15)' }]}
            onPress={() => navigation.navigate('MoreTab', { screen: 'Subscription' })}
          >
            <Text style={styles.trialText}>
              ⏳ {trialInfo.daysRemaining} days left in trial · Upgrade now
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Date Preset Filter */}
        <View style={styles.presetContainer}>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false} 
            contentContainerStyle={styles.presetScroll}
          >
            {PRESETS.map((preset) => (
              <TouchableOpacity
                key={preset.id}
                style={[
                  styles.presetButton,
                  {
                    backgroundColor: activePreset === preset.id ? colors.primary : colors.surfaceSecondary,
                    borderColor: activePreset === preset.id ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => handlePresetChange(preset.id)}
              >
                <Text
                  style={[
                    styles.presetText,
                    { color: activePreset === preset.id ? '#fff' : colors.textSecondary },
                  ]}
                >
                  {preset.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Stats Cards */}
        {loading ? (
          <View style={styles.statsGrid}>
            {[1, 2, 3, 4].map((i) => (
              <View key={i} style={[styles.statItem, { width: cardWidth }]}>
                <View style={[styles.statSkeletonCard, { backgroundColor: colors.card }]}>
                  <SkeletonLoader width={40} height={40} borderRadius={20} />
                  <View style={{ flex: 1, marginLeft: Spacing.md }}>
                    <SkeletonLoader width={100} height={12} style={{ marginBottom: 8 }} />
                    <SkeletonLoader width={80} height={20} />
                  </View>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.statsGrid}>
            <View style={[styles.statItem, { width: cardWidth }]}>
              <StatCard
                title="Today's Purchases"
                value={formatCurrency(stats?.purchaseToday || 0)}
                color="#6366F1"
                icon={<Text style={{ fontSize: 18 }}>📥</Text>}
              />
            </View>
            <View style={[styles.statItem, { width: cardWidth }]}>
              <StatCard
                title="Today's Sales"
                value={formatCurrency(stats?.salesToday || 0)}
                color="#10B981"
                icon={<Text style={{ fontSize: 18 }}>📤</Text>}
              />
            </View>
            <View style={[styles.statItem, { width: cardWidth }]}>
              <StatCard
                title="Receivable"
                value={formatCurrency(stats?.outstandingReceivable || 0)}
                color="#3B82F6"
                icon={<Text style={{ fontSize: 18 }}>💵</Text>}
              />
            </View>
            <View style={[styles.statItem, { width: cardWidth }]}>
              <StatCard
                title="Payable"
                value={formatCurrency(stats?.outstandingPayable || 0)}
                color="#F59E0B"
                icon={<Text style={{ fontSize: 18 }}>💸</Text>}
              />
            </View>
          </View>
        )}

        {/* Alert Cards */}
        {((stats?.lowStockAlerts ?? 0) > 0 || (stats?.partialPaymentAlerts ?? 0) > 0) && (
          <View style={styles.alertsSection}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Alerts</Text>
            {(stats?.lowStockAlerts ?? 0) > 0 && (
              <TouchableOpacity
                style={[styles.alertCard, { backgroundColor: colors.warningLight, borderColor: colors.warning + '30' }]}
                onPress={() => navigation.navigate('InventoryTab')}
              >
                <Text style={styles.alertIcon}>⚠️</Text>
                <Text style={[styles.alertText, { color: colors.text }]}>
                  {stats!.lowStockAlerts} items have low stock
                </Text>
              </TouchableOpacity>
            )}
            {(stats?.partialPaymentAlerts ?? 0) > 0 && (
              <TouchableOpacity
                style={[styles.alertCard, { backgroundColor: colors.infoLight, borderColor: colors.info + '30' }]}
                onPress={() => navigation.navigate('MoreTab', { screen: 'Payments' })}
              >
                <Text style={styles.alertIcon}>💳</Text>
                <Text style={[styles.alertText, { color: colors.text }]}>
                  {stats!.partialPaymentAlerts} pending partial payments
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Date Preset Filter */}
        <View style={styles.presetSection}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Date Range</Text>
          <View style={styles.presetButtons}>
            {PRESETS.map((preset) => (
              <TouchableOpacity
                key={preset.id}
                style={[
                  styles.presetButton,
                  {
                    backgroundColor: activePreset === preset.id ? colors.primary : colors.card,
                    borderColor: colors.border,
                    ...Shadow.sm,
                  },
                ]}
                onPress={() => handlePresetChange(preset.id)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.presetLabel,
                    { color: activePreset === preset.id ? '#FFF' : colors.text },
                  ]}
                >
                  {preset.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.quickSection}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Quick Actions</Text>
          <View style={styles.quickGrid}>
            {quickActions.map((action) => (
              <TouchableOpacity
                key={action.label}
                style={[
                  styles.quickItem,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    ...Shadow.sm,
                  },
                ]}
                onPress={() => {
                  haptic.light();
                  navigation.navigate(action.screen, action.params);
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.quickIcon}>{action.icon}</Text>
                <Text
                  style={[styles.quickLabel, { color: colors.text }]}
                  numberOfLines={1}
                >
                  {action.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xl,
    borderBottomLeftRadius: BorderRadius.xl,
    borderBottomRightRadius: BorderRadius.xl,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  headerTextContainer: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  greeting: {
    fontSize: FontSize.sm,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '500',
  },
  businessName: {
    fontSize: FontSize.xl,
    color: '#FFF',
    fontWeight: '700',
    marginTop: 2,
  },
  trialBanner: {
    marginTop: Spacing.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
  },
  trialText: {
    color: '#FFF',
    fontSize: FontSize.xs,
    fontWeight: '600',
    textAlign: 'center',
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxxxl,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: Spacing.xl,
  },
  statItem: {
    marginBottom: Spacing.md,
  },
  alertsSection: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    marginBottom: Spacing.md,
  },
  alertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginBottom: Spacing.sm,
  },
  alertIcon: {
    fontSize: 20,
    marginRight: Spacing.md,
  },
  alertText: {
    fontSize: FontSize.sm,
    fontWeight: '500',
    flex: 1,
  },
  presetSection: {
    marginBottom: Spacing.xl,
  },
  presetButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  presetButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginRight: Spacing.md,
    height: 48,
    justifyContent: 'center',
  },
  presetLabel: {
    fontSize: FontSize.sm,
    fontWeight: '500',
  },
  presetContainer: {
    marginBottom: Spacing.lg,
  },
  presetScroll: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  presetText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  quickSection: {
    marginBottom: Spacing.xl,
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  quickItem: {
    width: (width - Spacing.lg * 2 - Spacing.md * 2) / 3,
    alignItems: 'center',
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginBottom: Spacing.md,
  },
  quickIcon: {
    fontSize: 28,
    marginBottom: Spacing.sm,
  },
  quickLabel: {
    fontSize: FontSize.xs,
    fontWeight: '500',
    textAlign: 'center',
  },
  statSkeletonCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    ...Shadow.sm,
  },
});
