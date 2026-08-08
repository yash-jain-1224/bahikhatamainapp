import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { useTheme } from '../../theme';
import { FontSize, Spacing, BorderRadius, Shadow } from '../../theme/colors';
import { StatCard, Button } from '../../components/shared';
import { useToast } from '../../components/shared/Toast';
import { subscriptionApi, referralApi } from '../../services/api';
import { useAppSelector } from '../../hooks';
import { formatCurrency, formatDate } from '../../utils';
import type { Plan, Subscription } from '../../types';

type BillingCycle = 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY' | 'YEARLY';

const billingOptions: { id: BillingCycle; label: string; discount?: string }[] = [
  { id: 'MONTHLY', label: 'Monthly' },
  { id: 'QUARTERLY', label: 'Quarterly', discount: '10% off' },
  { id: 'HALF_YEARLY', label: '6 Months', discount: '15% off' },
  { id: 'YEARLY', label: 'Yearly', discount: '25% off' },
];

export default function SubscriptionScreen() {
  const { colors } = useTheme();
  const toast = useToast();
  const trialInfo = useAppSelector((s) => s.auth.trialInfo);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [current, setCurrent] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('MONTHLY');
  const [subscribing, setSubscribing] = useState(false);

  // Referral code
  const [referralCode, setReferralCode] = useState('');
  const [referralApplied, setReferralApplied] = useState(false);
  const [applyingReferral, setApplyingReferral] = useState(false);
  const [canApplyReferral, setCanApplyReferral] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [plansRes, currentRes, eligibilityRes] = await Promise.allSettled([
        subscriptionApi.plans(),
        subscriptionApi.current(),
        referralApi.eligibility(),
      ]);
      if (plansRes.status === 'fulfilled') setPlans(plansRes.value.data?.data || []);
      if (currentRes.status === 'fulfilled') setCurrent(currentRes.value.data?.data || null);
      if (eligibilityRes.status === 'fulfilled') {
        setCanApplyReferral(eligibilityRes.value.data?.data?.canApplyReferral ?? false);
      }
    } catch {} finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const handleApplyReferral = async () => {
    if (!referralCode.trim()) return;
    try {
      setApplyingReferral(true);
      await referralApi.apply(referralCode.trim().toUpperCase());
      setReferralApplied(true);
      toast.success('Referral code applied! You\'ll get bonus days.');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Invalid referral code');
    } finally {
      setApplyingReferral(false);
    }
  };

  const handleSubscribe = async () => {
    if (!selectedPlan) return;
    try {
      setSubscribing(true);
      await subscriptionApi.subscribe({ planId: selectedPlan, billingCycle });
      toast.success('Subscribed successfully!');
      fetchData();
      setSelectedPlan(null);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to subscribe');
    } finally {
      setSubscribing(false);
    }
  };

  const getPrice = (plan: Plan) => {
    const monthlyPrice = Number(plan.price_monthly) || 0;
    switch (billingCycle) {
      case 'QUARTERLY': return monthlyPrice * 3 * 0.9;
      case 'HALF_YEARLY': return monthlyPrice * 6 * 0.85;
      case 'YEARLY': return monthlyPrice * 12 * 0.75;
      default: return monthlyPrice;
    }
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
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
        {/* Current Plan */}
        {current && (
          <View style={[styles.currentCard, { backgroundColor: colors.primary + '10', borderColor: colors.primary + '30' }]}>
            <Text style={[styles.currentTitle, { color: colors.primary }]}>Current Plan</Text>
            <Text style={[styles.planName, { color: colors.text }]}>{current.plan.name}</Text>
            <Text style={[styles.planDetail, { color: colors.textSecondary }]}>
              {current.billing_cycle} · Expires {formatDate(current.current_period_end)}
            </Text>
          </View>
        )}

        {/* Trial Info */}
        {trialInfo && !trialInfo.expired && (
          <View style={[styles.trialCard, { backgroundColor: colors.warningLight, borderColor: colors.warning + '30' }]}>
            <Text style={[styles.trialText, { color: colors.text }]}>
              ⏳ {trialInfo.daysRemaining} days remaining in your trial
            </Text>
          </View>
        )}

        {/* Referral Code Input */}
        {canApplyReferral && !referralApplied && (
          <View style={[styles.referralCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.referralTitle, { color: colors.text }]}>Have a referral code?</Text>
            <View style={styles.referralRow}>
              <TextInput
                style={[styles.referralInput, { backgroundColor: colors.surfaceSecondary, color: colors.text, borderColor: colors.border }]}
                placeholder="Enter code"
                placeholderTextColor={colors.textTertiary}
                value={referralCode}
                onChangeText={setReferralCode}
                autoCapitalize="characters"
              />
              <TouchableOpacity
                style={[styles.referralBtn, { backgroundColor: colors.primary, opacity: applyingReferral ? 0.7 : 1 }]}
                onPress={handleApplyReferral}
                disabled={applyingReferral || !referralCode.trim()}
              >
                <Text style={styles.referralBtnText}>{applyingReferral ? '...' : 'Apply'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {referralApplied && (
          <View style={[styles.referralSuccess, { backgroundColor: colors.success + '15' }]}>
            <Text style={[styles.referralSuccessText, { color: colors.success }]}>
              ✓ Referral code applied! You'll get bonus trial days.
            </Text>
          </View>
        )}

        {/* Billing Cycle Selector */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Billing Cycle</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.billingScroll}>
          {billingOptions.map((opt) => (
            <TouchableOpacity
              key={opt.id}
              style={[
                styles.billingOption,
                {
                  backgroundColor: billingCycle === opt.id ? colors.primary : colors.surfaceSecondary,
                  borderColor: billingCycle === opt.id ? colors.primary : colors.border,
                },
              ]}
              onPress={() => setBillingCycle(opt.id)}
            >
              <Text
                style={[
                  styles.billingLabel,
                  { color: billingCycle === opt.id ? '#fff' : colors.text },
                ]}
              >
                {opt.label}
              </Text>
              {opt.discount && (
                <Text
                  style={[
                    styles.billingDiscount,
                    { color: billingCycle === opt.id ? '#fff' : colors.success },
                  ]}
                >
                  {opt.discount}
                </Text>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Plans Grid */}
        <Text style={[styles.sectionTitle, { color: colors.text, marginTop: Spacing.lg }]}>Available Plans</Text>
        {plans.map((plan) => (
          <TouchableOpacity
            key={plan.id}
            style={[
              styles.planCard,
              {
                backgroundColor: colors.card,
                borderColor: selectedPlan === plan.id ? colors.primary : colors.border,
                borderWidth: selectedPlan === plan.id ? 2 : 1,
                ...Shadow.sm,
              },
            ]}
            onPress={() => setSelectedPlan(plan.id)}
            activeOpacity={0.7}
          >
            <View style={styles.planHeader}>
              <Text style={[styles.planCardName, { color: colors.text }]}>{plan.name}</Text>
              {plan.name.toLowerCase().includes('pro') && (
                <Text style={[styles.popularBadge, { backgroundColor: colors.primary }]}>POPULAR</Text>
              )}
            </View>
            {plan.description && (
              <Text style={[styles.planDesc, { color: colors.textSecondary }]}>{plan.description}</Text>
            )}
            <View style={styles.priceRow}>
              <Text style={[styles.price, { color: colors.primary }]}>
                {formatCurrency(getPrice(plan))}
              </Text>
              <Text style={[styles.pricePeriod, { color: colors.textTertiary }]}>
                /{billingCycle === 'MONTHLY' ? 'month' : billingCycle === 'QUARTERLY' ? 'quarter' : billingCycle === 'HALF_YEARLY' ? '6 months' : 'year'}
              </Text>
            </View>
          </TouchableOpacity>
        ))}

        {selectedPlan && (
          <Button
            title={subscribing ? 'Processing...' : 'Subscribe Now'}
            onPress={handleSubscribe}
            disabled={subscribing}
            fullWidth
            size="lg"
            style={{ marginTop: Spacing.lg }}
          />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: Spacing.lg, paddingBottom: 100 },
  currentCard: { borderRadius: BorderRadius.lg, borderWidth: 1, padding: Spacing.xl, marginBottom: Spacing.xl },
  currentTitle: { fontSize: FontSize.xs, fontWeight: '600', textTransform: 'uppercase', marginBottom: Spacing.xs },
  planName: { fontSize: FontSize.xl, fontWeight: '700' },
  planDetail: { fontSize: FontSize.sm, marginTop: Spacing.xs },
  trialCard: { borderRadius: BorderRadius.md, borderWidth: 1, padding: Spacing.md, marginBottom: Spacing.lg },
  trialText: { fontSize: FontSize.sm, fontWeight: '500', textAlign: 'center' },
  referralCard: { borderRadius: BorderRadius.lg, borderWidth: 1, padding: Spacing.lg, marginBottom: Spacing.lg },
  referralTitle: { fontSize: FontSize.sm, fontWeight: '600', marginBottom: Spacing.sm },
  referralRow: { flexDirection: 'row', gap: Spacing.sm },
  referralInput: {
    flex: 1,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  referralBtn: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: BorderRadius.md, justifyContent: 'center' },
  referralBtnText: { color: '#fff', fontWeight: '600', fontSize: FontSize.sm },
  referralSuccess: { padding: Spacing.md, borderRadius: BorderRadius.md, marginBottom: Spacing.lg },
  referralSuccessText: { fontSize: FontSize.sm, fontWeight: '500', textAlign: 'center' },
  sectionTitle: { fontSize: FontSize.lg, fontWeight: '700', marginBottom: Spacing.md },
  billingScroll: { gap: Spacing.sm, paddingBottom: Spacing.sm },
  billingOption: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    alignItems: 'center',
    marginRight: Spacing.sm,
  },
  billingLabel: { fontSize: FontSize.sm, fontWeight: '600' },
  billingDiscount: { fontSize: FontSize.xs, fontWeight: '500', marginTop: 2 },
  planCard: { borderRadius: BorderRadius.lg, padding: Spacing.xl, marginBottom: Spacing.md },
  planHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  planCardName: { fontSize: FontSize.lg, fontWeight: '700', marginBottom: 4 },
  popularBadge: {
    color: '#fff',
    fontSize: FontSize.xs,
    fontWeight: '700',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
    overflow: 'hidden',
  },
  planDesc: { fontSize: FontSize.sm, marginBottom: Spacing.sm },
  priceRow: { flexDirection: 'row', alignItems: 'baseline' },
  price: { fontSize: FontSize.xl, fontWeight: '700' },
  pricePeriod: { fontSize: FontSize.sm, marginLeft: 4 },
});
