import { ArrowLeft } from 'lucide-react';
import { Button } from './Button.jsx';

export function PageHeader({ title, subtitle, actions, backTo, backLabel = 'Back' }) {
  return (
    <div className="no-print mb-5 space-y-2">
      {backTo && (
        <Button variant="ghost" size="sm" icon={ArrowLeft} to={backTo} className="-ml-2">
          {backLabel}
        </Button>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1>{title}</h1>
          {subtitle && <p className="mt-0.5 text-[14px] text-ink-faint">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}
