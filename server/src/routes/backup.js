import { Router } from 'express';
import { asyncH } from '../utils/errors.js';
import { dumpDatabase } from '../services/backup.js';
import { audit } from '../services/audit.js';
import { APP_NAME } from '../config.js';

const router = Router();

router.get(
  '/',
  asyncH(async (req, res) => {
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    const filename = `${APP_NAME.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-backup-${stamp}.sql`;
    await audit(null, 'backup', 'database', null, { filename });
    res.setHeader('Content-Type', 'application/sql; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await dumpDatabase((chunk) => res.write(chunk));
    res.end();
  }),
);

export default router;
