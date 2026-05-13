/**
 * Tiny CLI for poking the RunPod adapter without going through Claude.
 *
 *   pnpm --filter @sagan/runner runpod list [--account=personal|team]
 *   pnpm --filter @sagan/runner runpod get <podId> [--account=personal]
 *   pnpm --filter @sagan/runner runpod terminate <podId> [--account=personal]
 *   pnpm --filter @sagan/runner runpod volumes [--account=...]
 *   pnpm --filter @sagan/runner runpod create-volume --name=<n> --size=<gb> --dc=<dataCenterId> [--account=...]
 */
import '../src/env.js';
import {
  createNetworkVolume,
  getPod,
  listNetworkVolumes,
  listPods,
  terminatePod,
  type RunpodAccount,
} from '../src/tools/runpod.js';

function getAccount(args: string[]): RunpodAccount {
  const flag = args.find((a) => a.startsWith('--account='));
  const value = flag?.split('=')[1];
  return value === 'team' ? 'team' : 'personal';
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const account = getAccount(rest);

  switch (cmd) {
    case 'list': {
      const pods = await listPods(account);
      if (pods.length === 0) {
        console.log(`(no pods in ${account} scope)`);
        return;
      }
      console.log(`pods in ${account} scope:`);
      for (const p of pods) {
        console.log(
          `  ${p.podId}  ${p.desiredStatus.padEnd(8)} ${p.gpuTypeId ?? '-'} x${p.gpuCount ?? 0}  ${p.name}`,
        );
      }
      return;
    }
    case 'get': {
      const id = rest.find((a) => !a.startsWith('--'));
      if (!id) throw new Error('usage: runpod get <podId> [--account=personal]');
      const info = await getPod(id, account);
      console.log(JSON.stringify(info, null, 2));
      return;
    }
    case 'terminate': {
      const id = rest.find((a) => !a.startsWith('--'));
      if (!id) throw new Error('usage: runpod terminate <podId> [--account=personal]');
      const ok = await terminatePod(id, account);
      console.log(ok ? `terminated ${id}` : `terminate returned non-truthy for ${id}`);
      return;
    }
    case 'volumes': {
      const vols = await listNetworkVolumes(account);
      if (vols.length === 0) {
        console.log(`(no network volumes in ${account} scope)`);
        return;
      }
      console.log(`network volumes in ${account} scope:`);
      for (const v of vols) {
        console.log(`  ${v.id}  ${v.size}GB  ${v.dataCenterId}  ${v.name}`);
      }
      return;
    }
    case 'create-volume': {
      const name = rest.find((a) => a.startsWith('--name='))?.split('=').slice(1).join('=');
      const sizeRaw = rest.find((a) => a.startsWith('--size='))?.split('=')[1];
      const dc = rest.find((a) => a.startsWith('--dc='))?.split('=').slice(1).join('=');
      if (!name || !sizeRaw || !dc) {
        throw new Error('usage: runpod create-volume --name=<n> --size=<gb> --dc=<dataCenterId> [--account=...]');
      }
      const size = Number.parseInt(sizeRaw, 10);
      if (!Number.isFinite(size) || size < 1) {
        throw new Error(`--size must be a positive integer GB; got ${sizeRaw}`);
      }
      const created = await createNetworkVolume({ name, size, dataCenterId: dc }, account);
      console.log(JSON.stringify(created, null, 2));
      return;
    }
    default:
      console.error(
        'usage:\n' +
          '  runpod list [--account=personal|team]\n' +
          '  runpod get <podId> [--account=...]\n' +
          '  runpod terminate <podId> [--account=...]\n' +
          '  runpod volumes [--account=...]\n' +
          '  runpod create-volume --name=<n> --size=<gb> --dc=<dataCenterId> [--account=...]',
      );
      process.exit(2);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
