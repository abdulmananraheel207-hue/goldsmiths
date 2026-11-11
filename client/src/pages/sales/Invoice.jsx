import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { Printer, Receipt, Send, Ban, ShoppingCart } from 'lucide-react';
import { api } from '@/lib/api.js';
import { formatRs, formatRate, formatDateTime, PAYMENT_LABELS, APP_NAME } from '@/lib/format.js';
import { useSettings } from '@/lib/hooks.js';
import { Button, PageHeader, Loading, ErrorState, Badge, useToast } from '@/components/ui';
import { TaxNotConfiguredBanner } from '@/components/TaxNotConfiguredBanner.jsx';
import { TaxStatusBadge, VoidSaleModal } from './SalesHistory.jsx';

function printNow(mode) {
  let style;
  if (mode === 'thermal') {
    document.body.classList.add('print-thermal');
    style = document.createElement('style');
    style.textContent = '@page { size: 80mm auto; margin: 4mm; }';
    document.head.appendChild(style);
  }
  const cleanup = () => {
    document.body.classList.remove('print-thermal');
    style?.remove();
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  setTimeout(() => window.print(), 50);
}

const n = (v) => Number(v || 0);

export default function Invoice() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const toast = useToast();
  const qc = useQueryClient();
  const [voiding, setVoiding] = useState(null);
  const { data: settings } = useSettings();
  const q = useQuery({ queryKey: ['sales', id], queryFn: () => api.get(`/sales/${id}`) });
  const printed = useRef(false);

  useEffect(() => {
    if (q.data && settings && params.get('print') && !printed.current) {
      printed.current = true;
      setParams({}, { replace: true });
      setTimeout(() => printNow('a4'), 300);
    }
  }, [q.data, settings, params, setParams]);

  const resend = useMutation({
    mutationFn: () => api.post(`/sales/${id}/resend-tax`),
    onSuccess: (d) => {
      toast.info(d.message);
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['reports'] });
    },
    onError: (e) => toast.error(e.message),
  });

  if (q.isLoading || !settings) return <Loading />;
  if (q.error) return <ErrorState error={q.error} onRetry={q.refetch} />;
  const s = q.data.sale;
  const c = s.customer || {};
  const isVoid = s.status === 'void';
  const priceExGst = n(s.subtotal) - n(s.discount);
  const paidLater = (s.payments || []).reduce((t, p) => t + n(p.amount), 0);
  const balance = n(s.balance);
  const tax = settings.tax_integration || {};
  const anyOldGold = s.lines.some((l) => n(l.gold_received_value) > 0);
  // Once uploaded, the QR carries the tax authority's invoice number (scanned by the FBR/PRA verification app).
  const qrText = s.tax_invoice_number || [
    `Invoice: ${s.invoice_number}`,
    s.tax_invoice_number ? `Tax Invoice: ${s.tax_invoice_number}` : null,
    `Date: ${s.created_at}`,
    `Total: ${n(s.total_amount).toFixed(2)} PKR`,
    settings.ntn ? `NTN: ${settings.ntn}` : null,
    tax.pos_id ? `POS ID: ${tax.pos_id}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  return (
    <>
      <PageHeader
        title={`Invoice ${s.invoice_number}`}
        backTo="/sales"
        backLabel="Back to Sales History"
        actions={
          <>
            {!isVoid && s.tax_status !== 'uploaded' && (
              <Button variant="secondary" icon={Send} onClick={() => resend.mutate()} loading={resend.isPending}>
                Resend to Tax
              </Button>
            )}
            {!isVoid && (
              <Button variant="danger" icon={Ban} onClick={() => setVoiding(s)}>
                Cancel sale
              </Button>
            )}
            <Button variant="secondary" icon={ShoppingCart} to="/sales/new">
              New Sale
            </Button>
            <Button variant="secondary" icon={Receipt} onClick={() => printNow('thermal')}>
              Print Receipt (80mm)
            </Button>
            <Button icon={Printer} size="lg" onClick={() => printNow('a4')}>
              Print Invoice
            </Button>
          </>
        }
      />

      {s.tax_status === 'not_configured' && !isVoid && <TaxNotConfiguredBanner settings={settings} />}
      {isVoid && (
        <div className="no-print mb-6 rounded-xl border-2 border-danger-100 bg-danger-50 px-5 py-4 text-danger-700">
          <strong>This sale was cancelled</strong> on {formatDateTime(s.voided_at)}. Reason: {s.void_reason}
        </div>
      )}

      <article className="print-area card relative mx-auto max-w-[210mm] overflow-hidden bg-white p-8 text-[15px] leading-snug print:text-[11pt]">
        {isVoid && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="rotate-[-25deg] text-[96px] font-extrabold tracking-widest text-danger-600/15">CANCELLED</span>
          </div>
        )}

        {/* Shop header */}
        <header className="flex flex-wrap items-start justify-between gap-6 border-b-2 border-gold-500 pb-4">
          <div className="flex items-start gap-4">
            {settings.logo_path && <img src={settings.logo_path} alt="" className="a4-only h-20 w-20 object-contain" />}
            <div>
              <h1 className="text-[26px] font-extrabold">{settings.shop_name}</h1>
              {settings.shop_address && <p>{settings.shop_address}</p>}
              <p>
                {[settings.shop_phone && `Phone: ${settings.shop_phone}`, settings.shop_email].filter(Boolean).join(' · ')}
              </p>
              <p>
                {[
                  settings.ntn && `NTN: ${settings.ntn}`,
                  settings.stn && `STN: ${settings.stn}`,
                  tax.authority === 'PRA' && tax.pntn && `PNTN: ${tax.pntn}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[20px] font-extrabold uppercase tracking-wide text-gold-700">Sales Invoice</p>
            <p>
              Invoice No: <strong>{s.invoice_number}</strong>
            </p>
            <p>Date: {formatDateTime(s.created_at)}</p>
            {s.bill_no && <p>Bill No: {s.bill_no}</p>}
            <p>Payment: {PAYMENT_LABELS[s.payment_method]}</p>
            {s.tax_invoice_number && (
              <p>
                {tax.authority_label} Invoice No: <strong>{s.tax_invoice_number}</strong>
              </p>
            )}
            <p className="no-print mt-1">
              <TaxStatusBadge status={s.tax_status} />
            </p>
          </div>
        </header>

        {/* Customer + rate */}
        <section className="grid gap-4 border-b border-line py-4 sm:grid-cols-2 print:grid-cols-2">
          <div>
            <p className="text-[13px] font-bold uppercase tracking-wide text-ink-soft">Customer</p>
            <p className="text-[17px] font-bold">{c.name}</p>
            {c.cnic && <p>CNIC: {c.cnic}</p>}
            {c.phone && <p>Mobile: {c.phone}</p>}
            {c.address && <p>{c.address}</p>}
          </div>
          <div className="sm:text-right print:text-right">
            <p className="text-[13px] font-bold uppercase tracking-wide text-ink-soft">Gold rate used for this sale</p>
            <p className="text-[17px] font-bold">24K: {formatRs(s.gold_rate_24k_snapshot)} per tola</p>
            <p className="text-ink-soft">1 tola = {Number(s.grams_per_tola_snapshot)} g</p>
          </div>
        </section>

        {/* Lines */}
        <div className="overflow-x-auto py-4">
          <table className="w-full border-collapse text-[13px] print:text-[9pt]">
            <thead>
              <tr className="bg-gold-50 text-left">
                {['Tag', 'Description', 'Qty', 'Net Wt (g)', 'Waste (g)', 'Gross Wt (g)', 'Karat', 'Rate/Gm', 'Making', 'Others']
                  .concat(anyOldGold ? ['Old Gold'] : [])
                  .concat(['Net Bill'])
                  .map((h, i) => (
                    <th key={h} className={`border border-line px-2 py-1.5 ${i >= 2 && h !== 'Karat' ? 'text-right' : ''}`}>
                      {h}
                    </th>
                  ))}
              </tr>
            </thead>
            <tbody>
              {s.lines.map((l) => (
                <tr key={l.id}>
                  <td className="border border-line px-2 py-1.5 font-semibold">{l.item_tag}</td>
                  <td className="border border-line px-2 py-1.5">{l.item_name}</td>
                  <td className="num border border-line px-2 py-1.5 text-right">{l.quantity}</td>
                  <td className="num border border-line px-2 py-1.5 text-right">{n(l.weight_grams).toFixed(3)}</td>
                  <td className="num border border-line px-2 py-1.5 text-right">{n(l.wastage_grams).toFixed(3)}</td>
                  <td className="num border border-line px-2 py-1.5 text-right">{n(l.gross_weight).toFixed(3)}</td>
                  <td className="border border-line px-2 py-1.5">{l.karat}K</td>
                  <td className="num border border-line px-2 py-1.5 text-right">{n(l.rate_per_gram_snapshot).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="num border border-line px-2 py-1.5 text-right">{n(l.making_charges).toLocaleString('en-PK')}</td>
                  <td className="num border border-line px-2 py-1.5 text-right">{n(l.other_stone_charges).toLocaleString('en-PK')}</td>
                  {anyOldGold && <td className="num border border-line px-2 py-1.5 text-right">−{n(l.gold_received_value).toLocaleString('en-PK')}</td>}
                  <td className="num border border-line px-2 py-1.5 text-right font-bold">{n(l.line_total).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals + QR */}
        <section className="flex flex-wrap items-start justify-between gap-6 print:flex-nowrap">
          <div className="a4-only flex items-start gap-4">
            <div className="rounded-lg border border-line p-2">
              <QRCodeSVG value={qrText} size={112} level="M" />
            </div>
            <div className="space-y-2">
              <div className="flex h-14 w-28 items-center justify-center rounded border border-dashed border-line text-center text-[12px] text-ink-faint">
                {tax.authority_label || 'FBR'} logo
              </div>
              <p className="text-[13px]">
                POS ID: <strong>{tax.pos_id || 'Not set'}</strong>
              </p>
            </div>
          </div>
          <table className="ml-auto w-full max-w-sm text-[15px] print:text-[10pt]">
            <tbody>
              {[
                ['Sub Total', s.subtotal],
                n(s.discount) > 0 ? ['Discount', -n(s.discount)] : null,
                ['Price Excluding GST', priceExGst],
                [`GST (${n(s.tax_percent)}%)`, s.tax_amount],
                ['Price Including GST', priceExGst + n(s.tax_amount)],
                ['POS Service Charges', s.pos_service_fee],
                n(s.card_fee) > 0 ? ['Card Fee', s.card_fee] : null,
              ]
                .filter(Boolean)
                .map(([k, v]) => (
                  <tr key={k}>
                    <td className="py-1 pr-4">{k}</td>
                    <td className="num py-1 text-right">{formatRs(v, { decimals: 2 })}</td>
                  </tr>
                ))}
              <tr className="border-t-2 border-ink">
                <td className="py-2 pr-4 text-[18px] font-extrabold">GROSS TOTAL</td>
                <td className="num py-2 text-right text-[18px] font-extrabold">{formatRs(s.total_amount, { decimals: 2 })}</td>
              </tr>
              <tr>
                <td className="py-1 pr-4">Amount Received</td>
                <td className="num py-1 text-right">{formatRs(s.cash_received, { decimals: 2 })}</td>
              </tr>
              {paidLater > 0 && (
                <tr>
                  <td className="py-1 pr-4">Paid Later</td>
                  <td className="num py-1 text-right">{formatRs(paidLater, { decimals: 2 })}</td>
                </tr>
              )}
              <tr className="font-bold">
                <td className="py-1 pr-4">{balance < 0 ? 'Change Returned' : 'Balance Due'}</td>
                <td className="num py-1 text-right">{formatRs(balance < 0 ? -balance : Math.max(balance - paidLater, 0), { decimals: 2 })}</td>
              </tr>
            </tbody>
          </table>
        </section>

        {s.remarks && (
          <p className="mt-4 border-t border-line pt-3">
            <strong>Remarks:</strong> {s.remarks}
          </p>
        )}

        <footer className="mt-6 border-t border-line pt-4 text-center text-[13px] text-ink-soft">
          {settings.invoice_footer_note && <p>{settings.invoice_footer_note}</p>}
          <p className="mt-1 font-semibold text-ink">Thank you for shopping at {settings.shop_name}</p>
          <p className="mt-1 text-[11px]">Generated by {APP_NAME}</p>
        </footer>
        {isVoid && (
          <p className="mt-4 text-center font-bold text-danger-700">
            CANCELLED — {s.void_reason} <Badge tone="danger">Void</Badge>
          </p>
        )}
      </article>
      <p className="no-print mt-4 text-center text-[16px] text-ink-soft">Rate per gram on this invoice: {s.lines.map((l) => `${l.item_tag} ${formatRate(l.rate_per_gram_snapshot)}`).join(' · ')}</p>
      <VoidSaleModal sale={voiding} onClose={() => setVoiding(null)} onDone={() => q.refetch()} />
    </>
  );
}
