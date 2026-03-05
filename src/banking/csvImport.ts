import { supabase } from '../lib/supabase';

interface ParsedLine {
  date: string;
  label: string;
  amountCents: number;
}

function normalizeLabel(label: string): string {
  return label.trim().replace(/\s+/g, ' ');
}

function parseDate(dateStr: string): string {
  const formats = [
    /^(\d{4})-(\d{2})-(\d{2})$/,
    /^(\d{2})\/(\d{2})\/(\d{4})$/,
  ];

  for (const format of formats) {
    const match = dateStr.match(format);
    if (match) {
      if (format === formats[0]) {
        return `${match[1]}-${match[2]}-${match[3]}`;
      } else {
        return `${match[3]}-${match[2]}-${match[1]}`;
      }
    }
  }

  throw new Error(`Invalid date format: ${dateStr}`);
}

function parseAmount(amountStr: string): number {
  const normalized = amountStr.replace(',', '.').trim();
  const parsed = parseFloat(normalized);
  if (isNaN(parsed)) {
    throw new Error(`Invalid amount: ${amountStr}`);
  }
  return Math.round(parsed * 100);
}

function detectSeparator(csvContent: string): string {
  const firstLine = csvContent.split('\n')[0];
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  return semicolonCount > commaCount ? ';' : ',';
}

function parseCSVLine(line: string, separator: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === separator && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

function detectColumns(headers: string[]): { dateIdx: number; labelIdx: number; amountIdx: number } {
  let dateIdx = -1;
  let labelIdx = -1;
  let amountIdx = -1;

  headers.forEach((header, idx) => {
    const lower = header.toLowerCase();
    if (lower.includes('date')) {
      dateIdx = idx;
    } else if (lower.includes('label') || lower.includes('libellé') || lower.includes('libelle') || lower.includes('description')) {
      labelIdx = idx;
    } else if (lower.includes('montant') || lower.includes('amount')) {
      amountIdx = idx;
    }
  });

  if (dateIdx === -1 || labelIdx === -1 || amountIdx === -1) {
    throw new Error('CSV must contain date, label, and amount columns');
  }

  return { dateIdx, labelIdx, amountIdx };
}

export function parseCSV(csvContent: string): ParsedLine[] {
  const lines = csvContent.split('\n').filter(line => line.trim());
  if (lines.length < 2) {
    throw new Error('CSV must contain at least a header and one data row');
  }

  const separator = detectSeparator(csvContent);
  const headers = parseCSVLine(lines[0], separator);
  const { dateIdx, labelIdx, amountIdx } = detectColumns(headers);

  const parsed: ParsedLine[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCSVLine(lines[i], separator);

    if (cells.length < Math.max(dateIdx, labelIdx, amountIdx) + 1) {
      continue;
    }

    try {
      const dateISO = parseDate(cells[dateIdx]);
      const labelNormalized = normalizeLabel(cells[labelIdx]);
      const amountCents = parseAmount(cells[amountIdx]);

      parsed.push({
        date: dateISO,
        label: labelNormalized,
        amountCents,
      });
    } catch (err) {
      console.warn(`Skipping line ${i + 1}:`, err);
    }
  }

  return parsed;
}

async function hashString(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function importCSVToBank(
  companyId: string,
  csvContent: string,
  bankAccountId: string
): Promise<{ imported: number; duplicates: number; errors: string[] }> {
  const parsed = parseCSV(csvContent);

  const { data: statementData, error: statementError } = await supabase
    .from('bank_statements')
    .insert({
      company_id: companyId,
      bank_account_id: bankAccountId,
      source: 'csv',
      imported_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (statementError || !statementData) {
    throw new Error('Failed to create bank statement');
  }

  const statementId = statementData.id;

  let imported = 0;
  let duplicates = 0;
  const errors: string[] = [];

  for (const line of parsed) {
    try {
      const hashInput = `${companyId}|${bankAccountId}|${line.date}|${line.label}|${line.amountCents}`;
      const externalIdHash = await hashString(hashInput);

      const { error: insertError } = await supabase
        .from('bank_statement_lines')
        .insert({
          company_id: companyId,
          bank_account_id: bankAccountId,
          statement_id: statementId,
          date: line.date,
          label: line.label,
          amount_cents: line.amountCents,
          currency: 'EUR',
          external_id_hash: externalIdHash,
        });

      if (insertError) {
        if (insertError.code === '23505') {
          duplicates++;
        } else {
          errors.push(`Error inserting line: ${insertError.message}`);
        }
      } else {
        imported++;
      }
    } catch (err) {
      errors.push(`Error processing line: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { imported, duplicates, errors };
}
