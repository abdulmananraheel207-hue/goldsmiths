// Prepares a clean TEST database (DB_NAME_TEST) before the test run.
import knexLib from 'knex';
import mysql from 'mysql2/promise';

export default async function setup() {
  process.env.NODE_ENV = 'test';
  const { default: cfg, connectionConfig, databaseName } = await import('../knexfile.js');
  const name = databaseName();
  if (!/test/i.test(name)) throw new Error(`Refusing to run tests against "${name}" (name must contain "test").`);

  const conn = await mysql.createConnection(connectionConfig({ withDatabase: false }));
  await conn.query(`DROP DATABASE IF EXISTS \`${name}\``);
  await conn.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await conn.end();

  const knex = knexLib(cfg);
  await knex.migrate.latest();
  await knex.destroy();
}
