import { useId } from 'react';
import { AlertCircle } from 'lucide-react';
import { cleanDecimal } from '@/lib/format.js';

export function Field({ label, htmlFor, hint, error, required, children, className = '' }) {
  return (
    <div className={`space-y-1 ${className}`}>
      {label && (
        <label htmlFor={htmlFor} className="block text-[13px] font-medium text-ink-soft">
          {label}
          {required && <span className="text-danger-600"> *</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="flex items-start gap-1 text-[12.5px] text-danger-700" role="alert">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : (
        hint && <p className="text-[12.5px] text-ink-faint">{hint}</p>
      )}
    </div>
  );
}

export function Input({ label, hint, error, required, className = '', inputClassName = '', prefix, ...rest }) {
  const id = useId();
  return (
    <Field label={label} htmlFor={id} hint={hint} error={error} required={required} className={className}>
      <div className="relative">
        {prefix && (
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[13px] text-ink-faint">{prefix}</span>
        )}
        <input
          id={id}
          aria-invalid={Boolean(error)}
          className={`field-input ${error ? 'has-error' : ''} ${prefix ? 'pl-9' : ''} ${inputClassName}`}
          {...rest}
        />
      </div>
    </Field>
  );
}

/** Text input that only accepts decimal numbers (no spinners). */
export function NumberInput({ value, onChange, decimals = 2, ...rest }) {
  return (
    <Input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={value ?? ''}
      onChange={(e) => onChange(cleanDecimal(e.target.value, decimals))}
      inputClassName="num"
      {...rest}
    />
  );
}

export function Textarea({ label, hint, error, required, className = '', ...rest }) {
  const id = useId();
  return (
    <Field label={label} htmlFor={id} hint={hint} error={error} required={required} className={className}>
      <textarea
        id={id}
        rows={2}
        aria-invalid={Boolean(error)}
        className={`field-input py-2 ${error ? 'has-error' : ''}`}
        {...rest}
      />
    </Field>
  );
}
