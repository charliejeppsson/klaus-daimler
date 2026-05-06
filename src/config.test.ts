import { describe, expect, it } from 'vitest';

import { loadConfig } from './config.js';

describe('loadConfig', () => {
  it('returns null conventions path and default labels when no env is set', () => {
    expect(loadConfig({})).toEqual({
      conventionsPath: null,
      labels: {
        readyForAgent: 'ready-for-agent',
        needsInfo: 'needs-info',
        readyForReview: 'ready-for-review',
        reviewedByAgent: 'reviewed-by-agent',
      },
    });
  });

  it('honours KLAUS_CONVENTIONS_PATH and label overrides', () => {
    expect(
      loadConfig({
        KLAUS_CONVENTIONS_PATH: 'docs/style.md',
        KLAUS_LABEL_READY_FOR_AGENT: 'agent-ready',
        KLAUS_LABEL_NEEDS_INFO: 'awaiting-info',
        KLAUS_LABEL_READY_FOR_REVIEW: 'agent-pr-open',
        KLAUS_LABEL_REVIEWED_BY_AGENT: 'agent-reviewed',
      }),
    ).toEqual({
      conventionsPath: 'docs/style.md',
      labels: {
        readyForAgent: 'agent-ready',
        needsInfo: 'awaiting-info',
        readyForReview: 'agent-pr-open',
        reviewedByAgent: 'agent-reviewed',
      },
    });
  });
});
