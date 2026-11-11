import { useId } from 'react';
import { ChevronDown } from 'lucide-react';
import { Field } from './Input.jsx';

export function Select({ label, hint, error, required, options = [], placeholder, className = '', ...rest }) {
  const id = useId();
  return (
    <Field label={label} htmlFor={id} hint={hint} error={error} required={required} className={className}>
      <div className="relative">
        <select
          id={id}
          aria-invalid={Boolean(error)}
          className={`field-input appearance-none pr-9 ${error ? 'has-error' : ''}`}
          {...rest}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
      </div>
    </Field>
  );
}
