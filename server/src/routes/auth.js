import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { db } from '../db.js';
import { config } from '../config.js';
import { asyncH, badRequest, unauthorized } from '../utils/errors.js';
import { parse } from '../utils/validate.js';
import { requireAuth, setSessionCookie, clearSessionCookie, idleTimeoutMs } from '../middleware/auth.js';
import { audit } from '../services/audit.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.loginRateLimit,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { message: 'Too many login attempts. Please wait 15 minutes and try again.' },
});

const loginSchema = z.object({
  username: z.string({ required_error: 'Please enter your username' }).trim().min(1, 'Please enter your username'),
  password: z.string({ required_error: 'Please enter your password' }).min(1, 'Please enter your password'),
});

function adminView(admin, idleMs) {
  return {
    id: admin.id,
    name: admin.name,
    username: admin.username,
    must_change_password: Boolean(admin.must_change_password),
    last_login_at: admin.last_login_at,
    idle_timeout_ms: idleMs,
  };
}

router.post(
  '/login',
  loginLimiter,
  asyncH(async (req, res) => {
    const { username, password } = parse(loginSchema, req.body);
    const admin = await db('admin').where({ username }).first();
    const ok = admin && (await bcrypt.compare(password, admin.password_hash));
    if (!ok) throw unauthorized('The username or password is not correct. Please try again.');
    const previousLogin = admin.last_login_at;
    await db('admin').where({ id: admin.id }).update({ last_login_at: db.fn.now() });
    await setSessionCookie(res, admin);
    res.json({ admin: { ...adminView(admin, await idleTimeoutMs()), last_login_at: previousLogin } });
  }),
);

router.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ message: 'You have been logged out.' });
});

router.get(
  '/me',
  requireAuth,
  asyncH(async (req, res) => {
    res.json({ admin: adminView(req.admin, await idleTimeoutMs()) });
  }),
);

const changeSchema = z
  .object({
    current_password: z.string().min(1, 'Please enter your current password'),
    new_username: z
      .string()
      .trim()
      .min(3, 'Username must be at least 3 characters')
      .max(60)
      .regex(/^[A-Za-z0-9._-]+$/, 'Use only letters, numbers, dots, dashes or underscores')
      .optional()
      .or(z.literal('').transform(() => undefined)),
    new_password: z
      .string()
      .optional()
      .or(z.literal('').transform(() => undefined))
      .refine((v) => v === undefined || v.length >= 8, 'New password must be at least 8 characters'),
    confirm_password: z.string().optional().default(''),
  })
  .refine((d) => !d.new_password || d.new_password === d.confirm_password, {
    message: 'The two new passwords do not match',
    path: ['confirm_password'],
  })
  .refine((d) => d.new_password || d.new_username, {
    message: 'Please enter a new password or a new username',
    path: ['new_password'],
  });

router.post(
  '/change-password',
  requireAuth,
  asyncH(async (req, res) => {
    const data = parse(changeSchema, req.body);
    const admin = req.admin;
    if (!(await bcrypt.compare(data.current_password, admin.password_hash))) {
      throw badRequest('Your current password is not correct.', { current_password: 'Current password is not correct' });
    }
    const update = {};
    if (data.new_username && data.new_username !== admin.username) update.username = data.new_username;
    if (data.new_password) {
      if (data.new_password === data.current_password) {
        throw badRequest('Please choose a password different from the current one.', {
          new_password: 'Must be different from the current password',
        });
      }
      update.password_hash = await bcrypt.hash(data.new_password, 12);
      update.must_change_password = false;
      update.token_version = admin.token_version + 1; // signs out any other open sessions
    }
    if (Object.keys(update).length) await db('admin').where({ id: admin.id }).update(update);
    await audit(null, 'update', 'admin', admin.id, {
      username_changed: Boolean(update.username),
      password_changed: Boolean(update.password_hash),
    });
    const fresh = await db('admin').where({ id: admin.id }).first();
    await setSessionCookie(res, fresh);
    res.json({ message: 'Your login details have been updated.', admin: adminView(fresh, await idleTimeoutMs()) });
  }),
);

export default router;
