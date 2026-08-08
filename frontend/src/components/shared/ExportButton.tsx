import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, FileText, Sheet, Printer, FileJson } from 'lucide-react';
import { Button, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui';
import toast from 'react-hot-toast';

interface ExportButtonProps {
  onExport?: (format: 'pdf' | 'csv' | 'excel' | 'json') => void;
  onPrint?: () => void;
  label?: string;
  /** Pass data + columns for built-in CSV/JSON export */
  data?: Record<string, any>[];
  columns?: string[];
  filename?: string;
}

function downloadFile(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function dataToCSV(data: Record<string, any>[], columns?: string[]): string {
  if (data.length === 0) return '';
  const headers = columns || Object.keys(data[0]);
  const rows = data.map(row =>
    headers.map(h => {
      // Columns may use dotted paths into nested objects (e.g. 'expense_type.name')
      const val = h.split('.').reduce<any>((o, k) => o?.[k], row);
      const str = val == null ? '' : typeof val === 'object' ? JSON.stringify(val) : String(val);
      return str.includes(',') || str.includes('"') || str.includes('\n')
        ? `"${str.replace(/"/g, '""')}"` : str;
    }).join(',')
  );
  return [headers.join(','), ...rows].join('\n');
}

export function ExportButton({ onExport, onPrint, label, data, columns, filename = 'export' }: ExportButtonProps) {
  const [exporting, setExporting] = useState(false);
  const { t } = useTranslation('common');
  const resolvedLabel = label || t('export');

  const handleExport = async (format: 'pdf' | 'csv' | 'excel' | 'json') => {
    if (onExport) {
      setExporting(true);
      try {
        await onExport(format);
        toast.success(t('export_success', { format: format.toUpperCase() }));
      } catch {
        toast.error(t('export_error', { format: format.toUpperCase() }));
      } finally {
        setExporting(false);
      }
      return;
    }

    // Built-in export if data is provided
    if (data && data.length > 0) {
      try {
        setExporting(true);
        const timestamp = new Date().toISOString().split('T')[0];
        if (format === 'csv' || format === 'excel') {
          const csv = dataToCSV(data, columns);
          downloadFile(csv, `${filename}_${timestamp}.csv`, 'text/csv');
          toast.success(t('export_rows_csv', { count: data.length }));
        } else if (format === 'json') {
          const json = JSON.stringify(data, null, 2);
          downloadFile(json, `${filename}_${timestamp}.json`, 'application/json');
          toast.success(t('export_records_json', { count: data.length }));
        } else {
          toast.success(t('pdf_coming_soon'));
        }
      } finally {
        setExporting(false);
      }
      return;
    }

    // No handler and no rows: this is either a wiring bug or an empty table.
    // Never report success for an export that produced no file.
    toast.error(t('export_no_data', 'Nothing to export'));
  };

  const handlePrint = () => {
    if (onPrint) {
      onPrint();
    } else {
      window.print();
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={exporting}>
          <Download className="h-4 w-4 mr-2" />
          {exporting ? t('exporting') : resolvedLabel}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handleExport('csv')}>
          <Sheet className="h-4 w-4 mr-2" />
          {t('export_csv')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleExport('excel')}>
          <Sheet className="h-4 w-4 mr-2" />
          {t('export_excel')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleExport('json')}>
          <FileJson className="h-4 w-4 mr-2" />
          {t('export_json')}
        </DropdownMenuItem>
        {/* Built-in export has no PDF path — only show PDF when a handler exists */}
        {onExport && (
          <DropdownMenuItem onClick={() => handleExport('pdf')}>
            <FileText className="h-4 w-4 mr-2" />
            {t('export_pdf')}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handlePrint}>
          <Printer className="h-4 w-4 mr-2" />
          {t('print')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
