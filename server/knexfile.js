import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const isTest = process.env.NODE_ENV === 'test';

export function connectionConfig({ withDatabase = true } = {}) {
  const conn = {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    // Return DECIMAL columns as exact strings (never floats) and DATETIME as plain strings
    decimalNumbers: false,
    supportBigNumbers: true,
    bigNumberStrings: false,
    dateStrings: true,
    charset: 'utf8mb4',
    multipleStatements: false,
  };
  if (withDatabase) conn.database = databaseName();
  return conn;
}

export function databaseName() {
  return isTest
    ? process.env.DB_NAME_TEST || 'goldledger_test'
    : process.env.DB_NAME || 'goldledger';
}

const config = {
  client: 'mysql2',
  connection: connectionConfig(),
  pool: { min: 0, max: 10 },
  migrations: {
    directory: path.join(dirname, 'migrations'),
    tableName: 'knex_migrations',
    loadExtensions: ['.js'],
  },
  seeds: {
    directory: path.join(dirname, 'seeds'),
    loadExtensions: ['.js'],
  },
};

export default config;
