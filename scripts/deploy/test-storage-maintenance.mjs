import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

function simulate(args = [], overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), 'eosnet-storage-fixture-'));
  try {
    const bin = join(root, 'bin'), scripts = join(root, 'scripts/deploy'), calls = join(root, 'calls');
    mkdirSync(bin); mkdirSync(scripts, { recursive: true });
    for (const name of ['maintain-production-storage.sh', 'prune-production-images.sh']) {
      writeFileSync(join(scripts, name), readFileSync(new URL(name, import.meta.url), 'utf8').replace(/\r\n/g, '\n'));
    }
    writeFileSync(join(root, 'docker-compose.override.yml'), 'services: {}\n');
    const stub = (name, body) => writeFileSync(join(bin, name), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
    stub('git', 'printf "%s\\n" "$FIXTURE_ROOT"');
    stub('flock', 'exit "${FIXTURE_BUSY:-0}"');
    stub('df', 'printf "Filesystem 1024-blocks Used Available Capacity Mounted\\nfixture 40000000 20000000 %s 50%% /\\n" "$FIXTURE_FREE"');
    stub('docker', `printf '%s\\n' "$*" >> "$FIXTURE_CALLS"
case "$*" in
  *' ps -q firewall-web') [ "$FIXTURE_MISSING" = 1 ] || printf container-web ;;
  *' ps -q firewall-api') printf container-api ;;
  'inspect --format '*container-web) [ "$FIXTURE_BAD_ID" = 1 ] && printf invalid || printf 'sha256:${'1'.repeat(64)}' ;;
  'inspect --format '*container-api) printf 'sha256:${'2'.repeat(64)}' ;;
  'image prune --all --force --filter label=io.github.alirezaaliverdy-glitch.track-firewall-log.cleanup-scope=production-app') : ;;
  'buildx prune --force --filter shared=false --max-used-space 512mb --min-free-space 8gb') : ;;
  *) echo 'Unexpected fixture Docker command' >&2; exit 98 ;;
esac`);
    const result = spawnSync('sh', [join(scripts, 'maintain-production-storage.sh'), ...args], {
      encoding: 'utf8', timeout: 5000,
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, FIXTURE_ROOT: root, FIXTURE_CALLS: calls, FIXTURE_FREE: '9000000', FIXTURE_MISSING: '0', FIXTURE_BAD_ID: '0', ...overrides },
    });
    return { ...result, calls: existsSync(calls) ? readFileSync(calls, 'utf8') : '' };
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test('storage check is non-destructive by default', () => {
  const result = simulate(); assert.equal(result.status, 0); assert.equal(result.calls, '');
  assert.match(result.stdout, /storage_available_kib=9000000/);
});
test('apply preserves current images and scopes both image and private-cache cleanup', () => {
  const result = simulate(['--apply']); assert.equal(result.status, 0, result.stderr);
  assert.match(result.calls, /image prune --all --force --filter label=io.github.alirezaaliverdy-glitch.track-firewall-log.cleanup-scope=production-app/);
  assert.match(result.calls, /buildx prune --force --filter shared=false --max-used-space 512mb --min-free-space 8gb/);
  assert.doesNotMatch(result.calls, /image rm|system prune|volume|container prune/);
});
test('maintenance skips active deployments and cannot prune without live app images', () => {
  const busy = simulate(['--apply'], { FIXTURE_BUSY: '1' }); assert.equal(busy.status, 0); assert.equal(busy.calls, '');
  for (const flag of ['FIXTURE_MISSING', 'FIXTURE_BAD_ID']) {
    const result = simulate(['--apply'], { [flag]: '1' }); assert.equal(result.status, 2);
    assert.doesNotMatch(result.calls, /prune/);
  }
});
test('critical disk shortage is reported, never solved by deleting user data', () => {
  const result = simulate(['--apply'], { FIXTURE_FREE: '1000' }); assert.equal(result.status, 1);
  assert.match(result.stderr, /STORAGE_LOW/); assert.doesNotMatch(result.calls, /volume|system prune|rm /);
  assert.equal(simulate(['--unknown']).status, 2);
});
test('every service in every maintained Compose manifest has bounded logs', () => {
  for (const name of ['docker-compose.yml', 'docker-compose.production.yml', 'docker-compose.firewall.yml', 'docker-compose.staging.yml', 'docker-compose.development.yml']) {
    const source = readFileSync(new URL(`../../${name}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
    assert.match(source, /max-size: "10m"/); assert.match(source, /max-file: "3"/);
    const services = source.split(/^services:\n/m)[1]?.split(/^\S/m)[0]; assert.ok(services, name);
    const blocks = [...services.matchAll(/^  ([\w-]+):\n([\s\S]*?)(?=^  [\w-]+:|$(?![\s\S]))/gm)];
    assert.ok(blocks.length > 0, name);
    for (const [, service, block] of blocks) assert.match(block, /^    logging: \*bounded-logs$/m, `${name}/${service}`);
  }
});
test('hourly timer uses unprivileged explicit apply and cannot run arbitrary deletion', () => {
  const service = readFileSync(new URL('systemd/firewall-storage-maintenance.service', import.meta.url), 'utf8');
  const timer = readFileSync(new URL('systemd/firewall-storage-maintenance.timer', import.meta.url), 'utf8');
  assert.match(service, /User=alireza/); assert.match(service, /maintain-production-storage.sh --apply/);
  assert.match(service, /NoNewPrivileges=true/); assert.match(timer, /OnCalendar=hourly/);
  const script = readFileSync(new URL('maintain-production-storage.sh', import.meta.url), 'utf8');
  assert.match(script, /flock -n 9/); assert.doesNotMatch(script, /sudo|snap remove|rm -|volume prune|system prune/);
});
