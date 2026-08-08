import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Crown, Plus, Pencil, Trash2, Check, X, Zap,
  Users, Building2, BarChart3, Star,
} from 'lucide-react';
import {
  Button, Input, Card, CardContent, CardHeader, CardTitle,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  Label, Switch,
} from '@/components/ui';
import { StatCard } from '@/components/shared/stat-card';
import { SectionLoader } from '@/components/shared/loading';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { adminApi } from '@/lib/api';
import { formatCurrency } from '@/utils';
import type { Plan } from '@/types';
import toast from 'react-hot-toast';

interface AdminPlan extends Plan {
  subscriber_count?: number;
  revenue?: number;
}

// NOTE: a hard-coded `defaultPlans` fixture used to be substituted whenever
// the API failed or returned nothing — an admin could not tell a broken
// backend from a healthy one. Errors now render an explicit error state.

const featureLabels: Record<string, string> = {
  purchases: 'Purchases',
  sales: 'Sales',
  inventory: 'Inventory',
  ledger: 'Ledger',
  reports: 'Reports',
  import_export: 'Import/Export',
  multi_user: 'Multi-User',
};

const emptyForm = {
  name: '',
  slug: '',
  description: '',
  price_monthly: 0,
  price_quarterly: 0,
  price_half_yearly: 0,
  price_yearly: 0,
  max_businesses: 1,
  max_users: 1,
  max_shops: 1,
  features: {
    purchases: true,
    sales: true,
    inventory: true,
    ledger: true,
    reports: false,
    import_export: false,
    multi_user: false,
  } as Record<string, boolean>,
};

