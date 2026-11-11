import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BarChart3 } from 'lucide-react';
import { api } from '@/lib/api.js';
import { formatRs, formatDate, todayISO, shiftDate, TAX_STATUS_LABELS, formatNumber } from '@/lib/format.js';
import { useDebounced, useSettings } from '@/lib/hooks.js';
import { Button, PageHeader, Table, RowActions, Input, Combobox, Badge, useToast } from '@/components/ui';
import { TaxNotConfiguredBanner } from '@/components/TaxNotConfiguredBanner.jsx';
import { TaxStatusBadge } from './sales/SalesHistory.jsx';
import { BalanceText } from './customers/Customers.jsx';

function presetRange(key) {
  const t = todayISO();
  if (key === 'today') return { from: t, to: t };
  if (key === 'yesterday') return { from: shiftDate(t, -1), to: shiftDate(t, -1) };
  if (key === '7d') return { from: shiftDate(t, -6), to: t };
  if (key === 'month') return { from: `${t.slice(0, 8)}01`, to: t };
  return null;
}

const PRESETS = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: '7d', label: 'Last 7 Days' },
  { key: 'month', label: 'This Month' },
  { key: 'custom', label: 'Custom Range' },
];

function Summary({ items }) {
  return (
    <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {items.map(([label, value, tone]) => (
        <div key={label} className="card p-5">
          <p className="text-ink-soft">{label}</p>
          <p className={`num text-[1.25rem] font-extrabold ${tone === 'danger' ? 'text-danger-700' : ''}`}>{value}</p>
        </div>
      ))}
    </div>
  );
}

