import { Share, Alert } from 'react-native';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ExportFormat = 'csv' | 'json' | 'excel';

export interface ExportOptions {
  data: any[];
  filename: string;
  format: ExportFormat;
  columns?: string[];
  columnLabels?: Record<string, string>;
}

export interface ExportResult {
  success: boolean;
  error?: string;
}

// ─── CSV Conversion ───────────────────────────────────────────────────────────

/**
 * Convert array of objects to CSV string with proper escaping
 */
export function arrayToCSV(
  data: any[],
  columns?: string[],
  columnLabels?: Record<string, string>
): string {
  if (!data || data.length === 0) return '';

  // Get headers - use provided columns or extract all unique keys
  const headers = columns || Array.from(
    data.reduce((keys, item) => {
      Object.keys(item).forEach(key => keys.add(key));
      return keys;
    }, new Set<string>())
  );

  // Create header row with optional labels
  const headerRow = headers
    .map(h => escapeCSVValue(columnLabels?.[h] || h))
    .join(',');

  // Create data rows
  const dataRows = data.map(item =>
    headers
      .map(header => {
        const value = item[header];
        
        // Handle different value types
        if (value === null || value === undefined) {
          return '';
        }
        if (value instanceof Date) {
          return escapeCSVValue(value.toISOString());
        }
        if (typeof value === 'object') {
          return escapeCSVValue(JSON.stringify(value));
        }
        if (typeof value === 'boolean') {
          return value ? 'Yes' : 'No';
        }
        return escapeCSVValue(String(value));
      })
      .join(',')
  );

  return [headerRow, ...dataRows].join('\n');
}

/**
 * Escape a value for CSV format
 */
