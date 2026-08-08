import { Alert } from 'react-native';
import DocumentPicker, { types, DocumentPickerResponse } from 'react-native-document-picker';

export interface ImportResult<T = Record<string, unknown>> {
  success: boolean;
  data: T[];
  errors: string[];
  rowCount: number;
}

/**
 * Parse CSV string to array of objects
 */
export function parseCSV(csvString: string): Record<string, string>[] {
  if (!csvString || csvString.trim().length === 0) return [];

  const lines = csvString.split('\n').filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];

  // Parse header
  const headers = parseCSVLine(lines[0]);

  // Parse data rows
  const data: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header.trim()] = (values[index] || '').trim();
    });
    data.push(row);
  }

  return data;
}

/**
 * Parse a single CSV line, handling quoted values
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        current += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current); // Add last value
  return result;
}

/**
 * Parse JSON string to array of objects
 */
export function parseJSON<T = Record<string, unknown>>(jsonString: string): T[] {
  try {
    const parsed = JSON.parse(jsonString);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    // If it's a single object, wrap in array
    if (typeof parsed === 'object' && parsed !== null) {
      return [parsed];
    }
    return [];
  } catch {
    throw new Error('Invalid JSON format');
  }
}

/**
 * Read file contents from a document picker result
 */
async function readFileContents(file: DocumentPickerResponse): Promise<string> {
  // Use fetch to read file content from URI
  const response = await fetch(file.uri);
  const content = await response.text();
  return content;
}

/**
 * Validate imported data against a schema
 */
export function validateImportData<T>(
  data: Record<string, unknown>[],
  requiredFields: (keyof T)[],
  validators?: Partial<Record<keyof T, (value: unknown) => boolean>>
): ImportResult<T> {
  const validData: T[] = [];
  const errors: string[] = [];

  data.forEach((row, index) => {
    const rowNumber = index + 2; // Account for header and 1-indexed
    const missingFields = requiredFields.filter((field) => {
      const value = row[field as string];
      return value === undefined || value === null || value === '';
    });

    if (missingFields.length > 0) {
      errors.push(`Row ${rowNumber}: Missing required fields: ${missingFields.join(', ')}`);
      return;
    }

    // Run validators if provided
    if (validators) {
      let isValid = true;
      for (const field of Object.keys(validators)) {
        const validator = validators[field as keyof T];
        if (typeof validator === 'function' && !validator(row[field])) {
          errors.push(`Row ${rowNumber}: Invalid value for field "${field}"`);
          isValid = false;
        }
      }
      if (!isValid) return;
    }

    validData.push(row as T);
  });

  return {
    success: errors.length === 0,
    data: validData,
    errors,
    rowCount: data.length,
  };
}

/**
 * Import data from a file (CSV or JSON)
 */
export async function importData<T = Record<string, unknown>>(
  options?: {
    allowedTypes?: ('csv' | 'json')[];
    requiredFields?: (keyof T)[];
    validators?: Partial<Record<keyof T, (value: unknown) => boolean>>;
  }
): Promise<ImportResult<T>> {
  const { allowedTypes = ['csv', 'json'], requiredFields = [], validators } = options || {};

  try {
    // Open document picker
    const result = await DocumentPicker.pick({
      type: allowedTypes.includes('csv') && allowedTypes.includes('json')
        ? [types.plainText, types.json]
        : allowedTypes.includes('json')
          ? [types.json]
          : [types.plainText],
      copyTo: 'cachesDirectory',
    });

    const file = result[0];
    if (!file) {
      return { success: false, data: [], errors: ['No file selected'], rowCount: 0 };
    }

    // Read file contents
    const contents = await readFileContents(file);

    // Determine file type and parse
    let parsedData: Record<string, unknown>[];
    const isJSON = file.name?.toLowerCase().endsWith('.json') ||
      file.type?.includes('json') ||
      contents.trim().startsWith('[') ||
      contents.trim().startsWith('{');

    if (isJSON) {
      parsedData = parseJSON(contents);
    } else {
      parsedData = parseCSV(contents);
    }

    if (parsedData.length === 0) {
      return { success: false, data: [], errors: ['No data found in file'], rowCount: 0 };
    }

    // Validate data if required fields specified
    if (requiredFields.length > 0) {
      return validateImportData<T>(parsedData, requiredFields, validators);
    }

    return {
      success: true,
      data: parsedData as T[],
      errors: [],
      rowCount: parsedData.length,
    };
  } catch (error: unknown) {
    if (DocumentPicker.isCancel(error)) {
      return { success: false, data: [], errors: ['Import cancelled'], rowCount: 0 };
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, data: [], errors: [message], rowCount: 0 };
  }
}

/**
 * Show import dialog with file type selection
 */
export function showImportDialog(
  onImport: (format: 'csv' | 'json') => void
): void {
  Alert.alert(
    'Import Data',
    'Choose the file format to import',
    [
      {
        text: 'Cancel',
        style: 'cancel',
      },
      {
        text: 'Import CSV',
        onPress: () => onImport('csv'),
      },
      {
        text: 'Import JSON',
        onPress: () => onImport('json'),
      },
    ],
    { cancelable: true }
  );
}

/**
 * Display import result to user
 */
export function showImportResult(result: ImportResult<unknown>): void {
  if (result.success) {
    Alert.alert(
      'Import Successful',
      `Successfully imported ${result.rowCount} records.`,
      [{ text: 'OK' }]
    );
  } else {
    const errorSummary = result.errors.slice(0, 3).join('\n');
    const moreErrors = result.errors.length > 3 ? `\n...and ${result.errors.length - 3} more errors` : '';
    Alert.alert(
      'Import Issues',
      `Found ${result.errors.length} issue(s):\n\n${errorSummary}${moreErrors}`,
      [{ text: 'OK' }]
    );
  }
}
