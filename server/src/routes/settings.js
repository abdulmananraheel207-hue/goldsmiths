import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { z } from 'zod';
import { config } from '../config.js';
import { asyncH, badRequest } from '../utils/errors.js';
import { parse, optionalText, decimalStr } from '../utils/validate.js';
import { getSettings, saveSettings, publicSettings, encryptToken } from '../services/settings.js';
import { testConnection } from '../services/taxQueue.js';
import { audit } from '../services/audit.js';

const router = Router();

router.get(
  '/',
  asyncH(async (req, res) => {
    res.json(publicSettings(await getSettings()));
  }),
);

const settingsSchema = z
  .object({
    shop_name: z.string().trim().min(1, 'Please enter the shop name').max(150),
    shop_address: optionalText(255),
    shop_phone: optionalText(40),
    shop_email: z.preprocess(
      (v) => (v === '' ? null : v),
      z.string().trim().email('Please enter a valid email address').nullable(),
    ),
    ntn: optionalText(40),
    stn: optionalText(40),
    grams_per_tola: decimalStr('Grams per tola', { allowZero: false, max: 100 }),
    tax_percent: decimalStr('Tax percent', { max: 100 }),
    pos_service_fee: decimalStr('POS service fee', { max: 100000 }),
    card_fee_percent: decimalStr('Card fee percent', { max: 100 }),
    invoice_prefix: z
      .string()
      .trim()
      .max(12, 'Keep the invoice prefix short (12 characters or fewer)')
      .regex(/^[A-Za-z0-9/_-]*$/, 'Use only letters, numbers, dashes or slashes'),
    invoice_footer_note: optionalText(500),
    idle_timeout_hours: decimalStr('Idle timeout', { allowZero: false, max: 72 }).refine(
      (v) => Number(v) >= 0.25,
      'Idle timeout must be at least 0.25 hours (15 minutes)',
    ),
  })
  .partial();

router.put(
  '/',
  asyncH(async (req, res) => {
    const data = parse(settingsSchema, req.body);
    const before = await getSettings();
    await saveSettings(data);
    const changed = Object.keys(data).filter((k) => String(before[k] ?? '') !== String(data[k] ?? ''));
    await audit(null, 'update', 'settings', null, { changed });
    res.json({ message: 'Settings saved.', settings: publicSettings(await getSettings()) });
  }),
);

const taxSchema = z.object({
  authority: z.enum(['FBR', 'PRA']).default('FBR'),
  pos_id: z
    .string()
    .trim()
    .max(20)
    .refine((v) => v === '' || /^\d+$/.test(v), 'POS ID must contain numbers only')
    .default(''),
  pntn: z.string().trim().max(20).default(''),
  default_pct_code: z
    .string()
    .trim()
    .max(20)
    .refine((v) => v === '' || /^[\d.]+$/.test(v), 'PCT code must contain numbers (and dots) only')
    .default(''),
  endpoint_url: z
    .string()
    .trim()
    .max(255)
    .refine((v) => v === '' || /^https:\/\/\S+$/i.test(v), 'Please enter a full web address starting with https://')
    .default(''),
  token: z.string().max(4000).optional(), // undefined = keep existing; '' = clear
  environment: z.enum(['sandbox', 'production']).default('sandbox'),
  auto_upload: z.boolean().default(false),
});

router.put(
  '/tax-integration',
  asyncH(async (req, res) => {
    const data = parse(taxSchema, req.body);
    const current = (await getSettings()).tax_integration;
    const { token, ...rest } = data;
    const next = { ...current, ...rest, authority_label: rest.authority };
    if (token !== undefined) next.token_encrypted = token === '' ? null : encryptToken(token);
    await saveSettings({ tax_integration: next });
    await audit(null, 'update', 'settings', null, {
      changed: ['tax_integration'],
      token_changed: token !== undefined,
    });
    res.json({ message: 'Tax integration settings saved.', settings: publicSettings(await getSettings()) });
  }),
);

router.post(
  '/tax-integration/test',
  asyncH(async (req, res) => {
    res.json(await testConnection());
  }),
);

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      fs.mkdirSync(config.uploadsDir, { recursive: true });
      cb(null, config.uploadsDir);
    },
    filename: (req, file, cb) =>
      cb(null, `logo-${crypto.randomBytes(6).toString('hex')}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ['.png', '.jpg', '.jpeg', '.webp'].includes(path.extname(file.originalname).toLowerCase());
    cb(ok ? null : badRequest('Please choose a PNG, JPG or WEBP image.'), ok);
  },
});

router.post(
  '/logo',
  upload.single('logo'),
  asyncH(async (req, res) => {
    if (!req.file) throw badRequest('Please choose an image file.');
    const before = await getSettings();
    const logoPath = `/uploads/${req.file.filename}`;
    await saveSettings({ logo_path: logoPath });
    if (before.logo_path?.startsWith('/uploads/logo-')) {
      fs.unlink(path.join(config.uploadsDir, path.basename(before.logo_path)), () => {});
    }
    await audit(null, 'update', 'settings', null, { changed: ['logo_path'] });
    res.json({ message: 'Logo uploaded.', logo_path: logoPath });
  }),
);

router.delete(
  '/logo',
  asyncH(async (req, res) => {
    await saveSettings({ logo_path: '' });
    await audit(null, 'update', 'settings', null, { changed: ['logo_path'], removed: true });
    res.json({ message: 'Logo removed.' });
  }),
);

export default router;