function escapeCSVValue(value: string): string {
  // Wrap in quotes if contains comma, newline, or quotes
  if (value.includes(',') || value.includes('\n') || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// ─── Export Functions ─────────────────────────────────────────────────────────

/**
 * Export data and share it via the system share dialog
 */
export async function exportData({
  data,
  filename,
  format,
  columns,
  columnLabels,
}: ExportOptions): Promise<ExportResult> {
  if (!data || data.length === 0) {
    Alert.alert('No Data', 'There is no data to export.');
    return { success: false, error: 'No data to export' };
  }

  try {
    let content: string;
    let extension: string;

    switch (format) {
      case 'csv':
      case 'excel':
        content = arrayToCSV(data, columns, columnLabels);
        extension = 'csv';
        break;
      case 'json':
        content = JSON.stringify(data, null, 2);
        extension = 'json';
        break;
      default:
        throw new Error(`Unsupported format: ${format}`);
    }

    const timestamp = new Date().toISOString().split('T')[0];
    const fullFilename = `${filename}_${timestamp}.${extension}`;

    // Share the content via the system share dialog
    await Share.share({
      message: content,
      title: fullFilename,
    });

    return { success: true };
  } catch (error: any) {
    console.error('Export error:', error);
    Alert.alert('Export Failed', error.message || 'Failed to export data. Please try again.');
    return { success: false, error: error.message };
  }
}

// ─── Export Dialog ────────────────────────────────────────────────────────────

export interface ExportDialogOptions {
  data: any[];
  filename: string;
  columns?: string[];
  columnLabels?: Record<string, string>;
  onExport?: (format: ExportFormat) => void;
  title?: string;
  showExcel?: boolean;
}

/**
 * Show export options dialog with format selection
 */
export function showExportDialog({
  data,
  filename,
  columns,
  columnLabels,
  onExport,
  title,
  showExcel = false,
}: ExportDialogOptions): void {
  if (!data || data.length === 0) {
    Alert.alert('No Data', 'There is no data to export.');
    return;
  }

  const handleExport = async (format: ExportFormat) => {
    if (onExport) {
      onExport(format);
    } else {
      await exportData({ data, filename, format, columns, columnLabels });
    }
  };

  const buttons: any[] = [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Export as CSV', onPress: () => handleExport('csv') },
    { text: 'Export as JSON', onPress: () => handleExport('json') },
  ];

  if (showExcel) {
    buttons.splice(2, 0, { text: 'Export as Excel', onPress: () => handleExport('excel') });
  }

  Alert.alert(
    title || 'Export Data',
    `Export ${data.length} ${data.length === 1 ? 'record' : 'records'}`,
    buttons,
    { cancelable: true }
  );
}

// ─── Specialized Export Functions ─────────────────────────────────────────────

/**
 * Export sales data with formatted columns
 */
export async function exportSalesData(
  sales: any[],
  filename = 'sales_export'
): Promise<ExportResult> {
  const formattedData = sales.map(sale => ({
    'Sale ID': sale.id || sale.sale_id,
    'Date': sale.sale_date ? new Date(sale.sale_date).toLocaleDateString() : '',
    'Customer': sale.party?.name || sale.party_name || '',
    'Items': sale.sale_lots?.length || 0,
    'Total Amount': sale.total_amount || 0,
    'Paid Amount': sale.paid_amount || 0,
    'Balance': (sale.total_amount || 0) - (sale.paid_amount || 0),
    'Status': sale.payment_status || '',
    'Notes': sale.notes || '',
  }));

  return exportData({
    data: formattedData,
    filename,
    format: 'csv',
  });
}

/**
 * Export purchases data with formatted columns
 */
export async function exportPurchasesData(
  purchases: any[],
  filename = 'purchases_export'
): Promise<ExportResult> {
  const formattedData = purchases.map(purchase => ({
    'Purchase ID': purchase.id || purchase.purchase_id,
    'Date': purchase.purchase_date ? new Date(purchase.purchase_date).toLocaleDateString() : '',
    'Supplier': purchase.party?.name || purchase.party_name || '',
    'Lots': purchase.purchase_lots?.length || 0,
    'Total Amount': purchase.total_amount || 0,
    'Paid Amount': purchase.paid_amount || 0,
    'Balance': (purchase.total_amount || 0) - (purchase.paid_amount || 0),
    'Status': purchase.payment_status || '',
    'Notes': purchase.notes || '',
  }));

  return exportData({
    data: formattedData,
    filename,
    format: 'csv',
  });
}

/**
 * Export inventory/lots data with formatted columns
 */
export async function exportInventoryData(
  lots: any[],
  filename = 'inventory_export'
): Promise<ExportResult> {
  const formattedData = lots.map(lot => ({
    'Lot Number': lot.lot_number,
    'Item': lot.item?.name || '',
    'Available Qty': lot.available_qty || 0,
    'Total Qty': lot.total_qty || 0,
    'Sold Qty': lot.sold_qty || 0,
    'Unit': lot.unit || '',
    'Purchase Rate': lot.purchase_rate || 0,
    'Status': lot.status || '',
    'Purchase Date': lot.created_at ? new Date(lot.created_at).toLocaleDateString() : '',
  }));

  return exportData({
    data: formattedData,
    filename,
    format: 'csv',
  });
}

/**
 * Export parties data with formatted columns
 */
export async function exportPartiesData(
  parties: any[],
  filename = 'parties_export'
): Promise<ExportResult> {
  const formattedData = parties.map(party => ({
    'Name': party.name || '',
    'Type': party.type || '',
    'Phone': party.phone || '',
    'Email': party.email || '',
    'GSTIN': party.gstin || '',
    'Address': party.address || '',
    'City': party.city || '',
    'State': party.state || '',
    'Opening Balance': party.opening_balance || 0,
    'Current Balance': party.current_balance || 0,
  }));

  return exportData({
    data: formattedData,
    filename,
    format: 'csv',
  });
}

/**
 * Export ledger/transactions data with formatted columns
 */
export async function exportLedgerData(
  transactions: any[],
  filename = 'ledger_export'
): Promise<ExportResult> {
  const formattedData = transactions.map(txn => ({
    'Date': txn.date ? new Date(txn.date).toLocaleDateString() : '',
    'Type': txn.type || '',
    'Description': txn.description || txn.narration || '',
    'Party': txn.party?.name || '',
    'Debit': txn.debit || txn.debit_amount || 0,
    'Credit': txn.credit || txn.credit_amount || 0,
    'Balance': txn.balance || txn.running_balance || 0,
    'Reference': txn.reference || txn.voucher_number || '',
  }));

  return exportData({
    data: formattedData,
    filename,
    format: 'csv',
  });
}
