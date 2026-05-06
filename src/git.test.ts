import { describe, expect, it } from 'vitest';

import { pathsForIssue, pathsForReview, slugifyTitle } from './git.js';

describe('slugifyTitle', () => {
  it('lowercases and replaces non-alphanumerics with hyphens', () => {
    expect(slugifyTitle('Signal lifecycle: expiresAt filter')).toBe(
      'signal-lifecycle-expiresat-filter',
    );
  });

  it('strips leading and trailing punctuation', () => {
    expect(slugifyTitle('  --Hello, World!--  ')).toBe('hello-world');
  });

  it('truncates long titles at the previous hyphen boundary', () => {
    const slug = slugifyTitle(
      'A very long issue title that exceeds the maximum slug length we allow',
    );
    expect(slug.length).toBeLessThanOrEqual(40);
    expect(slug.endsWith('-')).toBe(false);
    expect(slug).toBe('a-very-long-issue-title-that-exceeds');
  });

  it('returns empty string when title has no usable characters', () => {
    expect(slugifyTitle('---')).toBe('');
    expect(slugifyTitle('')).toBe('');
  });
});

describe('pathsForIssue', () => {
  it('appends slug suffix to branch and worktree path', () => {
    const paths = pathsForIssue('/repo', 11, 'Signal lifecycle: expiresAt filter');
    expect(paths.branch).toBe('agent/issue-11-signal-lifecycle-expiresat-filter');
    expect(paths.worktreePath).toBe(
      '/repo/.klaus/worktrees/issue-11-signal-lifecycle-expiresat-filter',
    );
  });

  it('omits suffix when title slugifies to empty', () => {
    const paths = pathsForIssue('/repo', 7, '???');
    expect(paths.branch).toBe('agent/issue-7');
    expect(paths.worktreePath).toBe('/repo/.klaus/worktrees/issue-7');
  });
});

describe('pathsForReview', () => {
  it('uses a review-specific worktree path without changing the implementer branch', () => {
    const paths = pathsForReview(
      '/repo',
      123,
      11,
      'Signal lifecycle: expiresAt filter',
      'agent/issue-11-signal-lifecycle-expiresat-filter',
    );

    expect(paths.branch).toBe('agent/issue-11-signal-lifecycle-expiresat-filter');
    expect(paths.worktreePath).toBe(
      '/repo/.klaus/review-worktrees/pr-123-issue-11-signal-lifecycle-expiresat-filter',
    );
  });

  it('omits the review suffix when title slugifies to empty', () => {
    const paths = pathsForReview('/repo', 44, 7, '???', 'agent/issue-7');

    expect(paths.worktreePath).toBe('/repo/.klaus/review-worktrees/pr-44-issue-7');
  });
});
