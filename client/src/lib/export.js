/**
 * Table exports: CSV, Excel, PDF and Print.
 * columns: [{ header, exportValue(row) | accessor(row) }]
 */
import { APP_NAME } from './format.js';

const cellText = (col, row) => {
  const fn = col.exportValue || col.accessor;
  const v = fn ? fn(row) : '';
  return v === null || v === undefined ? '' : String(v);
};

const exportable = (columns) => columns.filter((c) => c.header && !c.noExport);

function fileStamp() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportCSV(columns, rows, name) {
  const cols = exportable(columns);
  const esc = (s) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = [cols.map((c) => esc(c.header)).join(',')];
  for (const r of rows) lines.push(cols.map((c) => esc(cellText(c, r))).join(','));
  // BOM so Excel opens UTF-8 correctly
  saveBlob(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), `${name}-${fileStamp()}.csv`);
}

export async function exportExcel(columns, rows, name) {
  const { default: writeXlsxFile } = await import('write-excel-file');
  const cols = exportable(columns);
  const data = [
    cols.map((c) => ({ value: c.header, fontWeight: 'bold' })),
    ...rows.map((r) =>
      cols.map((c) => {
        const raw = c.excelValue ? c.excelValue(r) : cellText(c, r);
        if (typeof raw === 'number') return { type: Number, value: raw };
        return { type: String, value: raw };
      }),
    ),
  ];
  await writeXlsxFile(data, {
    fileName: `${name}-${fileStamp()}.xlsx`,
    columns: cols.map((c) => ({ width: Math.min(40, Math.max(12, c.header.length + 4)) })),
  });
}

export async function exportPDF(columns, rows, name, title) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const cols = exportable(columns);
  const doc = new jsPDF({ orientation: cols.length > 6 ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
  doc.setFontSize(16);
  doc.text(`${APP_NAME} — ${title || name}`, 40, 40);
  doc.setFontSize(10);
  doc.text(`Printed ${new Date().toLocaleString('en-PK')}`, 40, 58);
  autoTable(doc, {
    startY: 72,
    head: [cols.map((c) => c.header)],
    // jsPDF's built-in font has no "−" or "₨"; keep plain ASCII
    body: rows.map((r) => cols.map((c) => cellText(c, r).replace(/−/g, '-'))),
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [184, 134, 11] },
    alternateRowStyles: { fillColor: [251, 248, 242] },
  });
  doc.save(`${name}-${fileStamp()}.pdf`);
}

export function printTable(columns, rows, title) {
  const cols = exportable(columns);
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  body{font-family:Nunito,Arial,sans-serif;color:#2A2622;margin:24px}
  h1{font-size:20px;margin:0 0 4px} p{margin:0 0 16px;color:#5A534B;font-size:12px}
  table{border-collapse:collapse;width:100%;font-size:12px}
  th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}
  th{background:#F5E8C4} tr:nth-child(even) td{background:#FBF8F2}
</style></head><body>
<h1>${esc(APP_NAME)} — ${esc(title)}</h1><p>Printed ${esc(new Date().toLocaleString('en-PK'))}</p>
<table><thead><tr>${cols.map((c) => `<th>${esc(c.header)}</th>`).join('')}</tr></thead>
<tbody>${rows.map((r) => `<tr>${cols.map((c) => `<td>${esc(cellText(c, r))}</td>`).join('')}</tr>`).join('')}</tbody></table>
</body></html>`;
  const frame = document.createElement('iframe');
  frame.style.position = 'fixed';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  document.body.appendChild(frame);
  frame.contentDocument.open();
  frame.contentDocument.write(html);
  frame.contentDocument.close();
  setTimeout(() => {
    frame.contentWindow.focus();
    frame.contentWindow.print();
    setTimeout(() => frame.remove(), 1000);
  }, 200);
}
