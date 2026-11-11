import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, Pencil, ShoppingCart } from 'lucide-react';
import { api } from '@/lib/api.js';
import { formatRs, formatDate, formatDateTime, PAYMENT_LABELS } from '@/lib/format.js';
import { Button, Card, PageHeader, Loading, ErrorState, Badge, StatusBadge, Modal, NumberInput, Select, Input, useToast } from '@/components/ui';
import { BalanceText } from './Customers.jsx';

/** Receive Payment window. Used on the customer page and in the Customers table. */
export function ReceivePaymentModal({ open, onClose, customer, sales }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState({ amount: '', method: 'cash', note: '', sale_id: '' });
  const [errors, setErrors] = useState({});
  const ledger = useQuery({
    queryKey: ['customers', String(customer?.id), 'ledger'],
    queryFn: () => api.get(`/customers/${customer.id}/ledger`),
    enabled: Boolean(open && customer && !sales),
  });
  const unpaid = (sales || ledger.data?.sales || []).filter((s) => Number(s.remaining) > 0);

  const save = useMutation({
    mutationFn: () => api.post(`/customers/${customer.id}/payments`, form),
    onSuccess: (d) => {
      toast.success(`${d.message} New balance: ${formatRs(d.balance)}`);
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['reports'] });
      setForm({ amount: '', method: 'cash', note: '', sale_id: '' });
      onClose();
    },
    onError: (e) => setErrors({ ...(e.errors || {}), _: e.message }),
  });

  const submit = (e) => {
    e?.preventDefault();
    if (!(Number(form.amount) > 0)) return setErrors({ amount: 'Please enter the amount received' });
    if (Number(form.amount) > Number(customer.balance)) {
      return setErrors({ amount: `This is more than the customer owes (${formatRs(customer.balance)})` });
    }
    setErrors({});
    save.mutate();
  };

  if (!customer) return null;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Receive Payment"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="success" icon={Banknote} onClick={submit} loading={save.isPending}>
            Save payment
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-5" noValidate>
        <p className="rounded-xl bg-paper px-4 py-2">
          <strong>{customer.name}</strong> owes <BalanceText value={customer.balance} />
        </p>
        {errors._ && <p className="font-semibold text-danger-700">{errors._}</p>}
        <NumberInput
          label="Amount received (Rs)"
          required
          placeholder="For example 10000"
          value={form.amount}
          onChange={(v) => setForm({ ...form, amount: v })}
          error={errors.amount}
          autoFocus
        />
        <Select
          label="Paid by"
          value={form.method}
          onChange={(e) => setForm({ ...form, method: e.target.value })}
          options={Object.entries(PAYMENT_LABELS).map(([value, label]) => ({ value, label }))}
        />
        {unpaid.length > 0 && (
          <Select
            label="For which invoice? (optional)"
            value={form.sale_id}
            onChange={(e) => setForm({ ...form, sale_id: e.target.value })}
            placeholder="General payment (not for one invoice)"
            options={unpaid.map((s) => ({ value: s.id, label: `${s.invoice_number} — remaining ${formatRs(s.remaining)}` }))}
            error={errors.sale_id}
          />
        )}
        <Input label="Note (optional)" placeholder="For example: second instalment" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
      </form>
    </Modal>
  );
}

