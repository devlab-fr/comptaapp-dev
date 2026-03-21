export function downloadCSV(filename: string, csvContent: string) {
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

export function generateCSVContent(headers: string[], rows: string[][]): string {
  const headerLine = headers.join(',');
  const dataLines = rows.map(row =>
    row.map(cell => {
      const cellStr = String(cell);
      if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
        return `"${cellStr.replace(/"/g, '""')}"`;
      }
      return cellStr;
    }).join(',')
  );

  return [headerLine, ...dataLines].join('\n');
}

export function formatCurrency(value: number): string {
  return value.toFixed(2);
}

// VAT-specific functions for Excel FR compatibility
export function generateCSVContentExcelFR(headers: string[], rows: string[][]): string {
  const headerLine = headers.join(';');
  const dataLines = rows.map(row =>
    row.map(cell => {
      const cellStr = String(cell);
      if (cellStr.includes(';') || cellStr.includes('"') || cellStr.includes('\n')) {
        return `"${cellStr.replace(/"/g, '""')}"`;
      }
      return cellStr;
    }).join(';')
  );

  return [headerLine, ...dataLines].join('\n');
}

export function formatCurrencyExcelFR(value: number): string {
  return value.toFixed(2).replace('.', ',');
}

export function formatDate(date: string | null): string {
  if (!date) return '';
  return new Date(date).toLocaleDateString('fr-FR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

export function formatDateOrToday(date: string | null): string {
  const targetDate = date ? new Date(date) : new Date();
  return targetDate.toLocaleDateString('fr-FR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

export function formatTodayDate(): string {
  return new Date().toLocaleDateString('fr-FR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}
