/**
 * Tiny CLI for poking the RunPod adapter without going through Claude.
 *
 *   pnpm --filter @sagan/runner runpod list [--account=personal|team]
 *   pnpm --filter @sagan/runner runpod get <podId> [--account=personal]
 *   pnpm --filter @sagan/runner runpod terminate <podId> [--account=personal]
 */
import '../src/env.js';
import {
  getPod,
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
    default:
      console.error(
        'usage:\n' +
          '  runpod list [--account=personal|team]\n' +
          '  runpod get <podId> [--account=...]\n' +
          '  runpod terminate <podId> [--account=...]',
      );
      process.exit(2);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
