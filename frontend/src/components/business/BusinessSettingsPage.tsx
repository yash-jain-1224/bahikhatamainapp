import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation, Trans } from 'react-i18next';
import {
  Building2, Save, Trash2, MapPin, Phone as PhoneIcon,
  FileText, Settings, ArrowLeft, AlertTriangle,
} from 'lucide-react';
import {
  Button, Input, Card, CardContent, CardHeader, CardTitle, CardDescription,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Separator, Label, Switch,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui';
import { businessApi } from '@/lib/api';
import { useAppSelector, useAppDispatch } from '@/hooks';
import { setCurrentBusiness, setBusinesses, updateBusinessLogo } from '@/store/businessSlice';
import toast from 'react-hot-toast';
import { ImageUpload } from '@/components/shared/ImageUpload';
import BusinessBankSection from './BusinessBankSection';
import BusinessCreditCardSection from './BusinessCreditCardSection';

const BUSINESS_TYPE_VALUES = ['TRADING', 'MANDI', 'WHOLESALE', 'RETAIL', 'MANUFACTURING', 'DISTRIBUTOR', 'OTHER'] as const;

// financial_year_start is stored as a month number (1-12); the select carries
// month names.
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Marks a control the backend has nowhere to store. */
function NotSavedHint() {
  return (
    <p className="text-xs text-amber-600 dark:text-amber-500">Not saved yet.</p>
  );
}

const indianStates = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Delhi', 'Chandigarh', 'Puducherry', 'Jammu & Kashmir', 'Ladakh',
];

