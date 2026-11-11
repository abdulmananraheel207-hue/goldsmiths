import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PackagePlus } from 'lucide-react';
import { api } from '@/lib/api.js';
import { formatRs, formatNumber } from '@/lib/format.js';
import { useCategories, useListQuery } from '@/lib/hooks.js';
import { Button, PageHeader, Table, RowActions, StatusBadge, Badge, Select, useConfirm, useToast } from '@/components/ui';

export function StockBadge({ quantity }) {
  if (Number(quantity) === 0) return <Badge tone="danger">Out of stock</Badge>;
  if (Number(quantity) === 1) return <Badge tone="warn">Last one</Badge>;
  return null;
}

export default function Items() {
  const [categoryId, setCategoryId] = useState('');
  const [stock, setStock] = useState('');
  const list = useListQuery('items', '/items', { category_id: categoryId, stock });
  const { data: cats } = useCategories();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();
  const qc = useQueryClient();

  const del = useMutation({
    mutationFn: (id) => api.del(`/items/${id}`),
    onSuccess: (d) => {
      toast.success(d.message);
      qc.invalidateQueries({ queryKey: ['items'] });
      qc.invalidateQueries({ queryKey: ['categories'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (e) => toast.error(e.message),
  });

  const onDelete = async (it) => {
    if (
      await confirm({
        title: 'Delete item',
        message: (
          <>
            Are you sure you want to delete this item?
            <br />
            <strong>
              {it.tag} — {it.name}
            </strong>
          </>
        ),
        confirmText: 'Yes, delete',
        danger: true,
      })
    ) {
      del.mutate(it.id);
    }
  };

  const columns = [
    { key: 'id', header: 'ID', exportValue: (i) => i.id },
    { key: 'name', header: 'Name', cell: (i) => <span className="font-semibold">{i.name}</span>, exportValue: (i) => i.name },
    { key: 'tag', header: 'Tag / Code', cell: (i) => <span className="num font-semibold">{i.tag}</span>, exportValue: (i) => i.tag },
    { key: 'category', header: 'Category', cell: (i) => i.category_name, exportValue: (i) => i.category_name },
    { key: 'weight', header: 'Weight (g)', align: 'right', cell: (i) => Number(i.weight_grams).toFixed(3), exportValue: (i) => Number(i.weight_grams).toFixed(3) },
    {
      key: 'qty',
      header: 'Quantity',
      align: 'right',
      cell: (i) => (
        <span className="inline-flex items-center gap-2">
          <StockBadge quantity={i.quantity} /> {formatNumber(i.quantity)}
        </span>
      ),
      exportValue: (i) => i.quantity,
    },
    { key: 'status', header: 'Status', cell: (i) => <StatusBadge status={i.status} />, exportValue: (i) => i.status },
    {
      key: 'value',
      header: 'Value at today’s rate',
      align: 'right',
      cell: (i) => <span className="text-ink-soft">{formatRs(i.estimated_value, { decimals: 0 })}</span>,
      exportValue: (i) => i.estimated_value,
    },
    {
      key: 'actions',
      header: 'Actions',
      noExport: true,
      headerClassName: 'text-right',
      cell: (i) => (
        <RowActions>
          <Button size="sm" variant="secondary" onClick={() => navigate(`/items/${i.id}`)}>
            View
          </Button>
          <Button size="sm" variant="secondary" onClick={() => navigate(`/items/${i.id}/edit`)}>
            Edit
          </Button>
          <Button size="sm" variant="danger" onClick={() => onDelete(i)}>
            Delete
          </Button>
        </RowActions>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Items"
        subtitle="Your stock of jewellery and gold."
        actions={
          <Button icon={PackagePlus} to="/items/new" size="lg">
            Add Item
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
        searchPlaceholder="Search by name or tag"
        toolbar={
          <>
            <Select
              aria-label="Filter by category"
              className="w-full sm:w-52"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              options={[{ value: '', label: 'All categories' }, ...(cats?.data || []).map((c) => ({ value: c.id, label: c.name }))]}
            />
            <Select
              aria-label="Filter by stock"
              className="w-full sm:w-52"
              value={stock}
              onChange={(e) => setStock(e.target.value)}
              options={[
                { value: '', label: 'All stock levels' },
                { value: 'in', label: 'In stock' },
                { value: 'low', label: 'Low (1 or none)' },
                { value: 'out', label: 'Out of stock' },
              ]}
            />
          </>
        }
        page={list.page}
        pageSize={list.pageSize}
        total={list.total}
        onPageChange={list.setPage}
        exportName="items"
        exportTitle="Items"
        getAllRows={list.getAllRows}
        emptyMessage={list.search || categoryId || stock ? 'No items match your search.' : "No items yet. Click 'Add Item' to add your first one."}
      />
    </>
  );
}
