import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Coins, Plus } from 'lucide-react';
import Decimal from 'decimal.js';
import { gramPriceFromTola, ratePerTola } from '@shared/goldRates.js';
import { api } from '@/lib/api.js';
import { formatRate, formatRs, formatDateTime } from '@/lib/format.js';
import { useCategories, useCurrentRate } from '@/lib/hooks.js';
import { Button, Card, PageHeader, Table, RowActions, StatusBadge, Badge, Modal, Input, NumberInput, Select, useConfirm, useToast } from '@/components/ui';
import { DailyRateModal } from '@/components/DailyRateModal.jsx';

function invalidateRates(qc) {
  ['categories', 'gold-rate', 'gold-rate-history', 'items', 'dashboard'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
}

function AddCategoryModal({ open, onClose }) {
  const toast = useToast();
  const qc = useQueryClient();
  const { data: rate } = useCurrentRate();
  const [form, setForm] = useState({ name: '', karat: '' });
  const [errors, setErrors] = useState({});
  useEffect(() => {
    if (open) {
      setForm({ name: '', karat: '' });
      setErrors({});
    }
  }, [open]);

  const k = Number(form.karat);
  const validK = Number.isInteger(k) && k >= 1 && k <= 24;
  const previewTola = validK && rate?.current ? ratePerTola(k, rate.current.price_24k_per_tola) : null;

  const save = useMutation({
    mutationFn: () => api.post('/categories', { name: form.name.trim() || `${k}K`, karat: k }),
    onSuccess: (d) => {
      toast.success(d.message);
      invalidateRates(qc);
      onClose();
    },
    onError: (e) => setErrors({ ...(e.errors || {}), _: e.message }),
  });

  const submit = (e) => {
    e?.preventDefault();
    if (!validK) return setErrors({ karat: 'Karat must be a whole number from 1 to 24' });
    save.mutate();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add Category"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={save.isPending}>
            Save category
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-5" noValidate>
        {errors._ && <p className="font-semibold text-danger-700">{errors._}</p>}
        <NumberInput
          label="Karat"
          required
          decimals={0}
          placeholder="A number from 1 to 24, for example 19"
          value={form.karat}
          onChange={(v) => setForm({ ...form, karat: v })}
          error={errors.karat}
          autoFocus
        />
        <Input
          label="Name"
          placeholder={validK ? `${k}K` : 'For example 19K'}
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          error={errors.name}
          hint="Leave empty to use the karat, like 19K."
        />
        {previewTola && (
          <p className="rounded-xl bg-gold-50 px-4 py-2">
            At today&apos;s rate this will be <strong>{formatRate(previewTola)}</strong> per tola.
          </p>
        )}
      </form>
    </Modal>
  );
}

function EditCategoryModal({ category, onClose }) {
  const toast = useToast();
  const qc = useQueryClient();
  const { data: rate } = useCurrentRate();
  const [form, setForm] = useState({ name: '', price_per_tola: '', status: 'active' });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (category) {
      setForm({
        name: category.name,
        price_per_tola: new Decimal(category.price_per_tola).toDecimalPlaces(2).toString(),
        status: category.status,
      });
      setErrors({});
    }
  }, [category]);

  const gpt = rate?.grams_per_tola || '11.6638';
  const priceChanged = category && form.price_per_tola !== new Decimal(category.price_per_tola).toDecimalPlaces(2).toString();

  const save = useMutation({
    mutationFn: () =>
      api.put(`/categories/${category.id}`, {
        name: form.name,
        status: form.status,
        ...(priceChanged ? { price_per_tola: form.price_per_tola } : {}),
      }),
    onSuccess: (d) => {
      toast.success(d.message);
      invalidateRates(qc);
      onClose();
    },
    onError: (e) => setErrors({ ...(e.errors || {}), _: e.message }),
  });

  const submit = (e) => {
    e?.preventDefault();
    const errs = {};
    if (!form.name.trim()) errs.name = 'Please enter a name';
    if (!(Number(form.price_per_tola) > 0)) errs.price_per_tola = 'Please enter the price per tola';
    setErrors(errs);
    if (!Object.keys(errs).length) save.mutate();
  };

  return (
    <Modal
      open={Boolean(category)}
      onClose={onClose}
      title={`Edit ${category?.name || ''}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={save.isPending}>
            Save changes
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-5" noValidate>
        {errors._ && <p className="font-semibold text-danger-700">{errors._}</p>}
        <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={errors.name} />
        <NumberInput
          label="Price per tola (Rs)"
          value={form.price_per_tola}
          onChange={(v) => setForm({ ...form, price_per_tola: v })}
          error={errors.price_per_tola}
          hint={
            Number(form.price_per_tola) > 0
              ? `Per gram: ${formatRate(gramPriceFromTola(form.price_per_tola, gpt).toString())}`
              : undefined
          }
        />
        {priceChanged && (
          <p className="rounded-xl bg-gold-50 px-4 py-2 text-gold-800">
            This karat will be marked <strong>Manually set</strong>. When you next add the daily gold price you can choose to keep it.
          </p>
        )}
        <Select
          label="Status"
          value={form.status}
          onChange={(e) => setForm({ ...form, status: e.target.value })}
          options={[
            { value: 'active', label: 'Active' },
            { value: 'inactive', label: 'Inactive (cannot be chosen for new items)' },
          ]}
        />
      </form>
    </Modal>
  );
}

function RateHistory() {
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const q = useQuery({ queryKey: ['gold-rate-history', page], queryFn: () => api.get('/gold-rates/history', { page, pageSize }) });
  const columns = [
    { key: 'created_at', header: 'Date and time', cell: (r) => formatDateTime(r.created_at), exportValue: (r) => r.created_at },
    {
      key: 'price',
      header: '24K price per tola',
      align: 'right',
      cell: (r) => <span className="font-bold">{formatRs(r.price_24k_per_tola)}</span>,
      exportValue: (r) => r.price_24k_per_tola,
    },
    {
      key: 'applied',
      header: 'Applied to',
      cell: (r) => (r.applied_to_all ? 'All karats' : 'All except manually set'),
      exportValue: (r) => (r.applied_to_all ? 'All karats' : 'All except manually set'),
    },
    { key: 'note', header: 'Note', cell: (r) => r.note || '—', exportValue: (r) => r.note },
  ];
  return (
    <div className="mt-6">
      <h2 className="mb-3">Rate history</h2>
      <Table
        columns={columns}
        rows={q.data?.data || []}
        isLoading={q.isLoading}
        error={q.error}
        onRetry={q.refetch}
        page={page}
        pageSize={pageSize}
        total={q.data?.total || 0}
        onPageChange={setPage}
        exportName="gold-rate-history"
        exportTitle="Gold Rate History"
        getAllRows={async () => (await api.get('/gold-rates/history', { pageSize: 10000 })).data}
        emptyMessage="No gold prices entered yet."
      />
    </div>
  );
}

export default function Categories() {
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useCategories();
  const [dailyOpen, setDailyOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const del = useMutation({
    mutationFn: (c) => api.del(`/categories/${c.id}`),
    onSuccess: (d) => {
      toast.success(d.message);
      invalidateRates(qc);
    },
  });
  const deactivate = useMutation({
    mutationFn: (c) => api.put(`/categories/${c.id}`, { status: 'inactive' }),
    onSuccess: () => {
      toast.success('Category marked inactive.');
      invalidateRates(qc);
    },
    onError: (e) => toast.error(e.message),
  });

  const onDelete = async (c) => {
    if (c.item_count > 0) {
      const yes = await confirm({
        title: 'This category cannot be deleted',
        message: `${c.name} has ${c.item_count} item(s), so it cannot be deleted. Would you like to mark it inactive instead?`,
        confirmText: 'Yes, mark inactive',
      });
      if (yes) deactivate.mutate(c);
      return;
    }
    if (await confirm({ title: 'Delete category', message: `Are you sure you want to delete the category ${c.name}?`, confirmText: 'Yes, delete', danger: true })) {
      del.mutate(c, { onError: (e) => toast.error(e.message) });
    }
  };

  const columns = [
    { key: 'id', header: 'ID', exportValue: (c) => c.id },
    {
      key: 'name',
      header: 'Name',
      cell: (c) => (
        <span className="font-bold">
          {c.name} {c.is_manual_override && <Badge tone="gold">Manually set</Badge>}
        </span>
      ),
      exportValue: (c) => c.name,
    },
    { key: 'tola', header: 'Price per Tola', align: 'right', cell: (c) => <span className="font-semibold">{formatRate(c.price_per_tola)}</span>, exportValue: (c) => Number(c.price_per_tola).toFixed(2) },
    { key: 'gram', header: 'Price per Gram', align: 'right', cell: (c) => formatRate(c.price_per_gram), exportValue: (c) => Number(c.price_per_gram).toFixed(2) },
    { key: 'items', header: 'Items', align: 'right', cell: (c) => c.item_count, exportValue: (c) => c.item_count },
    { key: 'status', header: 'Status', cell: (c) => <StatusBadge status={c.status} />, exportValue: (c) => c.status },
    {
      key: 'actions',
      header: 'Actions',
      noExport: true,
      headerClassName: 'text-right',
      cell: (c) => (
        <RowActions>
          <Button size="sm" variant="secondary" onClick={() => setEditing(c)}>
            Edit
          </Button>
          <Button size="sm" variant="danger" onClick={() => onDelete(c)}>
            Delete
          </Button>
        </RowActions>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Gold Rates & Karats"
        subtitle="Enter the 24K price each day. Every karat's price is worked out from it automatically."
        actions={
          <>
            <Button variant="secondary" icon={Plus} onClick={() => setAddOpen(true)}>
              Add Category
            </Button>
            <Button icon={Coins} size="lg" onClick={() => setDailyOpen(true)}>
              Add Today&apos;s Gold Price
            </Button>
          </>
        }
      />
      <Card className="mb-5" bodyClassName="py-4">
        <p className="text-ink-soft">
          How prices are worked out: <strong className="text-ink">karat ÷ 24 × today&apos;s 24K price</strong> gives the price per tola. Dividing by grams
          per tola (set in Settings) gives the price per gram. Saved sales always keep the price they were sold at.
        </p>
      </Card>
      <Table
        columns={columns}
        rows={data?.data || []}
        isLoading={isLoading}
        error={error}
        onRetry={refetch}
        exportName="categories"
        exportTitle="Categories and Gold Rates"
        emptyMessage="No categories yet. Click 'Add Category' to add one."
      />
      <RateHistory />
      <DailyRateModal open={dailyOpen} onClose={() => setDailyOpen(false)} />
      <AddCategoryModal open={addOpen} onClose={() => setAddOpen(false)} />
      <EditCategoryModal category={editing} onClose={() => setEditing(null)} />
    </>
  );
}
