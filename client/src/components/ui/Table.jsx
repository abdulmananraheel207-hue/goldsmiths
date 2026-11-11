import { useState } from 'react';
import { Search, FileSpreadsheet, FileText, Printer, FileDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './Button.jsx';
import { Loading, ErrorState, Empty } from './States.jsx';
import { exportCSV, exportExcel, exportPDF, printTable } from '@/lib/export.js';
import { useToast } from './Toast.jsx';

/**
 * Data table with zebra rows, search, pagination and exports.
 * No inner scroll box: the page scrolls as one (only wide tables scroll sideways on small screens).
 *
 * columns: [{ key, header, cell(row), exportValue(row), align: 'right', className, noExport, exportOnly }]
 * exportOnly: included in CSV/Excel/PDF/Print but not shown on screen (keeps tables narrow).
 * For exports, `getAllRows()` (async) returns every matching row (not just this page).
 */
export function Table({
  columns,
  rows = [],
  rowKey = (r) => r.id,
  isLoading,
  error,
  onRetry,
  emptyMessage = 'Nothing to show yet.',
  emptyAction,
  search,
  onSearchChange,
  searchPlaceholder = 'Search…',
  toolbar,
  page,
  pageSize,
  total,
  onPageChange,
  exportName,
  exportTitle,
  getAllRows,
  footer,
  rowClassName,
}) {
  const toast = useToast();
  const [exporting, setExporting] = useState(null);

  const doExport = async (kind) => {
    setExporting(kind);
    try {
      const all = getAllRows ? await getAllRows() : rows;
      if (!all.length) {
        toast.info('There is nothing to export yet.');
        return;
      }
      const title = exportTitle || exportName;
      if (kind === 'csv') exportCSV(columns, all, exportName);
      if (kind === 'excel') await exportExcel(columns, all, exportName);
      if (kind === 'pdf') await exportPDF(columns, all, exportName, title);
      if (kind === 'print') printTable(columns, all, title);
    } catch (e) {
      toast.error(e.message || 'Export failed. Please try again.');
    } finally {
      setExporting(null);
    }
  };

  const pages = total && pageSize ? Math.max(1, Math.ceil(total / pageSize)) : 1;
  const shown = columns.filter((c) => !c.exportOnly);
  const showToolbar = onSearchChange || toolbar || exportName;
  const exportBtn = 'min-h-[32px] px-2.5 text-[12.5px]';

  return (
    <div className="card overflow-hidden">
      {showToolbar && (
        <div className="no-print flex flex-col gap-3 border-b border-line px-4 py-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
            {onSearchChange && (
              <div className="relative w-full sm:max-w-xs">
                <label className="sr-only" htmlFor="table-search">
                  Search
                </label>
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
                <input
                  id="table-search"
                  type="search"
                  value={search}
                  onChange={(e) => onSearchChange(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="field-input pl-9"
                />
              </div>
            )}
            {toolbar}
          </div>
          {exportName && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="eyebrow mr-1 hidden xl:inline">Export</span>
              <Button size="sm" variant="secondary" className={exportBtn} icon={FileDown} loading={exporting === 'csv'} onClick={() => doExport('csv')}>
                CSV
              </Button>
              <Button size="sm" variant="secondary" className={exportBtn} icon={FileSpreadsheet} loading={exporting === 'excel'} onClick={() => doExport('excel')}>
                Excel
              </Button>
              <Button size="sm" variant="secondary" className={exportBtn} icon={FileText} loading={exporting === 'pdf'} onClick={() => doExport('pdf')}>
                PDF
              </Button>
              <Button size="sm" variant="secondary" className={exportBtn} icon={Printer} loading={exporting === 'print'} onClick={() => doExport('print')}>
                Print
              </Button>
            </div>
          )}
        </div>
      )}

      {isLoading ? (
        <Loading />
      ) : error ? (
        <ErrorState error={error} onRetry={onRetry} />
      ) : !rows.length ? (
        <Empty message={emptyMessage} action={emptyAction} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 text-table">
            <thead>
              <tr>
                {shown.map((c) => (
                  <th
                    key={c.key}
                    scope="col"
                    className={`whitespace-nowrap border-b border-line bg-paper px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint ${
                      c.align === 'right' ? 'text-right' : ''
                    } ${c.headerClassName || ''}`}
                  >
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={rowKey(r)}
                  className={`transition-colors hover:bg-gold-50/60 ${i % 2 ? 'bg-paper/50' : 'bg-white'} ${rowClassName ? rowClassName(r) : ''}`}
                >
                  {shown.map((c) => (
                    <td
                      key={c.key}
                      className={`border-b border-line/70 px-4 py-2 align-middle ${c.align === 'right' ? 'num text-right' : ''} ${
                        c.className || ''
                      }`}
                    >
                      {c.cell ? c.cell(r) : r[c.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            {footer && <tfoot>{footer}</tfoot>}
          </table>
        </div>
      )}

      {onPageChange && total > 0 && (
        <div className="no-print flex flex-col items-center justify-between gap-2 px-4 py-2.5 text-[13px] sm:flex-row">
          <p className="text-ink-faint">
            Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
          </p>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" icon={ChevronLeft} disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
              Previous
            </Button>
            <span className="px-1 font-medium text-ink-soft">
              {page} / {pages}
            </span>
            <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => onPageChange(page + 1)}>
              Next <ChevronRight className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Row action buttons: clearly labelled, never icon-only. */
export function RowActions({ children }) {
  return <div className="flex flex-nowrap justify-end gap-1.5">{children}</div>;
}
