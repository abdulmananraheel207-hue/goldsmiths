import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ShoppingCart } from 'lucide-react';
import { api } from '@/lib/api.js';
import { formatRs, formatDate, TAX_STATUS_LABELS } from '@/lib/format.js';
import { useListQuery } from '@/lib/hooks.js';
import { Button, PageHeader, Table, RowActions, Badge, Input, Modal, Textarea, Select, useToast } from '@/components/ui';

export function TaxStatusBadge({ status }) {
  const tone = { uploaded: 'success', failed: 'danger', pending: 'warn', not_configured: 'neutral' }[status] || 'neutral';
  return <Badge tone={tone}>{TAX_STATUS_LABELS[status] || status}</Badge>;
}

export function VoidSaleModal({ sale, onClose, onDone }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const mut = useMutation({
    mutationFn: () => api.post(`/sales/${sale.id}/void`, { reason }),
    onSuccess: (d) => {
      toast.success(d.message);
      ['sales', 'items', 'customers', 'dashboard', 'reports'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      setReason('');
      onDone?.();
      onClose();
    },
    onError: (e) => setError(e.errors?.reason || e.message),
  });
  const submit = () => {
    if (reason.trim().length < 3) return setError('Please write why this sale is being cancelled');
    mut.mutate();
  };
  return (
    <Modal
      open={Boolean(sale)}
      onClose={onClose}
      title="Cancel this sale?"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            No, keep the sale
          </Button>
          <Button variant="dangerSolid" onClick={submit} loading={mut.isPending}>
            Yes, cancel the sale
          </Button>
        </>
      }
    >
      {sale && (
        <div className="space-y-4">
          <p>
            Are you sure you want to cancel invoice <strong>{sale.invoice_number}</strong> for {formatRs(sale.total_amount)}?
          </p>
          <ul className="list-disc space-y-1 pl-6 text-ink-soft">
            <li>The items go back into stock.</li>
            <li>Any amount the customer owes for this sale is removed.</li>
            <li>The invoice number will not be used again.</li>
          </ul>
          <Textarea
            label="Reason for cancelling"
            required
            placeholder="For example: customer returned the item"
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setError('');
            }}
            error={error}
          />
        </div>
      )}
    </Modal>
  );
}

export const paidAmount = (s) => Math.min(Number(s.cash_received), Number(s.total_amount)) + Number(s.paid_later || 0);

export default function SalesHistory() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [status, setStatus] = useState('');
  const list = useListQuery('sales', '/sales', { from, to, status });
  const navigate = useNavigate();
  const [voiding, setVoiding] = useState(null);

  const columns = [
    { key: 'inv', header: 'Invoice No.', cell: (s) => <span className="num font-bold">{s.invoice_number}</span>, exportValue: (s) => s.invoice_number },
    { key: 'date', header: 'Date', cell: (s) => <span className="whitespace-nowrap">{formatDate(s.sale_date)}</span>, exportValue: (s) => s.sale_date },
    { key: 'customer', header: 'Customer', cell: (s) => s.customer_name, exportValue: (s) => s.customer_name },
    { key: 'total', header: 'Total', align: 'right', cell: (s) => <span className="font-semibold">{formatRs(s.total_amount)}</span>, exportValue: (s) => s.total_amount },
    { key: 'paid', header: 'Paid', align: 'right', cell: (s) => formatRs(paidAmount(s)), exportValue: (s) => paidAmount(s).toFixed(2) },
    {
      key: 'balance',
      header: 'Balance',
      align: 'right',
      cell: (s) => {
        if (s.status === 'void') return <span className="text-ink-faint">—</span>;
        const owed = Math.max(Number(s.balance) - Number(s.paid_later || 0), 0);
        return owed > 0 ? <span className="font-bold text-danger-700">{formatRs(owed)}</span> : <span className="text-ink-soft">{formatRs(0)}</span>;
      },
      exportValue: (s) => (s.status === 'void' ? '' : Math.max(Number(s.balance) - Number(s.paid_later || 0), 0).toFixed(2)),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (s) => (s.status === 'void' ? <Badge tone="danger">Cancelled</Badge> : <TaxStatusBadge status={s.tax_status} />),
      exportValue: (s) => (s.status === 'void' ? 'Cancelled' : TAX_STATUS_LABELS[s.tax_status]),
    },
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
          <Button size="sm" variant="secondary" onClick={() => navigate(`/sales/${s.id}?print=1`)}>
            Print
          </Button>
          {s.status === 'active' && (
            <Button size="sm" variant="danger" onClick={() => setVoiding(s)}>
              Cancel sale
            </Button>
          )}
        </RowActions>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Sales History"
        subtitle="Every sale made, newest first."
        actions={
          <Button icon={ShoppingCart} to="/sales/new" size="lg">
            Add Sale
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
        searchPlaceholder="Invoice, customer, CNIC, phone"
        rowClassName={(s) => (s.status === 'void' ? 'opacity-60' : '')}
        toolbar={
          <>
            <Input label="From date" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="w-full sm:w-48" />
            <Input label="To date" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="w-full sm:w-48" />
            <Select
              label="Show"
              className="w-full sm:w-44"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              options={[
                { value: '', label: 'All sales' },
                { value: 'active', label: 'Active only' },
                { value: 'void', label: 'Cancelled only' },
              ]}
            />
            {(from || to || status) && (
              <Button
                variant="ghost"
                onClick={() => {
                  setFrom('');
                  setTo('');
                  setStatus('');
                }}
              >
                Clear filters
              </Button>
            )}
          </>
        }
        page={list.page}
        pageSize={list.pageSize}
        total={list.total}
        onPageChange={list.setPage}
        exportName="sales-history"
        exportTitle="Sales History"
        getAllRows={list.getAllRows}
        emptyMessage={list.search || from || to ? 'No sales match your search.' : "No sales yet. Click 'Add Sale' to make your first sale."}
      />
      <VoidSaleModal sale={voiding} onClose={() => setVoiding(null)} />
    </>
  );
}
