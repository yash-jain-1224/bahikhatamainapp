import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Crown, Check, Zap, Star, ArrowRight, Clock, AlertTriangle, Tag, Building2, RefreshCw, Receipt } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle, Badge, Input } from '@/components/ui';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { subscriptionApi, authApi, referralApi } from '@/lib/api';
import { useAppSelector, useAppDispatch } from '@/hooks';
import { setTrialInfo } from '@/store/authSlice';
import { formatCurrency, formatDate } from '@/utils';
import type { Plan, Subscription } from '@/types';
import toast from 'react-hot-toast';

interface SubscriptionInvoice {
  id: string;
  invoice_number: string;
  total_amount: number | string;
  status: string;
  created_at: string;
  paid_at?: string | null;
  subscription?: { plan?: { name?: string } };
}

const INVOICE_STATUS_VARIANT: Record<string, 'success' | 'warning' | 'destructive' | 'default'> = {
  PAID: 'success',
  PENDING: 'warning',
  FAILED: 'destructive',
  REFUNDED: 'default',
  CANCELLED: 'destructive',
};

export default function SubscriptionPage() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { t } = useTranslation(['subscription', 'common']);
  const [searchParams] = useSearchParams();
  const isSetup = searchParams.get('setup') === 'true'; // First-time plan selection after business creation
  const [plans, setPlans] = useState<Plan[]>([]);
  const [current, setCurrent] = useState<Subscription | null>(null);
  const [invoices, setInvoices] = useState<SubscriptionInvoice[]>([]);
  const [_loading, setLoading] = useState(true);
  const [plansError, setPlansError] = useState(false);
  const [subscribing, setSubscribing] = useState<string | null>(null);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [billing, setBilling] = useState<'monthly' | 'quarterly' | 'half_yearly' | 'yearly'>('monthly');
  const { trialInfo } = useAppSelector(s => s.auth);
  // Subscribing requires a business — the backend rejects the call without one
  const hasBusiness = useAppSelector(s => s.business.businesses.length > 0);

  // Referral code state
  const [canApplyReferral, setCanApplyReferral] = useState(false);
  const [referralCode, setReferralCode] = useState('');
  const [referralApplied, setReferralApplied] = useState(false);
  const [applyingReferral, setApplyingReferral] = useState(false);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      // Use allSettled so a failed "current subscription" call doesn't
      // prevent plans from loading (current may fail if no business is selected)
      const [plansRes, currentRes, eligibilityRes, invoicesRes] = await Promise.allSettled([
        subscriptionApi.plans(),
        subscriptionApi.current(),
        referralApi.eligibility(),
        subscriptionApi.invoices(),
      ]);

      if (plansRes.status === 'fulfilled' && plansRes.value.data?.data?.length) {
        setPlans(plansRes.value.data.data);
        setPlansError(false);
      } else {
        setPlansError(true);
      }

      if (currentRes.status === 'fulfilled') {
        setCurrent(currentRes.value.data?.data || null);
      }

      if (invoicesRes.status === 'fulfilled') {
        setInvoices(invoicesRes.value.data?.data || []);
      }

      if (eligibilityRes.status === 'fulfilled') {
        const apiCanApply = eligibilityRes.value.data?.data?.canApplyReferral ?? false;
        // Also gate on the current subscription: if the user already has an
        // active non-free paid plan, never show the referral code input.
        const activeSub = currentRes.status === 'fulfilled'
          ? (currentRes.value.data?.data ?? null)
          : null;
        const hasActivePaidPlan =
          activeSub !== null &&
          activeSub.status === 'ACTIVE' &&
          Number(activeSub.plan?.price_monthly ?? 0) > 0;
        setCanApplyReferral(apiCanApply && !hasActivePaidPlan);
      }
    } catch {
      // Total failure — show error state
      setPlansError(true);
    } finally {
      setLoading(false);
    }
  };

  const handleApplyReferralCode = async () => {
    if (!referralCode.trim()) return;
    try {
      setApplyingReferral(true);
      await referralApi.apply(referralCode.trim().toUpperCase());
      setReferralApplied(true);
      toast.success(t('subscription:referral_success_toast'));
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('subscription:referral_error'));
    } finally {
      setApplyingReferral(false);
    }
  };

  const handleCancelSubscription = async () => {
    try {
      setCancelling(true);
      await subscriptionApi.cancel();
      toast.success(t('subscription:cancel_success'));
      setShowCancel(false);
      // Refresh trial info so the rest of the app picks up the change
      const meRes = await authApi.me();
      if (meRes.data?.data?.trial) {
        dispatch(setTrialInfo(meRes.data.data.trial));
      }
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('subscription:cancel_error'));
    } finally {
      setCancelling(false);
    }
  };

  const handleSubscribe = async (planId: string) => {
    try {
      setSubscribing(planId);
      const cycleMap = {
        monthly: 'MONTHLY',
        quarterly: 'QUARTERLY',
        half_yearly: 'HALF_YEARLY',
        yearly: 'YEARLY',
      } as const;
      await subscriptionApi.subscribe({ planId, billingCycle: cycleMap[billing] });

      // Refresh trial info so the rest of the app knows we now have an active subscription
      const meRes = await authApi.me();
      if (meRes.data?.data?.trial) {
        dispatch(setTrialInfo(meRes.data.data.trial));
      }

      if (isSetup) {
        toast.success(t('subscription:plan_activated'));
        navigate('/dashboard');
      } else {
        toast.success(t('subscription:subscription_updated'));
        fetchData();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('subscription:failed_subscribe'));
    } finally {
      setSubscribing(null);
    }
  };

  const featureLabels: Record<string, string> = {
    ledger: t('subscription:feature_ledger'),
    purchase: t('subscription:feature_purchase'),
    purchases: t('subscription:feature_purchase'),
    sales: t('subscription:feature_sales'),
    inventory: t('subscription:feature_inventory'),
    reports: t('subscription:feature_reports'),
    reports_basic: t('subscription:feature_reports_basic'),
    reports_advanced: t('subscription:feature_reports_advanced'),
    whatsapp: t('subscription:feature_whatsapp'),
    import_export: t('subscription:feature_import_export'),
    multi_user: t('subscription:feature_multi_user'),
    payments: t('subscription:feature_payments'),
    api_access: t('subscription:feature_api_access'),
    white_label: t('subscription:feature_white_label'),
    max_items: t('subscription:feature_max_items'),
    max_parties: t('subscription:feature_max_parties'),
  };

  return (
    <div className="space-y-6">
      {/* Trial Banner */}
      {trialInfo && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {/* isTrial === false means a paid subscription — show renewal
              wording, never "free trial". Missing = true for backward compat. */}
          {trialInfo.expired ? (
            <Card className="border-red-500/50 bg-red-500/10">
              <CardContent className="flex items-center gap-4 py-4">
                <div className="h-12 w-12 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="h-6 w-6 text-red-500" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-red-500">
                    {trialInfo.isTrial === false ? t('subscription:subscription_expired') : t('subscription:trial_expired')}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {trialInfo.isTrial === false ? t('subscription:subscription_expired_desc') : t('subscription:trial_expired_desc')}
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : trialInfo.daysRemaining !== null && trialInfo.daysRemaining <= 7 ? (
            <Card className={`border-amber-500/50 ${trialInfo.daysRemaining <= 2 ? 'bg-red-500/10 border-red-500/50' : 'bg-amber-500/10'}`}>
              <CardContent className="flex items-center gap-4 py-4">
                <div className={`h-12 w-12 rounded-full flex items-center justify-center flex-shrink-0 ${trialInfo.daysRemaining <= 2 ? 'bg-red-500/20' : 'bg-amber-500/20'}`}>
                  <Clock className={`h-6 w-6 ${trialInfo.daysRemaining <= 2 ? 'text-red-500' : 'text-amber-500'}`} />
                </div>
                <div className="flex-1">
                  <h3 className={`font-semibold ${trialInfo.daysRemaining <= 2 ? 'text-red-500' : 'text-amber-500'}`}>
                    {trialInfo.isTrial === false
                      ? (trialInfo.daysRemaining === 0
                          ? t('subscription:subscription_expires_today')
                          : trialInfo.planName && trialInfo.endsAt
                            ? t('subscription:subscription_renews_on', { plan: trialInfo.planName, date: formatDate(trialInfo.endsAt) })
                            : t('subscription:subscription_days_left', { count: trialInfo.daysRemaining }))
                      : (trialInfo.daysRemaining === 0
                          ? t('subscription:trial_expires_today')
                          : t('subscription:trial_days_left', { count: trialInfo.daysRemaining }))}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {trialInfo.planName && t('subscription:currently_on_plan', { plan: trialInfo.planName }) + ' '}
                    {trialInfo.isTrial === false ? t('subscription:renew_now') : t('subscription:upgrade_now')}
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </motion.div>
      )}

      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold mb-2">{isSetup ? t('subscription:setup_title') : t('subscription:title')}</h2>
        <p className="text-muted-foreground mb-2">
          {isSetup
            ? t('subscription:setup_subtitle')
            : t('subscription:subtitle')}
        </p>
        {/* One plan covers all businesses */}
        <div className="inline-flex items-center gap-1.5 text-xs text-primary font-medium bg-primary/10 rounded-full px-3 py-1 mb-4">
          <Crown className="h-3 w-3" />
          {t('subscription:one_sub_all_biz')}
        </div>
        {isSetup && (
          <p className="text-sm text-amber-500 font-medium mb-6">
            {t('subscription:choose_plan_continue')}
          </p>
        )}

        {/* No business yet — plans can't be subscribed to until one exists */}
        {!hasBusiness && (
          <div className="max-w-md mx-auto mb-6 flex items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-left">
            <Building2 className="h-5 w-5 text-amber-500 shrink-0" />
            <p className="text-sm text-amber-500 flex-1">
              {t('subscription:create_business_first', 'Create a business first to subscribe to a plan.')}
            </p>
            <Button variant="outline" size="sm" className="shrink-0" onClick={() => navigate('/business/new')}>
              {t('subscription:create_business', 'Create business')}
            </Button>
          </div>
        )}

        {/* ── Referral Code Entry ── */}
        {/* Shown ONLY for users who have not yet purchased a paid plan and have not already applied a code */}
        {canApplyReferral && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-md mx-auto mb-6"
          >
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="pt-4 pb-4">
                {referralApplied ? (
                  <div className="flex items-center gap-3 text-emerald-400">
                    <div className="h-8 w-8 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                      <Check className="h-4 w-4" />
                    </div>
                    <div className="text-left">
                      <p className="font-semibold text-sm">{t('subscription:referral_applied')}</p>
                      <p className="text-xs text-muted-foreground">{t('subscription:referral_applied_desc')}</p>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Tag className="h-4 w-4 text-primary" />
                      <p className="text-sm font-medium">{t('subscription:have_referral')} <span className="text-muted-foreground font-normal">({t('subscription:optional')})</span></p>
                    </div>
                    <div className="flex gap-2">
                      <Input
                        placeholder={t('subscription:referral_placeholder')}
                        value={referralCode}
                        onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                        className="font-mono text-sm uppercase"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleApplyReferralCode}
                        disabled={applyingReferral || !referralCode.trim()}
                        className="shrink-0"
                      >
                        {applyingReferral ? t('subscription:applying') : t('subscription:apply_code')}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5">
                      {t('subscription:referral_once_only')}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}

        <div className="inline-flex items-center gap-1 rounded-full bg-muted p-1">
          {([
            { key: 'monthly' as const, label: t('subscription:monthly') },
            { key: 'quarterly' as const, label: t('subscription:quarterly'), badge: t('subscription:save_10') },
            { key: 'half_yearly' as const, label: t('subscription:half_yearly'), badge: t('subscription:save_15') },
            { key: 'yearly' as const, label: t('subscription:yearly'), badge: t('subscription:save_17') },
          ]).map(({ key, label, badge }) => (
            <button
              key={key}
              onClick={() => setBilling(key)}
              className={`px-3 py-2 rounded-full text-sm font-medium transition-colors ${billing === key ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {label}
              {badge && <span className="text-xs text-emerald-400 ml-1 hidden sm:inline">{badge}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className={`grid grid-cols-1 gap-6 max-w-6xl mx-auto ${plans.length <= 3 ? 'md:grid-cols-3 max-w-5xl' : 'md:grid-cols-2 lg:grid-cols-4'}`}>
        {plansError ? (
          <div className="col-span-full flex flex-col items-center justify-center py-16 text-center gap-4">
            <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="h-8 w-8 text-destructive" />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-1">{t('subscription:plans_error_title')}</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {t('subscription:plans_error_desc')}
              </p>
              <Button variant="outline" onClick={fetchData} className="gap-2">
                <RefreshCw className="h-4 w-4" />
                {t('subscription:retry')}
              </Button>
            </div>
          </div>
        ) : plans.map((plan, i) => {
          const priceMap = {
            monthly: Number(plan.price_monthly),
            quarterly: Number(plan.price_quarterly),
            half_yearly: Number(plan.price_half_yearly),
            yearly: Number(plan.price_yearly),
          };
          const billingLabelMap = {
            monthly: t('subscription:per_month'),
            quarterly: t('subscription:per_quarter'),
            half_yearly: t('subscription:per_half_year'),
            yearly: t('subscription:per_year'),
          };
          const price = priceMap[billing];
          const billingLabel = billingLabelMap[billing];
          const isPopular = plans.length >= 3 ? i === 1 : plan.slug === 'pro';
          // In setup mode (first plan selection after business creation), nothing is
          // "current" yet — the user must actively choose. Outside setup, fall back to
          // Free when they have no active subscription.
          const isCurrent = isSetup
            ? current?.plan?.slug === plan.slug   // only mark current if they somehow already have one
            : (current?.plan?.slug === plan.slug || (!current && plan.slug === 'free'));
          const PlanIcon = i === 0 ? Zap : i === plans.length - 1 ? Star : Crown;

          return (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
            >
              <Card className={`glass relative h-full ${isPopular ? 'border-primary ring-2 ring-primary/20' : ''}`}>
                {isPopular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge variant="default" className="gradient-primary text-white px-3 py-1">
                      <Star className="h-3 w-3 mr-1" /> {t('subscription:popular')}
                    </Badge>
                  </div>
                )}
                <CardHeader className="text-center pb-2">
                  <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
                    <PlanIcon className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle>{plan.name}</CardTitle>
                  <p className="text-sm text-muted-foreground">{plan.description}</p>
                  <div className="mt-4">
                    <span className="text-4xl font-bold">{price === 0 ? t('subscription:free') : `₹${price}`}</span>
                    {price > 0 && <span className="text-muted-foreground text-sm">{billingLabel}</span>}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">{t('subscription:includes')}</p>
                    <p className="text-sm flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                      {t('subscription:up_to_businesses', { count: plan.max_businesses })}
                    </p>
                    <p className="text-sm">{t('subscription:users_count', { count: plan.max_users })}</p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">{t('subscription:features')}</p>
                    {Object.entries(plan.features || {}).map(([key, enabled]) => (
                      <div key={key} className="flex items-center gap-2 text-sm">
                        <Check className={`h-4 w-4 ${enabled ? 'text-emerald-400' : 'text-muted-foreground/30'}`} />
                        <span className={enabled ? '' : 'text-muted-foreground/50 line-through'}>{featureLabels[key] || key}</span>
                      </div>
                    ))}
                  </div>
                  <Button
                    className="w-full mt-4"
                    variant={isCurrent ? 'outline' : isPopular ? 'default' : 'secondary'}
                    disabled={isCurrent || subscribing === plan.id || !hasBusiness}
                    onClick={() => handleSubscribe(plan.id)}
                  >
                    {subscribing === plan.id
                      ? t('subscription:subscribing')
                      : isCurrent
                        ? t('subscription:current_plan')
                        : isSetup
                          ? (price === 0 ? t('subscription:start_for_free') : t('subscription:subscribe_to', { plan: plan.name }))
                          : (price === 0 ? t('subscription:get_started') : t('subscription:upgrade'))}
                    {!isCurrent && subscribing !== plan.id && <ArrowRight className="h-4 w-4 ml-2" />}
                  </Button>
                  {isCurrent && current && (
                    <Button
                      variant="ghost"
                      className="w-full text-red-400 hover:text-red-500"
                      onClick={() => setShowCancel(true)}
                    >
                      {t('subscription:cancel_subscription')}
                    </Button>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* ── Billing History ── */}
      {invoices.length > 0 && (
        <Card className="glass max-w-3xl mx-auto">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Receipt className="h-5 w-5" /> {t('subscription:billing_history')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-border">
              {invoices.map(inv => (
                <div key={inv.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium font-mono truncate">{inv.invoice_number}</p>
                    <p className="text-xs text-muted-foreground">
                      {inv.subscription?.plan?.name && `${inv.subscription.plan.name} · `}
                      {inv.paid_at
                        ? t('subscription:paid_on', { date: formatDate(inv.paid_at) })
                        : t('subscription:created_on', { date: formatDate(inv.created_at) })}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm font-semibold">{formatCurrency(inv.total_amount)}</span>
                    <Badge variant={INVOICE_STATUS_VARIANT[inv.status] || 'default'}>{inv.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Cancel Subscription Confirmation ── */}
      <ConfirmDialog
        open={showCancel}
        onClose={() => setShowCancel(false)}
        onConfirm={handleCancelSubscription}
        title={t('subscription:cancel_title')}
        description={t('subscription:cancel_desc')}
        confirmLabel={t('subscription:cancel_confirm')}
        variant="danger"
        loading={cancelling}
      />
    </div>
  );
}
