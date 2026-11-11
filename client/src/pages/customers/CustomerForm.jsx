import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { api } from '@/lib/api.js';
import { formatCnicInput, formatPhoneInput, isValidCnic, isValidPkMobile, isValidEmail } from '@/lib/format.js';
import { Button, Card, Input, NumberInput, Select, Textarea, PageHeader, Loading, ErrorState, useToast } from '@/components/ui';

export const emptyCustomer = { name: '', cnic: '', phone: '', email: '', address: '', opening_balance: '', status: 'active' };

export function validateCustomer(f) {
  const e = {};
  if (f.name.trim().length < 2) e.name = 'Please enter the customer name';
  if (f.cnic && !isValidCnic(f.cnic)) e.cnic = 'CNIC must have 13 digits, for example 35202-1234567-1';
  if (f.phone && !isValidPkMobile(f.phone)) e.phone = 'Mobile number must look like 0300-1234567';
  if (f.email && !isValidEmail(f.email)) e.email = 'Please enter a valid email address, for example name@example.com';
  return e;
}

/** The fields, reused by the "+ New customer" quick form on Add Sale. */
export function CustomerFields({ form, setForm, errors, isWalkIn, compact, showOpeningBalance = false }) {
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target ? e.target.value : e }));
  return (
    <div className="space-y-5">
      <Input label="Full name" required placeholder="For example: Muhammad Asif" value={form.name} onChange={set('name')} error={errors.name} autoFocus />
      {!isWalkIn && (
        <>
          <Input
            label="CNIC number"
            placeholder="35202-1234567-1"
            inputMode="numeric"
            value={form.cnic}
            onChange={(e) => setForm((f) => ({ ...f, cnic: formatCnicInput(e.target.value) }))}
            error={errors.cnic}
            hint="13 digits. The dashes are added for you."
            inputClassName="num"
          />
          <Input
            label="Mobile number"
            placeholder="0300-1234567"
            inputMode="tel"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: formatPhoneInput(e.target.value) }))}
            error={errors.phone}
            inputClassName="num"
          />
        </>
      )}
      {!compact && (
        <>
          <Input label="Email (optional)" type="email" placeholder="name@example.com" value={form.email} onChange={set('email')} error={errors.email} />
          <Textarea label="Address (optional)" placeholder="House, street, area, city" value={form.address} onChange={set('address')} error={errors.address} />
          {!isWalkIn && (
            <>
              {showOpeningBalance && (
              <NumberInput
                label="Opening balance (Rs)"
                placeholder="0"
                value={form.opening_balance}
                onChange={(v) => setForm((f) => ({ ...f, opening_balance: v }))}
                error={errors.opening_balance}
                hint="Money this customer already owed before using this system. Leave empty if none."
              />
              )}
              <Select
                label="Status"
                value={form.status}
                onChange={set('status')}
                options={[
                  { value: 'active', label: 'Active' },
                  { value: 'inactive', label: 'Inactive (hidden from Add Sale)' },
                ]}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}

export default function CustomerForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState(emptyCustomer);
  const [errors, setErrors] = useState({});

  const existing = useQuery({ queryKey: ['customers', id], queryFn: () => api.get(`/customers/${id}`), enabled: editing });

  useEffect(() => {
    const c = existing.data?.customer;
    if (c) {
      setForm({
        name: c.name || '',
        cnic: c.cnic || '',
        phone: c.phone || '',
        email: c.email || '',
        address: c.address || '',
        opening_balance: Number(c.opening_balance) ? String(Number(c.opening_balance)) : '',
        status: c.status,
      });
    }
  }, [existing.data]);

  const save = useMutation({
    mutationFn: (body) => (editing ? api.put(`/customers/${id}`, body) : api.post('/customers', body)),
    onSuccess: (d) => {
      toast.success(d.message);
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      navigate(`/customers/${d.customer.id}`);
    },
    onError: (e) => {
      setErrors(e.errors || {});
      toast.error(e.message);
    },
  });

  const submit = (e) => {
    e.preventDefault();
    const errs = validateCustomer(form);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    save.mutate(form);
  };

  if (editing && existing.isLoading) return <Loading />;
  if (editing && existing.error) return <ErrorState error={existing.error} onRetry={existing.refetch} />;
  const isWalkIn = existing.data?.customer?.is_walk_in;

  return (
    <>
      <PageHeader
        title={editing ? 'Edit Customer' : 'Add Customer'}
        backTo={editing ? `/customers/${id}` : '/customers'}
        backLabel={editing ? 'Back to customer' : 'Back to customers'}
      />
      <Card className="max-w-2xl">
        <form onSubmit={submit} noValidate className="space-y-5">
          <CustomerFields form={form} setForm={setForm} errors={errors} isWalkIn={isWalkIn} showOpeningBalance={editing} />
          <div className="flex flex-wrap gap-3 pt-2">
            <Button type="submit" icon={Save} size="lg" loading={save.isPending}>
              {editing ? 'Save changes' : 'Save customer'}
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
