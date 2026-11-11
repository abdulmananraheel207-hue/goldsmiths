import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Users, Receipt, Gem, Layers, ShoppingCart, AlertTriangle, ArrowRight, Wallet, CalendarDays, Sun } from 'lucide-react';
import { api } from '@/lib/api.js';
import { formatRs, formatDate, formatNumber } from '@/lib/format.js';
import { useCurrentRate } from '@/lib/hooks.js';
import { Button, Card, PageHeader, Loading, ErrorState, Badge } from '@/components/ui';
import { SalesChart, SalesChartTable } from '@/components/SalesChart.jsx';
import { MarketChart } from '@/components/MarketChart.jsx';
import { DailyRateModal } from '@/components/DailyRateModal.jsx';

function StatCard({ icon: Icon, label, value, to }) {
  return (
    <div className="card flex flex-col justify-between gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-ink-soft">{label}</p>
          <p className="num mt-1 font-display text-[1.9rem] font-semibold leading-none">{value}</p>
        </div>
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold-50 text-gold-600">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
      </div>
      <Link to={to} className="inline-flex min-h-[34px] items-center gap-2 font-semibold text-gold-700 hover:text-gold-800">
        Details <ArrowRight className="h-5 w-5" aria-hidden />
      </Link>
    </div>
  );
}

