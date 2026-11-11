import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Save, Printer, History, UserPlus, AlertTriangle } from 'lucide-react';
import { calcLine, calcTotals } from '@shared/saleCalc.js';
import { api } from '@/lib/api.js';
import { formatRs, formatRate, formatDate, todayISO, PAYMENT_LABELS, cleanDecimal } from '@/lib/format.js';
import { useCurrentRate, useDebounced, useSettings } from '@/lib/hooks.js';
import { Button, Card, Combobox, Input, Modal, PageHeader, Select, Field, Loading, useConfirm, useToast } from '@/components/ui';
import { CustomerFields, emptyCustomer, validateCustomer } from '@/pages/customers/CustomerForm.jsx';
import { DailyRateModal } from '@/components/DailyRateModal.jsx';

let uid = 1;
const newLine = () => ({
  uid: uid++,
  item: null,
  item_id: '',
  weight_grams: '',
  wastage_value: '',
  quantity: '1',
  rate_per_gram: '',
  making_charges: '',
  other_stone_charges: '',
  gold_received_value: '',
});

const customerLabel = (c) => (c ? `${c.name}${c.cnic ? ` (${c.cnic})` : ''}` : '');

/** Small number box for the line grid. */
function Num({ label, value, onChange, decimals = 2, error, readOnly, note, prefix, className = '' }) {
  return (
    <Field label={label} error={error} hint={note} className={className}>
      <div className="relative">
        {prefix && <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[13px] text-ink-soft">{prefix}</span>}
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          aria-label={label}
          readOnly={readOnly}
          tabIndex={readOnly ? -1 : undefined}
          value={value}
          placeholder="0"
          onChange={(e) => onChange?.(cleanDecimal(e.target.value, decimals))}
          className={`field-input num px-3 ${prefix ? 'pl-9' : ''} ${error ? 'has-error' : ''} ${readOnly ? 'font-bold' : ''}`}
        />
      </div>
    </Field>
  );
}

function ItemPicker({ line, onPick, error }) {
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 200);
  const res = useQuery({ queryKey: ['items', 'lookup', dq], queryFn: () => api.get('/items/lookup', { q: dq }) });
  const options = (res.data?.data || []).map((it) => ({
    value: it.id,
    label: `${it.tag} — ${it.name}`,
    sublabel: it.quantity > 0 ? `${it.category_name} · ${Number(it.weight_grams).toFixed(3)} g · ${it.quantity} in stock` : 'Out of stock',
    disabled: it.quantity <= 0,
    data: it,
  }));
  return (
    <Combobox
      label="Item Tag"
      required
      value={line.item_id}
      displayValue={line.item ? line.item.tag : ''}
      options={options}
      onSearch={setQ}
      onSelect={(o) => onPick(o.data)}
      loading={res.isFetching}
      placeholder="Type tag or name"
      emptyText="No item found with that tag"
      error={error}
    />
  );
}

function NewCustomerModal({ open, onClose, onCreated }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState(emptyCustomer);
  const [errors, setErrors] = useState({});
  useEffect(() => {
    if (open) {
      setForm(emptyCustomer);
      setErrors({});
    }
  }, [open]);
  const save = useMutation({
    mutationFn: () => api.post('/customers', form),
    onSuccess: (d) => {
      toast.success(d.message);
      qc.invalidateQueries({ queryKey: ['customers'] });
      onCreated(d.customer);
      onClose();
    },
    onError: (e) => setErrors({ ...(e.errors || {}), _: e.message }),
  });
  const submit = (e) => {
    e?.preventDefault();
    const errs = validateCustomer(form);
    setErrors(errs);
    if (!Object.keys(errs).length) save.mutate();
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New customer"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={save.isPending}>
            Save and use for this sale
          </Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        {errors._ && <p className="font-semibold text-danger-700">{errors._}</p>}
        <CustomerFields form={form} setForm={setForm} errors={errors} compact />
        <p className="text-[13px] text-ink-soft">You can add the address and other details later from the Customers page.</p>
      </form>
    </Modal>
  );
}

