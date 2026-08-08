import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import {
  Building2, Plus, Search, Settings, Check, MoreHorizontal,
  MapPin, Phone, FileText, Power, ArrowRight, Lock, Crown,
} from 'lucide-react';
import {
  Button, Input, Card, CardContent, Badge,
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { EmptyState } from '@/components/shared/empty-state';
import { SectionLoader } from '@/components/shared/loading';
import { useSelector, useDispatch } from 'react-redux';
import { setCurrentBusiness, setBusinesses } from '@/store/businessSlice';
import { businessApi } from '@/lib/api';
import type { RootState } from '@/store';
import type { Business } from '@/types';
import toast from 'react-hot-toast';

const businessTypeLabels: Record<string, string> = {
  TRADING: 'Trading',
  MANDI: 'Mandi/Commission',
  WHOLESALE: 'Wholesale',
  RETAIL: 'Retail',
  MANUFACTURING: 'Manufacturing',
  DISTRIBUTOR: 'Distributor',
  OTHER: 'Other',
};

// NOTE: a hard-coded `defaultBusinesses` fixture used to be dispatched into
// redux on any list failure. Because setBusinesses auto-selects the first
// entry, every subsequent request then carried x-business-id: '1' — poisoning
// the whole session (and localStorage after a Switch click). Failures now
// surface an error state instead.

export default function BusinessListPage() {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { t } = useTranslation(['business', 'common']);
  const { currentBusiness, businesses } = useSelector((s: RootState) => s.business);
  const { trialInfo } = useSelector((s: RootState) => s.auth);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState('');
  const [deactivateBiz, setDeactivateBiz] = useState<Business | null>(null);

  // Determine business limit from subscription plan (default 1 if no plan)
  const maxBusinesses = trialInfo?.maxBusinesses ?? 1;
  const canAddBusiness = businesses.length < maxBusinesses;

  useEffect(() => {
    fetchBusinesses();
  }, []);

  const fetchBusinesses = async () => {
    try {
      setLoading(true);
      setLoadError(false);
      const { data } = await businessApi.list();
      if (data?.data) {
        dispatch(setBusinesses(data.data));
      }
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  const handleSwitch = (biz: Business) => {
    dispatch(setCurrentBusiness(biz));
    toast.success(t('business:switched_to', { name: biz.name }));
    navigate('/dashboard');
  };

  const handleToggleActive = async () => {
    if (!deactivateBiz) return;
    try {
      const newStatus = !deactivateBiz.is_active;
      // camelCase — updateBusinessSchema validates `isActive`; `is_active` was
      // stripped by zod, so activate/deactivate silently did nothing.
      await businessApi.update(deactivateBiz.id, { isActive: newStatus });
      toast.success(newStatus ? t('business:activated_toast') : t('business:deactivated_toast'));
      setDeactivateBiz(null);
      fetchBusinesses();
    } catch {
      toast.error(t('business:status_error'));
    }
  };

  const filtered = businesses.filter((b) =>
    !search || b.name.toLowerCase().includes(search.toLowerCase()) || b.type.toLowerCase().includes(search.toLowerCase())
  );

  const activeBusinesses = filtered.filter((b) => b.is_active);
  const inactiveBusinesses = filtered.filter((b) => !b.is_active);

  if (loading) return <SectionLoader />;

  return (
    <div className="space-y-6">
      {loadError && (
        <div className="flex items-center justify-between rounded-lg border border-red-500/30 bg-red-500/5 p-4">
          <p className="text-sm text-red-400">{t('common:load_error', "Couldn't load your businesses. The list below may be stale.")}</p>
          <Button variant="outline" size="sm" onClick={fetchBusinesses}>{t('common:retry', 'Retry')}</Button>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{t('business:title')}</h2>
          <p className="text-muted-foreground">{t('business:subtitle')}</p>
        </div>
        {canAddBusiness ? (
          <Button onClick={() => navigate('/business/new')}>
            <Plus className="h-4 w-4 mr-2" /> {t('business:new_business')}
          </Button>
        ) : (
          <Button onClick={() => navigate('/subscription')} variant="outline" className="border-amber-400 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30 gap-2">
            <Crown className="h-4 w-4" />
            {t('business:upgrade_add_more')}
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="flex items-center gap-3">
        <Input
          icon={<Search className="h-4 w-4" />}
          placeholder={t('business:search_placeholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Badge variant="outline">{businesses.length} total</Badge>
      </div>

      {/* Limit reached banner */}
      {!canAddBusiness && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-700 px-4 py-3 text-sm">
          <Lock className="h-4 w-4 text-amber-500 shrink-0" />
          <p className="flex-1 text-amber-700 dark:text-amber-400">
            Your <span className="font-semibold">{trialInfo?.planName ?? 'current'}</span> plan allows up to <span className="font-semibold">{maxBusinesses} business{maxBusinesses !== 1 ? 'es' : ''}</span>. Upgrade to add more.
          </p>
          <Button size="sm" onClick={() => navigate('/subscription')} className="bg-amber-500 hover:bg-amber-600 text-white shrink-0">
            <Crown className="h-3.5 w-3.5 mr-1.5" /> {t('business:upgrade_plan')}
          </Button>
        </div>
      )}

      {/* Active Businesses */}
      {activeBusinesses.length === 0 && inactiveBusinesses.length === 0 ? (
        <EmptyState
          icon={<Building2 className="h-16 w-16 text-muted-foreground" />}
          title={t('business:no_businesses')}
          description={t('business:no_businesses_desc')}
          action={{ label: t('business:create_business'), onClick: () => navigate('/business/new') }}
        />
      ) : (
        <>
          {activeBusinesses.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-3">{t('business:active_businesses')}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {activeBusinesses.map((biz, idx) => {
                  const isCurrent = currentBusiness?.id === biz.id;
                  return (
                    <motion.div
                      key={biz.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                    >
                      <Card className={`relative overflow-hidden transition-all hover:shadow-lg ${isCurrent ? 'ring-2 ring-primary' : 'hover:ring-1 hover:ring-border'}`}>
                        {isCurrent && (
                          <div className="absolute top-0 left-0 bottom-0 w-1 gradient-primary rounded-l" />
                        )}
                        <CardContent className="p-5">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <div className={`h-10 w-10 rounded-lg overflow-hidden flex items-center justify-center shrink-0 ${isCurrent ? 'gradient-primary' : 'bg-primary/10'}`}>
                                {biz.logo_url ? (
                                  <img
                                    src={biz.logo_url}
                                    alt={biz.name}
                                    className="h-full w-full object-cover"
                                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                                  />
                                ) : (
                                  <Building2 className={`h-5 w-5 ${isCurrent ? 'text-white' : 'text-primary'}`} />
                                )}
                              </div>
                              <div>
                                <h4 className="font-semibold">{biz.name}</h4>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{businessTypeLabels[biz.type] || biz.type}</span>
                                  {biz.is_primary && <Badge variant="default" className="text-xs px-1.5 py-0">{t('business:primary')}</Badge>}
                                </div>
                              </div>
                            </div>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => navigate(`/business/${biz.id}/settings`)}>
                                  <Settings className="h-4 w-4 mr-2" /> {t('business:settings_title')}
                                </DropdownMenuItem>
                                {!biz.is_primary && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem className="text-red-400" onClick={() => setDeactivateBiz(biz)}>
                                      <Power className="h-4 w-4 mr-2" /> {t('business:deactivate')}
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>

                          <div className="space-y-1.5 text-sm text-muted-foreground mb-4">
                            {biz.address && (
                              <p className="flex items-center gap-1.5">
                                <MapPin className="h-3.5 w-3.5 shrink-0" />
                                <span className="truncate">{biz.address}{biz.city ? `, ${biz.city}` : ''}</span>
                              </p>
                            )}
                            {biz.phone && (
                              <p className="flex items-center gap-1.5">
                                <Phone className="h-3.5 w-3.5 shrink-0" />
                                {biz.phone}
                              </p>
                            )}
                            {biz.gst_number && (
                              <p className="flex items-center gap-1.5">
                                <FileText className="h-3.5 w-3.5 shrink-0" />
                                GST: {biz.gst_number}
                              </p>
                            )}
                          </div>

                          {isCurrent ? (
                            <div className="flex items-center gap-2 text-sm text-primary font-medium">
                              <Check className="h-4 w-4" />
                              {t('business:current_business')}
                            </div>
                          ) : (
                            <Button variant="outline" size="sm" className="w-full" onClick={() => handleSwitch(biz)}>
                              {t('business:switch_to')} <ArrowRight className="h-3.5 w-3.5 ml-1" />
                            </Button>
                          )}
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Inactive Businesses */}
          {inactiveBusinesses.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-3">{t('business:inactive_businesses')}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {inactiveBusinesses.map((biz) => (
                  <Card key={biz.id} className="opacity-60">
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-lg bg-muted overflow-hidden flex items-center justify-center">
                            {biz.logo_url ? (
                              <img src={biz.logo_url} alt={biz.name} className="h-full w-full object-cover opacity-60" />
                            ) : (
                              <Building2 className="h-5 w-5 text-muted-foreground" />
                            )}
                          </div>
                          <div>
                            <h4 className="font-semibold">{biz.name}</h4>
                            <Badge variant="outline" className="text-xs">{t('business:inactive')}</Badge>
                          </div>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => setDeactivateBiz(biz)}>
                          <Power className="h-3.5 w-3.5 mr-1" /> {t('business:activate')}
                        </Button>
                      </div>
                      <p className="text-sm text-muted-foreground">{businessTypeLabels[biz.type] || biz.type}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Confirm Dialog */}
      <ConfirmDialog
        open={!!deactivateBiz}
        onClose={() => setDeactivateBiz(null)}
        onConfirm={handleToggleActive}
        title={deactivateBiz?.is_active ? t('business:deactivate_title') : t('business:activate_title')}
        description={
          deactivateBiz?.is_active
            ? t('business:deactivate_desc', { name: deactivateBiz?.name })
            : t('business:activate_desc', { name: deactivateBiz?.name })
        }
        confirmLabel={deactivateBiz?.is_active ? t('business:deactivate') : t('business:activate')}
        variant={deactivateBiz?.is_active ? 'warning' : 'default'}
      />
    </div>
  );
}
