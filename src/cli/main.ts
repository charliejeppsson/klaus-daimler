import { existsSync } from 'node:fs';
import path from 'node:path';

import { formatRunSlug } from '../controller/run-dir.js';
import { AGENTS_WINDOW, TMUX_SESSION } from '../shell/tmux.js';
import {
  runImplementerWorkflow,
  type ImplementerWorkflowOutcome,
} from '../workflows/implement/workflow.js';
import {
  runReviewerWorkflow,
  type ReviewerWorkflowOutcome,
} from '../workflows/review/workflow.js';
import { parseArgs, type ParsedArgs } from './args.js';
import { printImplementerSummary, printReviewSummary } from './summaries.js';
import { bootstrapInTmuxAndAttach, shouldBootstrapInTmux } from './tmux-bootstrap.js';

export { parseArgs } from './args.js';
export { forwardedTmuxEnvFlags, shouldBootstrapInTmux } from './tmux-bootstrap.js';
export type { ImplementerWorkflowOutcome, ReviewerWorkflowOutcome, ParsedArgs };

export async function main(): Promise<void> {
  const repoRoot = assertRepoRoot(process.cwd());
  const args = parseArgs(process.argv.slice(2));

  if (shouldBootstrapInTmux(args, process.env)) {
    bootstrapInTmuxAndAttach(repoRoot, args);
    return;
  }

  const runDir = path.join(repoRoot, '.klaus', 'runs', formatRunSlug(new Date()));

  if (args.command === 'review') {
    const result = await runReviewerWorkflow({
      milestone: args.milestone,
      repoRoot,
      runDir,
      skipPlanConfirmation: args.skipPlanConfirmation,
      parallel: args.parallel,
      session: TMUX_SESSION,
      agentsWindow: AGENTS_WINDOW,
    });
    printReviewSummary(result);
    process.exit(result.errors.length === 0 ? 0 : 1);
  }

  const result = await runImplementerWorkflow({
    milestone: args.milestone,
    repoRoot,
    runDir,
    skipPlanConfirmation: args.skipPlanConfirmation,
    parallel: args.parallel,
    session: TMUX_SESSION,
    agentsWindow: AGENTS_WINDOW,
  });
  printImplementerSummary(result);
  process.exit(result.errors.length === 0 ? 0 : 1);
}

function assertRepoRoot(cwd: string): string {
  if (!existsSync(path.join(cwd, '.git'))) {
    throw new Error(`klaus must be run from a git repo root (cwd=${cwd}).`);
  }
  return cwd;
}
