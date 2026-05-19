import { describe, expect, it, vi } from 'vitest';

import { buildReviewPaneCommand, collectReviewTargets } from './workflow.js';

const paths = {
  worktreePath: '/repo/.klaus/worktrees/issue-11-example-issue',
  branch: 'agent/issue-11-example-issue',
};

const reviewPaths = {
  worktreePath: '/repo/.klaus/review-worktrees/pr-123-issue-11-example-issue',
  branch: 'agent/issue-11-example-issue',
};

describe('collectReviewTargets', () => {
  const issue = {
    number: 11,
    title: 'Example issue',
    body: 'Body',
    state: 'OPEN' as const,
    labels: [{ name: 'ready-for-review' }],
  };

  it('targets open PRs for ready-for-review milestone issues', () => {
    const findPrForBranch = vi.fn().mockReturnValue({
      number: 123,
      state: 'OPEN',
      url: 'https://github.com/example/repo/pull/123',
      isDraft: false,
    });

    const plan = collectReviewTargets({
      repoRoot: '/repo',
      issues: [issue],
      findPrForBranch,
      worktreeExists: vi.fn().mockReturnValue(false),
    });

    expect(findPrForBranch).toHaveBeenCalledWith(paths.branch);
    expect(plan.targets).toHaveLength(1);
    expect(plan.targets[0]?.pr.number).toBe(123);
    expect(plan.targets[0]?.reviewPaths.worktreePath).toBe(reviewPaths.worktreePath);
    expect(plan.skipped).toEqual([]);
  });

  it('skips issues without an open PR', () => {
    const plan = collectReviewTargets({
      repoRoot: '/repo',
      issues: [issue],
      findPrForBranch: vi.fn().mockReturnValue(null),
      worktreeExists: vi.fn().mockReturnValue(false),
    });

    expect(plan.targets).toEqual([]);
    expect(plan.skipped).toEqual([{ number: 11, reason: 'no PR for agent/issue-11-example-issue' }]);
  });

  it('refuses targets whose review worktree already exists', () => {
    const plan = collectReviewTargets({
      repoRoot: '/repo',
      issues: [issue],
      findPrForBranch: vi.fn().mockReturnValue({
        number: 123,
        state: 'OPEN',
        url: 'https://github.com/example/repo/pull/123',
        isDraft: false,
      }),
      worktreeExists: vi.fn().mockReturnValue(true),
    });

    expect(plan.targets).toEqual([]);
    expect(plan.skipped).toEqual([
      {
        number: 11,
        reason:
          'review worktree already exists at /repo/.klaus/review-worktrees/pr-123-issue-11-example-issue',
      },
    ]);
  });
});

describe('buildReviewPaneCommand', () => {
  it('signals the review channel when Claude exits', () => {
    const command = buildReviewPaneCommand({
      agent: 'claude',
      prNumber: 123,
      issueNumber: 11,
      branch: 'agent/issue-11-example',
      paneTitle: 'r-123',
      promptPath: '/repo/.klaus/runs/review-pr-123.prompt.md',
      channel: 'klaus-review-pr-123',
    });

    expect(command).toContain('KLAUS_REVIEW=1');
    expect(command).toContain("KLAUS_PANE_TITLE='r-123'");
    expect(command).toContain('claude "$(cat ');
    expect(command).toContain('tmux wait-for -S klaus-review-pr-123');
  });

  it('can launch the review prompt with Codex', () => {
    const command = buildReviewPaneCommand({
      agent: 'codex',
      prNumber: 123,
      issueNumber: 11,
      branch: 'agent/issue-11-example',
      paneTitle: 'r-123',
      promptPath: '/repo/.klaus/runs/review-pr-123.prompt.md',
      channel: 'klaus-review-pr-123',
    });

    expect(command).toContain('codex --no-alt-screen "$(cat ');
    expect(command).toContain('tmux wait-for -S klaus-review-pr-123');
  });
});
