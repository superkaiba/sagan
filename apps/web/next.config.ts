import type { NextConfig } from 'next';

const config: NextConfig = {
  // Workspace packages live above this dir; let Next bundle them with us.
  transpilePackages: ['@eps/agent-protocol', '@eps/api', '@eps/auth', '@eps/db', '@eps/ui'],
  // Allow `import { hash } from '@node-rs/argon2'` in route handlers /
  // Server Components without bundling the .node binding.
  serverExternalPackages: ['@node-rs/argon2', 'postgres'],
};

export default config;
