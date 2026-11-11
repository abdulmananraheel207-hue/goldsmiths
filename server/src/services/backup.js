/**
 * Plain SQL export of the whole database, written in Node so it works even when
 * the `mysqldump` tool is not installed. Restorable with:  mysql -u USER -p DBNAME < file.sql
 */
import { db } from '../db.js';
import { databaseName } from '../../knexfile.js';
import { APP_NAME } from '../config.js';

function sqlValue(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number' || typeof v === 'bigint') return String(v);
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (Buffer.isBuffer(v)) return `0x${v.toString('hex')}`;
  if (typeof v === 'object') v = JSON.stringify(v);
  return `'${String(v)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\0/g, '\\0')}'`;
}

/** Writes the dump through `write(chunk)` so large databases stream instead of buffering. */
export async function dumpDatabase(write) {
  const [tables] = await db.raw('SHOW FULL TABLES WHERE Table_type = "BASE TABLE"');
  const names = tables.map((t) => Object.values(t)[0]);

  write(`-- ${APP_NAME} database backup\n`);
  write(`-- Database: ${databaseName()}\n-- Created: ${new Date().toISOString()}\n\n`);
  write('SET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS = 0;\n\n');

  for (const name of names) {
    const [[create]] = await db.raw('SHOW CREATE TABLE ??', [name]);
    write(`DROP TABLE IF EXISTS \`${name}\`;\n${create['Create Table']};\n\n`);

    const pageSize = 500;
    for (let offset = 0; ; offset += pageSize) {
      const rows = await db(name).select('*').limit(pageSize).offset(offset);
      if (!rows.length) break;
      const cols = Object.keys(rows[0]).map((c) => `\`${c}\``).join(', ');
      const values = rows.map((r) => `(${Object.values(r).map(sqlValue).join(', ')})`).join(',\n');
      write(`INSERT INTO \`${name}\` (${cols}) VALUES\n${values};\n`);
      if (rows.length < pageSize) break;
    }
    write('\n');
  }
  write('SET FOREIGN_KEY_CHECKS = 1;\n');
}
