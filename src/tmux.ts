import { spawn, spawnSync } from 'node:child_process';

export const POLL_INTERVAL_MS = 10_000;
export const SIGTERM_GRACE_MS = 5_000;
export const TMUX_SESSION = 'klaus';
export const AGENTS_WINDOW = 'agents';

export type SessionInit = Readonly<{
  name: string;
  controlLogPath: string;
}>;

export type AgentPaneInit = Readonly<{
  session: string;
  windowName: string;
  paneTitle: string;
  cwd: string;
  command: string;
}>;

export function ensureSession(init: SessionInit): void {
  const has = spawnSync('tmux', ['has-session', '-t', init.name], { stdio: 'ignore' });
  if (has.status !== 0) {
    const create = spawnSync(
      'tmux',
      ['new-session', '-d', '-s', init.name, '-n', 'control', `tail -f ${init.controlLogPath}`],
      { encoding: 'utf8' },
    );
    if (create.status !== 0) {
      throw new Error(
        `tmux: failed to create session '${init.name}' (exit ${String(create.status)}): ${create.stderr.trim()}`,
      );
    }
  }

  spawnSync('tmux', ['set-option', '-t', init.name, 'pane-border-status', 'top'], {
    stdio: 'ignore',
  });
  spawnSync('tmux', ['set-option', '-t', init.name, 'pane-border-format', ' #{pane_title} '], {
    stdio: 'ignore',
  });
  spawnSync('tmux', ['set-option', '-t', init.name, 'mouse', 'on'], { stdio: 'ignore' });
}

let placeholderPaneId: string | null = null;

export function ensureAgentsWindow(session: string, windowName: string, cwd: string): void {
  const list = spawnSync('tmux', ['list-windows', '-t', session, '-F', '#{window_name}'], {
    encoding: 'utf8',
  });
  if (list.status === 0 && list.stdout.split('\n').includes(windowName)) return;

  const result = spawnSync(
    'tmux',
    [
      'new-window',
      '-t',
      `${session}:`,
      '-n',
      windowName,
      '-c',
      cwd,
      '-P',
      '-F',
      '#{pane_id}',
      'cat',
    ],
    { encoding: 'utf8' },
  );
  if (result.status !== 0) {
    throw new Error(
      `tmux: failed to create '${windowName}' window (exit ${String(result.status)}): ${result.stderr.trim()}`,
    );
  }
  placeholderPaneId = result.stdout.trim();
}

export function newAgentPane(init: AgentPaneInit): string {
  const target = `${init.session}:${init.windowName}`;
  const result = spawnSync(
    'tmux',
    ['split-window', '-t', target, '-c', init.cwd, '-P', '-F', '#{pane_id}', init.command],
    { encoding: 'utf8' },
  );
  if (result.status !== 0) {
    throw new Error(
      `tmux: failed to split-window in '${target}' (exit ${String(result.status)}): ${result.stderr.trim()}`,
    );
  }
  const paneId = result.stdout.trim();

  if (placeholderPaneId !== null) {
    spawnSync('tmux', ['kill-pane', '-t', placeholderPaneId], { stdio: 'ignore' });
    placeholderPaneId = null;
  }

  spawnSync('tmux', ['select-pane', '-t', paneId, '-T', init.paneTitle], { stdio: 'ignore' });
  retileAgents(init.session, init.windowName);

  return paneId;
}

export function retileAgents(session: string, windowName: string): void {
  spawnSync('tmux', ['select-layout', '-t', `${session}:${windowName}`, 'tiled'], {
    stdio: 'ignore',
  });
}

export function sendKeys(target: string, keys: string): void {
  const result = spawnSync('tmux', ['send-keys', '-t', target, keys], { encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(`klaus: tmux send-keys to ${target} failed: ${result.stderr.trim()}\n`);
  }
}

export function killPane(target: string): void {
  spawnSync('tmux', ['kill-pane', '-t', target], { stdio: 'ignore' });
}

export function waitFor(channel: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('tmux', ['wait-for', channel], { stdio: 'ignore' });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`tmux wait-for ${channel} exited with code ${String(code)}`));
    });
  });
}

export function signalChannel(channel: string): void {
  spawnSync('tmux', ['wait-for', '-S', channel], { stdio: 'ignore' });
}
