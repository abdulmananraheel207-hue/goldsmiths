// Creates the MySQL database named in .env if it does not exist yet.
import mysql from 'mysql2/promise';
import { connectionConfig, databaseName } from '../knexfile.js';

const name = databaseName();
try {
  const conn = await mysql.createConnection(connectionConfig({ withDatabase: false }));
  await conn.query(
    `CREATE DATABASE IF NOT EXISTS \`${name.replace(/`/g, '')}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
  await conn.end();
  console.log(`Database "${name}" is ready.`);
} catch (err) {
  console.error(`Could not create database "${name}": ${err.message}`);
  console.error('Check DB_HOST, DB_PORT, DB_USER and DB_PASSWORD in server/.env');
  process.exit(1);
}
