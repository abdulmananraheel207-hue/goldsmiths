import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export function Modal({ open, onClose, title, children, footer, size = 'md' }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    const prev = document.activeElement;
    setTimeout(() => {
      const first = ref.current?.querySelector('input, select, textarea, button:not([data-close])');
      (first || ref.current)?.focus();
    }, 30);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      prev?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  const widths = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' };

  return createPortal(
    <div className="no-print fixed inset-0 z-50 flex items-end justify-center bg-onyx-900/50 p-0 backdrop-blur-[2px] sm:items-center sm:p-6">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`page-enter flex max-h-[92vh] w-full ${widths[size]} flex-col rounded-t-xl bg-white shadow-lift sm:rounded-xl`}
      >
        <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-3">
          <h2 className="font-display text-[1.2rem]">{title}</h2>
          <button
            type="button"
            data-close
            onClick={onClose}
            className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg px-2 text-[13px] text-ink-faint hover:bg-paper hover:text-ink"
          >
            <X className="h-4 w-4" aria-hidden /> Close
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-paper/60 px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
