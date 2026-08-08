import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { User, Phone, Mail, Building2, Save, Sun, Moon, Monitor, Clock, AlertTriangle, ArrowRight, CreditCard, Plus, Trash2, Star, Landmark } from 'lucide-react';
import {
  Button, Input, Card, CardContent, CardHeader, CardTitle, CardDescription,
  Avatar, AvatarFallback, Separator, Badge, Label, Switch,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui';
import { profileApi } from '@/lib/api';
import { useAppSelector, useAppDispatch } from '@/hooks';
import { useTheme } from '@/hooks/useTheme';
import type { Theme } from '@/hooks/useTheme';
import { setUser } from '@/store/authSlice';
import { cn } from '@/utils';
import toast from 'react-hot-toast';
import { ImageUpload } from '@/components/shared/ImageUpload';

// ─── User-level Bank Accounts ────────────────────────────────────────────────
// Backed by profile-service /profile/bank-accounts (per-user, NOT the
// business-level accounts managed in BusinessBankSection). The service returns
// raw snake_case records with the FULL account number (no masking server-side).
// Request payload must be camelCase: accountName/accountNumber/ifscCode/
// bankName/upiId/isDefault — wrong-cased keys are rejected as missing.

// Mirrors the server's IFSC check in profile.service.ts (addBankAccount).
const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;

interface UserBankAccount {
  id: string;
  account_name: string;
  account_number: string;
  ifsc_code: string;
  bank_name: string;
  upi_id?: string | null;
  is_default: boolean;
}

const EMPTY_BANK_FORM = {
  accountName: '',
  accountNumber: '',
  ifscCode: '',
  bankName: '',
  upiId: '',
  isDefault: false,
};

function AddBankAccountDialog({ open, onClose, onSuccess }: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { t } = useTranslation(['profile', 'common']);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_BANK_FORM);

  useEffect(() => {
    if (open) setForm(EMPTY_BANK_FORM);
  }, [open]);

  const handleSave = async () => {
    if (!form.accountName.trim() || !form.accountNumber.trim() || !form.ifscCode.trim() || !form.bankName.trim()) {
      toast.error(t('profile:bank_required_fields'));
      return;
    }
    if (!IFSC_REGEX.test(form.ifscCode)) {
      toast.error(t('profile:bank_ifsc_invalid'));
      return;
    }
    try {
      setSaving(true);
      await profileApi.addBankAccount({
        accountName: form.accountName.trim(),
        accountNumber: form.accountNumber.trim(),
        ifscCode: form.ifscCode.trim(),
        bankName: form.bankName.trim(),
        upiId: form.upiId.trim() || undefined,
        isDefault: form.isDefault,
      });
      toast.success(t('profile:bank_added'));
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('profile:bank_add_error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            {t('profile:bank_add_title')}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>{t('profile:bank_account_holder_label')} *</Label>
            <Input
              placeholder={t('profile:bank_account_holder_placeholder')}
              value={form.accountName}
              onChange={e => setForm(f => ({ ...f, accountName: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>{t('profile:bank_name_label')} *</Label>
              <Input
                placeholder={t('profile:bank_name_placeholder')}
                value={form.bankName}
                onChange={e => setForm(f => ({ ...f, bankName: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('profile:bank_ifsc_label')} *</Label>
              <Input
                placeholder={t('profile:bank_ifsc_placeholder')}
                value={form.ifscCode}
                onChange={e => setForm(f => ({ ...f, ifscCode: e.target.value.toUpperCase() }))}
                maxLength={11}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t('profile:bank_account_number_label')} *</Label>
            <Input
              placeholder={t('profile:bank_account_number_placeholder')}
              value={form.accountNumber}
              onChange={e => setForm(f => ({ ...f, accountNumber: e.target.value.replace(/\D/g, '') }))}
            />
          </div>
          <div className="space-y-2">
            <Label>{t('profile:bank_upi_label')}</Label>
            <Input
              placeholder={t('profile:bank_upi_placeholder')}
              value={form.upiId}
              onChange={e => setForm(f => ({ ...f, upiId: e.target.value }))}
            />
          </div>
          <div className="flex items-center justify-between pt-2">
            <div>
              <p className="text-sm font-medium">{t('profile:bank_set_default')}</p>
              <p className="text-xs text-muted-foreground">{t('profile:bank_set_default_desc')}</p>
            </div>
            <Switch checked={form.isDefault} onCheckedChange={v => setForm(f => ({ ...f, isDefault: v }))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t('common:cancel')}</Button>
          <Button onClick={handleSave} loading={saving}>
            {t('profile:bank_add_account')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BankAccountsCard() {
  const { t } = useTranslation(['profile', 'common']);
  const [accounts, setAccounts] = useState<UserBankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchAccounts = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(false);
      const { data } = await profileApi.listBankAccounts();
      setAccounts(data?.data || []);
    } catch {
      // A failed list must never render as the "no accounts yet" empty state.
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  const handleDelete = async (id: string) => {
    if (!confirm(t('profile:bank_delete_confirm'))) return;
    try {
      setDeletingId(id);
      await profileApi.deleteBankAccount(id);
      toast.success(t('profile:bank_deleted'));
      fetchAccounts();
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('profile:bank_delete_error'));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Card className="glass">
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" /> {t('profile:bank_accounts')}
          </CardTitle>
          <CardDescription>{t('profile:bank_accounts_desc')}</CardDescription>
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4 mr-1.5" /> {t('profile:bank_add_account')}
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="py-8 text-center text-muted-foreground text-sm">{t('common:loading')}</div>
        ) : loadError ? (
          <div className="py-8 text-center">
            <p className="text-sm text-red-400 mb-3">{t('profile:bank_load_error')}</p>
            <Button variant="outline" size="sm" onClick={fetchAccounts}>{t('common:retry')}</Button>
          </div>
        ) : accounts.length === 0 ? (
          <div className="py-8 text-center">
            <Landmark className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">{t('profile:bank_none')}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => setShowAdd(true)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" /> {t('profile:bank_add_first')}
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-border rounded-lg border border-border">
            {accounts.map(acc => (
              <div key={acc.id} className="flex items-center gap-4 px-4 py-3 hover:bg-muted/30 transition-colors">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Landmark className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">{acc.bank_name}</p>
                    {acc.is_default && (
                      <Badge variant="default" className="text-[9px] px-1.5 py-0">
                        <Star className="h-2.5 w-2.5 mr-0.5" /> {t('profile:bank_default_badge')}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground font-mono">
                    {acc.account_number} · IFSC: {acc.ifsc_code}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {acc.account_name}{acc.upi_id ? ` · UPI: ${acc.upi_id}` : ''}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-red-400 hover:text-red-500 shrink-0"
                  disabled={deletingId === acc.id}
                  onClick={() => handleDelete(acc.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <AddBankAccountDialog
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onSuccess={fetchAccounts}
      />
    </Card>
  );
}

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

      {/* User-level Bank Accounts */}
      <BankAccountsCard />

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
