import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import { api } from '@/lib/api.js';
import { formatRs, formatRate, formatWeight, formatDateTime } from '@/lib/format.js';
import { Button, Card, PageHeader, Loading, ErrorState, StatusBadge } from '@/components/ui';
import { StockBadge } from './Items.jsx';

export default function ItemDetail() {
  const { id } = useParams();
  const q = useQuery({ queryKey: ['items', id], queryFn: () => api.get(`/items/${id}`) });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorState error={q.error} onRetry={q.refetch} />;
  const i = q.data.item;

  return (
    <>
      <PageHeader
        title={i.name}
        subtitle={`Tag ${i.tag}`}
        backTo="/items"
        backLabel="Back to items"
        actions={
          <Button icon={Pencil} to={`/items/${i.id}/edit`} size="lg">
            Edit Item
          </Button>
        }
      />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Details">
          <dl className="space-y-3">
            {[
              ['Item ID', i.id],
              ['Tag / Code', i.tag],
              ['Category', i.category_name],
              ['Weight (one piece)', formatWeight(i.weight_grams)],
              ['Quantity in stock', i.quantity],
              ['Added on', formatDateTime(i.created_at)],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 border-b border-line pb-2">
                <dt className="text-ink-soft">{k}</dt>
                <dd className="num text-right font-semibold">{v}</dd>
              </div>
            ))}
            <div className="flex justify-between gap-4">
              <dt className="text-ink-soft">Status</dt>
              <dd className="flex gap-2">
                <StatusBadge status={i.status} />
                <StockBadge quantity={i.quantity} />
              </dd>
            </div>
          </dl>
        </Card>
        <div className="card flex flex-col gap-3 border-gold-200 bg-gold-50 p-5">
          <p className="font-semibold text-gold-800">Estimated value at today&apos;s rate</p>
          <p className="num text-[1.9rem] font-extrabold leading-none">{formatRs(i.estimated_value_each, { decimals: 0 })}</p>
          <p className="text-ink-soft">
            One piece: {formatWeight(i.weight_grams)} × {formatRate(i.category_price_per_gram)} per gram ({i.category_name})
          </p>
          {i.quantity > 1 && (
            <p className="text-[15px]">
              All {i.quantity} pieces: <strong className="num">{formatRs(i.estimated_value, { decimals: 0 })}</strong>
            </p>
          )}
          <p className="text-[12.5px] text-ink-soft">
            Gold value only, worked out live from today&apos;s gold price. Making charges and stones are not included.
          </p>
        </div>
      </div>
    </>
  );
}
