import { useEffect, useRef, useState } from 'react';
import { WifiOff } from 'lucide-react';

/**
 * Live international Gold & Silver prices (view only), using TradingView's free
 * "Symbol Overview" widget. Updates by itself; hover the chart to see past dates.
 * Needs an internet connection. Nothing here affects the shop's own prices.
 */
const WIDGET_SRC = 'https://s3.tradingview.com/external-embedding/embed-widget-symbol-overview.js';

const CONFIG = {
  symbols: [
    ['Gold (US$/oz)', 'OANDA:XAUUSD|1M'],
    ['Silver (US$/oz)', 'OANDA:XAGUSD|1M'],
    ['US$ → PKR', 'FX_IDC:USDPKR|1M'],
  ],
  chartOnly: false,
  width: '100%',
  locale: 'en',
  colorTheme: 'light',
  autosize: false,
  showVolume: false,
  showMA: false,
  hideDateRanges: false,
  hideMarketStatus: false,
  hideSymbolLogo: false,
  scalePosition: 'right',
  scaleMode: 'Normal',
  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
  fontSize: '10',
  noTimeScale: false,
  valuesTracking: '1',
  changeMode: 'price-and-percent',
  chartType: 'area',
  lineWidth: 2,
  lineType: 0,
  lineColor: '#B08B4F',
  topColor: 'rgba(176, 139, 79, 0.28)',
  bottomColor: 'rgba(176, 139, 79, 0)',
  backgroundColor: 'rgba(255, 255, 255, 1)',
  dateRanges: ['1d|1', '1m|30', '3m|60', '12m|1D', '60m|1W', 'all|1M'],
};

export function MarketChart({ height = 380 }) {
  const ref = useRef(null);
  const [failed, setFailed] = useState(!navigator.onLine);

  useEffect(() => {
    const el = ref.current;
    if (!el || failed) return undefined;
    el.innerHTML = '<div class="tradingview-widget-container__widget" style="height:100%;width:100%"></div>';
    const script = document.createElement('script');
    script.src = WIDGET_SRC;
    script.async = true;
    script.type = 'text/javascript';
    // A fixed pixel height: with "autosize" the widget's frame collapses to 150px.
    script.innerHTML = JSON.stringify({ ...CONFIG, height });
    script.onerror = () => setFailed(true);
    el.appendChild(script);
    return () => {
      el.innerHTML = '';
    };
  }, [failed, height]);

  if (failed) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg bg-paper text-center text-[14px] text-ink-faint" style={{ height }}>
        <WifiOff className="h-6 w-6" aria-hidden />
        <p>The live market chart needs an internet connection.</p>
        <button type="button" className="text-[13px] font-medium text-gold-700 underline" onClick={() => setFailed(!navigator.onLine)}>
          Try again
        </button>
      </div>
    );
  }

  return <div ref={ref} className="tradingview-widget-container w-full" style={{ height }} />;
}
