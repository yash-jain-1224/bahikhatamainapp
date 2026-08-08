import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Share,
  RefreshControl,
  Clipboard,
  ActivityIndicator,
} from 'react-native';
import { useTheme } from '../../theme';
import { FontSize, Spacing, BorderRadius, Shadow } from '../../theme/colors';
import { Button, StatCard, EmptyState } from '../../components/shared';
import { useToast } from '../../components/shared/Toast';
import { referralApi } from '../../services/api';
import { formatCurrency, formatDate } from '../../utils';
import type { ReferralDashboard } from '../../types';

interface LeaderboardEntry {
  rank: number;
  name: string;
  referrals: number;
  earnings: number;
}

export default function ReferralsScreen() {
  const { colors } = useTheme();
  const toast = useToast();
  const [data, setData] = useState<ReferralDashboard | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [redeeming, setRedeeming] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [refRes, lbRes] = await Promise.allSettled([
        referralApi.myReferrals(),
        referralApi.leaderboard(),
      ]);

      if (refRes.status === 'fulfilled' && refRes.value.data?.data) {
        setData(refRes.value.data.data);
      }
      if (lbRes.status === 'fulfilled' && lbRes.value.data?.data) {
        setLeaderboard(lbRes.value.data.data);
      }
    } catch {
      toast.error('Failed to load referrals');
    } finally {
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

  const handleCopyCode = () => {
    if (!data?.referralCode) return;
    Clipboard.setString(data.referralCode);
    setCopied(true);
    toast.success('Code copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    if (!data?.referralCode) return;
    try {
      await Share.share({
        message: `Join Bahi Khata with my referral code: ${data.referralCode}\n\nDownload now and manage your business accounts easily!`,
      });
    } catch {}
  };

  const handleRedeemRewards = async () => {
    if (!data || (data.redeemableDays ?? 0) <= 0) return;
    try {
      setRedeeming(true);
      await referralApi.redeemRewards();
      toast.success('Rewards redeemed successfully!');
      fetchData();
    } catch {
      toast.error('Failed to redeem rewards');
    } finally {
      setRedeeming(false);
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
        <Text style={[styles.title, { color: colors.text }]}>Referrals</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Invite friends and earn rewards
        </Text>

        {/* Referral Code Card */}
        {data?.referralCode && (
          <View style={[styles.codeCard, { backgroundColor: colors.primary + '10', borderColor: colors.primary + '30' }]}>
            <Text style={[styles.codeLabel, { color: colors.textSecondary }]}>Your Referral Code</Text>
            <Text style={[styles.code, { color: colors.primary }]}>{data.referralCode}</Text>
            <View style={styles.codeActions}>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: copied ? colors.success : colors.primary }]}
                onPress={handleCopyCode}
              >
                <Text style={styles.actionBtnText}>{copied ? '✓ Copied' : '📋 Copy'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: colors.info }]}
                onPress={handleShare}
              >
                <Text style={styles.actionBtnText}>📤 Share</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Stats */}
        {data && (
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <StatCard title="Total Referrals" value={String(data.totalReferrals)} color={colors.primary} />
            </View>
            <View style={styles.statItem}>
              <StatCard title="Successful" value={String(data.successfulReferrals)} color={colors.success} />
            </View>
          </View>
        )}

        {/* Redeemable Rewards */}
        {data && (data.redeemableDays ?? 0) > 0 && (
          <View style={[styles.rewardCard, { backgroundColor: colors.success + '15', borderColor: colors.success + '30' }]}>
            <View style={styles.rewardInfo}>
              <Text style={[styles.rewardTitle, { color: colors.success }]}>🎁 Rewards Available!</Text>
              <Text style={[styles.rewardDesc, { color: colors.textSecondary }]}>
                You have {data.redeemableDays} days of free subscription
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.redeemBtn, { backgroundColor: colors.success, opacity: redeeming ? 0.7 : 1 }]}
              onPress={handleRedeemRewards}
              disabled={redeeming}
            >
              <Text style={styles.redeemBtnText}>{redeeming ? 'Redeeming...' : 'Redeem'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Leaderboard */}
        {leaderboard.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>🏆 Leaderboard</Text>
            {leaderboard.slice(0, 5).map((entry, idx) => (
              <View
                key={idx}
                style={[
                  styles.leaderRow,
                  { backgroundColor: colors.card, borderColor: colors.border },
                  idx === 0 && { borderColor: colors.warning },
                ]}
              >
                <Text style={[styles.rankText, { color: idx === 0 ? colors.warning : colors.textSecondary }]}>
                  #{entry.rank}
                </Text>
                <Text style={[styles.leaderName, { color: colors.text }]} numberOfLines={1}>
                  {entry.name}
                </Text>
                <Text style={[styles.leaderCount, { color: colors.primary }]}>
                  {entry.referrals} refs
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Referral History */}
        {data?.referrals && data.referrals.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Referral History</Text>
            {data.referrals.map((ref) => (
              <View key={ref.id} style={[styles.refCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.refInfo}>
                  <Text style={[styles.refName, { color: colors.text }]}>{ref.referred_name}</Text>
                  <Text style={[styles.refPhone, { color: colors.textSecondary }]}>{ref.referred_phone}</Text>
                </View>
                <View style={styles.refMeta}>
                  <Text
                    style={[
                      styles.refStatus,
                      {
                        backgroundColor:
                          ref.status === 'COMPLETED' || ref.status === 'REWARDED'
                            ? colors.success + '20'
                            : colors.warning + '20',
                        color:
                          ref.status === 'COMPLETED' || ref.status === 'REWARDED'
                            ? colors.success
                            : colors.warning,
                      },
                    ]}
                  >
                    {ref.status}
                  </Text>
                  <Text style={[styles.refDate, { color: colors.textTertiary }]}>{formatDate(ref.created_at)}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: Spacing.lg, paddingBottom: 100 },
  title: { fontSize: FontSize.xxl, fontWeight: '700' },
  subtitle: { fontSize: FontSize.sm, marginBottom: Spacing.xl },
  codeCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.xl,
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  codeLabel: { fontSize: FontSize.sm, marginBottom: Spacing.xs },
  code: { fontSize: 28, fontWeight: '700', letterSpacing: 4 },
  codeActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.lg },
  actionBtn: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
  },
  actionBtnText: { color: '#fff', fontWeight: '600', fontSize: FontSize.sm },
  statsRow: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.lg },
  statItem: { flex: 1 },
  rewardCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  rewardInfo: { flex: 1, marginRight: Spacing.md },
  rewardTitle: { fontSize: FontSize.md, fontWeight: '700' },
  rewardDesc: { fontSize: FontSize.sm, marginTop: 2 },
  redeemBtn: { paddingVertical: Spacing.sm, paddingHorizontal: Spacing.lg, borderRadius: BorderRadius.md },
  redeemBtnText: { color: '#fff', fontWeight: '600', fontSize: FontSize.sm },
  section: { marginBottom: Spacing.xl },
  sectionTitle: { fontSize: FontSize.lg, fontWeight: '700', marginBottom: Spacing.md },
  leaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginBottom: Spacing.sm,
  },
  rankText: { width: 30, fontSize: FontSize.md, fontWeight: '700' },
  leaderName: { flex: 1, fontSize: FontSize.sm, fontWeight: '500' },
  leaderCount: { fontSize: FontSize.sm, fontWeight: '600' },
  refCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  refInfo: { flex: 1 },
  refName: { fontSize: FontSize.md, fontWeight: '600' },
  refPhone: { fontSize: FontSize.sm, marginTop: 2 },
  refMeta: { alignItems: 'flex-end' },
  refStatus: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
    overflow: 'hidden',
    textTransform: 'uppercase',
  },
  refDate: { fontSize: FontSize.xs, marginTop: 4 },
});
