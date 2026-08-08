import React, { useEffect, useState } from 'react';
import {
  Settings, Globe, Bell, Shield, Database, Server,
  Save, RotateCcw,
} from 'lucide-react';
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
  Button, Input, Label, Switch, Separator,
} from '@/components/ui';
import { SectionLoader } from '@/components/shared/loading';
import { adminApi } from '@/lib/api';
import toast from 'react-hot-toast';

interface PlatformSettings {
  appName: string;
  supportEmail: string;
  maxBusinessesPerUser: number;
  maxUsersPerBusiness: number;
  maintenanceMode: boolean;
  registrationEnabled: boolean;
  otpExpiryMinutes: number;
  sessionTimeoutMinutes: number;
  emailNotifications: boolean;
  smsNotifications: boolean;
  autoBackupEnabled: boolean;
  backupFrequencyHours: number;
}

// The settings endpoint has returned three shapes for a stored value over time:
// the bare scalar (what it returns now), the `{ value: X }` envelope, and
// `{ enabled: bool }` for flags with no config row. Normalise all three here so
// a value written under an older shape still loads. Reading `.value` directly
// was what broke the toggles: a boolean arrived as `{ value: false }`, `.value`
// was not consulted on that branch, and the raw object landed in state — always
// truthy, so every switch showed ON and could not be turned off.
function unwrap(raw: any): unknown {
  if (raw !== null && typeof raw === 'object') {
    if ('value' in raw) return (raw as any).value;
    if ('enabled' in raw) return (raw as any).enabled;
    return undefined; // an object we have no binding for — keep the default
  }
  return raw;
}

function pickString<K extends string>(d: any, key: K) {
  const v = unwrap(d?.[key]);
  return v === undefined || v === null ? {} : { [key]: String(v) } as Record<K, string>;
}

function pickNumber<K extends string>(d: any, key: K) {
  const v = unwrap(d?.[key]);
  if (v === undefined || v === null || v === '') return {};
  const n = Number(v);
  // A non-numeric stored value must not put NaN into a number input.
  return Number.isFinite(n) ? ({ [key]: n } as Record<K, number>) : {};
}

/**
 * Marks a control whose value is stored but not yet acted on anywhere.
 *
 * Maintenance Mode, User Registration, the two per-account limits and SMS
 * notifications are now enforced. These remaining ones are still saved and
 * still read back correctly, but nothing consults them — and a settings screen
 * that silently does nothing is worse than one that admits it, because the
 * admin walks away believing the platform is configured.
 */
function NotEnforcedHint() {
  return (
    <p className="text-xs text-amber-600 dark:text-amber-500">
      Saved, but not enforced yet.
    </p>
  );
}

function pickBoolean<K extends string>(d: any, key: K) {
  const v = unwrap(d?.[key]);
  if (typeof v === 'boolean') return { [key]: v } as Record<K, boolean>;
  if (v === 'true' || v === 'false') return { [key]: v === 'true' } as Record<K, boolean>;
  return {};
}

