import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { db } from '../db.js';
import { getSettings } from '../services/settings.js';
import { unauthorized } from '../utils/errors.js';

export async function idleTimeoutMs() {
  const s = await getSettings();
  const hours = Math.min(Math.max(Number(s.idle_timeout_hours) || 8, 0.25), 72);
  return Math.round(hours * 3600 * 1000);
}

/** Issue (or refresh) the session cookie. Expiry = idle timeout, refreshed on every request (sliding). */
export async function setSessionCookie(res, admin) {
  const ms = await idleTimeoutMs();
  const token = jwt.sign({ sub: admin.id, tv: admin.token_version }, config.jwtSecret, {
    expiresIn: Math.round(ms / 1000),
  });
  res.cookie(config.cookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    maxAge: ms,
    path: '/',
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(config.cookieName, { httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, path: '/' });
}

/** Every /api route except login requires a valid session. */
export async function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.[config.cookieName];
    if (!token) throw unauthorized();
    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret);
    } catch {
      clearSessionCookie(res);
      throw unauthorized('Your session has ended. Please log in again.');
    }
    const admin = await db('admin').where({ id: payload.sub }).first();
    if (!admin || admin.token_version !== payload.tv) {
      clearSessionCookie(res);
      throw unauthorized('Your session has ended. Please log in again.');
    }
    req.admin = admin;
    // Sliding idle timeout: refresh at most once a minute.
    if (Date.now() / 1000 - payload.iat > 60) await setSessionCookie(res, admin);
    next();
  } catch (err) {
    next(err);
  }
}
