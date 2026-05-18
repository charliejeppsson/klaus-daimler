import { spawn, spawnSync } from 'node:child_process';

import type { ParsedArgs } from './args.js';
import { AGENTS_WINDOW, TMUX_SESSION } from '../shell/tmux.js';

export function shouldBootstrapInTmux(args: ParsedArgs, env: NodeJS.ProcessEnv): boolean {
  if (env.KLAUS_INSIDE_TMUX === '1') return false;
  void args;
  return true;
}

export function bootstrapInTmuxAndAttach(repoRoot: string, args: ParsedArgs): void {
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
    '--agent',
    args.agent,
  ];
  if (args.skipPlanConfirmation) innerArgs.push('--skip-plan-confirmation');
  const innerCmd =
    `env KLAUS_INSIDE_TMUX=1 ${[node, ...execArgv, script, ...innerArgs].map(shellQuote).join(' ')}; ` +
    `exec zsh`;

  const create = spawnSync(
    'tmux',
    [
      'new-session',
      '-d',
      '-s',
      TMUX_SESSION,
      '-n',
      'controller',
      '-c',
      repoRoot,
      ...forwardedTmuxEnvFlags(process.env),
      innerCmd,
    ],
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

const FORWARDED_ENV_VARS = [
  'KLAUS_CONVENTIONS_PATH',
  'KLAUS_LABEL_READY_FOR_AGENT',
  'KLAUS_LABEL_NEEDS_INFO',
  'KLAUS_LABEL_READY_FOR_REVIEW',
  'KLAUS_LABEL_REVIEWED_BY_AGENT',
] as const;

export function forwardedTmuxEnvFlags(env: NodeJS.ProcessEnv): string[] {
  // tmux new-session inherits its env from the running tmux server, captured when
  // that server first started -- not from the shell that invoked klaus. Pass each
  // Klaus config var via `-e` so the controller process sees the current values.
  return FORWARDED_ENV_VARS.flatMap((name) => {
    const value = env[name];
    return value === undefined || value === '' ? [] : ['-e', `${name}=${value}`];
  });
}

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}
