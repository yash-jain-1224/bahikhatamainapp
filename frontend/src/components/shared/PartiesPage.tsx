import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Plus, Search, Users, Phone, ArrowDownLeft, ArrowUpRight,
  Pencil, Trash2, Upload, Download, Scissors, IndianRupee,
  Package, X, Check, Loader2, ChevronRight,
} from 'lucide-react';
import { Button, Input, Badge, Card, CardContent, Separator } from '@/components/ui';
import { BulkSelectDataTable } from '@/components/shared/BulkSelectDataTable';
import { StatCard } from '@/components/shared/stat-card';
import { EmptyState } from '@/components/shared/empty-state';
import { AdvancedFilters, type FilterField } from '@/components/shared/AdvancedFilters';
import { ExportButton } from '@/components/shared/ExportButton';
import { ImportDataDialog } from '@/components/shared/ImportDataDialog';
import { AddPartyDialog } from '@/components/shared/AddPartyDialog';
import { EditPartyDialog } from '@/components/shared/EditPartyDialog';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { profileApi } from '@/lib/api';
import { formatCurrency } from '@/utils';
import type { Party, Cutter } from '@/types';
import toast from 'react-hot-toast';
import { cn } from '@/utils';

// ── Cutter add / edit dialog ──────────────────────────────────────────────────
interface CutterDialogProps {
  open: boolean;
  cutter?: Cutter | null;
  onClose: () => void;
  onSuccess: () => void;
}

