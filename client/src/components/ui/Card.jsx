export function Card({ title, actions, children, className = '', bodyClassName = '' }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
          {title && <h2>{title}</h2>}
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      )}
      <div className={`p-5 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

export function Badge({ tone = 'neutral', children, className = '' }) {
  const tones = {
    neutral: 'bg-paper text-ink-soft border-line',
    gold: 'bg-gold-50 text-gold-700 border-gold-200',
    success: 'bg-success-50 text-success-700 border-success-100',
    danger: 'bg-danger-50 text-danger-700 border-danger-100',
    warn: 'bg-warn-50 text-warn-700 border-warn-100',
  };
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-px text-[12px] font-medium ${tones[tone]} ${className}`}>
      {children}
    </span>
  );
}

export function StatusBadge({ status }) {
  return status === 'active' ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>;
}
