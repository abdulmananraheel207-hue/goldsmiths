import 'dotenv/config';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const appConfig = JSON.parse(readFileSync(path.join(dirname, '..', '..', 'app.config.json'), 'utf8'));

/** Product name lives in /app.config.json so it is easy to rename. */
export const APP_NAME = appConfig.appName;

const isProd = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

function secret(name, fallback) {
  const v = process.env[name];
  if (v && v.length >= 16) return v;
  if (isProd) throw new Error(`${name} must be set to a long random string in production`);
  return fallback;
}

export const config = {
  port: Number(process.env.PORT || 4000),
  isProd,
  isTest,
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  jwtSecret: secret('JWT_SECRET', 'dev-only-jwt-secret-change-me-please'),
  settingsKey: secret('SETTINGS_ENCRYPTION_KEY', 'dev-only-settings-key-change-me-please'),
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  cookieName: 'gl_session',
  loginRateLimit: Number(process.env.LOGIN_RATE_LIMIT || 10),
  uploadsDir: path.join(dirname, '..', 'uploads'),
  clientDist: path.join(dirname, '..', '..', 'client', 'dist'),
};
