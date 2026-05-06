#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  runImplementerWorkflow,
  type ImplementerWorkflowOutcome,
} from './implement.js';
import {
  runReviewerWorkflow,
  type ReviewerWorkflowOutcome,
} from './review.js';
import { AGENTS_WINDOW, TMUX_SESSION } from './tmux.js';

type KlausCommand = 'implement' | 'review';

type MilestoneWorkflowArgs = Readonly<{
  command: KlausCommand;
  milestone: string;
  skipPlanConfirmation: boolean;
  parallel: number;
}>;

type ParsedArgs = MilestoneWorkflowArgs;

const USAGE = `Usage:
  klaus implement --milestone <name> [--parallel N] [--skip-plan-confirmation]
  klaus review --milestone <name> [--parallel N] [--skip-plan-confirmation]

  --parallel N:                 dispatch up to N agents concurrently (default 1).
                                Implementer and reviewer workflows boot a tmux
                                session '${TMUX_SESSION}' and auto-attach, even when N = 1.
  --skip-plan-confirmation:     skip the interactive "Set sail, Captain? [y/N]"
                                confirmation shown after the plan is printed.
`;

async function main(): Promise<void> {
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

export function parseArgs(argv: readonly string[]): ParsedArgs {
  const [command, ...rest] = argv;
  if (command === 'implement') return parseMilestoneWorkflowArgs('klaus implement', command, rest);
  if (command === 'review') return parseMilestoneWorkflowArgs('klaus review', command, rest);
  process.stderr.write(USAGE);
  process.exit(2);
}

export function shouldBootstrapInTmux(args: ParsedArgs, env: NodeJS.ProcessEnv): boolean {
  if (env.KLAUS_INSIDE_TMUX === '1') return false;
  void args;
  return true;
}

function parseMilestoneWorkflowArgs(
  commandName: string,
  command: KlausCommand,
  rest: readonly string[],
): MilestoneWorkflowArgs {
  let milestone: string | undefined;
  let skipPlanConfirmation = false;
  let parallel = 1;
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (arg === '--milestone') {
      const value = rest[i + 1];
      if (value === undefined || value.startsWith('--')) {
        process.stderr.write(`${commandName}: --milestone requires a value\n${USAGE}`);
        process.exit(2);
      }
      milestone = value;
      i += 1;
      continue;
    }
    if (arg === '--parallel') {
      const value = rest[i + 1];
      if (value === undefined || value.startsWith('--')) {
        process.stderr.write(`${commandName}: --parallel requires a positive integer\n${USAGE}`);
        process.exit(2);
      }
      const parsed = Number.parseInt(value, 10);
      if (!Number.isInteger(parsed) || parsed < 1 || String(parsed) !== value) {
        process.stderr.write(
          `${commandName}: --parallel must be a positive integer (got '${value}')\n`,
        );
        process.exit(2);
      }
      parallel = parsed;
      i += 1;
      continue;
    }
    if (arg === '--skip-plan-confirmation') {
      skipPlanConfirmation = true;
      continue;
    }
    process.stderr.write(`${commandName}: unknown arg '${arg ?? ''}'\n${USAGE}`);
    process.exit(2);
  }
  if (milestone === undefined) {
    process.stderr.write(`${commandName}: --milestone <name> is required\n${USAGE}`);
    process.exit(2);
  }
  return { command, milestone, skipPlanConfirmation, parallel };
}

function printImplementerSummary(result: ImplementerWorkflowOutcome): void {
  const ran = result.ranIssues.length;
  const opened = result.ranIssues.filter((r) => r.outcome === 'pr-opened').length;
  const abandoned = result.ranIssues.filter((r) => r.outcome === 'abandoned').length;
  process.stdout.write(
    `\nKlaus reporting, Captain: ${String(ran)} dispatched (${String(opened)} pr-opened, ${String(abandoned)} abandoned), ${String(result.skipped.length)} skipped, ${String(result.blocked.length)} blocked, ${String(result.errors.length)} errored.\n`,
  );
  if (result.errors.length > 0) {
    process.stdout.write('Errors:\n');
    for (const e of result.errors) {
      process.stdout.write(`  #${String(e.number)}: ${e.message}\n`);
    }
  }
}

function printReviewSummary(result: ReviewerWorkflowOutcome): void {
  process.stdout.write(
    `\nKlaus reporting, Captain: ${String(result.reviewed.length)} review-posted, ${String(result.abandoned.length)} abandoned, ${String(result.skipped.length)} skipped, ${String(result.errors.length)} errored.\n`,
  );
  if (result.errors.length > 0) {
    process.stdout.write('Errors:\n');
    for (const e of result.errors) {
      process.stdout.write(
        `  PR #${String(e.prNumber)} / issue #${String(e.issueNumber)}: ${e.message}\n`,
      );
    }
  }
}

function bootstrapInTmuxAndAttach(repoRoot: string, args: MilestoneWorkflowArgs): void {
  const has = spawnSync('tmux', ['has-session', '-t', TMUX_SESSION], { stdio: 'ignore' });
  if (has.status === 0) {
    process.stderr.write(
      `Klaus is already at sea, Captain. Session '${TMUX_SESSION}' is in use.\n` +
        `  attach: tmux attach -t ${TMUX_SESSION}\n` +
        `  end:    tmux kill-session -t ${TMUX_SESSION}\n`,
    );
    process.exit(2);
  }

  const node = process.execPath;
  const execArgv = process.execArgv;
  const script = process.argv[1] ?? '';
  const innerArgs: string[] = [
    args.command,
    '--milestone',
    args.milestone,
    '--parallel',
    String(args.parallel),
  ];
  if (args.skipPlanConfirmation) innerArgs.push('--skip-plan-confirmation');
  const innerCmd =
    `env KLAUS_INSIDE_TMUX=1 ${[node, ...execArgv, script, ...innerArgs].map(shellQuote).join(' ')}; ` +
    `exec zsh`;

  const create = spawnSync(
    'tmux',
    ['new-session', '-d', '-s', TMUX_SESSION, '-n', 'controller', '-c', repoRoot, innerCmd],
    { encoding: 'utf8' },
  );
  if (create.status !== 0) {
    process.stderr.write(`klaus: failed to create tmux session: ${create.stderr.trim()}\n`);
    process.exit(1);
  }

  spawnSync('tmux', ['select-pane', '-t', `${TMUX_SESSION}:controller`, '-T', 'controller'], {
    stdio: 'ignore',
  });

  if (process.env.TMUX !== undefined) {
    const sw = spawnSync('tmux', ['switch-client', '-t', TMUX_SESSION], { stdio: 'inherit' });
    process.exit(sw.status ?? 0);
  }

  const attach = spawn('tmux', ['attach', '-t', TMUX_SESSION], { stdio: 'inherit' });
  attach.once('exit', (code) => {
    process.exit(code ?? 0);
  });
}

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

function assertRepoRoot(cwd: string): string {
  if (!existsSync(path.join(cwd, '.git'))) {
    throw new Error(`klaus must be run from a git repo root (cwd=${cwd}).`);
  }
  return cwd;
}

function formatRunSlug(d: Date): string {
  const iso = d.toISOString();
  return `${iso.slice(0, 10)}-${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 19)}`;
}

function isDirectRun(): boolean {
  const entrypoint = process.argv[1];
  return entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href;
}

if (isDirectRun()) {
  main().catch((err: unknown) => {
    process.stderr.write(`klaus: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}