export default function AddSale() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const { data: settings, isLoading: settingsLoading } = useSettings();
  const { data: rate } = useCurrentRate();

  const [customer, setCustomer] = useState(null);
  const [custSearch, setCustSearch] = useState('');
  const dCust = useDebounced(custSearch, 200);
  const custQ = useQuery({ queryKey: ['customers', 'options', dCust], queryFn: () => api.get('/customers/options', { search: dCust }) });
  const [header, setHeader] = useState({ payment_method: 'cash', bill_no: '', remarks: '' });
  const [lines, setLines] = useState([newLine()]);
  const [discount, setDiscount] = useState('');
  const [cash, setCash] = useState('');
  const [errors, setErrors] = useState({});
  const [newCustOpen, setNewCustOpen] = useState(false);
  const [rateOpen, setRateOpen] = useState(false);
  const printAfter = useRef(false);

  // Default customer: from ?customer=ID, else Walk-in.
  const preselect = params.get('customer');
  const preQ = useQuery({ queryKey: ['customers', preselect], queryFn: () => api.get(`/customers/${preselect}`), enabled: Boolean(preselect) });
  useEffect(() => {
    if (customer) return;
    if (preselect && preQ.data?.customer) setCustomer(preQ.data.customer);
    else if (!preselect && custQ.data && !dCust) {
      const w = custQ.data.data.find((c) => c.is_walk_in);
      if (w) setCustomer(w);
    }
  }, [customer, preselect, preQ.data, custQ.data, dCust]);

  const setLine = (u, patch) => setLines((ls) => ls.map((l) => (l.uid === u ? { ...l, ...patch } : l)));

  const pickItem = (u, it) => {
    setLine(u, {
      item: it,
      item_id: it.id,
      weight_grams: String(Number(it.weight_grams)),
      rate_per_gram: Number(it.category_price_per_gram).toFixed(2),
      quantity: '1',
    });
    setErrors((e) => {
      const n = { ...e };
      Object.keys(n).forEach((k) => k.startsWith('lines.') && delete n[k]);
      return n;
    });
  };

  const calcs = useMemo(() => lines.map((l) => calcLine(l)), [lines]);
  const filled = lines.filter((l) => l.item_id);
  const totals = useMemo(
    () =>
      calcTotals({
        lines: filled,
        discount,
        tax_percent: settings?.tax_percent || 0,
        pos_service_fee: settings?.pos_service_fee || 0,
        card_fee_percent: settings?.card_fee_percent || 0,
        payment_method: header.payment_method,
        cash_received: cash,
      }),
    [filled, discount, settings, header.payment_method, cash],
  );

  const lineIndex = (u) => filled.findIndex((l) => l.uid === u);
  const lineErr = (u, field) => {
    const i = lineIndex(u);
    return i >= 0 ? errors[`lines.${i}.${field}`] : undefined;
  };

  const save = useMutation({
    mutationFn: (body) => api.post('/sales', body),
    onSuccess: (d) => {
      toast.success(d.message);
      ['sales', 'items', 'customers', 'dashboard', 'reports'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      navigate(`/sales/${d.sale.id}${printAfter.current ? '?print=1' : ''}`);
    },
    onError: (e) => {
      setErrors(e.errors || {});
      toast.error(e.message);
    },
  });

  const submit = async (andPrint) => {
    const errs = {};
    if (!customer) errs.customer_id = 'Please choose a customer';
    if (!filled.length) errs.lines = 'Please add at least one item';
    filled.forEach((l, i) => {
      if (!(Number(l.quantity) >= 1)) errs[`lines.${i}.quantity`] = 'At least 1';
      else if (l.item && Number(l.quantity) > l.item.quantity) errs[`lines.${i}.quantity`] = `Only ${l.item.quantity} in stock`;
      if (!(Number(l.rate_per_gram) > 0)) errs[`lines.${i}.rate_per_gram`] = 'Enter the rate';
      if (!(Number(l.weight_grams) > 0)) errs[`lines.${i}.weight_grams`] = 'Enter the weight';
    });
    if (Number(totals.discount) > Number(totals.subtotal)) errs.discount = 'Discount cannot be more than the sub total';
    if (customer?.is_walk_in && Number(totals.balance) > 0) {
      errs.cash_received = `A walk-in customer must pay the full amount (${formatRs(totals.total_amount)}).`;
    }
    setErrors(errs);
    if (Object.keys(errs).length) {
      toast.error(errs.cash_received || errs.customer_id || errs.lines || 'Please check the highlighted fields.');
      return;
    }
    if (rate && !rate.is_set_today) {
      const ok = await confirm({
        title: "Today's gold price is not set",
        message: `Today's gold price has not been set yet. The last price entered was ${formatRs(rate.current?.price_24k_per_tola)} per tola (24K). Continue with yesterday's rate?`,
        confirmText: "Yes, continue with yesterday's rate",
        cancelText: 'No, go back',
      });
      if (!ok) return;
    }
    if (Number(totals.balance) > 0) {
      const ok = await confirm({
        title: 'Customer will owe money',
        message: (
          <>
            {customer.name} is paying less than the total.
            <br />
            <strong className="text-danger-700">{formatRs(totals.balance)}</strong> will be added to their balance. Continue?
          </>
        ),
        confirmText: 'Yes, save the sale',
      });
      if (!ok) return;
    }
    printAfter.current = andPrint;
    save.mutate({
      customer_id: customer.id,
      ...header,
      discount: discount || '0',
      cash_received: cash || '0',
      lines: filled.map((l) => ({
        item_id: l.item_id,
        weight_grams: l.weight_grams,
        wastage_value: l.wastage_value || '0',
        quantity: l.quantity,
        rate_per_gram: l.rate_per_gram,
        making_charges: l.making_charges || '0',
        other_stone_charges: l.other_stone_charges || '0',
        gold_received_value: l.gold_received_value || '0',
      })),
    });
  };

  if (settingsLoading) return <Loading />;

  const balance = Number(totals.balance);
  const custOptions = (custQ.data?.data || []).map((c) => ({
    value: c.id,
    label: customerLabel(c),
    sublabel: c.is_walk_in ? 'For counter sales paid in full' : c.phone,
    data: c,
  }));

  return (
    <>
      <PageHeader
        title="Add Sale"
        subtitle="Sales counter"
        actions={
          <Button variant="secondary" icon={History} to="/sales">
            Sales History
          </Button>
        }
      />

      {rate && !rate.is_set_today && (
        <div className="mb-5 flex flex-col gap-3 rounded-xl border border-warn-100 bg-warn-50 p-4 sm:flex-row sm:items-center sm:justify-between" role="alert">
          <p className="flex items-start gap-3 font-bold text-warn-700">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            Today&apos;s gold price has not been set yet. Please update it before making a sale.
          </p>
          <Button onClick={() => setRateOpen(true)}>Add Today&apos;s Gold Price</Button>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-5">
          {/* Header */}
          <Card>
            <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
              <div className="md:col-span-2 2xl:col-span-1">
                <Combobox
                  label="Customer"
                  required
                  value={customer?.id}
                  displayValue={customerLabel(customer)}
                  options={custOptions}
                  onSearch={setCustSearch}
                  onSelect={(o) => setCustomer(o.data)}
                  loading={custQ.isFetching}
                  placeholder="Search name, CNIC or phone"
                  error={errors.customer_id}
                />
                <Button variant="ghost" size="sm" icon={UserPlus} className="mt-1 text-gold-700" onClick={() => setNewCustOpen(true)}>
                  + New customer
                </Button>
              </div>
              <Input label="Date" value={formatDate(todayISO())} readOnly />
              <Select
                label="Payment From"
                value={header.payment_method}
                onChange={(e) => setHeader({ ...header, payment_method: e.target.value })}
                options={Object.entries(PAYMENT_LABELS).map(([value, label]) => ({ value, label }))}
              />
              <Input label="Bill No. (optional)" placeholder="Paper bill number, if any" value={header.bill_no} onChange={(e) => setHeader({ ...header, bill_no: e.target.value })} />
              <Input
                label="Remarks (optional)"
                placeholder="Any note about this sale"
                value={header.remarks}
                onChange={(e) => setHeader({ ...header, remarks: e.target.value })}
                className="md:col-span-2 2xl:col-span-2"
              />
            </div>
          </Card>

          {/* Lines */}
          <div className="space-y-4">
            <h2>Items being sold</h2>
            {errors.lines && <p className="font-semibold text-danger-700">{errors.lines}</p>}
            {lines.map((l, idx) => {
              const c = calcs[idx];
              const todayRate = l.item ? Number(l.item.category_price_per_gram) : null;
              return (
                <div key={l.uid} className="card p-4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <h3>Item {idx + 1}</h3>
                    <Button
                      variant="danger"
                      size="sm"
                      icon={Trash2}
                      onClick={() => setLines((ls) => (ls.length === 1 ? [newLine()] : ls.filter((x) => x.uid !== l.uid)))}
                    >
                      Remove
                    </Button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-6">
                    <div className="sm:col-span-2 lg:col-span-1">
                      <ItemPicker line={l} onPick={(it) => pickItem(l.uid, it)} error={lineErr(l.uid, 'item_id')} />
                    </div>
                    <Field label="Name">
                      <div className="field-input flex items-center bg-paper">{l.item?.name || <span className="text-ink-faint">—</span>}</div>
                    </Field>
                    <Field label="Category / Karat">
                      <div className="field-input flex items-center bg-paper">{l.item?.category_name || <span className="text-ink-faint">—</span>}</div>
                    </Field>
                    <Num label="Weight (g)" decimals={3} value={l.weight_grams} onChange={(v) => setLine(l.uid, { weight_grams: v })} error={lineErr(l.uid, 'weight_grams')} />

                    <Num
                      label="Wastage (grams)"
                      decimals={3}
                      value={l.wastage_value}
                      onChange={(v) => setLine(l.uid, { wastage_value: v })}
                      error={lineErr(l.uid, 'wastage_value')}
                    />
                    <Num label="Gross Weight (g)" value={c.gross_weight} readOnly />
                    <Num label="Qty" decimals={0} value={l.quantity} onChange={(v) => setLine(l.uid, { quantity: v })} error={lineErr(l.uid, 'quantity')} />

                    <Num
                      label="Rate per Gram"
                      prefix="Rs"
                      value={l.rate_per_gram}
                      onChange={(v) => setLine(l.uid, { rate_per_gram: v })}
                      error={lineErr(l.uid, 'rate_per_gram')}
                      note={todayRate ? `Today's rate: ${formatRate(todayRate)}` : undefined}
                    />
                    <Num label="Making Charges" prefix="Rs" value={l.making_charges} onChange={(v) => setLine(l.uid, { making_charges: v })} />
                    <Num label="Others / Stone" prefix="Rs" value={l.other_stone_charges} onChange={(v) => setLine(l.uid, { other_stone_charges: v })} />
                    <Num
                      label="Old Gold (−)"
                      prefix="Rs"
                      value={l.gold_received_value}
                      onChange={(v) => setLine(l.uid, { gold_received_value: v })}
                    />
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-end gap-3 rounded-xl bg-gold-50 px-4 py-2">
                    <span className="text-ink-soft">Line Total</span>
                    <span className="num text-[18px] font-extrabold">{formatRs(c.line_total)}</span>
                  </div>
                </div>
              );
            })}
            <Button variant="secondary" size="lg" icon={Plus} onClick={() => setLines((ls) => [...ls, newLine()])}>
              Add another item
            </Button>
          </div>
        </div>

        {/* Totals panel */}
        <aside className="xl:sticky xl:top-4 xl:self-start">
          <div className="card space-y-4 p-5">
            <h2>Totals</h2>
            <dl className="space-y-2.5">
              <div className="flex justify-between gap-3">
                <dt>Sub Total</dt>
                <dd className="num font-semibold">{formatRs(totals.subtotal)}</dd>
              </div>
            </dl>
            <Num label="Discount (Rs)" value={discount} onChange={setDiscount} error={errors.discount} prefix="Rs" />
            <dl className="space-y-2.5">
              <div className="flex justify-between gap-3">
                <dt>Tax ({Number(settings?.tax_percent || 0)}%)</dt>
                <dd className="num">{formatRs(totals.tax_amount)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>POS Service Fee</dt>
                <dd className="num">{formatRs(totals.pos_service_fee)}</dd>
              </div>
              {header.payment_method === 'card' && (
                <div className="flex justify-between gap-3">
                  <dt>Card Fee ({Number(settings?.card_fee_percent || 0)}%)</dt>
                  <dd className="num">{formatRs(totals.card_fee)}</dd>
                </div>
              )}
            </dl>
            <div className="rounded-lg bg-onyx-900 px-4 py-3 text-white">
              <p className="eyebrow text-gold-300">Total Amount</p>
              <p className="num text-[1.6rem] font-extrabold leading-tight">{formatRs(totals.total_amount)}</p>
            </div>
            <Num
              label={header.payment_method === 'cash' ? 'Cash Received (Rs)' : 'Amount Received (Rs)'}
              value={cash}
              onChange={setCash}
              prefix="Rs"
              error={errors.cash_received}
            />
            <Button variant="ghost" size="sm" onClick={() => setCash(totals.total_amount)}>
              Customer paid the full amount
            </Button>
            <div
              className={`rounded-xl px-4 py-2 ${
                balance > 0 ? 'bg-danger-50 text-danger-700' : balance < 0 ? 'bg-success-50 text-success-700' : 'bg-paper'
              }`}
            >
              {balance > 0 ? (
                <>
                  <p className="font-semibold">Customer Balance (still owes)</p>
                  <p className="num text-[1.25rem] font-extrabold">{formatRs(balance)}</p>
                  {customer?.is_walk_in && <p className="text-[13px]">Walk-in customers must pay in full.</p>}
                </>
              ) : balance < 0 ? (
                <>
                  <p className="font-semibold">Change to return</p>
                  <p className="num text-[1.25rem] font-extrabold">{formatRs(-balance)}</p>
                </>
              ) : (
                <p className="font-semibold">Fully paid</p>
              )}
            </div>
            <div className="space-y-3 pt-2">
              <Button size="lg" icon={Save} className="w-full" loading={save.isPending && !printAfter.current} onClick={() => submit(false)}>
                Save Sale
              </Button>
              <Button size="lg" variant="secondary" icon={Printer} className="w-full" loading={save.isPending && printAfter.current} onClick={() => submit(true)}>
                Save &amp; Print
              </Button>
            </div>
          </div>
        </aside>
      </div>

      <NewCustomerModal open={newCustOpen} onClose={() => setNewCustOpen(false)} onCreated={(c) => setCustomer(c)} />
      <DailyRateModal open={rateOpen} onClose={() => setRateOpen(false)} />
    </>
  );
}
