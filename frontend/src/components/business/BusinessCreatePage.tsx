import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import {
  Building2, ArrowRight, ArrowLeft, MapPin, Phone as PhoneIcon,
  FileText, Search, Loader2, X, ChevronDown, Check, Camera, Trash2,
} from 'lucide-react';
import { Button, Input, Card, CardContent, Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui';
import { businessApi } from '@/lib/api';
import { useAppDispatch, useFormErrors } from '@/hooks';
import { setBusinesses, setCurrentBusiness } from '@/store/businessSlice';
import {
  INDIAN_STATES, getCitiesForState, searchAddress,
  fetchPincodesForCity,
  type AddressSuggestion, type PincodeInfo,
} from '@/lib/india-geo';
import toast from 'react-hot-toast';

const BUSINESS_TYPE_VALUES = ['TRADING', 'MANDI', 'WHOLESALE', 'RETAIL', 'MANUFACTURING', 'DISTRIBUTOR', 'OTHER'] as const;

// ─── Field Label ─────────────────────────────────────────────────────────
function FieldLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <label className="flex items-center gap-2 text-sm font-medium mb-1.5">
      {children}
      {hint && <span className="text-muted-foreground text-xs font-normal">{hint}</span>}
    </label>
  );
}

// ─── Searchable Dropdown ─────────────────────────────────────────────────
interface SearchableDropdownProps {
  placeholder: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  allowCustom?: boolean;
  disabled?: boolean;
}

