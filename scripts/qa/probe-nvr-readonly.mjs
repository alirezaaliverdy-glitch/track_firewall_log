// Opt-in operator probe: one DVRIP authentication and StorageInfo read only.
// Supply credentials as a JSON object on stdin, never arguments, files or env.
// Prints capacity/coverage only, never credentials, raw packets or serials.
import { readFileSync } from 'node:fs';
import { readDvripStorage } from '../../backend/src/cameras/nvr-dvrip.ts';
const host = process.argv[2], port = Number(process.argv[3] ?? 34567);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid port');
try {
  const credentials = JSON.parse(readFileSync(0, 'utf8'));
  const disks = await readDvripStorage(host, port, credentials);
  console.log(JSON.stringify({ authenticated: true, diskCount: disks.length, disks: disks.map(({ capacityBytes, usedBytes, freeBytes, health, smart }) => ({ capacityBytes, usedBytes, freeBytes, health, smart })) }));
} catch (error) {
  console.log(JSON.stringify({ authenticated: false, errorCode: error?.code ?? 'PROBE_FAILED' })); process.exitCode = 1;
}