function MoneyTile({ icon: Icon, label, amount, sub, danger }) {
  return (
    <div className="card flex items-center gap-4 p-5">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${danger ? 'bg-danger-50 text-danger-600' : 'bg-success-50 text-success-600'}`}>
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-ink-soft">{label}</p>
        <p className={`num text-[1.25rem] font-extrabold leading-tight ${danger && Number(amount) > 0 ? 'text-danger-700' : ''}`}>
          {formatRs(amount)}
        </p>
        {sub && <p className="text-[12.5px] text-ink-soft">{sub}</p>}
      </div>
    </div>
  );
}

const RANGES = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: '7 days' },
  { key: 'month', label: 'Month' },
  { key: '30d', label: '30 days' },
];

export default function Dashboard() {
  const [range, setRange] = useState('30d');
  const [showTable, setShowTable] = useState(false);
  const [rateOpen, setRateOpen] = useState(false);
  const dash = useQuery({ queryKey: ['dashboard'], queryFn: () => api.get('/reports/dashboard') });
  const chart = useQuery({ queryKey: ['dashboard', 'chart', range], queryFn: () => api.get('/reports/dashboard/chart', { range }) });
  const { data: rate } = useCurrentRate();

  if (dash.isLoading) return <Loading />;
  if (dash.error) return <ErrorState error={dash.error} onRetry={dash.refetch} />;
  const d = dash.data;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Dashboard"
        subtitle="A quick look at how the shop is doing."
        actions={
          <Button to="/sales/new" icon={ShoppingCart} size="lg">
            Add Sale
          </Button>
        }
      />

      {rate && !rate.is_set_today && (
        <div className="flex flex-col gap-3 rounded-xl border border-warn-100 bg-warn-50 p-5 sm:flex-row sm:items-center sm:justify-between" role="alert">
          <div className="flex items-start gap-3 text-warn-700">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
            <p className="text-[15px] font-bold">Today&apos;s gold price has not been set yet. Please update it before making a sale.</p>
          </div>
          <Button onClick={() => setRateOpen(true)}>Add Today&apos;s Gold Price</Button>
        </div>
      )}

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Users} label="Total Registered Customers" value={formatNumber(d.counts.customers)} to="/customers" />
        <StatCard icon={Receipt} label="Total Number of Sales" value={formatNumber(d.counts.sales)} to="/sales" />
        <StatCard icon={Gem} label="Total Items" value={formatNumber(d.counts.items)} to="/items" />
        <StatCard icon={Layers} label="Total Categories" value={formatNumber(d.counts.categories)} to="/categories" />
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        <MoneyTile icon={Sun} label="Today's Sales" amount={d.today.amount} sub={`${d.today.count} ${d.today.count === 1 ? 'sale' : 'sales'}`} />
        <MoneyTile icon={CalendarDays} label="This Month's Sales" amount={d.month.amount} sub={`${d.month.count} sales`} />
        <MoneyTile
          icon={Wallet}
          label="Total Outstanding Customer Balance"
          amount={d.outstanding.total}
          sub={`${d.outstanding.customers} ${d.outstanding.customers === 1 ? 'customer owes' : 'customers owe'} money`}
          danger
        />
      </div>

      <Card title="Gold & Silver market (live)" bodyClassName="p-3">
        <MarketChart />
        <p className="px-2 pt-2 text-[12.5px] text-ink-faint">
          International prices from TradingView, for information only. Hover the chart to see the price on earlier dates. Your shop&apos;s own
          selling price is set under Gold Rates &amp; Karats.
        </p>
      </Card>

      <Card
        title="Sales over time"
        actions={
          <>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Choose period">
              {RANGES.map((r) => (
                <Button key={r.key} size="sm" variant={range === r.key ? 'primary' : 'secondary'} onClick={() => setRange(r.key)} aria-pressed={range === r.key}>
                  {r.label}
                </Button>
              ))}
            </div>
            <Button size="sm" variant="ghost" onClick={() => setShowTable((s) => !s)}>
              {showTable ? 'Show chart' : 'Show as table'}
            </Button>
          </>
        }
      >
        {chart.isLoading ? (
          <Loading />
        ) : chart.error ? (
          <ErrorState error={chart.error} onRetry={chart.refetch} />
        ) : showTable ? (
          <SalesChartTable data={chart.data.data} range={range} />
        ) : (
          <SalesChart data={chart.data.data} range={range} />
        )}
      </Card>

      <div className="grid gap-5 xl:grid-cols-3">
        <Card title="Recent Sales" className="xl:col-span-2" actions={<Button size="sm" variant="secondary" to="/sales">See all sales</Button>} bodyClassName="p-0">
          {!d.recent_sales.length ? (
            <p className="px-5 py-8 text-center text-ink-soft">No sales yet. Click &quot;Add Sale&quot; to make your first sale.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-table">
                <thead className="bg-gold-50">
                  <tr>
                    <th className="px-4 py-2 text-left">Invoice</th>
                    <th className="px-4 py-2 text-left">Date</th>
                    <th className="px-4 py-2 text-left">Customer</th>
                    <th className="px-4 py-2 text-right">Total</th>
                    <th className="px-4 py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {d.recent_sales.map((s, i) => (
                    <tr key={s.id} className={i % 2 ? 'bg-paper' : 'bg-white'}>
                      <td className="px-4 py-2 font-semibold">
                        {s.invoice_number} {s.status === 'void' && <Badge tone="danger">Cancelled</Badge>}
                      </td>
                      <td className="px-4 py-2">{formatDate(s.sale_date)}</td>
                      <td className="px-4 py-2">{s.customer_name}</td>
                      <td className="num px-4 py-2 text-right">{formatRs(s.total_amount)}</td>
                      <td className="px-4 py-2 text-right">
                        <Button size="sm" variant="secondary" to={`/sales/${s.id}`}>
                          View
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Low stock items" actions={<Button size="sm" variant="secondary" to="/items">All items</Button>} bodyClassName="p-0">
          {!d.low_stock.length ? (
            <p className="px-5 py-8 text-center text-ink-soft">All items are well stocked.</p>
          ) : (
            <ul className="divide-y divide-line">
              {d.low_stock.map((it) => (
                <li key={it.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <Link to={`/items/${it.id}`} className="font-semibold hover:text-gold-700">
                      {it.name}
                    </Link>
                    <p className="text-[12.5px] text-ink-soft">
                      {it.tag} · {it.category_name}
                    </p>
                  </div>
                  {it.quantity === 0 ? <Badge tone="danger">Out of stock</Badge> : <Badge tone="warn">Only {it.quantity} left</Badge>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <DailyRateModal open={rateOpen} onClose={() => setRateOpen(false)} />
    </div>
  );
}
