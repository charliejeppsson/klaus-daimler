import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

export type WorktreePaths = Readonly<{
  worktreePath: string;
  branch: string;
}>;

export type ReviewWorktreePaths = Readonly<{
  worktreePath: string;
  branch: string;
}>;

const MAX_SLUG_LEN = 40;

export function slugifyTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug.length <= MAX_SLUG_LEN) return slug;
  const truncated = slug.slice(0, MAX_SLUG_LEN);
  const lastHyphen = truncated.lastIndexOf('-');
  return lastHyphen > 0 ? truncated.slice(0, lastHyphen) : truncated;
}

export function pathsForIssue(
  repoRoot: string,
  issueNumber: number,
  title: string,
): WorktreePaths {
  const slug = slugifyTitle(title);
  const suffix =
    slug.length > 0 ? `issue-${String(issueNumber)}-${slug}` : `issue-${String(issueNumber)}`;
  return {
    worktreePath: joinPath(repoRoot, '.klaus', 'worktrees', suffix),
    branch: `agent/${suffix}`,
  };
}

export function pathsForReview(
  repoRoot: string,
  prNumber: number,
  issueNumber: number,
  title: string,
  branch: string,
): ReviewWorktreePaths {
  const slug = slugifyTitle(title);
  const suffix =
    slug.length > 0
      ? `pr-${String(prNumber)}-issue-${String(issueNumber)}-${slug}`
      : `pr-${String(prNumber)}-issue-${String(issueNumber)}`;
  return {
    worktreePath: joinPath(repoRoot, '.klaus', 'review-worktrees', suffix),
    branch,
  };
}

function joinPath(root: string, ...parts: readonly string[]): string {
  return [root.replace(/\/+$/g, ''), ...parts].join('/');
}

export function worktreeExists(paths: { readonly worktreePath: string }): boolean {
  return existsSync(paths.worktreePath);
}

export function createWorktree(repoRoot: string, paths: WorktreePaths): void {
  const result = spawnSync(
    'git',
    ['worktree', 'add', paths.worktreePath, '-b', paths.branch, 'main'],
    { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'inherit', 'inherit'] },
  );
  if (result.status !== 0) {
    throw new Error(`git worktree add failed (exit ${String(result.status)})`);
  }
}

export function createReviewWorktree(repoRoot: string, paths: ReviewWorktreePaths): void {
  const remoteRef = `refs/remotes/origin/${paths.branch}`;
  const fetchResult = spawnSync(
    'git',
    ['fetch', 'origin', `refs/heads/${paths.branch}:${remoteRef}`],
    { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'inherit', 'inherit'] },
  );
  if (fetchResult.status !== 0) {
    throw new Error(`git fetch origin ${paths.branch} failed (exit ${String(fetchResult.status)})`);
  }

  const addResult = spawnSync(
    'git',
    ['worktree', 'add', '--detach', paths.worktreePath, remoteRef],
    { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'inherit', 'inherit'] },
  );
  if (addResult.status !== 0) {
    throw new Error(`git review worktree add failed (exit ${String(addResult.status)})`);
  }
}

export function removeWorktree(repoRoot: string, paths: WorktreePaths): void {
  const removeResult = spawnSync(
    'git',
    ['worktree', 'remove', '--force', paths.worktreePath],
    { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'inherit', 'inherit'] },
  );
  if (removeResult.status !== 0 && existsSync(paths.worktreePath)) {
    throw new Error(`git worktree remove failed (exit ${String(removeResult.status)})`);
  }
  spawnSync('git', ['branch', '-D', paths.branch], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'ignore', 'ignore'],
  });
}

export function removeReviewWorktree(
  repoRoot: string,
  paths: { readonly worktreePath: string },
): void {
  const removeResult = spawnSync(
    'git',
    ['worktree', 'remove', '--force', paths.worktreePath],
    { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'inherit', 'inherit'] },
  );
  if (removeResult.status !== 0 && existsSync(paths.worktreePath)) {
    throw new Error(`git review worktree remove failed (exit ${String(removeResult.status)})`);
  }
}

export function deleteLocalBranch(repoRoot: string, branch: string): void {
  spawnSync('git', ['branch', '-D', branch], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'ignore', 'ignore'],
  });
}
