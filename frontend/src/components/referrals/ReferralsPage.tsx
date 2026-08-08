import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import {
  Gift, Copy, Share2, Trophy, Users, IndianRupee, Check, ArrowRight,
  Lock, Sparkles, Clock, RefreshCw, CalendarCheck,
} from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle, Badge } from '@/components/ui';
import { StatCard } from '@/components/shared/stat-card';
import { DataTable } from '@/components/shared/data-table';
import { SectionLoader } from '@/components/shared/loading';
import { referralApi, authApi } from '@/lib/api';
import { useAppDispatch } from '@/hooks';
import { setTrialInfo } from '@/store/authSlice';
import { formatDate, formatCurrency } from '@/utils';
import type { ReferralDashboard, ReferralEntry } from '@/types';
import toast from 'react-hot-toast';

interface LeaderboardEntry {
  rank: number;
  name: string;
  referrals: number;
  earnings: number;
}

// Status display helpers — use translation keys at render time
const STATUS_KEY: Record<string, string> = {
  PENDING: 'status_pending',
  APPLIED: 'status_applied',
  COMPLETED: 'status_completed',
  REWARDED: 'status_rewarded',
  EXPIRED: 'status_expired',
};

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'default' | 'destructive'> = {
  PENDING: 'default',
  APPLIED: 'warning',
  COMPLETED: 'success',
  REWARDED: 'success',
  EXPIRED: 'destructive',
};

