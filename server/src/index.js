import { createApp } from './app.js';
import { config, APP_NAME } from './config.js';
import { db } from './db.js';
import { processDueEntries } from './services/taxQueue.js';

const app = createApp();

try {
  await db.raw('SELECT 1');
} catch (err) {
  console.error(`Cannot connect to MySQL: ${err.message}`);
  console.error('Check the DB_* values in server/.env and that MySQL is running.');
  process.exit(1);
}

const server = app.listen(config.port, () => {
  console.log(`${APP_NAME} server running on http://localhost:${config.port}`);
});

// Background retry of tax uploads (stub for now; real IRIS upload plugs into taxUploader.js).
const timer = setInterval(() => {
  processDueEntries().catch((err) => console.error('Tax queue worker:', err.message));
}, 60_000);

function shutdown() {
  clearInterval(timer);
  server.close(() => db.destroy().then(() => process.exit(0)));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
