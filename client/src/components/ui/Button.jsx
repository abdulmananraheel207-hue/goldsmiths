import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

const variants = {
  primary: 'bg-onyx-800 text-white border-onyx-800 hover:bg-onyx-600 hover:border-onyx-600 shadow-sm',
  gold: 'bg-gold-500 text-white border-gold-500 hover:bg-gold-600 hover:border-gold-600 shadow-sm',
  secondary: 'bg-white text-ink border-line hover:border-gold-300 hover:bg-gold-50',
  danger: 'bg-white text-danger-700 border-line hover:bg-danger-50 hover:border-danger-100',
  dangerSolid: 'bg-danger-600 text-white border-danger-600 hover:bg-danger-700',
  success: 'bg-success-600 text-white border-success-600 hover:bg-success-700',
  ghost: 'bg-transparent text-ink-soft border-transparent hover:bg-gold-50 hover:text-ink',
};

const sizes = {
  md: 'min-h-[40px] px-4 text-[14px] gap-2',
  sm: 'min-h-[34px] px-3 text-[13px] gap-1.5',
  lg: 'min-h-[44px] px-5 text-[15px] gap-2',
};

export function Button({
  variant = 'primary',
  size = 'md',
  icon: Icon,
  loading = false,
  children,
  className = '',
  to,
  type = 'button',
  disabled,
  ...rest
}) {
  const cls = `inline-flex items-center justify-center rounded-lg border font-medium transition-colors duration-150
    disabled:cursor-not-allowed disabled:opacity-60 select-none whitespace-nowrap ${variants[variant]} ${sizes[size]} ${className}`;
  const content = (
    <>
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      ) : (
        Icon && <Icon className="h-4 w-4 shrink-0" aria-hidden />
      )}
      {children}
    </>
  );
  if (to) {
    return (
      <Link to={to} className={cls} {...rest}>
        {content}
      </Link>
    );
  }
  return (
    <button type={type} className={cls} disabled={disabled || loading} {...rest}>
      {content}
    </button>
  );
}
