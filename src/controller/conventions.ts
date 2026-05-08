import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { loadConfig } from '../config.js';

export async function readConventions(repoRoot: string): Promise<string> {
  const { conventionsPath } = loadConfig();
  if (conventionsPath === null) return '';
  const resolved = path.isAbsolute(conventionsPath)
    ? conventionsPath
    : path.join(repoRoot, conventionsPath);
  return readFile(resolved, 'utf8');
}
