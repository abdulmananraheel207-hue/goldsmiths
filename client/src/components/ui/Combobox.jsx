import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import { Field } from './Input.jsx';

/**
 * Searchable dropdown. Typing calls `onSearch(text)`; parent supplies `options`.
 * options: [{ value, label, sublabel?, disabled?, data? }]
 */
export function Combobox({
  label,
  hint,
  error,
  required,
  value,
  displayValue,
  options = [],
  onSearch,
  onSelect,
  loading,
  placeholder = 'Type to search…',
  emptyText = 'No matches found',
  className = '',
  inputClassName = '',
  autoFocus,
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [active, setActive] = useState(0);
  const wrapRef = useRef(null);

  useEffect(() => {
    const close = (e) => !wrapRef.current?.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const pick = (o) => {
    if (!o || o.disabled) return;
    onSelect(o);
    setOpen(false);
    setText('');
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, options.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter' && open) {
      e.preventDefault();
      pick(options[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <Field label={label} htmlFor={id} hint={hint} error={error} required={required} className={className}>
      <div ref={wrapRef} className="relative">
        <input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          autoComplete="off"
          autoFocus={autoFocus}
          className={`field-input pr-9 ${error ? 'has-error' : ''} ${inputClassName}`}
          placeholder={value ? displayValue : placeholder}
          value={open ? text : value ? displayValue || '' : text}
          onFocus={() => {
            setOpen(true);
            setText('');
            onSearch?.('');
          }}
          onChange={(e) => {
            setText(e.target.value);
            setActive(0);
            setOpen(true);
            onSearch?.(e.target.value);
          }}
          onKeyDown={onKeyDown}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronDown className="h-4 w-4" />}
        </span>
        {open && (
          <ul
            id={`${id}-list`}
            role="listbox"
            className="absolute z-30 mt-1 max-h-72 w-full min-w-[260px] overflow-auto rounded-lg border border-line bg-white py-1 text-[14px] shadow-lift"
          >
            {!options.length && <li className="px-3 py-2 text-ink-faint">{loading ? 'Searching…' : emptyText}</li>}
            {options.map((o, i) => (
              <li
                key={o.value}
                role="option"
                aria-selected={o.value === value}
                aria-disabled={o.disabled}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(o);
                }}
                onMouseEnter={() => setActive(i)}
                className={`cursor-pointer px-3 py-2 ${i === active ? 'bg-gold-50' : ''} ${
                  o.disabled ? 'cursor-not-allowed opacity-60' : ''
                } ${o.value === value ? 'font-bold' : ''}`}
              >
                <div>{o.label}</div>
                {o.sublabel && <div className="text-[12.5px] text-ink-faint">{o.sublabel}</div>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Field>
  );
}
