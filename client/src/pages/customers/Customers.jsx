import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { UserPlus } from 'lucide-react';
import { api } from '@/lib/api.js';
import { formatRs } from '@/lib/format.js';
import { useListQuery } from '@/lib/hooks.js';
import { Button, PageHeader, Table, RowActions, StatusBadge, Badge, Select, useConfirm, useToast } from '@/components/ui';
import { ReceivePaymentModal } from './CustomerDetail.jsx';

export function BalanceText({ value }) {
  const n = Number(value);
  if (n > 0) return <span className="num font-bold text-danger-700">{formatRs(n)}</span>;
  if (n < 0) return <span className="num font-semibold text-success-700">{formatRs(-n)} credit</span>;
  return <span className="num text-ink-soft">{formatRs(0)}</span>;
}

export default function Customers() {
  const [status, setStatus] = useState('');
  const [paying, setPaying] = useState(null);
  const list = useListQuery('customers', '/customers', { status });
  const navigate = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();
  const qc = useQueryClient();

  const del = useMutation({
    mutationFn: (id) => api.del(`/customers/${id}`),
    onSuccess: (d) => {
      toast.success(d.message);
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (e) => toast.error(e.message),
  });

  const onDelete = async (c) => {
    if (
      await confirm({
        title: 'Delete customer',
        message: (
          <>
            Are you sure you want to delete this customer?
            <br />
            <strong>{c.name}</strong>
            <br />
            <span className="text-ink-soft">Their past invoices will be kept.</span>
          </>
        ),
        confirmText: 'Yes, delete',
        danger: true,
      })
    ) {
      del.mutate(c.id);
    }
  };

  const columns = [
    { key: 'id', header: 'ID', cell: (c) => <span className="num">{c.id}</span>, exportValue: (c) => c.id },
    {
      key: 'name',
      header: 'Name',
      cell: (c) => (
        <span className="whitespace-nowrap font-semibold">
          {c.name} {c.is_walk_in && <Badge tone="gold">Default</Badge>}
        </span>
      ),
      exportValue: (c) => c.name,
    },
    { key: 'cnic', header: 'CNIC', cell: (c) => <span className="num whitespace-nowrap">{c.cnic || '—'}</span>, exportValue: (c) => c.cnic },
    { key: 'phone', header: 'Phone', cell: (c) => <span className="num whitespace-nowrap">{c.phone || '—'}</span>, exportValue: (c) => c.phone },
    { key: 'email', header: 'Email', exportOnly: true, exportValue: (c) => c.email },
    { key: 'address', header: 'Address', exportOnly: true, exportValue: (c) => c.address },
    { key: 'balance', header: 'Balance', align: 'right', className: 'whitespace-nowrap', cell: (c) => <BalanceText value={c.balance} />, exportValue: (c) => c.balance },
    { key: 'status', header: 'Status', cell: (c) => <StatusBadge status={c.status} />, exportValue: (c) => c.status },
    {
      key: 'actions',
      header: 'Actions',
      noExport: true,
      headerClassName: 'text-right',
      cell: (c) => (
        <RowActions>
          {Number(c.balance) > 0 && (
            <Button size="sm" variant="success" onClick={() => setPaying(c)}>
              Receive Payment
            </Button>
          )}
          <Button size="sm" variant="secondary" onClick={() => navigate(`/customers/${c.id}`)}>
            View
          </Button>
          <Button size="sm" variant="secondary" onClick={() => navigate(`/customers/${c.id}/edit`)}>
            Edit
          </Button>
          {!c.is_walk_in && (
            <Button size="sm" variant="danger" onClick={() => onDelete(c)}>
              Delete
            </Button>
          )}
        </RowActions>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Customers"
        subtitle="Everyone who buys from the shop, and what they owe."
        actions={
          <Button icon={UserPlus} to="/customers/new" size="lg">
            Add Customer
          </Button>
        }
      />
      <Table
        columns={columns}
        rows={list.rows}
        isLoading={list.query.isLoading}
        error={list.query.error}
        onRetry={list.query.refetch}
        search={list.search}
        onSearchChange={list.setSearch}
        searchPlaceholder="Search by name, CNIC or phone"
        toolbar={
          <Select
            aria-label="Filter by status"
            className="w-full sm:w-48"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            options={[
              { value: '', label: 'All customers' },
              { value: 'active', label: 'Active only' },
              { value: 'inactive', label: 'Inactive only' },
            ]}
          />
        }
        page={list.page}
        pageSize={list.pageSize}
        total={list.total}
        onPageChange={list.setPage}
        exportName="customers"
        exportTitle="Customers"
        getAllRows={list.getAllRows}
        emptyMessage={
          list.search ? 'No customers match your search.' : "No customers yet. Click 'Add Customer' to add your first one."
        }
      />
      <ReceivePaymentModal open={Boolean(paying)} customer={paying} onClose={() => setPaying(null)} />
    </>
  );
}
