import { describe, expect, it } from 'vitest';

import { dispatchWaves } from '../../controller/dispatch-waves.js';
import type { IssueRef } from '../../controller/scheduler.js';

const ref = (number: number): IssueRef => ({
  number,
  title: `Issue ${String(number)}`,
  body: '',
});

describe('dispatchWaves', () => {
  it('runs hard-blocked issues only after their blockers complete', async () => {
    const events: string[] = [];
    const blockerMap = new Map<number, Set<number>>([[2, new Set([1])]]);

    await dispatchWaves({
      issues: [ref(2), ref(1)],
      blockerMap,
      parallel: 2,
      onStart: () => {},
      runOne: async (issue) => {
        events.push(`start:${String(issue.number)}`);
        await new Promise((r) => setTimeout(r, 5));
        events.push(`end:${String(issue.number)}`);
        return 'pr-opened' as const;
      },
      onFinish: async () => {},
    });

    expect(events.indexOf('end:1')).toBeLessThan(events.indexOf('start:2'));
  });

  it('caps concurrent runs at the parallel limit', async () => {
    let active = 0;
    let peak = 0;

    await dispatchWaves({
      issues: [ref(1), ref(2), ref(3), ref(4)],
      blockerMap: new Map(),
      parallel: 2,
      onStart: () => {},
      runOne: async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 5));
        active -= 1;
        return 'pr-opened' as const;
      },
      onFinish: async () => {},
    });

    expect(peak).toBe(2);
  });

  it('continues to dispatch dependents even when a blocker errors', async () => {
    const ranNumbers: number[] = [];
    const blockerMap = new Map<number, Set<number>>([[2, new Set([1])]]);

    const result = await dispatchWaves({
      issues: [ref(1), ref(2)],
      blockerMap,
      parallel: 2,
      onStart: () => {},
      runOne: async (issue) => {
        ranNumbers.push(issue.number);
        await Promise.resolve();
        if (issue.number === 1) throw new Error('boom');
        return 'pr-opened' as const;
      },
      onFinish: async () => {},
    });

    expect(ranNumbers).toEqual([1, 2]);
    expect(result.ranIssues).toEqual([{ number: 2, outcome: 'pr-opened' }]);
    expect(result.errors).toEqual([{ number: 1, message: 'boom' }]);
  });
});