export default function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [payOpen, setPayOpen] = useState(false);
  const q = useQuery({ queryKey: ['customers', id, 'ledger'], queryFn: () => api.get(`/customers/${id}/ledger`) });

  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorState error={q.error} onRetry={q.refetch} />;
  const { customer: c, sales, payments } = q.data;
  const owes = Number(c.balance) > 0;

  return (
    <>
      <PageHeader
        title={c.name}
        subtitle={c.is_walk_in ? 'Default customer for counter sales' : 'Customer profile and account'}
        backTo="/customers"
        backLabel="Back to customers"
        actions={
          <>
            <Button variant="secondary" icon={Pencil} to={`/customers/${c.id}/edit`}>
              Edit
            </Button>
            {owes && (
              <Button variant="success" icon={Banknote} size="lg" onClick={() => setPayOpen(true)}>
                Receive Payment
              </Button>
            )}
            <Button icon={ShoppingCart} size="lg" onClick={() => navigate(`/sales/new?customer=${c.id}`)}>
              New Sale
            </Button>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Profile">
          <dl className="space-y-3">
            {[
              ['Customer ID', c.id],
              ['CNIC', c.cnic || '—'],
              ['Mobile', c.phone || '—'],
              ['Email', c.email || '—'],
              ['Address', c.address || '—'],
              ['Opening balance', formatRs(c.opening_balance)],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 border-b border-line pb-2 last:border-0">
                <dt className="text-ink-soft">{k}</dt>
                <dd className="text-right font-semibold">{v}</dd>
              </div>
            ))}
            <div className="flex justify-between gap-4">
              <dt className="text-ink-soft">Status</dt>
              <dd>
                <StatusBadge status={c.status} />
              </dd>
            </div>
          </dl>
        </Card>

        <div className={`card flex flex-col justify-center gap-2 p-5 lg:col-span-2 ${owes ? 'border-danger-100 bg-danger-50' : ''}`}>
          <p className="text-ink-soft">Current balance</p>
          <p className={`num text-[1.9rem] font-extrabold leading-none ${owes ? 'text-danger-700' : 'text-success-700'}`}>
            {formatRs(Math.abs(Number(c.balance)))}
          </p>
          <p className="text-[15px] font-semibold">
            {owes ? 'This customer owes the shop this amount.' : Number(c.balance) < 0 ? 'The shop owes this customer (credit).' : 'Nothing owed. All settled.'}
          </p>
          <p className="text-[12.5px] text-ink-soft">Balance = opening balance + unpaid invoices − payments received.</p>
        </div>
      </div>

      <Card title="Purchase history" className="mt-5" bodyClassName="p-0">
        {!sales.length ? (
          <p className="px-5 py-8 text-center text-ink-soft">This customer has not bought anything yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-table">
              <thead className="bg-gold-50">
                <tr>
                  <th className="px-4 py-2 text-left">Invoice</th>
                  <th className="px-4 py-2 text-left">Date</th>
                  <th className="px-4 py-2 text-right">Total</th>
                  <th className="px-4 py-2 text-right">Paid</th>
                  <th className="px-4 py-2 text-right">Remaining</th>
                  <th className="px-4 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((s, i) => (
                  <tr key={s.id} className={i % 2 ? 'bg-paper' : 'bg-white'}>
                    <td className="px-4 py-2 font-semibold">
                      {s.invoice_number} {s.status === 'void' && <Badge tone="danger">Cancelled</Badge>}
                    </td>
                    <td className="px-4 py-2">{formatDate(s.sale_date)}</td>
                    <td className="num px-4 py-2 text-right">{formatRs(s.total_amount)}</td>
                    <td className="num px-4 py-2 text-right">{formatRs(s.paid)}</td>
                    <td className={`num px-4 py-2 text-right ${Number(s.remaining) > 0 ? 'font-bold text-danger-700' : ''}`}>
                      {formatRs(s.remaining)}
                    </td>
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

      <Card title="Payments received" className="mt-5" bodyClassName="p-0">
        {!payments.length ? (
          <p className="px-5 py-8 text-center text-ink-soft">No separate payments recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-table">
              <thead className="bg-gold-50">
                <tr>
                  <th className="px-4 py-2 text-left">Date</th>
                  <th className="px-4 py-2 text-left">Paid by</th>
                  <th className="px-4 py-2 text-left">For invoice</th>
                  <th className="px-4 py-2 text-left">Note</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p, i) => (
                  <tr key={p.id} className={i % 2 ? 'bg-paper' : 'bg-white'}>
                    <td className="px-4 py-2">{formatDateTime(p.paid_at)}</td>
                    <td className="px-4 py-2">{PAYMENT_LABELS[p.method]}</td>
                    <td className="px-4 py-2">{p.invoice_number || 'General'}</td>
                    <td className="px-4 py-2">{p.note || '—'}</td>
                    <td className="num px-4 py-2 text-right font-semibold text-success-700">{formatRs(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ReceivePaymentModal open={payOpen} onClose={() => setPayOpen(false)} customer={c} sales={sales} />
    </>
  );
}