export default function ReferralsPage() {
  const { t } = useTranslation(['referrals', 'common']);
  const dispatch = useAppDispatch();
  const [data, setData] = useState<ReferralDashboard | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  // A failed my-referrals call must render an error, not the locked/upsell
  // screen — Promise.allSettled never rejects, so a catch/toast here was dead
  // code and an API outage looked like "upgrade to unlock referrals".
  const [loadError, setLoadError] = useState(false);
  const [redeeming, setRedeeming] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    setLoadError(false);
    const [refRes, lbRes] = await Promise.allSettled([
      referralApi.myReferrals(),
      referralApi.leaderboard(),
    ]);

    if (refRes.status === 'fulfilled' && refRes.value.data?.data) {
      setData(refRes.value.data.data);
    } else if (refRes.status === 'rejected') {
      setLoadError(true);
      toast.error(t('referrals:load_error'));
    }
    if (lbRes.status === 'fulfilled' && lbRes.value.data?.data) {
      setLeaderboard(lbRes.value.data.data);
    }
    setLoading(false);
  };

  const handleCopyCode = () => {
    if (!data?.referralCode) return;
    navigator.clipboard.writeText(data.referralCode);
    setCopied(true);
    toast.success(t('referrals:code_copied'));
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = () => {
    if (!data?.referralCode) return;
    const shareText = t('referrals:share_text', { code: data.referralCode });
    if (navigator.share) {
      navigator.share({ title: 'Bahi Khata Pro', text: shareText });
    } else {
      navigator.clipboard.writeText(shareText);
      toast.success(t('referrals:share_link_copied'));
    }
  };

  const handleRedeemRewards = async () => {
    if (!data || data.redeemableDays <= 0) return;
    try {
      setRedeeming(true);
      const res = await referralApi.redeemRewards();
      toast.success(res.data?.message || t('referrals:redeem_success'));
      // Refresh subscription info in global state
      const meRes = await authApi.me();
      if (meRes.data?.data?.trial) dispatch(setTrialInfo(meRes.data.data.trial));
      await fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('referrals:redeem_error'));
    } finally {
      setRedeeming(false);
    }
  };

  const referralColumns = [
    {
      key: 'referred_name', header: t('referrals:col_name'),
      render: (r: ReferralEntry) => <span className="font-medium">{r.referred_name}</span>,
    },
    {
      key: 'referred_phone', header: t('referrals:col_phone'),
      render: (r: ReferralEntry) => <span className="text-muted-foreground font-mono text-xs">{r.referred_phone}</span>,
    },
    {
      key: 'status', header: t('referrals:col_status'),
      render: (r: ReferralEntry) => (
        <Badge variant={STATUS_VARIANT[r.status] || 'default'}>
          {t(`referrals:${STATUS_KEY[r.status]}`) || r.status}
        </Badge>
      ),
    },
    {
      key: 'reward_amount', header: t('referrals:col_reward'),
      render: (r: ReferralEntry) => (
        r.status === 'COMPLETED' || r.status === 'REWARDED'
          ? <span className="text-emerald-400 font-semibold">{formatCurrency(r.reward_amount)} • {t('referrals:days_left', { count: r.redeemable_days - r.redeemed_days })}</span>
          : <span className="text-muted-foreground text-xs">{t('referrals:pending_purchase')}</span>
      ),
    },
    {
      key: 'created_at', header: t('referrals:col_date'),
      render: (r: ReferralEntry) => formatDate(r.created_at),
    },
  ];

  if (loading) return <SectionLoader />;

  // ─── Load failure — distinct from "not eligible" ─────
  if (loadError && !data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] px-4">
        <Card className="glass max-w-md w-full">
          <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
            <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
              <RefreshCw className="h-8 w-8 text-destructive" />
            </div>
            <div>
              <h2 className="text-lg font-semibold mb-1">{t('referrals:load_error')}</h2>
              <p className="text-sm text-muted-foreground">{t('referrals:load_error_desc')}</p>
            </div>
            <Button variant="outline" onClick={fetchData} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              {t('common:retry')}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── Not eligible (free trial user) ──────────────────
  if (!data?.isEligible) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="h-24 w-24 rounded-full bg-primary/10 flex items-center justify-center"
        >
          <Lock className="h-12 w-12 text-primary" />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <h2 className="text-2xl font-bold mb-2">{t('referrals:locked_title')}</h2>
          <p className="text-muted-foreground max-w-md">
            {t('referrals:locked_desc')}
          </p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Button onClick={() => window.location.href = '/subscription'} size="lg">
            {t('referrals:upgrade_unlock')} <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </motion.div>
        {/* How it works - teaser */}
        <Card className="glass max-w-lg w-full">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-400" /> {t('referrals:how_after_upgrade')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm text-left">
              {[
                { step: '1', icon: Share2, title: t('referrals:step1_title'), desc: t('referrals:step1_desc') },
                { step: '2', icon: Users, title: t('referrals:step2_title'), desc: t('referrals:step2_desc') },
                { step: '3', icon: CalendarCheck, title: t('referrals:step3_title'), desc: t('referrals:step3_desc') },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-2">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <item.icon className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">{item.title}</p>
                    <p className="text-xs text-muted-foreground">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── Eligible user — full dashboard ──────────────────
  return (
    <div className="space-y-6">
      {/* Hero Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl gradient-primary p-8"
      >
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <Gift className="h-8 w-8 text-white" />
            <h2 className="text-2xl font-bold text-white">{t('referrals:title')}</h2>
          </div>
          <p className="text-white/80 mb-6 max-w-lg">
            {t('referrals:invite_desc')}{' '}
            <span className="text-yellow-300 font-semibold">{t('referrals:free_days_reward')}</span> {t('referrals:for_every_friend')}
          </p>
          {/* Referral Code Box */}
          <div className="flex items-center gap-3 bg-white/10 backdrop-blur-sm rounded-xl p-4 max-w-md">
            <div className="flex-1">
              <p className="text-white/60 text-xs uppercase tracking-wider mb-1">{t('referrals:your_code')}</p>
              <p className="text-2xl font-bold text-white font-mono tracking-wider">{data.referralCode}</p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleCopyCode}
                className="bg-white/20 hover:bg-white/30 text-white border-0"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleShare}
                className="bg-white/20 hover:bg-white/30 text-white border-0"
              >
                <Share2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
        <div className="absolute top-0 right-0 h-full w-1/3 opacity-10">
          <Gift className="h-64 w-64 text-white absolute -top-8 -right-8" />
        </div>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard title={t('referrals:total_referrals')} value={data.totalReferrals} icon={Users} iconColor="text-blue-400" />
        <StatCard title={t('referrals:successful')} value={data.successfulReferrals} icon={Check} iconColor="text-emerald-400" />
        <StatCard title={t('referrals:pending')} value={data.pendingReferrals} icon={Clock} iconColor="text-amber-400" />
        <StatCard title={t('referrals:total_earned')} value={formatCurrency(data.totalRewardAmount)} icon={IndianRupee} iconColor="text-purple-400" />
      </div>

      {/* Redeem Rewards Banner */}
      {data.redeemableDays > 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <Card className="border-emerald-500/50 bg-emerald-500/10">
            <CardContent className="flex flex-col sm:flex-row items-start sm:items-center gap-4 py-4">
              <div className="h-12 w-12 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                <Sparkles className="h-6 w-6 text-emerald-400" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-emerald-400">
                  {t('referrals:redeemable_days', { count: data.redeemableDays })}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {t('referrals:redeem_desc', { count: data.redeemableDays })}
                </p>
              </div>
              <Button
                onClick={handleRedeemRewards}
                disabled={redeeming}
                className="bg-emerald-500 hover:bg-emerald-600 text-white shrink-0"
              >
                {redeeming ? (
                  <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> {t('referrals:redeeming')}</>
                ) : (
                  <><CalendarCheck className="h-4 w-4 mr-2" /> {t('referrals:redeem_button', { count: data.redeemableDays })}</>
                )}
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* How it works */}
      <Card className="glass">
        <CardHeader>
          <CardTitle className="text-base">{t('referrals:how_it_works')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { step: '1', title: t('referrals:step1_title'), desc: t('referrals:step1_desc'), icon: Share2 },
              { step: '2', title: t('referrals:step2_title'), desc: t('referrals:step2_desc'), icon: Users },
              { step: '3', title: t('referrals:step3_title'), desc: t('referrals:step3_desc'), icon: CalendarCheck },
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-primary font-bold">{item.step}</span>
                </div>
                <div>
                  <p className="font-medium text-sm">{item.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                </div>
                {i < 2 && <ArrowRight className="h-4 w-4 text-muted-foreground hidden md:block mt-3" />}
              </div>
            ))}
          </div>
          <div className="mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-sm text-amber-500">
            <strong>{t('referrals:note_title')}</strong> {t('referrals:note_desc')}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* My Referrals Table */}
        <Card className="glass">
          <CardHeader>
            <CardTitle className="text-base">{t('referrals:my_referrals')}</CardTitle>
          </CardHeader>
          <CardContent>
            {data.referrals.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                {t('referrals:no_referrals')}
              </div>
            ) : (
              <DataTable columns={referralColumns} data={data.referrals} />
            )}
          </CardContent>
        </Card>

        {/* Leaderboard */}
        <Card className="glass">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Trophy className="h-5 w-5 text-amber-400" /> {t('referrals:leaderboard')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {leaderboard.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">{t('referrals:no_leaderboard')}</div>
            ) : (
              <div className="space-y-3">
                {leaderboard.map((entry, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                      entry.name === 'You' ? 'bg-primary/10 border border-primary/20' : 'hover:bg-muted/30'
                    }`}
                  >
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold ${
                      entry.rank === 1 ? 'bg-amber-500/20 text-amber-400' :
                      entry.rank === 2 ? 'bg-gray-400/20 text-gray-300' :
                      entry.rank === 3 ? 'bg-orange-500/20 text-orange-400' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      {entry.rank <= 3 ? ['🥇', '🥈', '🥉'][entry.rank - 1] : `#${entry.rank}`}
                    </div>
                    <div className="flex-1">
                      <p className={`text-sm font-medium ${entry.name === 'You' ? 'text-primary' : ''}`}>{entry.name}</p>
                      <p className="text-xs text-muted-foreground">{entry.referrals} {t('referrals:successful_referrals')}</p>
                    </div>
                    <span className="text-sm font-semibold text-emerald-400">{formatCurrency(entry.earnings)}</span>
                  </motion.div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