function SearchableDropdown({
  placeholder, value, options, onChange, allowCustom = true, disabled,
}: SearchableDropdownProps) {
  const { t } = useTranslation(['business', 'common', 'parties']);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = options.filter(o => o.toLowerCase().includes(search.toLowerCase()));

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const select = (val: string) => { onChange(val); setOpen(false); setSearch(''); };

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <div className="relative">
        <button
          type="button"
          disabled={disabled}
          onClick={() => { setOpen(o => !o); setTimeout(() => inputRef.current?.focus(), 50); }}
          className={[
            'flex h-10 w-full items-center justify-between rounded-md border bg-background px-3 py-2 text-sm',
            'ring-offset-background transition-colors',
            'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
            'disabled:cursor-not-allowed disabled:opacity-50',
            open ? 'border-ring' : 'border-input',
          ].join(' ')}
        >
          <span className={value ? 'text-foreground' : 'text-muted-foreground'}>
            {value || placeholder}
          </span>
          <div className="flex items-center gap-1 shrink-0">
            {value && (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); onChange(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onChange(''); } }}
                className="rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
              >
                <X className="h-3 w-3" />
              </span>
            )}
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
          </div>
        </button>
      </div>

      {/* Dropdown */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.12 }}
            className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-popover text-popover-foreground shadow-xl"
          >
            <div className="p-2 border-b border-border">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <input
                  ref={inputRef}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder={t('parties:type_search_placeholder')}
                  className="w-full rounded-md border border-input bg-background pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>
            <div className="max-h-52 overflow-y-auto p-1">
              {filtered.length === 0 && !allowCustom && (
                <p className="text-xs text-muted-foreground text-center py-4">{t('common:no_results')}</p>
              )}
              {filtered.map(opt => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => select(opt)}
                  className="relative flex w-full items-center rounded-md px-2.5 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
                >
                  <span className="flex-1 text-left">{opt}</span>
                  {opt === value && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                </button>
              ))}
              {allowCustom && search.trim() && !filtered.some(f => f.toLowerCase() === search.trim().toLowerCase()) && (
                <button
                  type="button"
                  onClick={() => select(search.trim())}
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm text-primary hover:bg-accent border-t border-border mt-1 pt-2.5"
                >
                  <span className="font-medium">+ Add &ldquo;{search.trim()}&rdquo;</span>
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Section Divider ──────────────────────────────────────────────────────
function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <div className="flex-1 h-px bg-border" />
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────
export default function BusinessCreatePage() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { t } = useTranslation(['business', 'common']);
  const [loading, setLoading] = useState(false);
  const { errors, clearError, validate, setError } = useFormErrors<'name' | 'type' | 'gst_number' | 'phone' | 'pincode'>();

  const [form, setForm] = useState({
    name: '', type: '', gst_number: '',
    address: '', city: '', state: '', phone: '', pincode: '',
  });

  // Business image
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Address search
  const [addressQuery, setAddressQuery] = useState('');
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [addressLoading, setAddressLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [noResults, setNoResults] = useState(false);
  const addressContainerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  // Pincodes
  const [pincodes, setPincodes] = useState<PincodeInfo[]>([]);
  const [pincodesLoading, setPincodesLoading] = useState(false);

  const cities = form.state ? getCitiesForState(form.state) : [];
  const pincodeOptions = pincodes.map(p => `${p.pincode} — ${p.officeName}`);

  // ─── Image picker ─────────────────────────────────────────────────────
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error(t('business:image_too_large')); return; }
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  // ─── Form field updater ───────────────────────────────────────────────
  const updateField = (field: string, value: string) => {
    setForm(prev => {
      const next = { ...prev, [field]: value };
      if (field === 'state') {
        const newCities = getCitiesForState(value);
        if (prev.city && !newCities.includes(prev.city)) {
          next.city = ''; next.pincode = '';
          setPincodes([]);
        }
      }
      if (field === 'city') {
        next.pincode = '';
        if (value) { loadPincodes(value); } else { setPincodes([]); }
      }
      return next;
    });
  };

  // ─── Pincodes ─────────────────────────────────────────────────────────
  const loadPincodes = useCallback(async (city: string) => {
    if (!city) { setPincodes([]); return; }
    setPincodesLoading(true);
    try { setPincodes(await fetchPincodesForCity(city)); }
    finally { setPincodesLoading(false); }
  }, []);

  // ─── Address autocomplete ─────────────────────────────────────────────
  const handleAddressSearch = useCallback((query: string) => {
    setAddressQuery(query);
    setForm(prev => ({ ...prev, address: query }));
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.length < 2) {
      setAddressSuggestions([]); setShowSuggestions(false); setNoResults(false); return;
    }
    debounceRef.current = setTimeout(async () => {
      setAddressLoading(true); setNoResults(false);
      try {
        const results = await searchAddress(query);
        setAddressSuggestions(results);
        setShowSuggestions(results.length > 0);
        setNoResults(results.length === 0);
      } finally { setAddressLoading(false); }
    }, 300);
  }, []);

  const selectAddress = (s: AddressSuggestion) => {
    const matchedState = INDIAN_STATES.find(st => st.toLowerCase() === s.state.toLowerCase()) || s.state || '';
    const matchedCity = s.city || '';
    setForm(prev => ({
      ...prev,
      address: s.address,
      pincode: s.pincode || prev.pincode,
      state: matchedState || prev.state,
      city: matchedCity || prev.city,
    }));
    setAddressQuery(s.address);
    setShowSuggestions(false); setNoResults(false); setAddressSuggestions([]);
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

  const handlePincodeSelect = (val: string) => {
    updateField('pincode', val.split('—')[0]?.trim() || val);
  };

  // ─── Submit ───────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Mirror the server's zod rules so a typo is flagged on the field instead
    // of a bare "Validation failed" toast at the end of onboarding.
    const gstin = form.gst_number.trim();
    const pincode = form.pincode.trim();
    const phone = form.phone.trim();
    const ok = validate({
      name: [!form.name.trim(), t('business:name_required')],
      type: [!form.type, t('business:type_required')],
      gst_number: [
        !!gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstin),
        t('business:gstin_invalid', 'Invalid GSTIN (format: 22AAAAA0000A1Z5)'),
      ],
      phone: [!!phone && !/^[6-9]\d{9}$/.test(phone), t('business:phone_invalid', 'Phone must be 10 digits starting 6-9')],
      pincode: [!!pincode && !/^[1-9][0-9]{5}$/.test(pincode), t('business:pincode_invalid', 'Pincode must be 6 digits, not starting with 0')],
    });
    if (!ok) return;

    try {
      setLoading(true);

      let payload: any;
      if (imageFile) {
        // Send as multipart/form-data when image is included
        const fd = new FormData();
        fd.append('name', form.name.trim());
        fd.append('type', form.type);
        if (form.gst_number.trim()) fd.append('gstNumber', form.gst_number.trim());
        if (form.phone.trim()) fd.append('phone', form.phone.trim());
        if (form.address.trim()) fd.append('address', form.address.trim());
        if (form.city.trim()) fd.append('city', form.city.trim());
        if (form.state.trim()) fd.append('state', form.state.trim());
        if (form.pincode.trim()) fd.append('pincode', form.pincode.trim());
        fd.append('logo', imageFile);
        payload = fd;
      } else {
        payload = {
          name: form.name.trim(), type: form.type,
          ...(form.gst_number.trim() && { gstNumber: form.gst_number.trim() }),
          ...(form.phone.trim() && { phone: form.phone.trim() }),
          ...(form.address.trim() && { address: form.address.trim() }),
          ...(form.city.trim() && { city: form.city.trim() }),
          ...(form.state.trim() && { state: form.state.trim() }),
          ...(form.pincode.trim() && { pincode: form.pincode.trim() }),
        };
      }

      const { data } = await businessApi.create(payload);
      if (data?.data) {
        // Re-fetch the full businesses list so logo_url and all fields are up to date in the store
        const bizRes = await businessApi.list();
        const freshList = bizRes.data?.data || [];
        dispatch(setBusinesses(freshList));

        // Set the current business from the fresh list (has persisted logo_url)
        const created = freshList.find((b: any) => b.id === data.data.id) || data.data;
        dispatch(setCurrentBusiness(created));

        toast.success(t('business:created_redirect'));
        navigate('/subscription?setup=true');
      }
    } catch (err: any) {
      // Map server-side field errors back onto the inputs — the response
      // carries `errors: [{field, message}]` that used to be discarded.
      const fieldErrors: { field: string; message: string }[] = err.response?.data?.errors || [];
      const fieldMap: Record<string, 'name' | 'type' | 'gst_number' | 'phone' | 'pincode'> = {
        name: 'name', type: 'type', gstNumber: 'gst_number', phone: 'phone', pincode: 'pincode',
      };
      let mapped = false;
      for (const fe of fieldErrors) {
        const key = fieldMap[fe.field];
        if (key) { setError(key, fe.message); mapped = true; }
      }
      if (!mapped) toast.error(err.response?.data?.message || t('business:created_error'));
    } finally {
      setLoading(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background flex items-start justify-center p-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-lg"
      >
        {/* Header */}
        <div className="text-center mb-8">
          <div className="h-14 w-14 rounded-2xl gradient-primary flex items-center justify-center mx-auto mb-4 shadow-lg">
            <Building2 className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{t('business:create_title')}</h1>
          <p className="text-muted-foreground text-sm mt-1">{t('business:create_subtitle')}</p>
        </div>

        <Card className="glass shadow-sm">
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-5">

              {/* ── Business Logo ─────────────────────────────────────── */}
              <div className="flex flex-col items-center gap-3 pb-2">
                <div className="relative group">
                  {/* Avatar circle */}
                  <div
                    onClick={() => imageInputRef.current?.click()}
                    className={[
                      'h-24 w-24 rounded-full border-2 border-dashed cursor-pointer overflow-hidden',
                      'flex items-center justify-center transition-all duration-200',
                      imagePreview
                        ? 'border-transparent'
                        : 'border-border hover:border-primary bg-muted hover:bg-muted/70',
                    ].join(' ')}
                  >
                    {imagePreview ? (
                      <img src={imagePreview} alt={t('business:business_logo_alt')} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex flex-col items-center gap-1 text-muted-foreground group-hover:text-primary transition-colors">
                        <Camera className="h-6 w-6" />
                        <span className="text-[10px] font-medium">{t('business:add_logo')}</span>
                      </div>
                    )}
                  </div>

                  {/* Overlay on hover when image exists */}
                  {imagePreview && (
                    <div
                      onClick={() => imageInputRef.current?.click()}
                      className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                    >
                      <Camera className="h-5 w-5 text-white" />
                    </div>
                  )}

                  {/* Remove button */}
                  {imagePreview && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); removeImage(); }}
                      className="absolute -top-1 -right-1 h-6 w-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow-md hover:bg-destructive/90 transition-colors"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>

                <div className="text-center">
                  <p className="text-sm font-medium">{t('business:logo')}</p>
                  <p className="text-xs text-muted-foreground">{t('business:logo_hint')}</p>
                </div>

                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleImageChange}
                  className="hidden"
                />
              </div>

              <SectionDivider label={t('business:basic_info')} />

              {/* Business Name */}
              <div>
                <FieldLabel>{t('business:business_name')} <span className="text-destructive">*</span></FieldLabel>
                <Input
                  icon={<Building2 className="h-4 w-4" />}
                  placeholder={t('business:business_name_placeholder')}
                  value={form.name}
                  onChange={(e) => { updateField('name', e.target.value); clearError('name'); }}
                  error={errors.name}
                  autoFocus
                />
              </div>

              {/* Business Type */}
              <div>
                <FieldLabel>{t('business:business_type')} <span className="text-destructive">*</span></FieldLabel>
                <Select value={form.type} onValueChange={(val) => { updateField('type', val); clearError('type'); }}>
                  <SelectTrigger error={errors.type}>
                    <SelectValue placeholder={t('business:select_type')} />
                  </SelectTrigger>
                  <SelectContent>
                    {BUSINESS_TYPE_VALUES.map(val => (
                      <SelectItem key={val} value={val}>{t(`business:types.${val}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Phone + GST row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <FieldLabel>{t('business:phone')} <span className="text-destructive">*</span></FieldLabel>
                  <Input
                    icon={<PhoneIcon className="h-4 w-4" />}
                    type="tel"
                    placeholder={t('business:phone_placeholder')}
                    value={form.phone}
                    error={errors.phone}
                    onChange={(e) => { clearError('phone'); updateField('phone', e.target.value.replace(/\D/g, '').slice(0, 10)); }}
                  />
                </div>
                <div>
                  <FieldLabel>{t('business:gst_number')} <span className="text-muted-foreground text-xs font-normal">({t('common:optional', 'optional')})</span></FieldLabel>
                  <Input
                    icon={<FileText className="h-4 w-4" />}
                    placeholder="22AAAAA0000A1Z5"
                    value={form.gst_number}
                    error={errors.gst_number}
                    onChange={(e) => { clearError('gst_number'); updateField('gst_number', e.target.value.toUpperCase()); }}
                    maxLength={15}
                  />
                </div>
              </div>

              <SectionDivider label={t('business:address')} />

              {/* Address search */}
              <div ref={addressContainerRef} className="relative">
                <FieldLabel hint={t('business:address_hint')}>{t('business:address')}</FieldLabel>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
                    {addressLoading
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <Search className="h-4 w-4" />}
                  </div>
                  <input
                    type="text"
                    value={addressQuery || form.address}
                    onChange={(e) => handleAddressSearch(e.target.value)}
                    onFocus={() => { if (addressSuggestions.length) setShowSuggestions(true); }}
                    placeholder={t('business:address_search_placeholder')}
                    className="flex h-10 w-full rounded-md border border-input bg-background pl-10 pr-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 transition-colors"
                  />
                </div>

                {/* Suggestions */}
                <AnimatePresence>
                  {(showSuggestions && addressSuggestions.length > 0) ||
                   (noResults && !addressLoading && (addressQuery || form.address).length >= 2) ? (
                    <motion.div
                      initial={{ opacity: 0, y: -4, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -4, scale: 0.98 }}
                      transition={{ duration: 0.12 }}
                      className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-popover text-popover-foreground shadow-xl max-h-64 overflow-y-auto"
                    >
                      {addressSuggestions.length > 0 ? (
                        addressSuggestions.map((s, i) => (
                          <button
                            key={`${s.lat}-${s.lon}-${i}`}
                            type="button"
                            onClick={() => selectAddress(s)}
                            className="flex flex-col items-start w-full px-3 py-2.5 text-sm hover:bg-accent hover:text-accent-foreground border-b border-border/40 last:border-0 text-left transition-colors"
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
                          <p className="font-medium text-foreground mb-1">{t('business:no_address_results')}</p>
                          <p className="text-xs">{t('business:no_address_results_hint')}</p>
                        </div>
                      )}
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>

              {/* State & City */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <FieldLabel>{t('business:state')}</FieldLabel>
                  <SearchableDropdown
                    placeholder={t('business:select_state')}
                    value={form.state}
                    options={[...INDIAN_STATES]}
                    onChange={(val) => updateField('state', val)}
                    allowCustom
                  />
                </div>
                <div>
                  <FieldLabel>{t('business:city')}</FieldLabel>
                  <SearchableDropdown
                    placeholder={form.state ? t('business:select_city') : t('business:select_state_first')}
                    value={form.city}
                    options={cities}
                    onChange={(val) => updateField('city', val)}
                    allowCustom
                    disabled={false}
                  />
                </div>
              </div>
              {form.state && cities.length > 0 && (
                <p className="text-xs text-muted-foreground -mt-2">
                  {t('business:cities_listed', { count: cities.length, state: form.state })}
                </p>
              )}

              {/* Pincode */}
              <div>
                <FieldLabel>
                  {t('business:pincode')}
                  {pincodesLoading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                </FieldLabel>
                {pincodes.length > 0 ? (
                  <>
                    <SearchableDropdown
                      placeholder={t('business:select_pincode')}
                      value={
                        form.pincode
                          ? (pincodes.find(p => p.pincode === form.pincode)
                            ? `${form.pincode} — ${pincodes.find(p => p.pincode === form.pincode)?.officeName}`
                            : form.pincode)
                          : ''
                      }
                      options={pincodeOptions}
                      onChange={handlePincodeSelect}
                      allowCustom
                    />
                    {form.city && (
                      <p className="text-xs text-muted-foreground mt-1.5">
                        {t('business:pincodes_found', { count: pincodes.length, city: form.city })}
                      </p>
                    )}
                  </>
                ) : (
                  <Input
                    placeholder={
                      form.city
                        ? (pincodesLoading ? t('business:pincode_loading') : t('business:pincode_manual'))
                        : t('business:select_city_first')
                    }
                    value={form.pincode}
                    error={errors.pincode}
                    onChange={(e) => { clearError('pincode'); updateField('pincode', e.target.value.replace(/\D/g, '').slice(0, 6)); }}
                    maxLength={6}
                  />
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-3 border-t border-border">
                <Button type="button" variant="outline" className="flex-1" onClick={() => navigate(-1)}>
                  <ArrowLeft className="h-4 w-4 mr-2" /> {t('common:back')}
                </Button>
                <Button type="submit" className="flex-1" loading={loading}>
                  {t('business:create_button')} <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>

            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
