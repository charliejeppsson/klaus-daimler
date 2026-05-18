import { afterEach, describe, expect, it, vi } from 'vitest';

import { forwardedTmuxEnvFlags, parseArgs, shouldBootstrapInTmux } from './main.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('parseArgs', () => {
  it('parses implement milestone with defaults', () => {
    expect(parseArgs(['implement', '--milestone', 'M1'])).toEqual({
      command: 'implement',
      milestone: 'M1',
      skipPlanConfirmation: false,
      parallel: 1,
      agent: 'claude',
    });
  });

  it('parses review milestone with defaults', () => {
    expect(parseArgs(['review', '--milestone', 'M1'])).toEqual({
      command: 'review',
      milestone: 'M1',
      skipPlanConfirmation: false,
      parallel: 1,
      agent: 'claude',
    });
  });

  it('parses review parallel and skip confirmation flags', () => {
    expect(
      parseArgs(['review', '--milestone', 'M1', '--parallel', '3', '--skip-plan-confirmation']),
    ).toEqual({
      command: 'review',
      milestone: 'M1',
      skipPlanConfirmation: true,
      parallel: 3,
      agent: 'claude',
    });
  });

  it('parses codex as the selected coding agent', () => {
    expect(parseArgs(['implement', '--milestone', 'M1', '--agent', 'codex'])).toEqual({
      command: 'implement',
      milestone: 'M1',
      skipPlanConfirmation: false,
      parallel: 1,
      agent: 'codex',
    });
  });

  it('rejects unknown coding agents', () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit');
    });

    expect(() => parseArgs(['review', '--milestone', 'M1', '--agent', 'cursor'])).toThrow('exit');
    expect(exit).toHaveBeenLastCalledWith(2);
  });

  it('rejects the removed loop, run, and yes interfaces', () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit');
    });

    expect(() => parseArgs(['loop', '--milestone', 'M1'])).toThrow('exit');
    expect(exit).toHaveBeenLastCalledWith(2);

    expect(() => parseArgs(['run', '1'])).toThrow('exit');
    expect(exit).toHaveBeenLastCalledWith(2);

    expect(() => parseArgs(['review', '--milestone', 'M1', '--yes'])).toThrow('exit');
    expect(exit).toHaveBeenLastCalledWith(2);
  });
});

describe('shouldBootstrapInTmux', () => {
  it('bootstraps review runs even at parallel 1', () => {
    expect(
      shouldBootstrapInTmux(
        {
          command: 'review',
          milestone: 'v0',
          skipPlanConfirmation: false,
          parallel: 1,
          agent: 'claude',
        },
        {},
      ),
    ).toBe(true);
  });

  it('does not recursively bootstrap inside the klaus tmux controller', () => {
    expect(
      shouldBootstrapInTmux(
        {
          command: 'review',
          milestone: 'v0',
          skipPlanConfirmation: false,
          parallel: 1,
          agent: 'claude',
        },
        { KLAUS_INSIDE_TMUX: '1' },
      ),
    ).toBe(false);
  });

  it('bootstraps implementer runs with the same tmux behavior', () => {
    expect(
      shouldBootstrapInTmux(
        {
          command: 'implement',
          milestone: 'v0',
          skipPlanConfirmation: false,
          parallel: 1,
          agent: 'claude',
        },
        {},
      ),
    ).toBe(true);
    expect(
      shouldBootstrapInTmux(
        {
          command: 'implement',
          milestone: 'v0',
          skipPlanConfirmation: false,
          parallel: 2,
          agent: 'codex',
        },
        {},
      ),
    ).toBe(true);
  });
});

describe('forwardedTmuxEnvFlags', () => {
  it('returns no flags when no klaus config vars are set', () => {
    expect(forwardedTmuxEnvFlags({})).toEqual([]);
  });

  it('forwards KLAUS_CONVENTIONS_PATH and label overrides as -e flags', () => {
    expect(
      forwardedTmuxEnvFlags({
        KLAUS_CONVENTIONS_PATH: 'docs/conventions.md',
        KLAUS_LABEL_READY_FOR_AGENT: 'agent-ready',
        UNRELATED: 'ignored',
      }),
    ).toEqual([
      '-e',
      'KLAUS_CONVENTIONS_PATH=docs/conventions.md',
      '-e',
      'KLAUS_LABEL_READY_FOR_AGENT=agent-ready',
    ]);
  });

  it('skips empty values', () => {
    expect(
      forwardedTmuxEnvFlags({ KLAUS_CONVENTIONS_PATH: '', KLAUS_LABEL_NEEDS_INFO: 'needs' }),
    ).toEqual(['-e', 'KLAUS_LABEL_NEEDS_INFO=needs']);
  });
});
