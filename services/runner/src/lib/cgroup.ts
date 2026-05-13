/**
 * Read the current process's cgroup v2 memory accounting. Used by the queue
 * to back-pressure new agent_run claims when the runner cgroup is close to
 * its `MemoryMax` (avoids OOM-kill cascades like 2026-05-13 13:10 where a 2G
 * cap got blown by ~5 concurrent Claude Code subprocesses).
 *
 * Returns null when we can't read the cgroup (non-cgroup-v2 host, cgroup
 * without a limit, file permissions). Callers treat null as "no signal, do
 * not back-pressure on memory" — the concurrency cap still applies.
 */
import { readFile } from 'node:fs/promises';

const CGROUP_BASE = '/sys/fs/cgroup';
let cachedPath: string | null | undefined;

async function resolveCgroupPath(): Promise<string | null> {
  if (cachedPath !== undefined) return cachedPath;
  try {
    const raw = await readFile('/proc/self/cgroup', 'utf8');
    // cgroup v2 line is "0::/<relative-path>". Older v1 hosts emit many lines
    // prefixed with hierarchy IDs; we only support v2 (the systemd default on
    // recent Ubuntu).
    const line = raw.split('\n').find((l) => l.startsWith('0::'));
    const rel = line?.slice(3).trim();
    cachedPath = rel && rel !== '/' ? `${CGROUP_BASE}${rel}` : null;
  } catch {
    cachedPath = null;
  }
  return cachedPath;
}

export interface CgroupMemoryReading {
  current: number;
  max: number | null;
  fraction: number | null;
}

export async function readCgroupMemory(): Promise<CgroupMemoryReading | null> {
  const path = await resolveCgroupPath();
  if (!path) return null;
  try {
    const [curRaw, maxRaw] = await Promise.all([
      readFile(`${path}/memory.current`, 'utf8'),
      readFile(`${path}/memory.max`, 'utf8'),
    ]);
    const current = Number.parseInt(curRaw.trim(), 10);
    if (!Number.isFinite(current)) return null;
    const maxStr = maxRaw.trim();
    if (maxStr === 'max') return { current, max: null, fraction: null };
    const max = Number.parseInt(maxStr, 10);
    if (!Number.isFinite(max) || max <= 0) return { current, max: null, fraction: null };
    return { current, max, fraction: current / max };
  } catch {
    return null;
  }
}