export default function BusinessSettingsPage() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { t } = useTranslation(['business', 'common']);
  const { currentBusiness, businesses } = useAppSelector(s => s.business);
  const { id: routeBusinessId } = useParams<{ id: string }>();

  // The route is /business/:id/settings and the list page links per-card, but
  // this page used to read `currentBusiness` for everything — so opening
  // Settings for business B while A was active showed A's data and pointed
  // every action (Save, logo, bank accounts, credit cards, Deactivate) at A.
  // The user believed they were configuring B and silently overwrote A.
  //
  // Switching the active business is the fix rather than threading an id prop:
  // BusinessBankSection and BusinessCreditCardSection each read
  // `currentBusiness` from redux in a dozen places of their own, and any call
  // site missed would keep writing to the wrong tenant's record.
  useEffect(() => {
    if (!routeBusinessId || businesses.length === 0) return;
    if (currentBusiness?.id === routeBusinessId) return;

    const target = businesses.find(b => b.id === routeBusinessId);
    if (target) {
      dispatch(setCurrentBusiness(target));
    } else {
      // Not one of the user's businesses — do not fall back to editing whatever
      // happens to be selected.
      toast.error(t('business:not_found'));
      navigate('/business');
    }
  }, [routeBusinessId, businesses, currentBusiness?.id, dispatch, navigate, t]);

  const [saving, setSaving] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(currentBusiness?.logo_url || null);

  const handleLogoSelected = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) { toast.error(t('business:image_too_large')); return; }
    // Show local preview immediately while upload is in flight
    setLogoPreview(URL.createObjectURL(file));
    try {
      setLogoUploading(true);
      const { data } = await businessApi.uploadLogo(currentBusiness!.id, file);
      const newLogoUrl = data?.data?.logo_url;
      if (newLogoUrl) {
        dispatch(updateBusinessLogo({ id: currentBusiness!.id, logo_url: newLogoUrl }));
        setLogoPreview(newLogoUrl);
        toast.success(t('business:logo_updated'));
      }
    } catch {
      setLogoPreview(currentBusiness?.logo_url || null); // revert preview on error
      toast.error(t('business:logo_upload_error'));
    } finally {
      setLogoUploading(false);
    }
  };

  const handleLogoRemove = async () => {
    try {
      setLogoUploading(true);
      await businessApi.removeLogo(currentBusiness!.id);
      dispatch(updateBusinessLogo({ id: currentBusiness!.id, logo_url: '' }));
      setLogoPreview(null);
      toast.success(t('business:logo_removed'));
    } catch {
      toast.error(t('business:logo_remove_error'));
    } finally {
      setLogoUploading(false);
    }
  };

  const [form, setForm] = useState({
    name: currentBusiness?.name || '',
    type: currentBusiness?.type || '',
    gst_number: currentBusiness?.gst_number || '',
    address: currentBusiness?.address || '',
    city: currentBusiness?.city || '',
    state: currentBusiness?.state || '',
    phone: currentBusiness?.phone || '',
  });

  const [settings, setSettings] = useState({
    invoicePrefix: currentBusiness?.invoice_prefix || 'INV',
    purchasePrefix: currentBusiness?.purchase_prefix || 'PUR',
    salePrefix: 'SAL',
    currencySymbol: '₹',
    financialYearStart: 'April',
    autoBackup: true,
    enableWhatsApp: false,
    enableSMS: false,
  });

  // useState only seeds on mount, so without this the form would keep showing
  // the previously-active business after the switch above.
  useEffect(() => {
    if (!currentBusiness) return;
    setSettings(s => ({
      ...s,
      invoicePrefix: currentBusiness.invoice_prefix || 'INV',
      purchasePrefix: currentBusiness.purchase_prefix || 'PUR',
      financialYearStart: MONTHS[(currentBusiness.financial_year_start || 4) - 1] || 'April',
    }));
    setForm({
      name: currentBusiness.name || '',
      type: currentBusiness.type || '',
      gst_number: currentBusiness.gst_number || '',
      address: currentBusiness.address || '',
      city: currentBusiness.city || '',
      state: currentBusiness.state || '',
      phone: currentBusiness.phone || '',
    });
    setLogoPreview(currentBusiness.logo_url || null);
  }, [currentBusiness?.id]);

  const updateField = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!form.name.trim()) return toast.error(t('business:name_required'));
    try {
      setSaving(true);
      // The form state is snake_case to match the API's read shape, but the
      // update schema is camelCase — and zod silently strips unknown keys, so
      // `gst_number` was accepted, dropped, and reported as saved. The GSTIN
      // was never persisted, and Settings offers no other way to set it.
      const { gst_number, ...rest } = form;
      const payload: Record<string, unknown> = { ...rest, gstNumber: gst_number };

      // The Preferences card was collected into a second state object that no
      // request ever read, so those controls reset to their defaults on every
      // load while Save still reported success. Ship the three the Business
      // model actually has columns for.
      payload.invoicePrefix = settings.invoicePrefix;
      payload.purchasePrefix = settings.purchasePrefix;
      const fyMonth = MONTHS.indexOf(settings.financialYearStart) + 1;
      if (fyMonth > 0) payload.financialYearStart = fyMonth;

      const { data } = await businessApi.update(currentBusiness!.id, payload);
      if (data?.data) {
        dispatch(setCurrentBusiness(data.data));
        // Sync logo preview with whatever the server returned
        if (data.data.logo_url) setLogoPreview(data.data.logo_url);
        const bizRes = await businessApi.list();
        if (bizRes.data?.data) dispatch(setBusinesses(bizRes.data.data));
      }
      toast.success(t('business:settings_saved'));
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('business:settings_save_error'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      // camelCase — see BusinessListPage.
      await businessApi.update(currentBusiness!.id, { isActive: false });
      toast.success(t('business:business_deactivated'));
      setShowDeleteDialog(false);
      const remaining = businesses.filter(b => b.id !== currentBusiness?.id);
      dispatch(setBusinesses(remaining));
      if (remaining.length > 0) {
        dispatch(setCurrentBusiness(remaining[0]));
        navigate('/dashboard');
      } else {
        navigate('/business/new');
      }
    } catch {
      toast.error(t('business:deactivate_error'));
    }
  };

  if (!currentBusiness) {
    return (
      <div className="text-center py-20">
        <Building2 className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
        <h2 className="text-xl font-bold mb-2">{t('business:no_business_selected')}</h2>
        <p className="text-muted-foreground mb-4">{t('business:no_businesses_desc')}</p>
        <Button onClick={() => navigate('/business/new')}>{t('business:create_button')}</Button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h2 className="text-2xl font-bold">{t('business:settings_title')}</h2>
            <p className="text-muted-foreground">{t('business:settings_subtitle')}</p>
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-2" /> {saving ? t('common:updating') : t('common:save')}
        </Button>
      </div>

      {/* Business Logo & Name */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-4 w-4" /> {t('business:business_profile')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4 mb-4">
            <ImageUpload
              src={logoPreview}
              fallback={<Building2 className="h-10 w-10 text-primary" />}
              onFileSelected={handleLogoSelected}
              onRemove={handleLogoRemove}
              loading={logoUploading}
              shape="rounded"
              size="h-20 w-20"
            />
            <div className="flex-1">
              <p className="font-semibold text-lg">{currentBusiness.name}</p>
              <p className="text-sm text-muted-foreground">{currentBusiness.type} · {currentBusiness.city || t('business:no_city')}</p>
              <p className="text-xs text-muted-foreground mt-1">{t('business:logo_hover_hint')}</p>
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('business:business_name')} *</Label>
              <Input value={form.name} onChange={(e) => updateField('name', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t('business:business_type')} *</Label>
              <Select value={form.type} onValueChange={(val) => updateField('type', val)}>
                <SelectTrigger><SelectValue placeholder={t('business:select_type')} /></SelectTrigger>
                <SelectContent>
                  {BUSINESS_TYPE_VALUES.map(val => (
                    <SelectItem key={val} value={val}>{t(`business:types.${val}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('business:gst_number')}</Label>
              <Input
                icon={<FileText className="h-4 w-4" />}
                placeholder="22AAAAA0000A1Z5"
                value={form.gst_number}
                onChange={(e) => updateField('gst_number', e.target.value.toUpperCase())}
                maxLength={15}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('business:phone')}</Label>
              <Input
                icon={<PhoneIcon className="h-4 w-4" />}
                value={form.phone}
                onChange={(e) => updateField('phone', e.target.value.replace(/\D/g, '').slice(0, 10))}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Address */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="h-4 w-4" /> {t('business:address')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-2">
              <Label>{t('business:street_address')}</Label>
              <Input
                icon={<MapPin className="h-4 w-4" />}
                placeholder={t('business:street_address')}
                value={form.address}
                onChange={(e) => updateField('address', e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('business:city')}</Label>
                <Input placeholder={t('business:city')} value={form.city} onChange={(e) => updateField('city', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t('business:state')}</Label>
                <Select value={form.state} onValueChange={(val) => updateField('state', val)}>
                  <SelectTrigger><SelectValue placeholder={t('business:select_state')} /></SelectTrigger>
                  <SelectContent>
                    {indianStates.map(state => (
                      <SelectItem key={state} value={state}>{state}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Preferences */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Settings className="h-4 w-4" /> {t('business:preferences')}
          </CardTitle>
          <CardDescription>{t('business:preferences_desc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>{t('business:invoice_prefix')}</Label>
              <Input value={settings.invoicePrefix} onChange={(e) => setSettings(s => ({ ...s, invoicePrefix: e.target.value.toUpperCase() }))} />
            </div>
            <div className="space-y-2">
              <Label>{t('business:purchase_prefix')}</Label>
              <Input value={settings.purchasePrefix} onChange={(e) => setSettings(s => ({ ...s, purchasePrefix: e.target.value.toUpperCase() }))} />
            </div>
            <div className="space-y-2">
              <Label>{t('business:sale_prefix')}</Label>
              <Input value={settings.salePrefix} onChange={(e) => setSettings(s => ({ ...s, salePrefix: e.target.value.toUpperCase() }))} />
              {/* Business has invoice_prefix and purchase_prefix columns but no
                  sale_prefix, so this one has nowhere to go. */}
              <NotSavedHint />
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('business:fy_start')}</Label>
              <Select value={settings.financialYearStart} onValueChange={(val) => setSettings(s => ({ ...s, financialYearStart: val }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="January">{t('business:fy_january')}</SelectItem>
                  <SelectItem value="April">{t('business:fy_april')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('business:currency_symbol')}</Label>
              <Input value={settings.currencySymbol} onChange={(e) => setSettings(s => ({ ...s, currencySymbol: e.target.value }))} className="w-24" />
              {/* No column on Business for this — see NotSavedHint. */}
              <NotSavedHint />
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{t('business:whatsapp_notif')}</p>
                <p className="text-xs text-muted-foreground">{t('business:whatsapp_notif_desc')}</p>
                <NotSavedHint />
              </div>
              <Switch checked={settings.enableWhatsApp} onCheckedChange={(v) => setSettings(s => ({ ...s, enableWhatsApp: v }))} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{t('business:sms_notif')}</p>
                <p className="text-xs text-muted-foreground">{t('business:sms_notif_desc')}</p>
                <NotSavedHint />
              </div>
              <Switch checked={settings.enableSMS} onCheckedChange={(v) => setSettings(s => ({ ...s, enableSMS: v }))} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{t('business:auto_backup')}</p>
                <p className="text-xs text-muted-foreground">{t('business:auto_backup_desc')}</p>
                <NotSavedHint />
              </div>
              <Switch checked={settings.autoBackup} onCheckedChange={(v) => setSettings(s => ({ ...s, autoBackup: v }))} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bank Accounts & Statement Reconciliation */}
      <BusinessBankSection />

      {/* Credit Cards & Statement Reconciliation */}
      <BusinessCreditCardSection />

      {/* Danger Zone — only for non-primary businesses */}
      {!currentBusiness.is_primary && (
      <Card className="border-red-500/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 text-red-500">
            <AlertTriangle className="h-4 w-4" /> {t('business:danger_zone')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{t('business:deactivate_business')}</p>
              <p className="text-xs text-muted-foreground">
                {t('business:deactivate_business_desc')}
              </p>
            </div>
            <Button variant="destructive" size="sm" onClick={() => setShowDeleteDialog(true)}>
              <Trash2 className="h-4 w-4 mr-2" /> {t('business:deactivate')}
            </Button>
          </div>
        </CardContent>
      </Card>
      )}

      {currentBusiness.is_primary && (
      <Card className="border-blue-500/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 text-blue-500">
            <Building2 className="h-4 w-4" /> {t('business:primary_business')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {t('business:primary_business_desc')}
          </p>
        </CardContent>
      </Card>
      )}

      {/* Delete Confirmation */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('business:deactivate_business')}</DialogTitle>
            <DialogDescription>
              {/*
                Was dangerouslySetInnerHTML. Combined with i18n's
                escapeValue:false that made the business name a stored-XSS
                sink — a business named `<img src=x onerror=...>` executed
                when this dialog opened, for every member of that business.
                <Trans> maps the <strong> in the translation to a real element
                and interpolates the name as an escaped React child instead.
              */}
              <Trans
                i18nKey="business:deactivate_confirm_desc"
                values={{ name: currentBusiness.name }}
                components={{ strong: <strong /> }}
              />
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>{t('common:cancel')}</Button>
            <Button variant="destructive" onClick={handleDelete}>{t('business:deactivate')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
