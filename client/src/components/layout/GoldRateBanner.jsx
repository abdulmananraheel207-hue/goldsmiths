import { useState } from 'react';
import { AlertTriangle, Pencil } from 'lucide-react';
import { useCurrentRate } from '@/lib/hooks.js';
import { formatRs, formatDateTime } from '@/lib/format.js';
import { Button } from '@/components/ui';
import { DailyRateModal } from '@/components/DailyRateModal.jsx';

/** "Gold Now": current 24K price per tola, a slim bar at the top of every page. */
export function GoldRateBanner() {
  const { data, isLoading } = useCurrentRate();
  const [open, setOpen] = useState(false);
  const current = data?.current;
  const notToday = data && !data.is_set_today;

  return (
    <div className="no-print">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-white/80 px-4 py-2 backdrop-blur lg:px-8">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
          <span className="eyebrow text-gold-600">Gold Now</span>
          {isLoading ? (
            <span className="text-ink-faint">Loading…</span>
          ) : current ? (
            <>
              <span className="num text-[15px] font-semibold text-ink">
                24K {formatRs(current.price_24k_per_tola)}
                <span className="ml-1 text-[12.5px] font-normal text-ink-faint">per tola</span>
              </span>
              <span className="hidden text-ink-faint sm:inline">· Updated {formatDateTime(current.created_at)}</span>
            </>
          ) : (
            <span className="font-medium text-danger-700">No gold price entered yet</span>
          )}
          {notToday && (
            <span className="inline-flex items-center gap-1 rounded-full bg-warn-50 px-2 py-px text-[12px] font-medium text-warn-700">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> Not set today
            </span>
          )}
        </div>
        <Button size="sm" variant={notToday ? 'gold' : 'secondary'} icon={Pencil} onClick={() => setOpen(true)}>
          Update price
        </Button>
      </div>
      <DailyRateModal open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
