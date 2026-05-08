#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { main } from './cli/main.js';

export { parseArgs } from './cli/args.js';
export { forwardedTmuxEnvFlags, shouldBootstrapInTmux } from './cli/tmux-bootstrap.js';

function isDirectRun(): boolean {
  // Node ESM realpath-resolves import.meta.url for the main module but leaves
  // process.argv[1] as the unresolved path the user invoked. Realpath the entry
  // so this returns true when klaus is invoked through a symlink, e.g. pnpm's
  // node_modules/klaus-daimler -> .pnpm/... layout.
  const entrypoint = process.argv[1];
  if (entrypoint === undefined) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(entrypoint)).href;
  } catch {
    return false;
  }
}

if (isDirectRun()) {
  main().catch((err: unknown) => {
    process.stderr.write(`klaus: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}
