import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Button, Input, Label,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  Badge,
} from '@/components/ui';
import { profileApi } from '@/lib/api';
import {
  User, Phone, Mail, ChevronDown, ChevronRight, Plus, X, Building2,
  CreditCard, MapPin, FileText, Banknote, Tag, Search, Check, Loader2,
  MessageCircle,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useFormErrors } from '@/hooks';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
  INDIAN_STATES, getCitiesForState, fetchPincodesForCity,
  searchAddress, type AddressSuggestion, type PincodeInfo,
} from '@/lib/india-geo';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ContactEntry {
  id: string;
  name: string;
  phone: string;
  email: string;
  tags: string[];
  tagInput: string;
}

interface BankEntry {
  id: string;
  bankName: string;
  accountNumber: string;
  ifscCode: string;
  branch: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function SectionHeader({
  icon, label, open, onToggle, optional = true,
}: {
  icon: React.ReactNode;
  label: string;
  open: boolean;
  onToggle: () => void;
  optional?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-semibold
        bg-muted/50 hover:bg-muted transition-colors text-foreground"
    >
      <span className="text-primary">{icon}</span>
      <span className="flex-1 text-left">{label}</span>
      {optional && (
        <span className="text-[10px] font-normal text-muted-foreground bg-background border border-border rounded px-1.5 py-0.5">
          optional
        </span>
      )}
      {open
        ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
        : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
    </button>
  );
}

// ─── Searchable Dropdown (reused from BusinessCreatePage pattern) ─────────────
interface SearchableDropdownProps {
  placeholder: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  disabled?: boolean;
  loading?: boolean;
  /** When set, Enter in the search box commits the typed text (if this
   *  predicate accepts it) even when no option matches — the option lists
   *  are incomplete lookups, not exhaustive. */
  allowFreeText?: (value: string) => boolean;
}

function SearchableDropdown({ placeholder, value, options, onChange, disabled, loading, allowFreeText }: SearchableDropdownProps) {
  const { t } = useTranslation(['parties', 'common']);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const filtered = options.filter(o => o.toLowerCase().includes(search.toLowerCase()));

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false); setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const select = (val: string) => { onChange(val); setOpen(false); setSearch(''); };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => { setOpen(o => !o); setTimeout(() => inputRef.current?.focus(), 50); }}
        className={[
          'flex h-10 w-full items-center justify-between rounded-md border bg-background px-3 text-sm',
          'ring-offset-background transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
          open ? 'border-ring' : 'border-input',
        ].join(' ')}
      >
        <span className={value ? 'text-foreground' : 'text-muted-foreground'}>{value || placeholder}</span>
        <div className="flex items-center gap-1 shrink-0">
          {value && (
            <span role="button" tabIndex={0}
              onClick={e => { e.stopPropagation(); onChange(''); }}
              className="rounded p-0.5 text-muted-foreground hover:text-foreground cursor-pointer"
            ><X className="h-3 w-3" /></span>
          )}
          {loading
            ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            : <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />}
        </div>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-popover shadow-xl">
          <div className="p-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <input ref={inputRef} value={search} onChange={e => setSearch(e.target.value)}
                onKeyDown={e => {
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  const typed = search.trim();
                  const exact = filtered.find(o => o.toLowerCase() === typed.toLowerCase());
                  if (exact) { select(exact); return; }
                  if (typed && allowFreeText?.(typed)) select(typed);
                }}
                placeholder={t('parties:search_placeholder')}
                className="w-full rounded-md border border-input bg-background pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto p-1">
            {filtered.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">{t('common:no_results')}</p>}
            {filtered.map(opt => (
              <button key={opt} type="button" onClick={() => select(opt)}
                className="relative flex w-full items-center rounded-md px-2.5 py-2 text-sm hover:bg-accent"
              >
                <span className="flex-1 text-left">{opt}</span>
                {opt === value && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface AddPartyDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export function AddPartyDialog({ open, onClose, onSuccess }: AddPartyDialogProps) {
  const { t } = useTranslation(['parties', 'common']);
  const [loading, setLoading] = useState(false);
  const { errors, clearError, validate } = useFormErrors<'name' | 'phone' | 'email'>();

  // ── Sections open/closed ────────────────────────────────────────────────
  const [sections, setSections] = useState({
    contacts: false,
    gst: false,
    address: false,
    credit: false,
    banking: false,
  });
  const toggle = (s: keyof typeof sections) => setSections(p => ({ ...p, [s]: !p[s] }));

  // ── Core fields ─────────────────────────────────────────────────────────
  const [form, setForm] = useState({
    name: '',
    phone: '',
    whatsapp: '',
    email: '',
    type: 'BOTH' as 'SUPPLIER' | 'CUSTOMER' | 'BOTH',
    is_mine: false,
    opening_balance: '',
    opening_balance_type: 'receivable' as 'receivable' | 'payable',
  });

  // ── GST ─────────────────────────────────────────────────────────────────
  const [gst, setGst] = useState({
    registrationType: 'UNREGISTERED' as 'REGULAR' | 'COMPOSITION' | 'UNREGISTERED' | 'CONSUMER',
    gstin: '',
    gstState: '',
    panNumber: '',
  });

  // ── Address ─────────────────────────────────────────────────────────────
  const [addr, setAddr] = useState({
    address: '', city: '', state: '', pincode: '',
  });
  const [pincodes, setPincodes] = useState<PincodeInfo[]>([]);
  const [pincodesLoading, setPincodesLoading] = useState(false);

  // Address autocomplete
  const [addressQuery, setAddressQuery] = useState('');
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [addressLoading, setAddressLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [addressNoResults, setAddressNoResults] = useState(false);
  const addressContainerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  const cities = addr.state ? getCitiesForState(addr.state) : [];
  const pincodeOptions = pincodes.map(p => `${p.pincode} — ${p.officeName}`);

  const loadPincodes = useCallback(async (city: string) => {
    if (!city) { setPincodes([]); return; }
    setPincodesLoading(true);
    try { setPincodes(await fetchPincodesForCity(city)); }
    finally { setPincodesLoading(false); }
  }, []);

  const handleAddressSearch = useCallback((query: string) => {
    setAddressQuery(query);
    setAddr(prev => ({ ...prev, address: query }));
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.length < 2) {
      setAddressSuggestions([]); setShowSuggestions(false); setAddressNoResults(false); return;
    }
    debounceRef.current = setTimeout(async () => {
      setAddressLoading(true); setAddressNoResults(false);
      try {
        const results = await searchAddress(query);
        setAddressSuggestions(results);
        setShowSuggestions(results.length > 0);
        setAddressNoResults(results.length === 0);
      } finally { setAddressLoading(false); }
    }, 300);
  }, []);

  const selectAddress = (s: AddressSuggestion) => {
    const matchedState = INDIAN_STATES.find(st => st.toLowerCase() === s.state.toLowerCase()) || s.state || '';
    const matchedCity = s.city || '';
    setAddr(prev => ({
      ...prev,
      address: s.address,
      pincode: s.pincode ? s.pincode.split('—')[0].trim() : prev.pincode,
      state: matchedState || prev.state,
      city: matchedCity || prev.city,
    }));
    setAddressQuery(s.address);
    setShowSuggestions(false); setAddressNoResults(false); setAddressSuggestions([]);
    if (matchedCity) loadPincodes(matchedCity);
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (addressContainerRef.current && !addressContainerRef.current.contains(e.target as Node))
        setShowSuggestions(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const updateAddr = (field: keyof typeof addr, value: string) => {
    setAddr(prev => {
      const next = { ...prev, [field]: value };
      if (field === 'state') {
        const newCities = getCitiesForState(value);
        if (prev.city && !newCities.includes(prev.city)) { next.city = ''; next.pincode = ''; setPincodes([]); }
      }
      if (field === 'city') { next.pincode = ''; if (value) loadPincodes(value); else setPincodes([]); }
      return next;
    });
  };

  // ── Credit ───────────────────────────────────────────────────────────────
  const [credit, setCredit] = useState({ periodDays: '', limit: '' });

  // ── Contacts ────────────────────────────────────────────────────────────
  const [contacts, setContacts] = useState<ContactEntry[]>([]);

  const addContact = () =>
    setContacts(p => [...p, { id: uid(), name: '', phone: '', email: '', tags: [], tagInput: '' }]);

  const removeContact = (id: string) => setContacts(p => p.filter(c => c.id !== id));

  const updateContact = (id: string, field: keyof Omit<ContactEntry, 'id'>, value: string | string[]) =>
    setContacts(p => p.map(c => c.id === id ? { ...c, [field]: value } : c));

  const addTag = (id: string) => {
    const c = contacts.find(x => x.id === id);
    if (!c || !c.tagInput.trim()) return;
    const tag = c.tagInput.trim().toLowerCase();
    if (!c.tags.includes(tag)) updateContact(id, 'tags', [...c.tags, tag]);
    updateContact(id, 'tagInput', '');
  };

  const removeTag = (id: string, tag: string) => {
    const c = contacts.find(x => x.id === id);
    if (!c) return;
    updateContact(id, 'tags', c.tags.filter(t => t !== tag));
  };

  // ── Banks ────────────────────────────────────────────────────────────────
  const [banks, setBanks] = useState<BankEntry[]>([]);

  const addBank = () =>
    setBanks(p => [...p, { id: uid(), bankName: '', accountNumber: '', ifscCode: '', branch: '' }]);

  const removeBank = (id: string) => setBanks(p => p.filter(b => b.id !== id));

  const updateBank = (id: string, field: keyof Omit<BankEntry, 'id'>, value: string) =>
    setBanks(p => p.map(b => b.id === id ? { ...b, [field]: value } : b));

  // ── Reset on open ────────────────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      setForm({ name: '', phone: '', whatsapp: '', email: '', type: 'BOTH', is_mine: false, opening_balance: '', opening_balance_type: 'receivable' });
      setGst({ registrationType: 'UNREGISTERED', gstin: '', gstState: '', panNumber: '' });
      setAddr({ address: '', city: '', state: '', pincode: '' });
      setAddressQuery('');
      setAddressSuggestions([]);
      setShowSuggestions(false);
      setAddressNoResults(false);
      setCredit({ periodDays: '', limit: '' });
      setContacts([]);
      setBanks([]);
      setSections({ contacts: false, gst: false, address: false, credit: false, banking: false });
      setPincodes([]);
    }
  }, [open]);

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const phoneEmpty = !form.phone.trim();
    const ok = validate({
      name: [!form.name.trim(), t('common:name_required')],
      phone: [phoneEmpty || form.phone.length !== 10, phoneEmpty ? t('parties:phone_required') : t('parties:phone_invalid')],
      email: [!!form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email), t('parties:email_invalid')],
    });
    if (!ok) return;

    try {
      setLoading(true);
      await profileApi.createParty({
        name: form.name.trim(),
        phone: form.phone,
        whatsapp: form.whatsapp.trim() || undefined,
        type: form.type,
        email: form.email.trim() || undefined,
        isMine: form.is_mine,
        // Backend sign convention (party.balance): positive = payable (we owe
        // them), negative = receivable (they owe us) — see sales.service.ts.
        openingBalance: form.opening_balance
          ? (form.opening_balance_type === 'payable' ? Math.abs(parseFloat(form.opening_balance)) : -Math.abs(parseFloat(form.opening_balance)))
          : 0,

        // GST
        gstRegistrationType: gst.registrationType,
        gstNumber: gst.gstin.trim() || undefined,
        gstState: gst.gstState || undefined,
        panNumber: gst.panNumber.trim() || undefined,

        // Address
        address: addr.address.trim() || undefined,
        city: addr.city || undefined,
        state: addr.state || undefined,
        pincode: addr.pincode ? addr.pincode.split('—')[0].trim() : undefined,

        // Credit
        creditPeriodDays: credit.periodDays ? parseInt(credit.periodDays) : undefined,
        creditLimit: credit.limit ? parseFloat(credit.limit) : undefined,

        // Contacts
        contacts: contacts
          .filter(c => c.name.trim())
          .map(c => ({
            name: c.name.trim(),
            phone: c.phone.trim() || undefined,
            email: c.email.trim() || undefined,
            tags: c.tags,
            notes: undefined,
          })),

        // Banks
        bankAccounts: banks
          .filter(b => b.bankName.trim() && b.accountNumber.trim() && b.ifscCode.trim())
          .map((b, i) => ({
            bankName: b.bankName.trim(),
            accountNumber: b.accountNumber.trim(),
            ifscCode: b.ifscCode.trim().toUpperCase(),
            branch: b.branch.trim() || undefined,
            isPrimary: i === 0,
          })),
      });
      toast.success(t('parties:party_added'));
      onSuccess?.();
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('parties:party_add_error'));
    } finally {
      setLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={val => !val && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
          <DialogTitle>{t('parties:add_party_title')}</DialogTitle>
          <DialogDescription>{t('parties:add_party_desc')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

            {/* ── Core Fields ──────────────────────────────────────────── */}
            <div className="space-y-3">
              <div>
                <Label>{t('common:name')} *</Label>
                <Input icon={<User className="h-4 w-4" />} className="mt-1.5" placeholder={t('parties:party_name')}
                  value={form.name} autoFocus error={errors.name}
                  onChange={e => { setForm(p => ({ ...p, name: e.target.value })); clearError('name'); }}
                />
              </div>

              {/* ── Is Mine (Mines party) ── */}
              <label className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30 cursor-pointer hover:bg-muted/60 transition-colors select-none">
                <input
                  type="checkbox"
                  checked={form.is_mine}
                  onChange={e => setForm(p => ({ ...p, is_mine: e.target.checked }))}
                  className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
                />
                <div>
                  <p className="text-sm font-medium leading-tight">{t('parties:is_mines_label')}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t('parties:is_mines_hint')}</p>
                </div>
              </label>

              <div>
                <Label>{t('parties:phone_label')} *</Label>
                <Input icon={<Phone className="h-4 w-4" />} className="mt-1.5" type="tel"
                  placeholder={t('parties:phone_placeholder')} value={form.phone} error={errors.phone}
                  onChange={e => { setForm(p => ({ ...p, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })); clearError('phone'); }}
                />
              </div>

              <div>
                <Label className="flex items-center gap-1.5">
                  WhatsApp
                  <span className="text-[10px] font-normal text-muted-foreground bg-green-500/10 text-green-600 border border-green-500/20 rounded px-1.5 py-0.5">
                    {t('common:optional')}
                  </span>
                </Label>
                <div className="mt-1.5 relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-green-500 pointer-events-none">
                    <MessageCircle className="h-4 w-4" />
                  </div>
                  <input
                    type="tel"
                    inputMode="numeric"
                    placeholder={t('parties:whatsapp_placeholder')}
                    value={form.whatsapp}
                    onChange={e => setForm(p => ({ ...p, whatsapp: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
                    className="flex h-10 w-full rounded-md border border-input bg-background pl-10 pr-3 py-2 text-sm
                      ring-offset-background placeholder:text-muted-foreground
                      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                  {form.phone && !form.whatsapp && (
                    <button
                      type="button"
                      onClick={() => setForm(p => ({ ...p, whatsapp: p.phone }))}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-green-600 hover:text-green-700 font-medium hover:underline"
                    >
                      {t('parties:same_as_phone')}
                    </button>
                  )}
                </div>
              </div>

              <div>
                <Label>{t('parties:email_label')}</Label>
                <Input icon={<Mail className="h-4 w-4" />} className="mt-1.5" type="email"
                  placeholder={t('parties:email_placeholder')} value={form.email} error={errors.email}
                  onChange={e => { setForm(p => ({ ...p, email: e.target.value })); clearError('email'); }}
                />
              </div>

              {/* ── Opening Balance ─────────────────────────────────── */}
              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2.5">
                <div className="flex items-center gap-2">
                  <Banknote className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">{t('common:opening_balance_label')}</span>
                  <span className="text-[10px] font-normal text-muted-foreground bg-background border border-border rounded px-1.5 py-0.5">
                    {t('common:optional')}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{t('parties:opening_balance_hint')}</p>
                <div className="flex gap-2">
                  {/* Amount */}
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₹</span>
                    <input
                      type="number"
                      min={0}
                      placeholder="0.00"
                      value={form.opening_balance}
                      onChange={e => setForm(p => ({ ...p, opening_balance: e.target.value }))}
                      className="flex h-10 w-full rounded-md border border-input bg-background pl-7 pr-3 py-2 text-sm
                        placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2
                        focus-visible:ring-ring focus-visible:ring-offset-2"
                    />
                  </div>
                  {/* Receivable / Payable toggle */}
                  <div className="flex rounded-md border border-input overflow-hidden shrink-0">
                    {(['receivable', 'payable'] as const).map(opt => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setForm(p => ({ ...p, opening_balance_type: opt }))}
                        className={[
                          'px-3 py-2 text-xs font-medium transition-colors',
                          form.opening_balance_type === opt
                            ? opt === 'receivable'
                              ? 'bg-green-500 text-white'
                              : 'bg-red-500 text-white'
                            : 'bg-background text-muted-foreground hover:bg-muted',
                        ].join(' ')}
                      >
                        {opt === 'receivable' ? t('parties:ob_receivable') : t('parties:ob_payable')}
                      </button>
                    ))}
                  </div>
                </div>
                {form.opening_balance && (
                  <p className="text-xs text-muted-foreground">
                    {form.opening_balance_type === 'receivable'
                      ? t('parties:ob_receivable_hint', { amount: `₹${form.opening_balance}` })
                      : t('parties:ob_payable_hint', { amount: `₹${form.opening_balance}` })}
                  </p>
                )}
              </div>
            </div>

            {/* ── Contacts / Owners ────────────────────────────────────── */}
            <div className="space-y-3">
              <SectionHeader icon={<User className="h-4 w-4" />} label={t('parties:contacts_owners')}
                open={sections.contacts} onToggle={() => toggle('contacts')} />

              {sections.contacts && (
                <div className="space-y-3 pl-1">
                  <p className="text-xs text-muted-foreground">
                    {t('parties:contacts_hint')}
                  </p>
                  {contacts.map((c, idx) => (
                    <div key={c.id} className="rounded-lg border border-border p-3 space-y-2.5 bg-muted/20">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">{t('parties:contact_index', { index: idx + 1 })}</span>
                        <button type="button" onClick={() => removeContact(c.id)}
                          className="text-muted-foreground hover:text-destructive transition-colors">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      <Input placeholder={t('parties:contact_name_placeholder')} value={c.name}
                        onChange={e => updateContact(c.id, 'name', e.target.value)} />
                      <div className="grid grid-cols-2 gap-2">
                        <Input placeholder={t('parties:contact_phone_placeholder')} value={c.phone}
                          onChange={e => updateContact(c.id, 'phone', e.target.value.replace(/\D/g, '').slice(0, 10))} />
                        <Input placeholder={t('parties:contact_email_placeholder')} value={c.email}
                          onChange={e => updateContact(c.id, 'email', e.target.value)} />
                      </div>
                      {/* Tags */}
                      <div>
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                            <input
                              placeholder={t('parties:tag_placeholder')}
                              value={c.tagInput}
                              onChange={e => updateContact(c.id, 'tagInput', e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(c.id); } }}
                              className="flex h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 py-2 text-sm
                                placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2
                                focus-visible:ring-ring focus-visible:ring-offset-2"
                            />
                          </div>
                          <button type="button" onClick={() => addTag(c.id)}
                            className="h-9 px-3 rounded-md border border-input bg-background text-sm hover:bg-accent transition-colors">
                            Add
                          </button>
                        </div>
                        {c.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {c.tags.map(tag => (
                              <Badge key={tag} variant="outline"
                                className="text-xs gap-1 cursor-pointer hover:bg-destructive/10"
                                onClick={() => removeTag(c.id, tag)}>
                                {tag} <X className="h-2.5 w-2.5" />
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  <button type="button" onClick={addContact}
                    className="flex items-center gap-2 text-sm text-primary hover:underline">
                    <Plus className="h-4 w-4" /> {t('parties:add_contact')}
                  </button>
                </div>
              )}
            </div>

            {/* ── GST Details ──────────────────────────────────────────── */}
            <div className="space-y-3">
              <SectionHeader icon={<FileText className="h-4 w-4" />} label={t('parties:gst_details')}
                open={sections.gst} onToggle={() => toggle('gst')} />

              {sections.gst && (
                <div className="space-y-3 pl-1">
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1.5 block">{t('parties:gst_registration_type')}</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {(['REGULAR', 'COMPOSITION', 'UNREGISTERED', 'CONSUMER'] as const).map(t => (
                        <button key={t} type="button"
                          onClick={() => setGst(p => ({ ...p, registrationType: t }))}
                          className={[
                            'rounded-md border px-3 py-2 text-xs font-medium transition-colors text-left',
                            gst.registrationType === t
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-border bg-background text-foreground hover:bg-muted',
                          ].join(' ')}>
                          {t.charAt(0) + t.slice(1).toLowerCase()}
                        </button>
                      ))}
                    </div>
                  </div>

                  {(gst.registrationType === 'REGULAR' || gst.registrationType === 'COMPOSITION') && (
                    <div>
                      <Label className="text-xs">{t('parties:gstin')}</Label>
                      <Input className="mt-1" placeholder="22AAAAA0000A1Z5"
                        value={gst.gstin}
                        onChange={e => setGst(p => ({ ...p, gstin: e.target.value.toUpperCase().slice(0, 15) }))}
                      />
                      <p className="text-[10px] text-muted-foreground mt-1">{t('parties:gstin_hint')}</p>
                    </div>
                  )}

                  <div>
                    <Label className="text-xs">{t('parties:registered_state')}
                      <span className="ml-1.5 text-muted-foreground font-normal">({t('parties:igst_vs_cgst')})</span>
                    </Label>
                    <div className="mt-1">
                      <SearchableDropdown
                        placeholder={t('parties:select_state_placeholder')}
                        value={gst.gstState}
                        options={[...INDIAN_STATES]}
                        onChange={v => setGst(p => ({ ...p, gstState: v }))}
                      />
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs">{t('parties:pan_number')}</Label>
                    <Input className="mt-1" placeholder="AAAAA0000A"
                      value={gst.panNumber}
                      onChange={e => setGst(p => ({ ...p, panNumber: e.target.value.toUpperCase().slice(0, 10) }))}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* ── Address ──────────────────────────────────────────────── */}
            <div className="space-y-3">
              <SectionHeader icon={<MapPin className="h-4 w-4" />} label={t('parties:address_section')}
                open={sections.address} onToggle={() => toggle('address')} />

              {sections.address && (
                <div className="space-y-3 pl-1">

                  {/* Street address with autocomplete */}
                  <div ref={addressContainerRef} className="relative">
                    <Label className="text-xs">
                      {t('parties:street_address')}
                      <span className="ml-1.5 text-muted-foreground font-normal">— {t('parties:address_autofill_hint')}</span>
                    </Label>
                    <div className="relative mt-1">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
                        {addressLoading
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <Search className="h-4 w-4" />}
                      </div>
                      <input
                        type="text"
                        value={addressQuery || addr.address}
                        onChange={e => handleAddressSearch(e.target.value)}
                        onFocus={() => { if (addressSuggestions.length) setShowSuggestions(true); }}
                        placeholder={t('parties:search_address_placeholder')}
                        className="flex h-10 w-full rounded-md border border-input bg-background pl-10 pr-3 py-2 text-sm
                          placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2
                          focus-visible:ring-ring focus-visible:ring-offset-2 transition-colors"
                      />
                    </div>

                    {/* Suggestions dropdown */}
                    <AnimatePresence>
                      {((showSuggestions && addressSuggestions.length > 0) ||
                        (addressNoResults && !addressLoading && (addressQuery || addr.address).length >= 2)) && (
                        <motion.div
                          initial={{ opacity: 0, y: -4, scale: 0.98 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -4, scale: 0.98 }}
                          transition={{ duration: 0.12 }}
                          className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-popover
                            text-popover-foreground shadow-xl max-h-56 overflow-y-auto"
                        >
                          {addressSuggestions.length > 0 ? (
                            addressSuggestions.map((s, i) => (
                              <button
                                key={`${s.lat}-${s.lon}-${i}`}
                                type="button"
                                onClick={() => selectAddress(s)}
                                className="flex flex-col items-start w-full px-3 py-2.5 text-sm hover:bg-accent
                                  hover:text-accent-foreground border-b border-border/40 last:border-0 text-left transition-colors"
                              >
                                <span className="font-medium flex items-center gap-1.5 text-foreground leading-snug">
                                  <MapPin className="h-3.5 w-3.5 text-primary shrink-0 mt-px" />
                                  {s.address}
                                </span>
                                {(s.city || s.state || s.pincode) && (
                                  <span className="text-xs text-muted-foreground ml-5 mt-0.5">
                                    {[s.city, s.state, s.pincode].filter(Boolean).join(', ')}
                                  </span>
                                )}
                              </button>
                            ))
                          ) : (
                            <div className="px-3 py-4 text-sm text-center text-muted-foreground">
                              <p className="font-medium text-foreground mb-1">{t('parties:no_address_results')}</p>
                              <p className="text-xs">{t('parties:no_address_results_hint')}</p>
                            </div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <div>
                    <Label className="text-xs">{t('parties:state')}</Label>
                    <div className="mt-1">
                      <SearchableDropdown
                        placeholder={t('parties:select_state_placeholder')}
                        value={addr.state}
                        options={[...INDIAN_STATES]}
                        onChange={v => updateAddr('state', v)}
                      />
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs">{t('parties:city')}</Label>
                    <div className="mt-1">
                      <SearchableDropdown
                        placeholder={addr.state ? t('parties:select_city') : t('parties:select_state_first')}
                        value={addr.city}
                        options={cities}
                        onChange={v => updateAddr('city', v)}
                        disabled={!addr.state}
                        allowFreeText={v => v.trim().length >= 2}
                      />
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs">{t('parties:pincode')}</Label>
                    <div className="mt-1">
                      <SearchableDropdown
                        placeholder={addr.city ? t('parties:select_pincode') : t('parties:select_city_first')}
                        value={addr.pincode}
                        options={pincodeOptions}
                        onChange={v => updateAddr('pincode', v.split('—')[0].trim())}
                        disabled={!addr.city}
                        loading={pincodesLoading}
                        allowFreeText={v => /^[1-9][0-9]{5}$/.test(v.trim())}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ── Credit ───────────────────────────────────────────────── */}
            <div className="space-y-3">
              <SectionHeader icon={<CreditCard className="h-4 w-4" />} label={t('parties:credit_terms')}
                open={sections.credit} onToggle={() => toggle('credit')} />

              {sections.credit && (
                <div className="grid grid-cols-2 gap-3 pl-1">
                  <div>
                    <Label className="text-xs">{t('parties:credit_period')}</Label>
                    <div className="relative mt-1">
                      <Input type="number" placeholder="30" min={0} max={365}
                        value={credit.periodDays}
                        onChange={e => setCredit(p => ({ ...p, periodDays: e.target.value }))}
                        className="pr-12"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{t('parties:days')}</span>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">{t('parties:credit_limit')}</Label>
                    <div className="relative mt-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">₹</span>
                      <Input type="number" placeholder="0.00" min={0}
                        value={credit.limit}
                        onChange={e => setCredit(p => ({ ...p, limit: e.target.value }))}
                        className="pl-6"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ── Banking Details ───────────────────────────────────────── */}
            <div className="space-y-3">
              <SectionHeader icon={<Banknote className="h-4 w-4" />} label={t('parties:banking_details')}
                open={sections.banking} onToggle={() => toggle('banking')} />

              {sections.banking && (
                <div className="space-y-3 pl-1">
                  <p className="text-xs text-muted-foreground">
                    {t('parties:banking_hint')}
                  </p>
                  {banks.map((b, idx) => (
                    <div key={b.id} className="rounded-lg border border-border p-3 space-y-2.5 bg-muted/20">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                          <Building2 className="h-3.5 w-3.5" /> {t('parties:bank_index', { index: idx + 1 })}
                          {idx === 0 && (
                            <Badge variant="outline" className="text-[10px] py-0">{t('parties:primary_label')}</Badge>
                          )}
                        </span>
                        <button type="button" onClick={() => removeBank(b.id)}
                          className="text-muted-foreground hover:text-destructive transition-colors">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Input placeholder={t('parties:bank_name_placeholder')} value={b.bankName}
                          onChange={e => updateBank(b.id, 'bankName', e.target.value)} />
                        <Input placeholder={t('parties:ifsc_placeholder')} value={b.ifscCode}
                          onChange={e => updateBank(b.id, 'ifscCode', e.target.value.toUpperCase())} />
                      </div>
                      <Input placeholder={t('parties:account_number_placeholder')} value={b.accountNumber}
                        onChange={e => updateBank(b.id, 'accountNumber', e.target.value)} />
                      <Input placeholder={t('parties:branch_placeholder')} value={b.branch}
                        onChange={e => updateBank(b.id, 'branch', e.target.value)} />
                    </div>
                  ))}
                  <button type="button" onClick={addBank}
                    className="flex items-center gap-2 text-sm text-primary hover:underline">
                    <Plus className="h-4 w-4" /> {t('parties:add_bank_account')}
                  </button>
                </div>
              )}
            </div>

          </div>

          {/* ── Footer ───────────────────────────────────────────────── */}
          <DialogFooter className="px-6 py-4 border-t border-border shrink-0 bg-background">
            <Button type="button" variant="outline" onClick={onClose}>{t('common:cancel')}</Button>
            <Button type="submit" loading={loading}>{t('parties:add_party_btn')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
