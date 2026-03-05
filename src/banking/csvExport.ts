import { BankStatementLine } from './queries';

export function exportBankStatementCSV(lines: BankStatementLine[]): string {
  const headers = ['date', 'label', 'amount', 'currency', 'bank_account_id', 'statement_id', 'line_id'];
  const rows = lines.map(line => [
    line.date,
    `"${line.label.replace(/"/g, '""')}"`,
    (line.amount_cents / 100).toFixed(2),
    line.currency,
    line.bank_account_id,
    line.statement_id,
    line.id,
  ]);

  return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
}

export function exportReconciliationCSV(lines: BankStatementLine[]): string {
  const headers = ['line_id', 'match_status', 'note'];
  const rows = lines.map(line => [
    line.id,
    line.match_status || 'unmatched',
    line.note ? `"${line.note.replace(/"/g, '""')}"` : '',
  ]);

  return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
}

export function downloadCSV(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
