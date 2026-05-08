import { describe, expect, it } from 'vitest';

import type { IssueRef } from './scheduler.js';
import { buildHardBlockerMap, parseBlockedBy, planSequential } from './scheduler.js';

const issue = (number: number, body: string): IssueRef => ({
  number,
  title: `Issue ${String(number)}`,
  body,
});

describe('parseBlockedBy', () => {
  it('returns empty when there is no Blocked by section', () => {
    expect(parseBlockedBy('## What\n\nDo a thing.\n')).toEqual([]);
  });

  it('returns empty for "None - can start immediately."', () => {
    expect(parseBlockedBy('## Blocked by\n\nNone - can start immediately.\n')).toEqual([]);
  });

  it('extracts hard blocker references', () => {
    const body = '## Blocked by\n\n#5 — first\n#7 — second\n';

    const result = parseBlockedBy(body);

    expect(result).toEqual([
      { number: 5, soft: false },
      { number: 7, soft: false },
    ]);
  });

  it('marks (soft) blockers', () => {
    expect(parseBlockedBy('## Blocked by\n\n#3 (soft) — explanation\n')).toEqual([
      { number: 3, soft: true },
    ]);
  });

  it('handles mixed hard and soft blockers', () => {
    const body = '## Blocked by\n\n#2 — hard reason\n#4 (soft) — soft reason\n';

    expect(parseBlockedBy(body)).toEqual([
      { number: 2, soft: false },
      { number: 4, soft: true },
    ]);
  });

  it('stops at the next section heading', () => {
    const body = '## Blocked by\n\n#1\n\n## Other section\n\n#999\n';

    expect(parseBlockedBy(body)).toEqual([{ number: 1, soft: false }]);
  });

  it('treats the same number as hard when it appears both ways', () => {
    expect(parseBlockedBy('## Blocked by\n\n#5 (soft)\n#5 — actually hard\n')).toEqual([
      { number: 5, soft: false },
    ]);
  });
});

describe('planSequential', () => {
  it('orders by issue number when there are no blockers', () => {
    const plan = planSequential(
      [issue(7, 'no section'), issue(3, 'no section'), issue(5, 'no section')],
      () => false,
    );

    expect(plan.ordered.map((i) => i.number)).toEqual([3, 5, 7]);
    expect(plan.blocked).toEqual([]);
  });

  it('runs hard blockers before their dependents', () => {
    const plan = planSequential(
      [issue(2, '## Blocked by\n\n#5 — needs 5\n'), issue(5, '## Blocked by\n\nNone\n')],
      () => false,
    );

    expect(plan.ordered.map((i) => i.number)).toEqual([5, 2]);
  });

  it('reports issues blocked by an unsatisfied non-candidate hard blocker', () => {
    const plan = planSequential(
      [issue(2, '## Blocked by\n\n#99 — outside the milestone\n')],
      () => false,
    );

    expect(plan.ordered).toEqual([]);
    expect(plan.blocked).toHaveLength(1);
    expect(plan.blocked[0]?.issue.number).toBe(2);
    expect(plan.blocked[0]?.waitingOn).toEqual([99]);
  });

  it('treats closed hard blockers as satisfied', () => {
    const plan = planSequential([issue(2, '## Blocked by\n\n#99\n')], (n) => n === 99);

    expect(plan.ordered.map((i) => i.number)).toEqual([2]);
    expect(plan.blocked).toEqual([]);
  });

  it('respects soft blockers as ordering hints within a layer', () => {
    const plan = planSequential(
      [
        issue(2, '## Blocked by\n\n#3 (soft) — prefer after 3\n'),
        issue(3, '## Blocked by\n\nNone\n'),
      ],
      () => false,
    );

    expect(plan.ordered.map((i) => i.number)).toEqual([3, 2]);
  });

  it('throws on a hard cycle among candidates', () => {
    expect(() =>
      planSequential(
        [issue(1, '## Blocked by\n\n#2\n'), issue(2, '## Blocked by\n\n#1\n')],
        () => false,
      ),
    ).toThrow(/scheduler: hard-blocker cycle/);
  });
});

describe('buildHardBlockerMap', () => {
  it('returns only intra-candidate, unclosed, hard blockers', () => {
    const map = buildHardBlockerMap(
      [
        issue(2, '## Blocked by\n\n#5\n#7 (soft)\n#99\n'),
        issue(5, '## Blocked by\n\nNone\n'),
      ],
      (n) => n === 99,
    );

    expect(map.get(2)).toEqual(new Set([5]));
    expect(map.has(5)).toBe(false);
  });

  it('omits issues with no pending blockers', () => {
    const map = buildHardBlockerMap([issue(1, 'no section')], () => false);
    expect(map.size).toBe(0);
  });
});
