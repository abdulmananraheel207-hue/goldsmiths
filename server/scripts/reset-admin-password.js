/**
 * Reset the admin password from the terminal (for when the password is forgotten).
 *
 *   npm run reset-admin-password                  (asks for the new password)
 *   npm run reset-admin-password -- "NewPass@123"  (non-interactive)
 *   npm run reset-admin-password -- "NewPass@123" --username admin
 */
import readline from 'node:readline';
import bcrypt from 'bcryptjs';
import { db } from '../src/db.js';

function ask(question, hidden = false) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  if (hidden) {
    rl._writeToOutput = (s) => rl.output.write(s.includes(question) ? s : s.replace(/[^\r\n]/g, '*'));
  }
  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(answer);
    }),
  );
}

const args = process.argv.slice(2);
const uIdx = args.indexOf('--username');
const newUsername = uIdx >= 0 ? args[uIdx + 1] : null;
let password = args.filter((a, i) => !a.startsWith('--') && !(uIdx >= 0 && i === uIdx + 1))[0];

try {
  const admin = await db('admin').orderBy('id').first();
  if (!admin) {
    console.error('No admin account found. Run "npm run seed" first.');
    process.exit(1);
  }
  if (!password) {
    password = await ask('New password (at least 8 characters): ', true);
    const confirm = await ask('Type it again: ', true);
    if (password !== confirm) {
      console.error('The two passwords do not match. Nothing was changed.');
      process.exit(1);
    }
  }
  if (!password || password.length < 8) {
    console.error('The password must be at least 8 characters. Nothing was changed.');
    process.exit(1);
  }
  const update = {
    password_hash: await bcrypt.hash(password, 12),
    must_change_password: false,
    token_version: admin.token_version + 1,
  };
  if (newUsername) update.username = newUsername.trim();
  await db('admin').where({ id: admin.id }).update(update);
  await db('audit_log').insert({
    action: 'reset_password',
    entity: 'admin',
    entity_id: admin.id,
    details: JSON.stringify({ via: 'cli', username_changed: Boolean(newUsername) }),
  });
  console.log(`Password updated for "${update.username || admin.username}". All open sessions were signed out.`);
} catch (err) {
  console.error(`Could not reset the password: ${err.message}`);
  process.exitCode = 1;
} finally {
  await db.destroy();
}