function CutterDialog({ open, cutter, onClose, onSuccess }: CutterDialogProps) {
  const { t } = useTranslation(['parties', 'common']);
  const isEdit = !!cutter;
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [rate, setRate] = useState('');
  const [unit, setUnit] = useState('KG');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(cutter?.name || '');
      setPhone(cutter?.phone || '');
      setPhoneError('');
      setRate(cutter?.rate_per_unit ? String(cutter.rate_per_unit) : '');
      setUnit(cutter?.unit || 'KG');
    }
  }, [open, cutter]);

  if (!open) return null;

  const handleSave = async () => {
    if (!name.trim()) { toast.error(t('parties:cutter_name_required')); return; }
    // Backend requires a 10-digit Indian mobile (/^[6-9]\d{9}$/) when a phone is given
    if (phone.trim() && !/^[6-9]\d{9}$/.test(phone.trim())) {
      setPhoneError(t('parties:invalid_phone', 'Enter a valid 10-digit mobile number starting with 6-9'));
      return;
    }
    try {
      setSaving(true);
      const payload = {
        name: name.trim(),
        ratePerUnit: rate ? parseFloat(rate) : 0,
        unit,
      };
      if (isEdit && cutter) {
        // On edit the phone goes as null, not undefined — undefined keys are
        // dropped by JSON.stringify, so clearing the field would silently
        // keep the old value. (Create must keep undefined: its zod schema
        // rejects null for an omitted phone.)
        await profileApi.updateCutter(cutter.id, { ...payload, phone: phone.trim() || null });
        toast.success(t('parties:cutter_updated_toast'));
      } else {
        await profileApi.createCutter({ ...payload, phone: phone.trim() || undefined });
        toast.success(t('parties:cutter_added_toast'));
      }
      onSuccess();
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message ||
          (isEdit ? t('parties:cutter_update_fail') : t('parties:cutter_add_fail')),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">{isEdit ? t('parties:edit_cutter_title') : t('parties:add_new_cutter')}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>
        <Separator />
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('parties:name_label')}</label>
            <Input placeholder={t('parties:name_placeholder')} value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('parties:phone_label_short')}</label>
            <Input
              placeholder={t('parties:phone_placeholder_short')}
              value={phone}
              onChange={e => {
                setPhone(e.target.value.replace(/\D/g, '').slice(0, 10));
                setPhoneError('');
              }}
            />
            {phoneError && <p className="text-xs text-red-400">{phoneError}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t('parties:rate_per_unit_label')}</label>
              <Input type="number" min={0} step="0.01" placeholder="0.00" value={rate} onChange={e => setRate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t('parties:unit_label')}</label>
              <select
                value={unit}
                onChange={e => setUnit(e.target.value)}
                className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="KG">KG</option>
                <option value="PCS">PCS</option>
                <option value="BOX">BOX</option>
                <option value="TON">TON</option>
                <option value="SFT">SFT</option>
                <option value="QUINTAL">{t('common:quintal_label')}</option>
              </select>
            </div>
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={saving}>{t('common:cancel')}</Button>
          <Button className="flex-1" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
            {isEdit ? t('parties:save_changes') : t('parties:add_cutter')}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function PartiesPage() {
  const navigate = useNavigate();
  const { t } = useTranslation(['parties', 'common']);
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get('tab') || 'parties') as 'parties' | 'cutters';

  // ── Parties state ──
  const [parties, setParties] = useState<Party[]>([]);
  const [partiesLoading, setPartiesLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Record<string, any>>({});
  const [showAddParty, setShowAddParty] = useState(false);
  const [editParty, setEditParty] = useState<Party | null>(null);
  const [deleteParty, setDeleteParty] = useState<Party | null>(null);
  const [showImport, setShowImport] = useState(false);

  // ── Cutters state ──
  const [cutters, setCutters] = useState<Cutter[]>([]);
  const [cuttersLoading, setCuttersLoading] = useState(true);
  const [cutterSearch, setCutterSearch] = useState('');
  const [showAddCutter, setShowAddCutter] = useState(false);
  const [editCutter, setEditCutter] = useState<Cutter | null>(null);
  const [deleteCutter, setDeleteCutter] = useState<Cutter | null>(null);

  useEffect(() => { fetchCutters(); }, []);
  useEffect(() => { fetchParties(); }, [search, filters]);

  const fetchParties = async () => {
    try {
      setPartiesLoading(true);
      const { data } = await profileApi.parties({ search, ...filters });
      setParties(data?.data || []);
    } catch {
      setParties([]);
    } finally {
      setPartiesLoading(false);
    }
  };

  const fetchCutters = async () => {
    try {
      setCuttersLoading(true);
      const { data } = await profileApi.cutters();
      setCutters(data?.data || []);
    } catch {
      setCutters([]);
    } finally {
      setCuttersLoading(false);
    }
  };

  const handleDeleteParty = async () => {
    if (!deleteParty) return;
    try {
      // The service reads data.isActive; is_active was never read, so this
      // returned 200 and left the party active.
      await profileApi.updateParty(deleteParty.id, { isActive: false });
      toast.success(t('parties:party_deactivated_toast'));
      setDeleteParty(null);
      fetchParties();
    } catch {
      toast.error(t('parties:party_deactivate_fail'));
    }
  };

  const handleDeleteCutter = async () => {
    if (!deleteCutter) return;
    try {
      await profileApi.deleteCutter(deleteCutter.id);
      toast.success(t('parties:cutter_deactivated_toast', { name: deleteCutter.name }));
      setDeleteCutter(null);
      fetchCutters();
    } catch {
      toast.error(t('parties:cutter_deactivate_fail'));
    }
  };

  const setTab = (tab: 'parties' | 'cutters') => {
    setSearchParams(tab === 'parties' ? {} : { tab });
  };

  // ── Parties computed ──
  // party.balance < 0 => they owe us (receivable); > 0 => we owe them (payable).
  // These stat tiles had the signs inverted, so the two figures were swapped.
  const totalReceivable = parties.filter(p => p.balance < 0).reduce((s, p) => s + Math.abs(p.balance), 0);
  const totalPayable = parties.filter(p => p.balance > 0).reduce((s, p) => s + p.balance, 0);

  const filterFields: FilterField[] = [
    {
      key: 'balance_type', label: t('common:balance_filter'), type: 'select',
      options: [
        { value: 'receivable', label: t('common:receivable_filter') },
        { value: 'payable', label: t('common:payable_filter') },
        { value: 'settled', label: t('common:settled_filter') },
      ],
    },
  ];

  const partyColumns = [
    { key: 'name', header: t('common:party_name_col'), render: (p: Party) => (
      <div>
        <p className="font-medium">{p.name}</p>
        {p.phone && <p className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3" />{p.phone}</p>}
      </div>
    )},
    { key: 'receivable', header: t('common:receivable_col'), render: (p: Party) => (
      p.balance > 0 ? (
        <div className="flex items-center gap-1.5">
          <ArrowDownLeft className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
          <span className="font-semibold text-emerald-400">{formatCurrency(p.balance)}</span>
        </div>
      ) : <span className="text-xs text-muted-foreground/40">—</span>
    )},
    { key: 'payable', header: t('common:payable_col'), render: (p: Party) => (
      p.balance < 0 ? (
        <div className="flex items-center gap-1.5">
          <ArrowUpRight className="h-3.5 w-3.5 text-red-400 shrink-0" />
          <span className="font-semibold text-red-400">{formatCurrency(Math.abs(p.balance))}</span>
        </div>
      ) : <span className="text-xs text-muted-foreground/40">—</span>
    )},
    { key: 'actions', header: '', render: (p: Party) => (
      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditParty(p)}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-300" onClick={() => setDeleteParty(p)}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    )},
  ];

  // ── Cutters computed ──
  const filteredCutters = cutters.filter(c =>
    !cutterSearch || c.name.toLowerCase().includes(cutterSearch.toLowerCase()) ||
    (c.phone && c.phone.includes(cutterSearch))
  );
  const totalCutterRate = cutters.reduce((s, c) => s + (Number(c.rate_per_unit) || 0), 0);

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{t('parties:title')}</h2>
          <p className="text-muted-foreground">{t('common:manage_parties_subtitle')}</p>
        </div>
        {activeTab === 'parties' ? (
          <div className="flex gap-2">
            {/* Party rows have no receivable/payable keys — exporting them
                raw wrote empty columns. Project from balance instead.
                Sign convention: negative balance = receivable, positive = payable. */}
            <ExportButton
              data={parties.map(p => ({
                name: p.name,
                phone: p.phone || '',
                receivable: p.balance < 0 ? Math.abs(p.balance) : 0,
                payable: p.balance > 0 ? p.balance : 0,
              }))}
              columns={['name', 'phone', 'receivable', 'payable']}
              filename="parties"
            />
            <Button variant="outline" onClick={() => setShowImport(true)}>
              <Upload className="h-4 w-4 mr-2" /> {t('common:import')}
            </Button>
            <Button onClick={() => setShowAddParty(true)}>
              <Plus className="h-4 w-4 mr-2" /> {t('parties:add_party')}
            </Button>
          </div>
        ) : (
          <Button onClick={() => setShowAddCutter(true)}>
            <Plus className="h-4 w-4 mr-2" /> {t('parties:add_cutter')}
          </Button>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-border">
        {(['parties', 'cutters'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setTab(tab)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px',
              activeTab === tab
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
            )}
          >
            {tab === 'parties' ? <Users className="h-4 w-4" /> : <Scissors className="h-4 w-4" />}
            {tab === 'parties' ? t('parties:parties_tab') : t('parties:cutters_tab')}
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {tab === 'parties' ? parties.length : cutters.length}
            </Badge>
          </button>
        ))}
      </div>

      {/* ── PARTIES TAB ── */}
      {activeTab === 'parties' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard title={t('parties:total_parties')} value={parties.length} icon={Users} iconColor="text-blue-400" />
            <StatCard title={t('parties:total_receivable')} value={formatCurrency(totalReceivable)} icon={ArrowDownLeft} iconColor="text-emerald-400" />
            <StatCard title={t('parties:total_payable')} value={formatCurrency(totalPayable)} icon={ArrowUpRight} iconColor="text-red-400" />
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <Input icon={<Search className="h-4 w-4" />} placeholder={t('common:search_parties')} value={search} onChange={e => setSearch(e.target.value)} className="w-64" />
            </div>
            <AdvancedFilters fields={filterFields} values={filters} onChange={setFilters} onReset={() => setFilters({})} />
          </div>

          <div>
            {parties.length === 0 && !partiesLoading ? (
              <EmptyState
                icon={<Users className="h-16 w-16 text-muted-foreground" />}
                title={t('common:no_parties_found')}
                description={t('common:add_first_party_desc')}
                action={{ label: t('parties:add_party'), onClick: () => setShowAddParty(true) }}
              />
            ) : (
              <BulkSelectDataTable
                columns={partyColumns}
                data={parties}
                loading={partiesLoading}
                onRowClick={p => navigate(`/parties/${p.id}`)}
                bulkActions={[
                  {
                    label: t('common:export_selected'),
                    icon: <Download className="h-3.5 w-3.5" />,
                    onClick: (items) => {
                      // Sign convention: negative balance = receivable, positive = payable
                      const csv = ['Name,Phone,Receivable,Payable', ...items.map(p => `${p.name},${p.phone || ''},${p.balance < 0 ? Math.abs(p.balance) : 0},${p.balance > 0 ? p.balance : 0}`)].join('\n');
                      const blob = new Blob([csv], { type: 'text/csv' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a'); a.href = url; a.download = 'selected_parties.csv'; a.click();
                      URL.revokeObjectURL(url);
                      toast.success(t('parties:exported_count', { count: items.length }));
                    },
                  },
                  {
                    label: t('common:deactivate_selected'), icon: <Trash2 className="h-3.5 w-3.5" />, variant: 'destructive',
                    onClick: async (items) => {
                      const results = await Promise.allSettled(
                        items.map(p => profileApi.updateParty(p.id, { isActive: false })),
                      );
                      const failed = results.filter(r => r.status === 'rejected').length;
                      if (failed) toast.error(t('parties:party_deactivate_fail') + ` (${failed}/${items.length})`);
                      else toast.success(t('common:deactivated'));
                      fetchParties();
                    },
                  },
                ]}
              />
            )}
          </div>
        </>
      )}

      {/* ── CUTTERS TAB ── */}
      {activeTab === 'cutters' && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard title={t('common:total_cutters')} value={cutters.length} icon={Scissors} iconColor="text-purple-400" />
            <StatCard
              title={t('common:with_phone')}
              value={cutters.filter(c => c.phone).length}
              icon={Phone}
              iconColor="text-blue-400"
            />
            <StatCard
              title={t('common:avg_rate_per_unit')}
              value={cutters.length ? formatCurrency(totalCutterRate / cutters.length) : '—'}
              icon={IndianRupee}
              iconColor="text-emerald-400"
            />
          </div>

          {/* Search */}
          <div className="flex items-center gap-3">
            <Input
              icon={<Search className="h-4 w-4" />}
              placeholder={t('common:search_cutters')}
              value={cutterSearch}
              onChange={e => setCutterSearch(e.target.value)}
              className="w-72"
            />
            {cutterSearch && (
              <button onClick={() => setCutterSearch('')} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Cutters list */}
          {cuttersLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredCutters.length === 0 ? (
            <EmptyState
              icon={<Scissors className="h-16 w-16 text-muted-foreground" />}
              title={cutterSearch ? t('common:no_cutters_match') : t('common:no_cutters_yet')}
              description={cutterSearch ? t('common:try_different_search') : t('common:add_cutters_desc')}
              action={!cutterSearch ? { label: t('parties:add_cutter'), onClick: () => setShowAddCutter(true) } : undefined}
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredCutters.map(c => (
                <Card
                  key={c.id}
                  className="glass hover:border-primary/40 hover:shadow-md transition-all cursor-pointer"
                  onClick={() => navigate(`/cutters/${c.id}`)}
                >
                  <CardContent className="p-5 space-y-3">
                    {/* Name + actions */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-10 w-10 rounded-xl bg-purple-500/10 flex items-center justify-center shrink-0">
                          <Scissors className="h-5 w-5 text-purple-400" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold truncate">{c.name}</p>
                          {c.phone && (
                            <a
                              href={`tel:${c.phone}`}
                              className="text-xs text-muted-foreground flex items-center gap-1 hover:text-primary transition-colors"
                              onClick={e => e.stopPropagation()}
                            >
                              <Phone className="h-3 w-3" />{c.phone}
                            </a>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={e => { e.stopPropagation(); setEditCutter(c); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-300" onClick={e => { e.stopPropagation(); setDeleteCutter(c); }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                        <ChevronRight className="h-4 w-4 text-muted-foreground/50 ml-1" />
                      </div>
                    </div>

                    <Separator />

                    {/* Rate / unit */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <IndianRupee className="h-3.5 w-3.5" />
                        <span>{t('common:rate_per_unit')}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-sm">
                          {c.rate_per_unit ? formatCurrency(Number(c.rate_per_unit)) : <span className="text-muted-foreground text-xs">{t('common:not_set')}</span>}
                        </span>
                        {c.unit && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            <Package className="h-2.5 w-2.5 mr-1" />{c.unit}
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Transaction count if present */}
                    {(c as any)._count?.transactions > 0 && (
                      <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border">
                        <span>{t('common:total_purchases')}</span>
                        <span className="font-medium text-foreground">{(c as any)._count.transactions}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Dialogs ── */}
      <AddPartyDialog open={showAddParty} onClose={() => setShowAddParty(false)} onSuccess={() => { setShowAddParty(false); fetchParties(); }} />
      {editParty && (
        <EditPartyDialog open={!!editParty} party={editParty} onClose={() => setEditParty(null)} onSuccess={() => { setEditParty(null); fetchParties(); }} />
      )}
      <ConfirmDialog
        open={!!deleteParty} onClose={() => setDeleteParty(null)} onConfirm={handleDeleteParty}
        title={t('parties:deactivate_party')} description={t('parties:deactivate_party_desc', { name: deleteParty?.name })}
        confirmLabel={t('parties:deactivate_party')} variant="warning"
      />
      <ImportDataDialog open={showImport} onClose={() => setShowImport(false)} onSuccess={() => { setShowImport(false); fetchParties(); }} defaultModule="parties" />

      <CutterDialog
        open={showAddCutter || !!editCutter}
        cutter={editCutter}
        onClose={() => { setShowAddCutter(false); setEditCutter(null); }}
        onSuccess={() => { setShowAddCutter(false); setEditCutter(null); fetchCutters(); }}
      />
      <ConfirmDialog
        open={!!deleteCutter} onClose={() => setDeleteCutter(null)} onConfirm={handleDeleteCutter}
        title={t('parties:deactivate_cutter')} description={t('parties:deactivate_cutter_desc', { name: deleteCutter?.name })}
        confirmLabel={t('parties:deactivate_cutter')} variant="warning"
      />
    </div>
  );
}
