import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

// Run on a Docker-enabled CI runner. Use only a disposable, synthetic context.
test('production cache selector matches real BuildKit private records, not an empty boolean comparison', () => {
  const root = mkdtempSync(join(tmpdir(), 'eosnet-buildkit-filter-'));
  const marker = `eosnet-filter-${randomUUID()}`, tag = `eosnet-storage-filter-fixture:${marker}`;
  const docker = args => spawnSync('docker', args, { encoding: 'utf8', timeout: 120000 });
  try {
    writeFileSync(join(root, 'Dockerfile'), `FROM node:22-alpine AS probe\nRUN printf '${marker}' > /filter-marker\nFROM scratch\nCOPY --from=probe /filter-marker /filter-marker\n`);
    assert.equal(docker(['buildx', 'build', '--load', '--tag', tag, root]).status, 0, 'Synthetic cache fixture build failed');
    const script = readFileSync(new URL('prune-production-images.sh', import.meta.url), 'utf8');
    const selector = script.match(/docker buildx prune[^\n]*--filter '([^']+)'/)?.[1];
    assert.ok(selector, 'Private cache selector must be explicit');
    const inventory = filter => {
      const result = docker(['buildx', 'du', ...(filter ? ['--filter', filter] : []), '--format', 'json']);
      assert.equal(result.status, 0, 'BuildKit cache inventory/filter failed');
      return result.stdout.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
    };
    const expected = inventory().filter(record => record.Shared === false).map(record => record.ID).sort();
    assert.ok(expected.length > 0, 'Fixture must create private records; do not accept vacuous equality');
    const selected = inventory(selector);
    assert.ok(selected.every(record => record.Shared === false));
    assert.deepEqual(selected.map(record => record.ID).sort(), expected, 'Selector silently omitted private cache records');
  } finally {
    docker(['image', 'rm', tag]); // Exact disposable tag; never force or prune globally.
    rmSync(root, { recursive: true, force: true });
  }
});
