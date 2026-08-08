import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Upload, AlertTriangle, Check, X, Download, Info,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  Button, Label, Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Card, CardContent, Progress,
} from '@/components/ui';
import toast from 'react-hot-toast';
import { runImport, UNSUPPORTED_MODULES, type ImportModule, type ImportOutcome } from '@/lib/importers';

interface ImportDataDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  defaultModule?: ImportModule;
}

interface ParsedRow {
  [key: string]: string;
}

const MODULE_TEMPLATES: Record<ImportModule, { headers: string[]; sampleRow: string[] }> = {
  parties: {
    headers: ['name', 'phone', 'email', 'type', 'opening_balance'],
    sampleRow: ['Sharma Seeds', '9876543210', 'sharma@example.com', 'SUPPLIER', '45000'],
  },
  inventory: {
    headers: ['name', 'sku', 'unit', 'current_stock', 'min_stock', 'category'],
    sampleRow: ['Wheat Grade A', 'WHT-A', 'Quintal', '150', '50', 'Grains'],
  },
  purchases: {
    headers: ['purchase_date', 'party_name', 'item_name', 'quantity', 'rate', 'amount', 'gadi_number'],
    sampleRow: ['2024-01-15', 'Sharma Seeds', 'Wheat Grade A', '100', '2500', '250000', 'MP-04-AB-1234'],
  },
  sales: {
    headers: ['sale_date', 'party_name', 'item_name', 'quantity', 'rate', 'amount'],
    sampleRow: ['2024-01-15', 'Gupta Trading', 'Wheat Grade A', '50', '2800', '140000'],
  },
  payments: {
    headers: ['date', 'party_name', 'type', 'amount', 'mode', 'reference'],
    sampleRow: ['2024-01-15', 'Gupta Trading', 'IN', '80000', 'UPI', 'UPI-12345'],
  },
  ledger: {
    headers: ['date', 'account_type', 'entry_type', 'amount', 'narration', 'party_name'],
    sampleRow: ['2024-01-15', 'PURCHASE', 'DEBIT', '125000', 'Purchase from Sharma Seeds', 'Sharma Seeds'],
  },
  expenses: {
    headers: ['date', 'expense_type', 'category', 'amount', 'payment_mode', 'is_paid', 'notes'],
    sampleRow: ['2024-01-15', 'Freight', 'DIRECT', '4500', 'CASH', 'true', 'Mandi to godown'],
  },
};

