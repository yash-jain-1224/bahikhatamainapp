import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { User, Phone, Mail, Building2, Save, Sun, Moon, Monitor, Clock, AlertTriangle, ArrowRight } from 'lucide-react';
import { Button, Input, Card, CardContent, CardHeader, CardTitle, Avatar, AvatarFallback, Separator, Badge } from '@/components/ui';
import { profileApi } from '@/lib/api';
import { useAppSelector, useAppDispatch } from '@/hooks';
import { useTheme } from '@/hooks/useTheme';
import type { Theme } from '@/hooks/useTheme';
import { setUser } from '@/store/authSlice';
import { cn } from '@/utils';
import toast from 'react-hot-toast';
import { ImageUpload } from '@/components/shared/ImageUpload';

export default function ProfilePage() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { t } = useTranslation(['profile', 'common']);
  const { user, trialInfo } = useAppSelector(s => s.auth);
  const { theme, setTheme } = useTheme();
  const [form, setForm] = useState({ name: user?.name || '', email: user?.email || '' });
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(user?.avatar_url || null);

  const handleAvatarSelected = async (file: File) => {
    // Show local preview immediately
    const preview = URL.createObjectURL(file);
    setAvatarPreview(preview);

    try {
      setUploadingAvatar(true);
      const { data } = await profileApi.uploadAvatar(file);
      if (data?.data?.avatarUrl) setAvatarPreview(data.data.avatarUrl);
      if (data?.data?.user) dispatch(setUser(data.data.user));
      toast.success(t('profile:photo_updated'));
    } catch (err: any) {
      setAvatarPreview(user?.avatar_url || null);
      toast.error(err.response?.data?.message || t('profile:photo_upload_error'));
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleAvatarRemove = async () => {
    try {
      setUploadingAvatar(true);
      const { data } = await profileApi.removeAvatar();
      if (data?.data?.user) dispatch(setUser(data.data.user));
      setAvatarPreview(null);
      toast.success(t('profile:photo_removed'));
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('profile:photo_remove_error'));
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const { data } = await profileApi.update(form);
      if (data?.data) {
        dispatch(setUser(data.data));
        toast.success(t('profile:profile_updated'));
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('profile:profile_update_error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold">{t('profile:title')}</h2>

      <Card className="glass">
        <CardHeader>
          <div className="flex items-center gap-4">
            <ImageUpload
              src={avatarPreview}
              fallback={
                <Avatar className="h-full w-full">
                  <AvatarFallback className="text-2xl bg-primary/20 text-primary h-full w-full rounded-full">
                    {user?.name?.charAt(0) || user?.phone?.charAt(0) || 'U'}
                  </AvatarFallback>
                </Avatar>
              }
              onFileSelected={handleAvatarSelected}
              onRemove={handleAvatarRemove}
              loading={uploadingAvatar}
              shape="circle"
              size="h-20 w-20"
            />
            <div>
              <h3 className="text-lg font-semibold">{user?.name || t('profile:user_fallback')}</h3>
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <Phone className="h-3 w-3" /> {user?.phone}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Separator />
          <div className="grid gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">{t('profile:full_name_label')}</label>
              <Input
                icon={<User className="h-4 w-4" />}
                placeholder={t('profile:name_placeholder')}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">{t('profile:email_address_label')}</label>
              <Input
                icon={<Mail className="h-4 w-4" />}
                type="email"
                placeholder={t('profile:email_placeholder')}
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">{t('profile:phone_number_label')}</label>
              <Input
                icon={<Phone className="h-4 w-4" />}
                value={user?.phone || ''}
                disabled
                className="opacity-50"
              />
              <p className="text-xs text-muted-foreground mt-1">{t('profile:phone_cannot_change')}</p>
            </div>
          </div>
          <div className="flex justify-end pt-4">
            <Button onClick={handleSave} loading={saving}>
              <Save className="h-4 w-4 mr-2" /> {t('common:save_changes')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Subscription / Trial Status */}
      {trialInfo && (
        <Card className={cn(
          'glass',
          trialInfo.expired
            ? 'border-red-500/50 bg-red-500/5'
            : trialInfo.daysRemaining !== null && trialInfo.daysRemaining <= 2
              ? 'border-red-500/50 bg-red-500/5'
              : trialInfo.daysRemaining !== null && trialInfo.daysRemaining <= 7
                ? 'border-amber-500/50 bg-amber-500/5'
                : '',
        )}>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              {trialInfo.expired ? (
                <><AlertTriangle className="h-5 w-5 text-red-500" /> {t('profile:subscription_status')}</>
              ) : (
                <><Clock className="h-5 w-5 text-primary" /> {t('profile:subscription_status')}</>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* isTrial === false = paid subscription — renewal wording, not "free trial" */}
            {trialInfo.expired ? (
              <>
                <div className="flex items-center gap-2">
                  <Badge className="bg-red-500/10 text-red-500 border-red-500/30">
                    {trialInfo.isTrial === false ? t('profile:subscription_expired_badge') : t('profile:trial_expired_badge')}
                  </Badge>
                  {trialInfo.planName && <span className="text-sm text-muted-foreground">{t('profile:plan_label', { name: trialInfo.planName })}</span>}
                </div>
                <p className="text-sm text-muted-foreground">
                  {trialInfo.isTrial === false ? t('profile:subscription_ended_desc') : t('profile:trial_ended_desc')}
                </p>
                <Button onClick={() => navigate('/subscription')} className="mt-2">
                  {trialInfo.isTrial === false ? t('profile:renew_now') : t('profile:upgrade_now')} <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <Badge className={cn(
                    'border',
                    trialInfo.daysRemaining !== null && trialInfo.daysRemaining <= 2
                      ? 'bg-red-500/10 text-red-500 border-red-500/30'
                      : trialInfo.daysRemaining !== null && trialInfo.daysRemaining <= 7
                        ? 'bg-amber-500/10 text-amber-500 border-amber-500/30'
                        : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30',
                  )}>
                    {trialInfo.isTrial !== false && trialInfo.daysRemaining !== null && trialInfo.daysRemaining <= 7 ? t('profile:trial_badge') : t('profile:active_badge')}
                  </Badge>
                  {trialInfo.planName && <span className="text-sm text-muted-foreground">{t('profile:plan_label', { name: trialInfo.planName })}</span>}
                </div>
                {trialInfo.daysRemaining !== null && (
                  <p className="text-sm">
                    {trialInfo.daysRemaining <= 7 ? (
                      <span className={trialInfo.daysRemaining <= 2 ? 'text-red-500 font-medium' : 'text-amber-500 font-medium'}>
                        {trialInfo.isTrial === false
                          ? (trialInfo.daysRemaining === 0
                              ? t('profile:subscription_expires_today')
                              : t('profile:subscription_days_remaining_plural', { count: trialInfo.daysRemaining }))
                          : (trialInfo.daysRemaining === 0
                              ? t('profile:trial_expires_today')
                              : t('profile:trial_days_remaining_plural', { count: trialInfo.daysRemaining }))}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">{t('profile:days_remaining_simple', { count: trialInfo.daysRemaining })}</span>
                    )}
                  </p>
                )}
                {trialInfo.endsAt && (
                  <p className="text-xs text-muted-foreground">
                    {trialInfo.isTrial !== false && trialInfo.daysRemaining !== null && trialInfo.daysRemaining <= 7 ? t('profile:trial_ends') : t('profile:renews')}: {new Date(trialInfo.endsAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                )}
                <Button variant="outline" onClick={() => navigate('/subscription')} className="mt-2">
                  {trialInfo.daysRemaining !== null && trialInfo.daysRemaining <= 7
                    ? (trialInfo.isTrial === false ? t('profile:renew_now') : t('profile:upgrade_now'))
                    : t('profile:manage_plan')} <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="glass">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-5 w-5" /> {t('profile:business_settings')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {t('profile:business_settings_desc')}
          </p>
          <Button variant="outline" className="mt-4" onClick={() => navigate('/business')}>{t('profile:manage_business')}</Button>
        </CardContent>
      </Card>

      {/* Appearance / Theme */}
      <Card className="glass">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sun className="h-5 w-5" /> {t('profile:appearance')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            {t('profile:appearance_desc')}
          </p>
          <div className="grid grid-cols-3 gap-3">
            {([
              { value: 'light' as Theme, label: t('common:theme_light'), icon: Sun, preview: 'bg-white border-gray-200' },
              { value: 'dark' as Theme, label: t('common:theme_dark'), icon: Moon, preview: 'bg-gray-900 border-gray-700' },
              { value: 'system' as Theme, label: t('common:theme_system'), icon: Monitor, preview: 'bg-gradient-to-r from-white to-gray-900 border-gray-400' },
            ]).map(({ value, label, icon: Icon, preview }) => (
              <button
                key={value}
                onClick={() => setTheme(value)}
                className={cn(
                  'flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all hover:scale-[1.02]',
                  theme === value
                    ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                    : 'border-border hover:border-muted-foreground/30',
                )}
              >
                <div className={cn('h-10 w-16 rounded-md border', preview)} />
                <div className="flex items-center gap-1.5">
                  <Icon className={cn('h-4 w-4', theme === value ? 'text-primary' : 'text-muted-foreground')} />
                  <span className={cn('text-sm font-medium', theme === value ? 'text-primary' : 'text-muted-foreground')}>
                    {label}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
