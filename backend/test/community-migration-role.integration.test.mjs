import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

test('collaboration migration needs no AppUser ownership or superuser', async () => {
  const { assertSafeTestDatabaseEnvironment } = await import('../dist/testing/test-database-safety.js');
  assertSafeTestDatabaseEnvironment();
  const admin = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL }); await admin.connect();
  const tag = randomBytes(6).toString('hex'), schema = `qa_community_${tag}`, role = `qa_community_app_${tag}`;
  try {
    await admin.query(`CREATE ROLE "${role}" NOLOGIN NOSUPERUSER`);
    await admin.query(`CREATE SCHEMA "${schema}" AUTHORIZATION "${role}"`);
    await admin.query(`CREATE TABLE "${schema}"."AppUser" ("id" TEXT PRIMARY KEY)`);
    await admin.query(`GRANT REFERENCES ("id") ON "${schema}"."AppUser" TO "${role}"`);
    await admin.query(`CREATE TABLE "${schema}"."Company" ("id" TEXT PRIMARY KEY)`);
    await admin.query(`GRANT REFERENCES ("id") ON "${schema}"."Company" TO "${role}"`);
    await admin.query(`SET ROLE "${role}"`); await admin.query(`SET search_path TO "${schema}"`);
    const base = await readFile(new URL('../prisma/migrations/20261017120000_community/migration.sql', import.meta.url), 'utf8');
    const extension = await readFile(new URL('../prisma/migrations/20261018120000_community_collaboration/migration.sql', import.meta.url), 'utf8');
    await admin.query(base); await admin.query(extension);
    await admin.query(await readFile(new URL('../prisma/migrations/20261018150000_community_storage_retention/migration.sql', import.meta.url), 'utf8'));
    await admin.query('CREATE TABLE "CameraDevice" ("id" TEXT PRIMARY KEY, "ownerId" TEXT NOT NULL, "host" TEXT NOT NULL, "onvifPort" INTEGER NOT NULL)');
    await admin.query('CREATE UNIQUE INDEX "CameraDevice_ownerId_host_onvifPort_key" ON "CameraDevice"("ownerId","host","onvifPort")');
    await admin.query(await readFile(new URL('../prisma/migrations/20261018160000_camera_company_monitoring/migration.sql', import.meta.url), 'utf8'));
    assert.equal((await admin.query(`SELECT count(*) AS count FROM information_schema.columns WHERE table_schema=$1 AND table_name='CameraDevice' AND column_name IN ('companyId','monitoringEnabled')`, [schema])).rows[0].count, '2');
    const result = await admin.query(`SELECT tableowner FROM pg_tables WHERE schemaname = $1 AND tablename = 'AppUser'`, [schema]);
    assert.notEqual(result.rows[0].tableowner, role);
    assert.equal((await admin.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_name IN ('CommunityTask','CommunityAttachment')`, [schema])).rows.length, 2);
    assert.equal((await admin.query('SELECT current_user AS name')).rows[0].name, role);
  } finally {
    await admin.query('RESET ROLE'); await admin.query('SET search_path TO public');
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await admin.query(`DROP ROLE IF EXISTS "${role}"`); await admin.end();
  }
});
