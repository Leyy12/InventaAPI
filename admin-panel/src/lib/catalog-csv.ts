// Presentation export retains the existing filtered scope and display columns.
// Quote every cell; neutralize spreadsheet formulas without embedding any bytes/tokens.
export function catalogCsv(rows: string[][]): string {
  const cell = (value: string) => '"' + (/^[=+@\-\t\r]/u.test(value) ? "'" + value : value).replace(/"/gu, '""') + '"';
  return ['Name,Brand,Segment,Category,Flavors,Specs,Status,image_url',
    ...rows.map(row => row.map(cell).join(','))].join('\r\n');
}