function SalesReport() {
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: settings } = useSettings();
  const [preset, setPreset] = useState('month');
  const [range, setRange] = useState(presetRange('month'));
  const [customer, setCustomer] = useState(null);
  const [custSearch, setCustSearch] = useState('');
  const dCust = useDebounced(custSearch, 200);
  const custQ = useQuery({ queryKey: ['customers', 'options', dCust], queryFn: () => api.get('/customers/options', { search: dCust }) });
  const [applied, setApplied] = useState({ ...presetRange('month'), customer_id: '' });
  const [error, setError] = useState('');

  const q = useQuery({ queryKey: ['reports', 'sales', applied], queryFn: () => api.get('/reports/sales', applied) });

  const resend = useMutation({
    mutationFn: (id) => api.post(`/sales/${id}/resend-tax`),
    onSuccess: (d) => {
      toast.info(d.message);
      qc.invalidateQueries({ queryKey: ['reports'] });
    },
    onError: (e) => toast.error(e.message),
  });

  const generate = () => {
    if (!range.from || !range.to) return setError('Please choose both dates.');
    if (range.from > range.to) return setError('The "From" date must be before the "To" date.');
    setError('');
    setApplied({ ...range, customer_id: customer?.id || '' });
  };

  const columns = [
    { key: 'inv', header: 'Invoice Number', cell: (s) => <span className="num font-bold">{s.invoice_number}</span>, exportValue: (s) => s.invoice_number },
    { key: 'date', header: 'Date', cell: (s) => <span className="whitespace-nowrap">{formatDate(s.sale_date)}</span>, exportValue: (s) => s.sale_date },
    {
      key: 'name',
      header: 'Customer Name',
      cell: (s) => (
        <>
          {s.customer_name} {s.status === 'void' && <Badge tone="danger">Cancelled</Badge>}
        </>
      ),
      exportValue: (s) => s.customer_name + (s.status === 'void' ? ' (Cancelled)' : ''),
    },
    { key: 'cnic', header: 'Customer CNIC', cell: (s) => <span className="num whitespace-nowrap">{s.customer_cnic || '—'}</span>, exportValue: (s) => s.customer_cnic },
    { key: 'phone', header: 'Customer Phone', cell: (s) => <span className="num whitespace-nowrap">{s.customer_phone || '—'}</span>, exportValue: (s) => s.customer_phone },
    { key: 'sub', header: 'Sub Total', align: 'right', cell: (s) => formatRs(s.subtotal), exportValue: (s) => s.subtotal },
    { key: 'disc', header: 'Discount', align: 'right', cell: (s) => formatRs(s.discount), exportValue: (s) => s.discount },
    { key: 'tax', header: 'Tax', align: 'right', cell: (s) => formatRs(s.tax_amount), exportValue: (s) => s.tax_amount },
    { key: 'total', header: 'Grand Total', align: 'right', cell: (s) => <strong>{formatRs(s.total_amount)}</strong>, exportValue: (s) => s.total_amount },
    { key: 'taxst', header: 'Tax Upload Status', cell: (s) => <TaxStatusBadge status={s.tax_status} />, exportValue: (s) => TAX_STATUS_LABELS[s.tax_status] },
    {
      key: 'actions',
      header: 'Actions',
      noExport: true,
      headerClassName: 'text-right',
      cell: (s) => (
        <RowActions>
          <Button size="sm" variant="secondary" onClick={() => navigate(`/sales/${s.id}`)}>
            View
          </Button>
          {s.status === 'active' && s.tax_status !== 'uploaded' && (
            <Button size="sm" variant="secondary" loading={resend.isPending && resend.variables === s.id} onClick={() => resend.mutate(s.id)}>
              Resend to Tax
            </Button>
          )}
        </RowActions>
      ),
    },
  ];

  const sum = q.data?.summary;
  const anyNotConfigured = q.data?.data?.some((s) => s.tax_status === 'not_configured');

  return (
    <>
      {anyNotConfigured && <TaxNotConfiguredBanner settings={settings} />}
      <div className="card mb-5 space-y-4 p-5">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Date range">
          {PRESETS.map((p) => (
            <Button
              key={p.key}
              size="sm"
              variant={preset === p.key ? 'primary' : 'secondary'}
              aria-pressed={preset === p.key}
              onClick={() => {
                setPreset(p.key);
                const r = presetRange(p.key);
                if (r) setRange(r);
              }}
            >
              {p.label}
            </Button>
          ))}
        </div>
        <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Input label="From date" type="date" value={range.from} onChange={(e) => (setPreset('custom'), setRange({ ...range, from: e.target.value }))} />
          <Input label="To date" type="date" value={range.to} onChange={(e) => (setPreset('custom'), setRange({ ...range, to: e.target.value }))} />
          <Combobox
            label="Customer (optional)"
            value={customer?.id}
            displayValue={customer ? customer.name : ''}
            options={[{ value: '', label: 'All customers' }, ...(custQ.data?.data || []).map((c) => ({ value: c.id, label: c.name, sublabel: c.cnic, data: c }))]}
            onSearch={setCustSearch}
            onSelect={(o) => setCustomer(o.data || null)}
            placeholder="All customers"
          />
          <Button size="lg" icon={BarChart3} onClick={generate}>
            Generate
          </Button>
        </div>
        {error && <p className="font-semibold text-danger-700">{error}</p>}
        <p className="text-ink-soft">
          Showing {formatDate(applied.from)} to {formatDate(applied.to)}
          {applied.customer_id && customer ? ` for ${customer.name}` : ''}.
        </p>
      </div>

      {sum && (
        <Summary
          items={[
            ['Number of sales', formatNumber(sum.count)],
            ['Sub Total', formatRs(sum.subtotal)],
            ['Tax collected', formatRs(sum.tax_amount)],
            ['Grand Total', formatRs(sum.total_amount)],
          ]}
        />
      )}
      <Table
        columns={columns}
        rows={q.data?.data || []}
        isLoading={q.isLoading}
        error={q.error}
        onRetry={q.refetch}
        rowClassName={(s) => (s.status === 'void' ? 'opacity-60' : '')}
        exportName={`sales-report-${applied.from}-to-${applied.to}`}
        exportTitle={`Sales Report ${applied.from} to ${applied.to}`}
        emptyMessage="No sales found for these dates. Try a different date range."
        footer={
          sum && sum.count > 0 ? (
            <tr className="bg-gold-50 font-bold">
              <td className="px-4 py-2" colSpan={5}>
                Totals (cancelled sales not included)
              </td>
              <td className="num px-4 py-2 text-right">{formatRs(sum.subtotal)}</td>
              <td className="num px-4 py-2 text-right">{formatRs(sum.discount)}</td>
              <td className="num px-4 py-2 text-right">{formatRs(sum.tax_amount)}</td>
              <td className="num px-4 py-2 text-right">{formatRs(sum.total_amount)}</td>
              <td colSpan={2} />
            </tr>
          ) : null
        }
      />
    </>
  );
}

