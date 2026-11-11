import { z } from 'zod';
import { badRequest } from './errors.js';

/** Parse with zod; on failure throw a 400 with plain-English field errors. */
export function parse(schema, data) {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const errors = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || '_';
    if (!errors[key]) errors[key] = issue.message;
  }
  throw badRequest('Please check the highlighted fields and try again.', errors);
}

const emptyToUndef = (v) => (v === '' || v === null ? undefined : v);

/** A decimal number given as string or number; returns a normalised string. */
export const decimalStr = (label, { min = 0, allowZero = true, max } = {}) =>
  z
    .union([z.string(), z.number()], { required_error: `${label} is required` })
    .transform((v) => String(v).replace(/,/g, '').trim())
    .refine((v) => v !== '' && /^-?\d+(\.\d+)?$/.test(v), { message: `${label} must be a number` })
    .refine((v) => Number(v) >= min && (allowZero || Number(v) !== 0), {
      message: allowZero ? `${label} cannot be negative` : `${label} must be more than zero`,
    })
    .refine((v) => max === undefined || Number(v) <= max, { message: `${label} is too large` });

export const optionalDecimal = (label, opts) =>
  z.preprocess(emptyToUndef, decimalStr(label, opts).optional()).transform((v) => v ?? '0');

export const optionalText = (max = 255) =>
  z.preprocess(
    (v) => (typeof v === 'string' ? v.trim() || null : v ?? null),
    z.string().max(max, `Please keep this under ${max} characters`).nullable(),
  );

export const idParam = z.coerce.number().int().positive();

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(10000).default(20),
  search: z.string().trim().max(100).optional().default(''),
});

export const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Please pick a valid date');

/** CNIC: 13 digits; stored formatted as 12345-1234567-1 */
export function formatCnic(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  if (d.length !== 13) return null;
  return `${d.slice(0, 5)}-${d.slice(5, 12)}-${d.slice(12)}`;
}

/** Pakistani mobile: 03XXXXXXXXX (11 digits); stored as 03XX-XXXXXXX. Accepts +92 / 92 prefixes. */
export function formatPkMobile(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('92') && d.length === 12) d = '0' + d.slice(2);
  if (!/^03\d{9}$/.test(d)) return null;
  return `${d.slice(0, 4)}-${d.slice(4)}`;
}
