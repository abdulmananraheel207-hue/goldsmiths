import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save, Wand2, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api.js';
import { formatRs } from '@/lib/format.js';
import { useCategories, useDebounced } from '@/lib/hooks.js';
import { Button, Card, Input, NumberInput, Select, PageHeader, Loading, ErrorState, useToast } from '@/components/ui';

const empty = { name: '', tag: '', category_id: '', weight_grams: '', quantity: '1', status: 'active' };

/** Two-letter prefix from the name: "Gold Chain" → "CH" (skips the word "gold"). */
function prefixFromName(name) {
  const words = name
    .toUpperCase()
    .replace(/[^A-Z ]/g, '')
    .split(/\s+/)
    .filter((w) => w && w !== 'GOLD');
  return (words[0] || 'IT').slice(0, 2).padEnd(2, 'X');
}

export default function ItemForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState({});
  const { data: cats } = useCategories();
  const existing = useQuery({ queryKey: ['items', id], queryFn: () => api.get(`/items/${id}`), enabled: editing });

  useEffect(() => {
    const i = existing.data?.item;
    if (i) {
      setForm({
        name: i.name,
        tag: i.tag,
        category_id: String(i.category_id),
        weight_grams: String(Number(i.weight_grams)),
        quantity: String(i.quantity),
        status: i.status,
      });
    }
  }, [existing.data]);

  const debouncedTag = useDebounced(form.tag.trim(), 350);
  const tagCheck = useQuery({
    queryKey: ['items', 'tag-check', debouncedTag, id],
    queryFn: () => api.get('/items/tags/check', { tag: debouncedTag, exclude_id: id }),
    enabled: debouncedTag.length >= 2,
  });
  const duplicate = tagCheck.data?.exists && tagCheck.data.existing;

  const autoTag = useMutation({
    mutationFn: () => api.get('/items/tags/next', { prefix: prefixFromName(form.name) }),
    onSuccess: (d) => {
      setForm((f) => ({ ...f, tag: d.tag }));
      setErrors((e) => ({ ...e, tag: undefined }));
    },
    onError: (e) => toast.error(e.message),
  });

  const save = useMutation({
    mutationFn: (body) => (editing ? api.put(`/items/${id}`, body) : api.post('/items', body)),
    onSuccess: (d) => {
      toast.success(d.message);
      qc.invalidateQueries({ queryKey: ['items'] });
      qc.invalidateQueries({ queryKey: ['categories'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      navigate(`/items/${d.item.id}`);
    },
    onError: (e) => {
      setErrors(e.errors || {});
      toast.error(e.message);
    },
  });

  const submit = (e) => {
    e.preventDefault();
    const errs = {};
    if (form.name.trim().length < 2) errs.name = 'Please enter the item name';
    if (!form.tag.trim()) errs.tag = 'Please enter a tag or click Auto-generate';
    else if (!/^[A-Za-z0-9_-]+$/.test(form.tag.trim())) errs.tag = 'Use only letters, numbers and dashes in the tag';
    else if (duplicate) errs.tag = 'This tag is already used. Please choose another.';
    if (!form.category_id) errs.category_id = 'Please choose a category';
    if (!(Number(form.weight_grams) > 0)) errs.weight_grams = 'Please enter the weight in grams, for example 6.720';
    if (form.quantity === '' || !Number.isInteger(Number(form.quantity))) errs.quantity = 'Please enter how many pieces you have';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    save.mutate(form);
  };

  if (editing && existing.isLoading) return <Loading />;
  if (editing && existing.error) return <ErrorState error={existing.error} onRetry={existing.refetch} />;

  const categories = (cats?.data || []).filter((c) => c.status === 'active' || String(c.id) === form.category_id);
  const selectedCat = categories.find((c) => String(c.id) === form.category_id);
  const estimate = selectedCat && Number(form.weight_grams) > 0 ? Number(form.weight_grams) * Number(selectedCat.price_per_gram) : null;
  const similar = (tagCheck.data?.similar || []).filter((s) => s.tag !== form.tag.toUpperCase());

  return (
    <>
      <PageHeader title={editing ? 'Edit Item' : 'Add Item'} backTo={editing ? `/items/${id}` : '/items'} backLabel={editing ? 'Back to item' : 'Back to items'} />
      <Card className="max-w-2xl">
        <form onSubmit={submit} noValidate className="space-y-5">
          <Input
            label="Item name"
            required
            placeholder="For example: Gold Chain (Rope design)"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            error={errors.name}
            autoFocus
          />

          <div className="space-y-2">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <Input
                className="flex-1"
                label="Tag / Code"
                required
                placeholder="For example CH0001"
                value={form.tag}
                onChange={(e) => setForm({ ...form, tag: e.target.value.toUpperCase().replace(/\s/g, '') })}
                error={errors.tag}
                list="similar-tags"
                inputClassName="num uppercase"
                hint="A unique code printed on the item's label."
              />
              <Button variant="secondary" icon={Wand2} onClick={() => autoTag.mutate()} loading={autoTag.isPending} className="sm:mb-[30px]">
                Auto-generate
              </Button>
            </div>
            <datalist id="similar-tags">
              {similar.map((s) => (
                <option key={s.id} value={s.tag}>
                  {s.name}
                </option>
              ))}
            </datalist>
            {duplicate && (
              <p className="flex items-start gap-2 rounded-xl bg-danger-50 px-4 py-2 font-semibold text-danger-700" role="alert">
                <AlertTriangle className="mt-1 h-5 w-5 shrink-0" />
                {duplicate.deleted
                  ? 'This tag was used by an item that has been deleted. Please choose another tag.'
                  : `This tag is already used by "${duplicate.name}". Please choose another tag.`}
              </p>
            )}
            {!duplicate && similar.length > 0 && (
              <p className="text-[13px] text-ink-soft">
                Similar tags already used: {similar.slice(0, 6).map((s) => s.tag).join(', ')}
              </p>
            )}
          </div>

          <Select
            label="Category (karat)"
            required
            placeholder="Choose a category"
            value={form.category_id}
            onChange={(e) => setForm({ ...form, category_id: e.target.value })}
            options={categories.map((c) => ({ value: String(c.id), label: c.name }))}
            error={errors.category_id}
          />
          <NumberInput
            label="Weight in grams"
            required
            decimals={3}
            placeholder="For example 6.720"
            value={form.weight_grams}
            onChange={(v) => setForm({ ...form, weight_grams: v })}
            error={errors.weight_grams}
            hint="Weight of one piece. Up to 3 decimal places."
          />
          <NumberInput
            label="Quantity (pieces)"
            required
            decimals={0}
            placeholder="1"
            value={form.quantity}
            onChange={(v) => setForm({ ...form, quantity: v })}
            error={errors.quantity}
          />
          <Select
            label="Status"
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value })}
            options={[
              { value: 'active', label: 'Active (can be sold)' },
              { value: 'inactive', label: 'Inactive (hidden from Add Sale)' },
            ]}
          />
          {estimate !== null && (
            <p className="rounded-xl bg-gold-50 px-4 py-2">
              Estimated value of one piece <strong>at today&apos;s rate</strong>: <strong className="num">{formatRs(estimate, { decimals: 0 })}</strong>
            </p>
          )}
          <div className="flex flex-wrap gap-3 pt-2">
            <Button type="submit" icon={Save} size="lg" loading={save.isPending}>
              {editing ? 'Save changes' : 'Save item'}
            </Button>
            <Button variant="secondary" size="lg" onClick={() => navigate(-1)}>
              Cancel
            </Button>
          </div>
        </form>
      </Card>
    </>
  );
}
