import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Filter, X, RotateCcw, Calendar } from 'lucide-react';
import { Button, Input, Label, Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui';
import { useTranslation } from 'react-i18next';

export interface FilterField {
  key: string;
  label: string;
  type: 'text' | 'select' | 'date' | 'date-range' | 'number-range';
  options?: { value: string; label: string }[];
  placeholder?: string;
}

type DatePreset = 'today' | 'last_week' | 'last_month' | 'last_year' | 'custom' | '';

interface AdvancedFiltersProps {
  fields: FilterField[];
  values: Record<string, any>;
  onChange: (values: Record<string, any>) => void;
  onReset: () => void;
  /** Key used for date filtering in the API params. Defaults to 'date' */
  dateKey?: string;
}

function getPresetRange(preset: DatePreset): { from: string; to: string } | null {
  const fmt = (d: Date) => d.toISOString().split('T')[0];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  switch (preset) {
    case 'today': {
      const s = fmt(today);
      return { from: s, to: s };
    }
    case 'last_week': {
      const to = new Date(today);
      const from = new Date(today);
      from.setDate(from.getDate() - 6);
      return { from: fmt(from), to: fmt(to) };
    }
    case 'last_month': {
      const to = new Date(today);
      const from = new Date(today);
      from.setDate(from.getDate() - 29);
      return { from: fmt(from), to: fmt(to) };
    }
    case 'last_year': {
      const to = new Date(today);
      const from = new Date(today);
      from.setFullYear(from.getFullYear() - 1);
      return { from: fmt(from), to: fmt(to) };
    }
    default:
      return null;
  }
}

export function AdvancedFilters({ fields, values, onChange, onReset, dateKey = 'date' }: AdvancedFiltersProps) {
  const { t } = useTranslation('common');
  const [open, setOpen] = useState(false);
  const [activePreset, setActivePreset] = useState<DatePreset>('');

  const fromKey = `${dateKey}_from`;
  const toKey   = `${dateKey}_to`;

  // Count non-date advanced filters that are active
  const advancedActiveCount = Object.entries(values).filter(([k, v]) =>
    k !== fromKey && k !== toKey && v !== '' && v !== undefined && v !== null
  ).length;

  const updateValue = (key: string, value: any) => {
    onChange({ ...values, [key]: value });
  };

  const handlePreset = (preset: DatePreset) => {
    if (activePreset === preset && preset !== 'custom') {
      // Deselect
      setActivePreset('');
      onChange({ ...values, [fromKey]: '', [toKey]: '' });
      return;
    }
    setActivePreset(preset);
    if (preset === 'custom') {
      // Just activate custom mode — user types dates below
      return;
    }
    const range = getPresetRange(preset);
    if (range) {
      onChange({ ...values, [fromKey]: range.from, [toKey]: range.to });
    }
  };

  const handleReset = () => {
    setActivePreset('');
    onReset();
  };

  const hasDateFilter = values[fromKey] || values[toKey];

  const TRANSLATED_PRESETS: { id: DatePreset; label: string }[] = [
    { id: 'today',      label: t('today') },
    { id: 'last_week',  label: t('last_7_days') },
    { id: 'last_month', label: t('last_30_days') },
    { id: 'last_year',  label: t('last_year') },
    { id: 'custom',     label: t('custom') },
  ];

  return (
    <div className="space-y-3">
      {/* ── Date Preset Bar ─────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground shrink-0">
          <Calendar className="h-3.5 w-3.5" /> Period:
        </span>
        <div className="flex items-center gap-1.5 flex-wrap">
          {TRANSLATED_PRESETS.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => handlePreset(p.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                activePreset === p.id
                  ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                  : 'bg-background border-border text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-primary/5'
              }`}
            >
              {p.label}
            </button>
          ))}
          {hasDateFilter && (
            <button
              type="button"
              onClick={() => { setActivePreset(''); onChange({ ...values, [fromKey]: '', [toKey]: '' }); }}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-red-400 border border-transparent hover:border-red-400/30 hover:bg-red-400/5 transition-all"
              title={t('clear_date_filter')}
            >
              <X className="h-3 w-3" /> {t('clear')}
            </button>
          )}
        </div>

        {/* Spacer + Advanced Filters button */}
        <div className="ml-auto flex items-center gap-2">
          {hasDateFilter && activePreset !== 'custom' && (
            <span className="text-[11px] text-muted-foreground">
              {values[fromKey]}{values[fromKey] !== values[toKey] ? ` → ${values[toKey]}` : ''}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={() => setOpen(!open)} className="relative">
            <Filter className="h-4 w-4 mr-2" />
            {t('filters')}
            {advancedActiveCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-primary text-[10px] font-bold flex items-center justify-center text-white">
                {advancedActiveCount}
              </span>
            )}
          </Button>
        </div>
      </div>

      {/* ── Custom date inputs (shown when Custom is active) ── */}
      <AnimatePresence>
        {activePreset === 'custom' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="flex items-center gap-3 p-3 rounded-lg border border-primary/20 bg-primary/5">
              <Calendar className="h-4 w-4 text-primary shrink-0" />
              <div className="flex items-center gap-2 flex-1">
                <div className="flex-1">
                  <Label className="text-xs text-muted-foreground">From</Label>
                  <Input
                    type="date"
                    className="mt-1 h-8 text-sm"
                    value={values[fromKey] || ''}
                    onChange={(e) => updateValue(fromKey, e.target.value)}
                  />
                </div>
                <span className="text-muted-foreground mt-5">→</span>
                <div className="flex-1">
                  <Label className="text-xs text-muted-foreground">To</Label>
                  <Input
                    type="date"
                    className="mt-1 h-8 text-sm"
                    value={values[toKey] || ''}
                    onChange={(e) => updateValue(toKey, e.target.value)}
                  />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Advanced Filters Panel ───────────────────────── */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="p-4 rounded-lg border border-border bg-card/50">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <Filter className="h-4 w-4 text-primary" />
                  Advanced Filters
                </h4>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={handleReset}>
                    <RotateCcw className="h-3 w-3 mr-1" /> {t('common:reset_all')}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOpen(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {fields.map((field) => (
                  <div key={field.key}>
                    <Label className="text-xs text-muted-foreground">{field.label}</Label>
                    {field.type === 'text' && (
                      <Input
                        className="mt-1.5 h-9"
                        placeholder={field.placeholder || `Filter by ${field.label.toLowerCase()}`}
                        value={values[field.key] || ''}
                        onChange={(e) => updateValue(field.key, e.target.value)}
                      />
                    )}
                    {field.type === 'select' && (
                      <Select value={values[field.key] || ''} onValueChange={(val) => updateValue(field.key, val)}>
                        <SelectTrigger className="mt-1.5 h-9">
                          <SelectValue placeholder={field.placeholder || t('common:all')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__all__">{t('common:all')}</SelectItem>
                          {field.options?.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {field.type === 'date' && (
                      <Input
                        type="date"
                        className="mt-1.5 h-9"
                        value={values[field.key] || ''}
                        onChange={(e) => updateValue(field.key, e.target.value)}
                      />
                    )}
                    {field.type === 'date-range' && field.key !== dateKey && (
                      <div className="flex gap-2 mt-1.5">
                        <Input
                          type="date"
                          className="h-9"
                          placeholder={t('common:from')}
                          value={values[`${field.key}_from`] || ''}
                          onChange={(e) => updateValue(`${field.key}_from`, e.target.value)}
                        />
                        <Input
                          type="date"
                          className="h-9"
                          placeholder={t('common:to')}
                          value={values[`${field.key}_to`] || ''}
                          onChange={(e) => updateValue(`${field.key}_to`, e.target.value)}
                        />
                      </div>
                    )}
                    {field.type === 'number-range' && (
                      <div className="flex gap-2 mt-1.5">
                        <Input
                          type="number"
                          className="h-9"
                          placeholder={t('common:min')}
                          value={values[`${field.key}_min`] || ''}
                          onChange={(e) => updateValue(`${field.key}_min`, e.target.value)}
                        />
                        <Input
                          type="number"
                          className="h-9"
                          placeholder={t('common:max')}
                          value={values[`${field.key}_max`] || ''}
                          onChange={(e) => updateValue(`${field.key}_max`, e.target.value)}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
