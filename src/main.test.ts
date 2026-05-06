import { afterEach, describe, expect, it, vi } from 'vitest';

import { parseArgs, shouldBootstrapInTmux } from './main.js';

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
    });
  });

  it('parses review milestone with defaults', () => {
    expect(parseArgs(['review', '--milestone', 'M1'])).toEqual({
      command: 'review',
      milestone: 'M1',
      skipPlanConfirmation: false,
      parallel: 1,
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
    });
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
        { command: 'review', milestone: 'v0', skipPlanConfirmation: false, parallel: 1 },
        {},
      ),
    ).toBe(true);
  });

  it('does not recursively bootstrap inside the klaus tmux controller', () => {
    expect(
      shouldBootstrapInTmux(
        { command: 'review', milestone: 'v0', skipPlanConfirmation: false, parallel: 1 },
        { KLAUS_INSIDE_TMUX: '1' },
      ),
    ).toBe(false);
  });

  it('bootstraps implementer runs with the same tmux behavior', () => {
    expect(
      shouldBootstrapInTmux(
        { command: 'implement', milestone: 'v0', skipPlanConfirmation: false, parallel: 1 },
        {},
      ),
    ).toBe(true);
    expect(
      shouldBootstrapInTmux(
        { command: 'implement', milestone: 'v0', skipPlanConfirmation: false, parallel: 2 },
        {},
      ),
    ).toBe(true);
  });
});
