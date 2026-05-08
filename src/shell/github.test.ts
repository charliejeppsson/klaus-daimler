import { describe, expect, it } from 'vitest';

import { containsCommentReviewAfter } from './github.js';

describe('containsCommentReviewAfter', () => {
  it('detects a comment-style review after the start timestamp', () => {
    const found = containsCommentReviewAfter(
      {
        reviews: [
          { state: 'APPROVED', submittedAt: '2026-05-05T10:00:00Z' },
          { state: 'COMMENTED', submittedAt: '2026-05-05T10:02:00Z' },
        ],
      },
      '2026-05-05T10:01:00Z',
    );

    expect(found).toBe(true);
  });

  it('ignores pre-start and non-comment reviews', () => {
    const found = containsCommentReviewAfter(
      {
        reviews: [
          { state: 'COMMENTED', submittedAt: '2026-05-05T09:59:00Z' },
          { state: 'CHANGES_REQUESTED', submittedAt: '2026-05-05T10:02:00Z' },
        ],
      },
      '2026-05-05T10:01:00Z',
    );

    expect(found).toBe(false);
  });
});