function StockReport() {
  const q = useQuery({ queryKey: ['reports', 'stock'], queryFn: () => api.get('/reports/stock') });
  const summaryCols = [
    { key: 'cat', header: 'Category', cell: (g) => <strong>{g.category_name}</strong>, exportValue: (g) => g.category_name },
    { key: 'items', header: 'Different items', align: 'right', cell: (g) => g.item_count, exportValue: (g) => g.item_count },
    { key: 'qty', header: 'Total pieces', align: 'right', cell: (g) => g.total_quantity, exportValue: (g) => g.total_quantity },
    { key: 'wt', header: 'Total weight (g)', align: 'right', cell: (g) => Number(g.total_weight).toFixed(3), exportValue: (g) => g.total_weight },
    { key: 'val', header: "Value at today's rate", align: 'right', cell: (g) => formatRs(g.estimated_value, { decimals: 0 }), exportValue: (g) => g.estimated_value },
  ];
  const itemCols = [
    { key: 'tag', header: 'Tag', cell: (i) => <span className="num font-semibold">{i.tag}</span>, exportValue: (i) => i.tag },
    { key: 'name', header: 'Name', cell: (i) => i.name, exportValue: (i) => i.name },
    { key: 'cat', header: 'Category', cell: (i) => i.category_name, exportValue: (i) => i.category_name },
    { key: 'w', header: 'Weight each (g)', align: 'right', cell: (i) => Number(i.weight_grams).toFixed(3), exportValue: (i) => i.weight_grams },
    {
      key: 'q',
      header: 'Quantity',
      align: 'right',
      cell: (i) => (i.quantity === 0 ? <Badge tone="danger">Out of stock</Badge> : i.quantity),
      exportValue: (i) => i.quantity,
    },
    { key: 'tw', header: 'Total weight (g)', align: 'right', cell: (i) => i.total_weight, exportValue: (i) => i.total_weight },
    { key: 'v', header: "Value at today's rate", align: 'right', cell: (i) => formatRs(i.estimated_value, { decimals: 0 }), exportValue: (i) => i.estimated_value },
  ];
  return (
    <div className="space-y-8">
      <div>
        <h2 className="mb-3">Stock by category</h2>
        <Table
          columns={summaryCols}
          rows={q.data?.summary || []}
          rowKey={(g) => g.category_id}
          isLoading={q.isLoading}
          error={q.error}
          onRetry={q.refetch}
          exportName="stock-by-category"
          exportTitle="Stock by Category"
          emptyMessage="No items in stock yet."
        />
      </div>
      <div>
        <h2 className="mb-3">All items</h2>
        <Table
          columns={itemCols}
          rows={q.data?.data || []}
          isLoading={q.isLoading}
          error={q.error}
          onRetry={q.refetch}
          exportName="stock-items"
          exportTitle="Stock Report"
          emptyMessage="No items yet."
        />
      </div>
    </div>
  );
}

function BalancesReport() {
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['reports', 'balances'], queryFn: () => api.get('/reports/balances') });
  const columns = [
    { key: 'id', header: 'ID', exportValue: (c) => c.id },
    { key: 'name', header: 'Customer Name', cell: (c) => <strong>{c.name}</strong>, exportValue: (c) => c.name },
    { key: 'cnic', header: 'CNIC', cell: (c) => <span className="num">{c.cnic || '—'}</span>, exportValue: (c) => c.cnic },
    { key: 'phone', header: 'Phone', cell: (c) => <span className="num">{c.phone || '—'}</span>, exportValue: (c) => c.phone },
    { key: 'bal', header: 'Balance', align: 'right', cell: (c) => <BalanceText value={c.balance} />, exportValue: (c) => c.balance },
    {
      key: 'a',
      header: 'Action',
      noExport: true,
      headerClassName: 'text-right',
      cell: (c) => (
        <RowActions>
          <Button size="sm" variant="secondary" onClick={() => navigate(`/customers/${c.id}`)}>
            View
          </Button>
        </RowActions>
      ),
    },
  ];
  return (
    <>
      {q.data && (
        <Summary
          items={[
            ['Customers who owe money', formatNumber(q.data.summary.customers_owing)],
            ['Total outstanding', formatRs(q.data.summary.total_outstanding), 'danger'],
          ]}
        />
      )}
      <Table
        columns={columns}
        rows={q.data?.data || []}
        isLoading={q.isLoading}
        error={q.error}
        onRetry={q.refetch}
        exportName="customer-balances"
        exportTitle="Customer Balances"
        emptyMessage="Good news: no customer owes any money."
      />
    </>
  );
}

const TABS = [
  { key: 'sales', label: 'Sales Report', Comp: SalesReport },
  { key: 'stock', label: 'Stock Report', Comp: StockReport },
  { key: 'balances', label: 'Customer Balances', Comp: BalancesReport },
];

export default function Reports() {
  const [tab, setTab] = useState('sales');
  const Active = TABS.find((t) => t.key === tab).Comp;
  return (
    <>
      <PageHeader title="Reports" subtitle="Sales, stock and money owed. Every report can be exported or printed." />
      <div className="no-print mb-5 flex flex-wrap gap-2 border-b border-line pb-3" role="tablist">
        {TABS.map((t) => (
          <Button key={t.key} role="tab" aria-selected={tab === t.key} variant={tab === t.key ? 'primary' : 'secondary'} onClick={() => setTab(t.key)}>
            {t.label}
          </Button>
        ))}
      </div>
      <Active />
    </>
  );
}
