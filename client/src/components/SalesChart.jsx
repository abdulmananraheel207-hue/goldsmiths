import { useMemo, useState } from 'react';
import { formatRs, formatDate } from '@/lib/format.js';

/**
 * Single-series bar chart of sales amount (gold bars, rounded data-ends,
 * recessive grid, hover tooltip). A table view is always available.
 */
export function SalesChart({ data = [], range }) {
  const [hover, setHover] = useState(null);
  const W = 900;
  const H = 280;
  const pad = { top: 16, right: 12, bottom: 34, left: 84 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;

  const max = Math.max(...data.map((d) => Number(d.amount)), 0);
  const niceMax = useMemo(() => {
    if (max <= 0) return 1000;
    const p = 10 ** Math.floor(Math.log10(max));
    return Math.ceil(max / p) * p;
  }, [max]);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * niceMax);
  const step = innerW / Math.max(data.length, 1);
  const barW = Math.max(4, Math.min(28, step - 2));
  const label = (d) => (range === 'today' ? d.label : formatDate(d.key));
  const shortLabel = (d) => (range === 'today' ? d.label : String(Number(d.key.slice(8))));
  const labelEvery = data.length > 16 ? Math.ceil(data.length / 10) : 1;
  const compact = (v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${Math.round(v / 1e3)}K` : String(v));

  if (!data.length || max === 0) {
    return <p className="rounded-xl bg-paper px-4 py-8 text-center text-ink-soft">No sales in this period yet.</p>;
  }

  const h = hover !== null ? data[hover] : null;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Sales amount over time">
        {ticks.map((t) => {
          const y = pad.top + innerH - (t / niceMax) * innerH;
          return (
            <g key={t}>
              <line x1={pad.left} x2={W - pad.right} y1={y} y2={y} stroke="#E7E0D4" strokeWidth="1" />
              <text x={pad.left - 10} y={y + 5} textAnchor="end" fontSize="14" fill="#5A534B">
                Rs {compact(t)}
              </text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const v = Number(d.amount);
          const bh = (v / niceMax) * innerH;
          const x = pad.left + i * step + (step - barW) / 2;
          const y = pad.top + innerH - bh;
          const r = Math.min(4, barW / 2, bh);
          return (
            <g key={d.key}>
              {bh > 0 && (
                <path
                  d={`M${x},${pad.top + innerH} V${y + r} Q${x},${y} ${x + r},${y} H${x + barW - r} Q${x + barW},${y} ${x + barW},${
                    y + r
                  } V${pad.top + innerH} Z`}
                  fill={hover === i ? '#9A6F08' : '#B8860B'}
                />
              )}
              {i % labelEvery === 0 && (
                <text x={x + barW / 2} y={H - 10} textAnchor="middle" fontSize="13" fill="#5A534B">
                  {shortLabel(d)}
                </text>
              )}
              {/* Hit target larger than the mark */}
              <rect
                x={pad.left + i * step}
                y={pad.top}
                width={step}
                height={innerH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onClick={() => setHover(i)}
              />
            </g>
          );
        })}
        <line x1={pad.left} x2={W - pad.right} y1={pad.top + innerH} y2={pad.top + innerH} stroke="#8A8178" />
      </svg>
      {h && (
        <div
          className="pointer-events-none absolute top-2 rounded-xl border border-line bg-white px-4 py-2 shadow-soft"
          style={{
            left: `${((pad.left + hover * step + step / 2) / W) * 100}%`,
            transform: `translateX(${hover > data.length / 2 ? '-105%' : '5%'})`,
          }}
        >
          <div className="text-[12.5px] text-ink-soft">{label(h)}</div>
          <div className="num font-bold">{formatRs(h.amount)}</div>
          <div className="text-[12.5px] text-ink-soft">
            {h.count} {h.count === 1 ? 'sale' : 'sales'}
          </div>
        </div>
      )}
    </div>
  );
}

export function SalesChartTable({ data = [], range }) {
  return (
    <div className="max-h-80 overflow-auto rounded-xl border border-line">
      <table className="w-full text-table">
        <thead className="sticky top-0 bg-gold-50">
          <tr>
            <th className="px-4 py-2 text-left">{range === 'today' ? 'Hour' : 'Date'}</th>
            <th className="px-4 py-2 text-right">Sales</th>
            <th className="px-4 py-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d, i) => (
            <tr key={d.key} className={i % 2 ? 'bg-paper' : 'bg-white'}>
              <td className="px-4 py-2">{range === 'today' ? d.label : formatDate(d.key)}</td>
              <td className="num px-4 py-2 text-right">{d.count}</td>
              <td className="num px-4 py-2 text-right">{formatRs(d.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
