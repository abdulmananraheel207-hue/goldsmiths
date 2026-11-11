import { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

const styles = {
  success: { cls: 'border-l-success-600', icon: 'text-success-600', Icon: CheckCircle2 },
  error: { cls: 'border-l-danger-600', icon: 'text-danger-600', Icon: AlertTriangle },
  info: { cls: 'border-l-gold-500', icon: 'text-gold-600', Icon: Info },
};

let nextId = 1;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const show = useCallback(
    (type, message, duration) => {
      const id = nextId++;
      setToasts((t) => [...t.slice(-3), { id, type, message }]);
      // Long enough to read comfortably; errors stay longer.
      setTimeout(() => dismiss(id), duration ?? (type === 'error' ? 10000 : 6000));
    },
    [dismiss],
  );

  const api = {
    success: (m, d) => show('success', m, d),
    error: (m, d) => show('error', m, d),
    info: (m, d) => show('info', m, d),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="no-print fixed bottom-4 right-4 z-[60] flex w-[min(460px,calc(100vw-2rem))] flex-col gap-3" aria-live="polite">
        {toasts.map((t) => {
          const { cls, icon, Icon } = styles[t.type];
          return (
            <div key={t.id} role="status" className={`page-enter flex items-start gap-3 rounded-lg border border-l-4 border-line bg-white px-4 py-3 text-ink shadow-lift ${cls}`}>
              <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${icon}`} aria-hidden />
              <p className="flex-1 text-[14px] font-medium leading-snug">{t.message}</p>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="-m-1 inline-flex min-h-[30px] min-w-[30px] items-center justify-center rounded-md text-ink-faint hover:bg-paper"
                aria-label="Close message"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