const defaultSettings: PlatformSettings = {
  appName: 'Bahi Khata Pro',
  supportEmail: 'support@bahikhata.pro',
  maxBusinessesPerUser: 5,
  maxUsersPerBusiness: 10,
  maintenanceMode: false,
  registrationEnabled: true,
  otpExpiryMinutes: 5,
  sessionTimeoutMinutes: 60,
  emailNotifications: true,
  smsNotifications: true,
  autoBackupEnabled: true,
  backupFrequencyHours: 24,
};

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<PlatformSettings>(defaultSettings);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const res = await adminApi.getSettings();
      if (res.data?.data && Object.keys(res.data.data).length > 0) {
        const d = res.data.data;
        setSettings((prev) => ({
          ...prev,
          ...pickString(d, 'appName'),
          ...pickString(d, 'supportEmail'),
          ...pickNumber(d, 'maxBusinessesPerUser'),
          ...pickNumber(d, 'maxUsersPerBusiness'),
          ...pickBoolean(d, 'maintenanceMode'),
          ...pickBoolean(d, 'registrationEnabled'),
          ...pickNumber(d, 'otpExpiryMinutes'),
          ...pickNumber(d, 'sessionTimeoutMinutes'),
          ...pickBoolean(d, 'emailNotifications'),
          ...pickBoolean(d, 'smsNotifications'),
          ...pickBoolean(d, 'autoBackupEnabled'),
          ...pickNumber(d, 'backupFrequencyHours'),
        }));
      }
    } catch {
      // Use defaults
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await adminApi.updateSettings({
        appName: settings.appName,
        supportEmail: settings.supportEmail,
        maxBusinessesPerUser: settings.maxBusinessesPerUser,
        maxUsersPerBusiness: settings.maxUsersPerBusiness,
        maintenanceMode: settings.maintenanceMode,
        registrationEnabled: settings.registrationEnabled,
        otpExpiryMinutes: settings.otpExpiryMinutes,
        sessionTimeoutMinutes: settings.sessionTimeoutMinutes,
        emailNotifications: settings.emailNotifications,
        smsNotifications: settings.smsNotifications,
        autoBackupEnabled: settings.autoBackupEnabled,
        backupFrequencyHours: settings.backupFrequencyHours,
      });
      toast.success('Platform settings saved successfully');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setSettings(defaultSettings);
    toast.success('Settings reset to defaults');
  };

  const update = <K extends keyof PlatformSettings>(key: K, value: PlatformSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  if (loading) return <SectionLoader />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Settings className="h-7 w-7 text-purple-500" />
          <div>
            <h2 className="text-2xl font-bold">Platform Settings</h2>
            <p className="text-muted-foreground">Configure global application settings</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleReset}>
            <RotateCcw className="h-4 w-4 mr-2" /> Reset
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4 mr-2" /> {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      {/* General Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Globe className="h-4 w-4" /> General
          </CardTitle>
          <CardDescription>Basic platform configuration</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>App Name</Label>
              <Input
                value={settings.appName}
                onChange={(e) => update('appName', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Support Email</Label>
              <Input
                type="email"
                value={settings.supportEmail}
                onChange={(e) => update('supportEmail', e.target.value)}
              />
            </div>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">Maintenance Mode</p>
              <p className="text-xs text-muted-foreground">Temporarily disable user access for maintenance</p>
            </div>
            <Switch
              checked={settings.maintenanceMode}
              onCheckedChange={(v) => update('maintenanceMode', v)}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">User Registration</p>
              <p className="text-xs text-muted-foreground">Allow new users to sign up</p>
            </div>
            <Switch
              checked={settings.registrationEnabled}
              onCheckedChange={(v) => update('registrationEnabled', v)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Limits */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4" /> Limits & Security
          </CardTitle>
          <CardDescription>Set platform limits and security parameters</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Max Businesses per User</Label>
              <Input
                type="number"
                min={1}
                value={settings.maxBusinessesPerUser}
                onChange={(e) => update('maxBusinessesPerUser', parseInt(e.target.value) || 1)}
              />
            </div>
            <div className="space-y-2">
              <Label>Max Users per Business</Label>
              <Input
                type="number"
                min={1}
                value={settings.maxUsersPerBusiness}
                onChange={(e) => update('maxUsersPerBusiness', parseInt(e.target.value) || 1)}
              />
            </div>
            <div className="space-y-2">
              <Label>OTP Expiry (minutes)</Label>
              <Input
                type="number"
                min={1}
                value={settings.otpExpiryMinutes}
                onChange={(e) => update('otpExpiryMinutes', parseInt(e.target.value) || 5)}
              />
              <NotEnforcedHint />
            </div>
            <div className="space-y-2">
              <Label>Session Timeout (minutes)</Label>
              <Input
                type="number"
                min={5}
                value={settings.sessionTimeoutMinutes}
                onChange={(e) => update('sessionTimeoutMinutes', parseInt(e.target.value) || 60)}
              />
              <NotEnforcedHint />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bell className="h-4 w-4" /> Notifications
          </CardTitle>
          <CardDescription>Manage platform-wide notification settings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">Email Notifications</p>
              <p className="text-xs text-muted-foreground">Send transactional emails to users</p>
              {/* There is no email channel in the platform at all — nothing to gate. */}
              <NotEnforcedHint />
            </div>
            <Switch
              checked={settings.emailNotifications}
              onCheckedChange={(v) => update('emailNotifications', v)}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">SMS / WhatsApp Notifications</p>
              <p className="text-xs text-muted-foreground">
                Send outbound WhatsApp alerts for reminders and critical events
              </p>
            </div>
            <Switch
              checked={settings.smsNotifications}
              onCheckedChange={(v) => update('smsNotifications', v)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Backup */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="h-4 w-4" /> Backup & Data
          </CardTitle>
          <CardDescription>Database backup and data management</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">Automatic Backups</p>
              <p className="text-xs text-muted-foreground">Schedule automatic database backups</p>
              {/* No backup subsystem exists behind any of this. */}
              <NotEnforcedHint />
            </div>
            <Switch
              checked={settings.autoBackupEnabled}
              onCheckedChange={(v) => update('autoBackupEnabled', v)}
            />
          </div>
          {settings.autoBackupEnabled && (
            <div className="space-y-2 max-w-xs">
              <Label>Backup Frequency (hours)</Label>
              <Input
                type="number"
                min={1}
                value={settings.backupFrequencyHours}
                onChange={(e) => update('backupFrequencyHours', parseInt(e.target.value) || 24)}
              />
            </div>
          )}
          <Separator />
          {/* These two buttons had no onClick at all: clicking them did nothing,
              with no error and no feedback. Disabled until there is something to
              call, so they stop advertising a capability that does not exist. */}
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" disabled title="Backups are not implemented yet">
              <Database className="h-4 w-4 mr-2" /> Backup Now
            </Button>
            <Button variant="outline" size="sm" disabled title="Backups are not implemented yet">
              <Server className="h-4 w-4 mr-2" /> View Backups
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Backups are handled by the database provider. There is no in-app backup job yet.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
