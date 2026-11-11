import { Loader2, AlertTriangle, Inbox } from 'lucide-react';
import { Button } from './Button.jsx';

export function Loading({ label = 'Loading, please wait…' }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-[14px] text-ink-faint" role="status">
      <Loader2 className="h-5 w-5 animate-spin text-gold-500" aria-hidden />
      <span>{label}</span>
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-10 text-center text-[14px]" role="alert">
      <AlertTriangle className="h-8 w-8 text-danger-600" aria-hidden />
      <div>
        <p className="font-semibold">Sorry, this could not be loaded.</p>
        <p className="text-ink-soft">{error?.message || 'Please try again.'}</p>
      </div>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function Empty({ message, action }) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
      <Inbox className="h-8 w-8 text-gold-300" aria-hidden strokeWidth={1.5} />
      <p className="max-w-md text-[14px] text-ink-faint">{message}</p>
      {action}
    </div>
  );
}
