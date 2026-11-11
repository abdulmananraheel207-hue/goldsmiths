import { Info } from 'lucide-react';
import { Link } from 'react-router-dom';

export function TaxNotConfiguredBanner({ settings }) {
  const label = settings?.tax_integration?.authority_label || 'FBR';
  return (
    <div className="no-print mb-5 flex items-start gap-3 rounded-xl border border-gold-200 bg-gold-50 px-5 py-4">
      <Info className="mt-0.5 h-5 w-5 shrink-0 text-gold-700" aria-hidden />
      <p>
        <strong>{label} invoice upload is not set up yet.</strong> Sales are saved normally and marked &quot;Not configured&quot;. They can be
        sent later once the connection is set up in{' '}
        <Link to="/settings?tab=tax" className="font-semibold text-gold-700 underline">
          Settings &gt; Tax Integration
        </Link>
        .
      </p>
    </div>
  );
}
