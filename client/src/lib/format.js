import appConfig from '@appconfig';

export const APP_NAME = appConfig.appName;
export const APP_TAGLINE = appConfig.tagline;

const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** "Rs 248,854" — whole rupees shown without decimals, otherwise 2 decimals. */
export function formatRs(value, { decimals } = {}) {
  const n = toNum(value);
  const neg = n < 0;
  const abs = Math.abs(n);
  const d = decimals ?? (Math.round(abs * 100) % 100 === 0 ? 0 : 2);
  const s = abs.toLocaleString('en-PK', { minimumFractionDigits: d, maximumFractionDigits: d });
  return `${neg ? '−' : ''}Rs ${s}`;
}

/** Rates always shown with 2 decimals: "Rs 35,208.65" */
export const formatRate = (v) => formatRs(v, { decimals: 2 });

export function formatNumber(value, decimals = 0) {
  return toNum(value).toLocaleString('en-PK', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export const formatWeight = (v) => `${toNum(v).toFixed(3)} g`;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Server sends "YYYY-MM-DD" or "YYYY-MM-DD HH:MM:SS" (shop's local time). */
export function formatDate(value) {
  if (!value) return '';
  const [y, m, d] = String(value).slice(0, 10).split('-');
  if (!d) return String(value);
  return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`;
}

export function formatTime(value) {
  const t = String(value || '').slice(11, 16);
  if (!t) return '';
  let [h, mi] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'pm' : 'am';
  h = ((h + 11) % 12) + 1;
  return `${h}:${String(mi).padStart(2, '0')} ${ampm}`;
}

export function formatDateTime(value) {
  if (!value) return '';
  const time = formatTime(value);
  return time ? `${formatDate(value)}, ${time}` : formatDate(value);
}

export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function shiftDate(iso, days) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const PAYMENT_LABELS = { cash: 'Cash', card: 'Card', bank_transfer: 'Bank Transfer' };

export const TAX_STATUS_LABELS = {
  not_configured: 'Not configured',
  pending: 'Waiting to send',
  uploaded: 'Uploaded',
  failed: 'Failed',
};

/* ---------- CNIC and mobile ---------- */

/** Auto-format while typing: 35202-1234567-1 */
export function formatCnicInput(raw) {
  const d = String(raw || '')
    .replace(/\D/g, '')
    .slice(0, 13);
  if (d.length <= 5) return d;
  if (d.length <= 12) return `${d.slice(0, 5)}-${d.slice(5)}`;
  return `${d.slice(0, 5)}-${d.slice(5, 12)}-${d.slice(12)}`;
}

export const isValidCnic = (v) => String(v || '').replace(/\D/g, '').length === 13;

/** Auto-format while typing: 0300-1234567 */
export function formatPhoneInput(raw) {
  const d = String(raw || '')
    .replace(/\D/g, '')
    .slice(0, 11);
  if (d.length <= 4) return d;
  return `${d.slice(0, 4)}-${d.slice(4)}`;
}

export const isValidPkMobile = (v) => /^03\d{9}$/.test(String(v || '').replace(/\D/g, ''));

export const isValidEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim());

/** Keep only characters valid in a decimal number. */
export function cleanDecimal(raw, maxDecimals = 2) {
  let s = String(raw ?? '').replace(/[^\d.]/g, '');
  const i = s.indexOf('.');
  if (i >= 0) s = s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, '').slice(0, maxDecimals);
  return s;
}
