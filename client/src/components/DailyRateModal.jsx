import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ratePerTola, gramPriceFromTola } from '@shared/goldRates.js';
import { api } from '@/lib/api.js';
import { formatRate, formatRs } from '@/lib/format.js';
import { useCategories, useCurrentRate } from '@/lib/hooks.js';
import { Modal, Button, NumberInput, Badge, useToast } from '@/components/ui';

/**
 * "Add Today's Gold Price": asks only for the 24K price per tola,
 * shows a live preview of every karat, then saves in one transaction.
 */
export function DailyRateModal({ open, onClose }) {
  const toast = useToast();
  const qc = useQueryClient();
  const { data: rateData } = useCurrentRate();
  const { data: catData } = useCategories();
  const [price, setPrice] = useState('');
  const [keepManual, setKeepManual] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setPrice('');
      setKeepManual(false);
      setError('');
    }
  }, [open]);

  const gpt = rateData?.grams_per_tola || '11.6638';
  const categories = useMemo(() => catData?.data || [], [catData]);
  const manual = categories.filter((c) => c.is_manual_override);
  const valid = Number(price) > 0;

  const preview = useMemo(() => {
    if (!valid) return [];
    return categories.map((c) => {
      const keep = keepManual && c.is_manual_override;
      const tola = keep ? c.price_per_tola : ratePerTola(c.karat, price).toString();
      return {
        ...c,
        keep,
        newTola: tola,
        newGram: keep ? c.price_per_gram : gramPriceFromTola(tola, gpt).toString(),
      };
    });
  }, [categories, price, keepManual, gpt, valid]);

  const save = useMutation({
    mutationFn: () => api.post('/categories/apply-daily-rate', { price_24k_per_tola: price, keep_manual: keepManual }),
    onSuccess: (d) => {
      toast.success(d.message);
      qc.invalidateQueries({ queryKey: ['gold-rate'] });
      qc.invalidateQueries({ queryKey: ['categories'] });
      qc.invalidateQueries({ queryKey: ['gold-rate-history'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['items'] });
      onClose();
    },
    onError: (e) => setError(e.errors?.price_24k_per_tola || e.message),
  });

  const submit = (e) => {
    e?.preventDefault();
    if (!valid) {
      setError('Please enter the 24K price per tola, for example 448000');
      return;
    }
    save.mutate();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add Today's Gold Price"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={save.isPending} disabled={!valid}>
            Save price for all karats
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-5">
        <NumberInput
          label="24K price per tola (Rs)"
          placeholder="Enter today's 24K price, for example 448000"
          value={price}
          onChange={(v) => {
            setPrice(v);
            setError('');
          }}
          error={error}
          hint={
            rateData?.current
              ? `Current price: ${formatRs(rateData.current.price_24k_per_tola)} per tola. All other karats are worked out from this.`
              : 'All other karats are worked out from this price.'
          }
          required
          autoFocus
          inputClassName="text-[18px] font-bold"
        />

        {manual.length > 0 && (
          <fieldset className="rounded-xl border border-gold-200 bg-gold-50 p-4">
            <legend className="px-2 font-bold">Some karats were set by hand</legend>
            <p className="mb-3 text-ink-soft">
              {manual.map((m) => m.name).join(', ')} {manual.length === 1 ? 'was' : 'were'} manually set. What would you like to
              do?
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="flex min-h-[38px] flex-1 cursor-pointer items-center gap-3 rounded-lg border border-line bg-white px-4 has-[:checked]:border-gold-500">
                <input type="radio" className="h-5 w-5 accent-gold-500" checked={!keepManual} onChange={() => setKeepManual(false)} />
                Update all karats
              </label>
              <label className="flex min-h-[38px] flex-1 cursor-pointer items-center gap-3 rounded-lg border border-line bg-white px-4 has-[:checked]:border-gold-500">
                <input type="radio" className="h-5 w-5 accent-gold-500" checked={keepManual} onChange={() => setKeepManual(true)} />
                Keep manually set karats unchanged
              </label>
            </div>
          </fieldset>
        )}

        <div>
          <h3 className="mb-2">Preview</h3>
          {!valid ? (
            <p className="rounded-xl bg-paper px-4 py-5 text-center text-ink-soft">
              Type the 24K price above to see the new price of every karat here.
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-line">
              <table className="w-full text-table">
                <thead className="bg-paper text-[11px] uppercase tracking-[0.08em] text-ink-faint">
                  <tr>
                    <th className="px-4 py-2 text-left">Karat</th>
                    <th className="px-4 py-2 text-right">Now (per tola)</th>
                    <th className="px-4 py-2 text-right">New per tola</th>
                    <th className="px-4 py-2 text-right">New per gram</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((c, i) => (
                    <tr key={c.id} className={i % 2 ? 'bg-paper' : 'bg-white'}>
                      <td className="px-4 py-2 font-semibold">
                        {c.name} {c.keep && <Badge tone="gold">Kept</Badge>}
                      </td>
                      <td className="num px-4 py-2 text-right text-ink-soft">{formatRate(c.price_per_tola)}</td>
                      <td className="num px-4 py-2 text-right font-bold">{formatRate(c.newTola)}</td>
                      <td className="num px-4 py-2 text-right">{formatRate(c.newGram)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </form>
    </Modal>
  );
}