export function ImportDataDialog({ open, onClose, onSuccess, defaultModule = 'parties' }: ImportDataDialogProps) {
  const { t } = useTranslation();
  const [module, setModule] = useState<ImportModule>(defaultModule);
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [_importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const [step, setStep] = useState<'upload' | 'preview' | 'importing' | 'done'>('upload');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = () => {
    setFile(null);
    setParsedData([]);
    setErrors([]);
    setImporting(false);
    setProgress(0);
    setOutcome(null);
    setStep('upload');
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const parseCSV = (text: string): ParsedRow[] => {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase().replace(/\s+/g, '_'));
    return lines.slice(1).map(line => {
      const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      const row: ParsedRow = {};
      headers.forEach((h, i) => { row[h] = values[i] || ''; });
      return row;
    }).filter(row => Object.values(row).some(v => v !== ''));
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    const validTypes = ['text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/plain'];
    if (!validTypes.includes(selectedFile.type) && !selectedFile.name.endsWith('.csv')) {
      toast.error(t('common:upload_csv'));
      return;
    }

    setFile(selectedFile);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const data = parseCSV(text);
      if (data.length === 0) {
        setErrors(['File is empty or has invalid format. Please check your CSV file.']);
        return;
      }

      const template = MODULE_TEMPLATES[module];
      const fileHeaders = Object.keys(data[0]);
      const missingHeaders = template.headers.filter(h => !fileHeaders.includes(h));
      const validationErrors: string[] = [];

      if (missingHeaders.length > 0) {
        validationErrors.push(`Missing columns: ${missingHeaders.join(', ')}`);
      }
      if (data.length > 5000) {
        validationErrors.push('Maximum 5000 rows allowed per import');
      }

      setErrors(validationErrors);
      setParsedData(data);
      setStep('preview');
    };
    reader.readAsText(selectedFile);
  };

  const handleDownloadTemplate = () => {
    const template = MODULE_TEMPLATES[module];
    const csv = [
      template.headers.join(','),
      template.sampleRow.join(','),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${module}_import_template.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t('common:template_downloaded'));
  };

  const handleImport = async () => {
    if (errors.length > 0) return toast.error(t('common:fix_errors_before_import'));

    const blocked = UNSUPPORTED_MODULES[module];
    if (blocked) return toast.error(blocked, { duration: 8000 });

    setStep('importing');
    setImporting(true);
    setProgress(0);
    setOutcome(null);

    try {
      const result = await runImport(module, parsedData, (done, total) => {
        setProgress(total ? Math.round((done / total) * 100) : 100);
      });
      setOutcome(result);
      setStep('done');

      if (result.failed === 0) {
        toast.success(t('common:import_success_toast', { count: result.imported, module }));
      } else if (result.imported === 0) {
        toast.error(`Import failed — 0 of ${parsedData.length} rows were saved`);
      } else {
        toast(`Imported ${result.imported}, skipped ${result.failed}`, { icon: '⚠️' });
      }

      // Only refresh the caller if something actually landed.
      if (result.imported > 0) onSuccess?.();
    } catch (e: any) {
      setOutcome({ imported: 0, failed: parsedData.length, errors: [{ row: 0, message: e?.message || 'Import failed' }] });
      setStep('done');
      toast.error(e?.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => !val && handleClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" />
            {t('common:import_data')}
          </DialogTitle>
          <DialogDescription>
            {t('common:import_data_desc')}
          </DialogDescription>
        </DialogHeader>

        {step === 'upload' && (
          <div className="space-y-4">
            <div>
              <Label>{t('common:select_module')}</Label>
              <Select value={module} onValueChange={(v) => setModule(v as ImportModule)}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="parties">{t('common:parties_module')}</SelectItem>
                  <SelectItem value="inventory">{t('common:inventory_module')}</SelectItem>
                  <SelectItem value="purchases">{t('common:purchases_module')}</SelectItem>
                  <SelectItem value="sales">{t('common:sales_module')}</SelectItem>
                  <SelectItem value="payments">{t('common:payments_module')}</SelectItem>
                  <SelectItem value="ledger">{t('common:ledger_module')}</SelectItem>
                  <SelectItem value="expenses">{t('common:expenses_module')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Template download */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Info className="h-5 w-5 text-blue-500 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{t('common:download_template_first')}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t('common:download_template_hint', { module })}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {t('common:required_columns')}: <code className="text-xs">{MODULE_TEMPLATES[module].headers.join(', ')}</code>
                    </p>
                    <Button variant="outline" size="sm" className="mt-2" onClick={handleDownloadTemplate}>
                      <Download className="h-3.5 w-3.5 mr-1.5" /> {t('common:download_template')}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* File Upload */}
            <div
              className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const droppedFile = e.dataTransfer.files?.[0];
                if (droppedFile) {
                  const fakeEvent = { target: { files: [droppedFile] } } as any;
                  handleFileSelect(fakeEvent);
                }
              }}
            >
              <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-medium">{t('common:click_to_upload')}</p>
              <p className="text-xs text-muted-foreground mt-1">{t('common:csv_rows_limit')}</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt"
                className="hidden"
                onChange={handleFileSelect}
              />
            </div>
          </div>
        )}

        {step === 'preview' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{file?.name}</p>
                <p className="text-xs text-muted-foreground">{t('common:rows_found', { count: parsedData.length })}</p>
              </div>
              <Button variant="outline" size="sm" onClick={resetState}>
                <X className="h-3.5 w-3.5 mr-1.5" /> {t('common:change_file')}
              </Button>
            </div>

            {errors.length > 0 && (
              <Card className="border-red-500/30 bg-red-500/5">
                <CardContent className="p-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-red-500">{t('common:validation_errors')}</p>
                      {errors.map((err, i) => (
                        <p key={i} className="text-xs text-red-400 mt-0.5">{err}</p>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Preview table */}
            <div className="rounded-lg border border-border overflow-hidden max-h-64 overflow-y-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">#</th>
                    {Object.keys(parsedData[0] || {}).map(h => (
                      <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsedData.slice(0, 10).map((row, i) => (
                    <tr key={i} className="border-b border-border last:border-0">
                      <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                      {Object.values(row).map((val, j) => (
                        <td key={j} className="px-3 py-2 truncate max-w-[150px]">{val}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsedData.length > 10 && (
                <div className="p-2 text-center text-xs text-muted-foreground bg-muted/30">
                  {t('common:and_more_rows', { count: parsedData.length - 10 })}
                </div>
              )}
            </div>
          </div>
        )}

        {step === 'importing' && (
          <div className="py-8 text-center space-y-4">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto animate-pulse">
              <Upload className="h-8 w-8 text-primary" />
            </div>
            <div>
              <p className="font-medium">{t('common:importing_records', { count: parsedData.length })}</p>
              <p className="text-xs text-muted-foreground mt-1">{t('common:dont_close_dialog')}</p>
            </div>
            <div className="max-w-xs mx-auto">
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-muted-foreground mt-2">{t('common:percent_complete', { percent: progress })}</p>
            </div>
          </div>
        )}

        {/* Report what actually happened. This used to always claim success for
            every row, even though nothing had been sent anywhere. */}
        {step === 'done' && (
          <div className="py-6 space-y-4">
            <div className="text-center space-y-3">
              {outcome && outcome.imported > 0 && outcome.failed === 0 && (
                <>
                  <div className="h-16 w-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto">
                    <Check className="h-8 w-8 text-emerald-500" />
                  </div>
                  <p className="text-lg font-semibold text-emerald-500">{t('common:import_successful')}</p>
                </>
              )}
              {outcome && outcome.imported > 0 && outcome.failed > 0 && (
                <>
                  <div className="h-16 w-16 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto">
                    <AlertTriangle className="h-8 w-8 text-amber-500" />
                  </div>
                  <p className="text-lg font-semibold text-amber-500">Imported with errors</p>
                </>
              )}
              {outcome && outcome.imported === 0 && (
                <>
                  <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
                    <X className="h-8 w-8 text-destructive" />
                  </div>
                  <p className="text-lg font-semibold text-destructive">Nothing was imported</p>
                </>
              )}
              <p className="text-sm text-muted-foreground">
                {outcome
                  ? `${outcome.imported} saved · ${outcome.failed} skipped · ${parsedData.length} rows in file`
                  : t('common:records_imported', { count: parsedData.length, module })}
              </p>
            </div>

            {outcome && outcome.errors.length > 0 && (
              <Card>
                <CardContent className="p-3 max-h-56 overflow-y-auto space-y-1">
                  {outcome.errors.slice(0, 50).map((e, i) => (
                    <p key={i} className="text-xs text-destructive">
                      {e.row > 0 ? `Row ${e.row}: ` : ''}{e.message}
                    </p>
                  ))}
                  {outcome.errors.length > 50 && (
                    <p className="text-xs text-muted-foreground pt-1">
                      …and {outcome.errors.length - 50} more
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}

        <DialogFooter>
          {step === 'upload' && (
            <Button variant="outline" onClick={handleClose}>{t('common:cancel')}</Button>
          )}
          {step === 'preview' && (
            <>
              <Button variant="outline" onClick={resetState}>{t('common:back')}</Button>
              <Button onClick={handleImport} disabled={errors.length > 0}>
                <Upload className="h-4 w-4 mr-2" /> {t('common:import_count_records', { count: parsedData.length })}
              </Button>
            </>
          )}
          {step === 'done' && (
            <Button onClick={handleClose}>
              <Check className="h-4 w-4 mr-2" /> {t('common:done')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
