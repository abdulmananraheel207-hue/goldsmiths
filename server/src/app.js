import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { requireAuth } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/auth.js';
import settingsRoutes from './routes/settings.js';
import categoryRoutes from './routes/categories.js';
import goldRateRoutes from './routes/goldRates.js';
import customerRoutes from './routes/customers.js';
import itemRoutes from './routes/items.js';
import saleRoutes from './routes/sales.js';
import reportRoutes from './routes/reports.js';
import backupRoutes from './routes/backup.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'same-site' },
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          styleSrc: ["'self'", "'unsafe-inline'"],
          fontSrc: ["'self'", 'data:'],
          // TradingView market chart widget on the Dashboard (view only)
          scriptSrc: ["'self'", 'https://s3.tradingview.com'],
          frameSrc: ["'self'", 'https://*.tradingview.com', 'https://*.tradingview-widget.com'],
        },
      },
    }),
  );
  app.use(cors({ origin: config.clientOrigin, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  fs.mkdirSync(config.uploadsDir, { recursive: true });
  app.use('/uploads', express.static(config.uploadsDir, { maxAge: '1h' }));

  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRoutes);

  // Everything below requires login.
  app.use('/api', requireAuth);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/categories', categoryRoutes);
  app.use('/api/gold-rates', goldRateRoutes);
  app.use('/api/customers', customerRoutes);
  app.use('/api/items', itemRoutes);
  app.use('/api/sales', saleRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/backup', backupRoutes);
  app.use('/api', notFoundHandler);

  // In production, serve the built web app from the same server.
  if (fs.existsSync(config.clientDist)) {
    app.use(express.static(config.clientDist));
    app.get('*', (req, res) => res.sendFile(path.join(config.clientDist, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