export default function AdminPlansPage() {
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<AdminPlan[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingPlan, setEditingPlan] = useState<AdminPlan | null>(null);
  const [deletePlan, setDeletePlan] = useState<AdminPlan | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => { fetchPlans(); }, []);

  const fetchPlans = async () => {
    try {
      setLoading(true);
      setLoadError(false);
      const res = await adminApi.plans();
      setPlans(res.data?.data || []);
    } catch {
      setPlans([]);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditingPlan(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = (plan: AdminPlan) => {
    setEditingPlan(plan);
    setForm({
      name: plan.name,
      slug: plan.slug,
      description: plan.description || '',
      price_monthly: Number(plan.price_monthly),
      price_quarterly: Number(plan.price_quarterly) || 0,
      price_half_yearly: Number(plan.price_half_yearly) || 0,
      price_yearly: Number(plan.price_yearly),
      max_businesses: plan.max_businesses,
      max_users: plan.max_users,
      max_shops: plan.max_shops || 1,
      features: { ...plan.features } as Record<string, boolean>,
    });
    setShowForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error('Plan name is required');
    if (!form.slug.trim()) return toast.error('Plan slug is required');

    // Transform to camelCase keys expected by the backend
    const payload = {
      name: form.name.trim(),
      slug: form.slug.trim(),
      description: form.description.trim() || undefined,
      priceMonthly: form.price_monthly,
      priceQuarterly: form.price_quarterly,
      priceHalfYearly: form.price_half_yearly,
      priceYearly: form.price_yearly,
      maxBusinesses: form.max_businesses,
      maxUsers: form.max_users,
      maxShops: form.max_shops,
      features: form.features,
    };

    try {
      setSaving(true);
      if (editingPlan) {
        await adminApi.updatePlan(editingPlan.id, payload);
        toast.success(`Plan "${form.name}" updated successfully`);
      } else {
        await adminApi.createPlan(payload);
        toast.success(`Plan "${form.name}" created successfully`);
      }
      setShowForm(false);
      fetchPlans();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to save plan');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletePlan) return;
    try {
      await adminApi.deletePlan(deletePlan.id);
      toast.success(`Plan "${deletePlan.name}" deleted`);
      setDeletePlan(null);
      fetchPlans();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to delete plan');
    }
  };

  const totalSubscribers = plans.reduce((s, p) => s + (p.subscriber_count || 0), 0);
  const totalRevenue = plans.reduce((s, p) => s + (p.revenue || 0), 0);

  const planColors = ['bg-gray-500/10 border-gray-500/30', 'bg-blue-500/10 border-blue-500/30', 'bg-purple-500/10 border-purple-500/30'];
  const planIcons = [Zap, Star, Crown];

  if (loading) return <SectionLoader />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Crown className="h-7 w-7 text-amber-500" />
          <div>
            <h2 className="text-2xl font-bold">Plans Management</h2>
            <p className="text-muted-foreground">Manage subscription plans and features</p>
          </div>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" /> New Plan
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title="Total Plans" value={plans.length} icon={Crown} iconColor="text-amber-400" />
        <StatCard title="Total Subscribers" value={totalSubscribers} icon={Users} iconColor="text-blue-400" />
        <StatCard title="Total MRR" value={formatCurrency(totalRevenue)} icon={BarChart3} iconColor="text-emerald-400" />
      </div>

      {/* Load error — distinct from a genuinely empty list */}
      {loadError && (
        <Card className="border-red-500/30">
          <CardContent className="p-4 flex items-center justify-between">
            <p className="text-sm text-red-400">Couldn't load plans — the data shown may be incomplete.</p>
            <Button variant="outline" size="sm" onClick={fetchPlans}>Retry</Button>
          </CardContent>
        </Card>
      )}

      {/* Plan Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {plans.map((plan, idx) => {
          const Icon = planIcons[idx] || Crown;
          const colorClass = planColors[idx] || planColors[0];
          return (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
            >
              <Card className={`relative border ${colorClass}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className="h-5 w-5" />
                      <CardTitle className="text-lg">{plan.name}</CardTitle>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(plan)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-300" onClick={() => setDeletePlan(plan)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">{plan.description}</p>
                </CardHeader>
                <CardContent>
                  {/* Pricing */}
                  <div className="flex items-baseline gap-1 mb-4">
                    <span className="text-3xl font-bold">{formatCurrency(Number(plan.price_monthly))}</span>
                    <span className="text-sm text-muted-foreground">/month</span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-1">
                    {formatCurrency(Number(plan.price_quarterly))}/quarter · {formatCurrency(Number(plan.price_half_yearly))}/half-year
                  </p>
                  <p className="text-xs text-muted-foreground mb-4">
                    {formatCurrency(Number(plan.price_yearly))}/year
                  </p>

                  {/* Limits */}
                  <div className="flex items-center gap-4 mb-4 text-sm">
                    <div className="flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                      {plan.max_businesses} biz
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5 text-muted-foreground" />
                      {plan.max_users} users
                    </div>
                  </div>

                  {/* Features */}
                  <div className="space-y-1.5 mb-4">
                    {Object.entries(plan.features || {}).map(([key, enabled]) => (
                      <div key={key} className="flex items-center gap-2 text-sm">
                        {enabled ? (
                          <Check className="h-3.5 w-3.5 text-emerald-400" />
                        ) : (
                          <X className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                        <span className={enabled ? '' : 'text-muted-foreground line-through'}>
                          {featureLabels[key] || key}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Subscriber Stats */}
                  <div className="pt-3 border-t border-border flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{plan.subscriber_count || 0} subscribers</span>
                    <span className="font-medium">{formatCurrency(plan.revenue || 0)} MRR</span>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Create/Edit Plan Dialog */}
      <Dialog open={showForm} onOpenChange={(v) => !v && setShowForm(false)}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPlan ? 'Edit Plan' : 'Create New Plan'}</DialogTitle>
            <DialogDescription>
              {editingPlan ? `Edit the "${editingPlan.name}" plan` : 'Set up a new subscription plan'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSave} className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Plan Name *</Label>
                <Input
                  className="mt-1.5"
                  value={form.name}
                  onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="e.g., Pro"
                />
              </div>
              <div>
                <Label>Slug *</Label>
                <Input
                  className="mt-1.5"
                  value={form.slug}
                  onChange={(e) => setForm(p => ({ ...p, slug: e.target.value }))}
                  placeholder="e.g., pro"
                />
              </div>
            </div>

            <div>
              <Label>Description</Label>
              <Input
                className="mt-1.5"
                value={form.description}
                onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))}
                placeholder="Plan description"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Monthly Price (₹)</Label>
                <Input
                  type="number"
                  className="mt-1.5"
                  value={form.price_monthly}
                  onChange={(e) => setForm(p => ({ ...p, price_monthly: Number(e.target.value) }))}
                />
              </div>
              <div>
                <Label>Quarterly Price (₹)</Label>
                <Input
                  type="number"
                  className="mt-1.5"
                  value={form.price_quarterly}
                  onChange={(e) => setForm(p => ({ ...p, price_quarterly: Number(e.target.value) }))}
                  placeholder="3-month price"
                />
              </div>
              <div>
                <Label>Half-Yearly Price (₹)</Label>
                <Input
                  type="number"
                  className="mt-1.5"
                  value={form.price_half_yearly}
                  onChange={(e) => setForm(p => ({ ...p, price_half_yearly: Number(e.target.value) }))}
                  placeholder="6-month price"
                />
              </div>
              <div>
                <Label>Yearly Price (₹)</Label>
                <Input
                  type="number"
                  className="mt-1.5"
                  value={form.price_yearly}
                  onChange={(e) => setForm(p => ({ ...p, price_yearly: Number(e.target.value) }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Max Businesses</Label>
                <Input
                  type="number"
                  className="mt-1.5"
                  value={form.max_businesses}
                  onChange={(e) => setForm(p => ({ ...p, max_businesses: Number(e.target.value) }))}
                />
              </div>
              <div>
                <Label>Max Users</Label>
                <Input
                  type="number"
                  className="mt-1.5"
                  value={form.max_users}
                  onChange={(e) => setForm(p => ({ ...p, max_users: Number(e.target.value) }))}
                />
              </div>
              <div>
                <Label>Max Shops</Label>
                <Input
                  type="number"
                  className="mt-1.5"
                  value={form.max_shops}
                  onChange={(e) => setForm(p => ({ ...p, max_shops: Number(e.target.value) }))}
                />
              </div>
            </div>

            <div>
              <Label className="mb-3 block">Features</Label>
              <div className="space-y-3">
                {Object.entries(featureLabels).map(([key, label]) => (
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-sm">{label}</span>
                    <Switch
                      checked={form.features[key] || false}
                      onCheckedChange={(checked) =>
                        setForm(p => ({
                          ...p,
                          features: { ...p.features, [key]: checked },
                        }))
                      }
                    />
                  </div>
                ))}
              </div>
            </div>

            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving...' : editingPlan ? 'Update Plan' : 'Create Plan'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deletePlan}
        onClose={() => setDeletePlan(null)}
        onConfirm={handleDelete}
        title="Delete Plan"
        description={`Are you sure you want to delete the "${deletePlan?.name}" plan? This will affect ${deletePlan?.subscriber_count || 0} subscribers.`}
        confirmLabel="Delete Plan"
        variant="danger"
      />
    </div>
  );
}
