import { spawnSync } from 'node:child_process';

import { z } from 'zod';

import { loadConfig } from '../config.js';

const labels = loadConfig().labels;

export const READY_FOR_AGENT = labels.readyForAgent;
export const NEEDS_INFO = labels.needsInfo;
export const READY_FOR_REVIEW = labels.readyForReview;
export const REVIEWED_BY_AGENT = labels.reviewedByAgent;

export type IssueState = 'OPEN' | 'CLOSED';
export type PullRequestState = 'OPEN' | 'CLOSED' | 'MERGED';

export type IssueLabel = Readonly<{
  name: string;
}>;

export type Issue = Readonly<{
  number: number;
  title: string;
  body: string;
  state: IssueState;
}>;

export type IssueListItem = Issue &
  Readonly<{
    labels: readonly IssueLabel[];
  }>;

export type PullRequest = Readonly<{
  number: number;
  state: PullRequestState;
  url: string;
  isDraft: boolean;
}>;

export type PullRequestDetails = Readonly<{
  number: number;
  title: string;
  body: string;
  url: string;
  headRefName: string;
  baseRefName: string;
  isDraft: boolean;
}>;

export type MergedAgentPullRequest = Readonly<{
  number: number;
  branch: string;
}>;

const IssueSchema = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  body: z.string(),
  state: z.enum(['OPEN', 'CLOSED']),
});

const PrSchema = z.object({
  number: z.number().int().positive(),
  state: z.enum(['OPEN', 'CLOSED', 'MERGED']),
  url: z.url(),
  isDraft: z.boolean(),
});

const PrDetailsSchema = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  body: z.string(),
  url: z.url(),
  headRefName: z.string(),
  baseRefName: z.string(),
  isDraft: z.boolean(),
});

const PrReviewSchema = z.object({
  state: z.string(),
  submittedAt: z.string().nullable(),
});

const IssueListItemSchema = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  body: z.string(),
  state: z.enum(['OPEN', 'CLOSED']),
  labels: z.array(z.object({ name: z.string() })),
});

const MergedAgentPrSchema = z.object({
  number: z.number().int().positive(),
  headRefName: z.string(),
});

const IssueStateSchema = z.object({ state: z.enum(['OPEN', 'CLOSED']) });

const PrReviewsSchema = z.object({
  reviews: z.array(PrReviewSchema),
});

export function fetchIssue(issueNumber: number): Issue {
  const result = spawnSync(
    'gh',
    ['issue', 'view', String(issueNumber), '--json', 'number,title,body,state'],
    { encoding: 'utf8' },
  );
  if (result.status !== 0) {
    throw new Error(
      `gh issue view ${String(issueNumber)} failed (exit ${String(result.status)}): ${result.stderr.trim()}`,
    );
  }
  return IssueSchema.parse(JSON.parse(result.stdout));
}

export function fetchIssueState(issueNumber: number): IssueState {
  const result = spawnSync('gh', ['issue', 'view', String(issueNumber), '--json', 'state'], {
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(
      `gh issue view ${String(issueNumber)} failed (exit ${String(result.status)}): ${result.stderr.trim()}`,
    );
  }
  return IssueStateSchema.parse(JSON.parse(result.stdout)).state;
}

export function listMilestoneIssues(milestone: string, label: string): readonly IssueListItem[] {
  const result = spawnSync(
    'gh',
    [
      'issue',
      'list',
      '--milestone',
      milestone,
      '--label',
      label,
      '--state',
      'open',
      '--json',
      'number,title,body,state,labels',
      '--limit',
      '200',
    ],
    { encoding: 'utf8' },
  );
  if (result.status !== 0) {
    throw new Error(
      `gh issue list --milestone ${milestone} failed (exit ${String(result.status)}): ${result.stderr.trim()}`,
    );
  }
  return z.array(IssueListItemSchema).parse(JSON.parse(result.stdout));
}

export function findPrForBranch(branch: string): PullRequest | null {
  // Filter to OPEN PRs: a stale CLOSED PR on the same branch name must not be
  // mistaken for a freshly-opened one by the implementer poll. Merged PRs are
  // handled separately via listMergedAgentPrs and the worktree-cleanup path.
  const result = spawnSync(
    'gh',
    ['pr', 'list', '--head', branch, '--state', 'open', '--json', 'number,state,url,isDraft'],
    { encoding: 'utf8' },
  );
  if (result.status !== 0) {
    throw new Error(
      `gh pr list --head ${branch} failed (exit ${String(result.status)}): ${result.stderr.trim()}`,
    );
  }
  const list = z.array(PrSchema).parse(JSON.parse(result.stdout));
  return list[0] ?? null;
}

export function fetchPrDetails(prNumber: number): PullRequestDetails {
  const result = spawnSync(
    'gh',
    [
      'pr',
      'view',
      String(prNumber),
      '--json',
      'number,title,body,url,headRefName,baseRefName,isDraft',
    ],
    { encoding: 'utf8' },
  );
  if (result.status !== 0) {
    throw new Error(
      `gh pr view ${String(prNumber)} failed (exit ${String(result.status)}): ${result.stderr.trim()}`,
    );
  }
  return PrDetailsSchema.parse(JSON.parse(result.stdout));
}

export function hasCommentReviewAfter(prNumber: number, afterIso: string): boolean {
  const result = spawnSync('gh', ['pr', 'view', String(prNumber), '--json', 'reviews'], {
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(
      `gh pr view ${String(prNumber)} --json reviews failed (exit ${String(result.status)}): ${result.stderr.trim()}`,
    );
  }
  return containsCommentReviewAfter(JSON.parse(result.stdout), afterIso);
}

export function containsCommentReviewAfter(payload: unknown, afterIso: string): boolean {
  const afterMs = Date.parse(afterIso);
  if (!Number.isFinite(afterMs)) {
    throw new Error(`invalid review timestamp '${afterIso}'`);
  }
  const parsed = PrReviewsSchema.parse(payload);
  return parsed.reviews.some((review) => {
    if (review.state !== 'COMMENTED' || review.submittedAt === null) return false;
    const submittedMs = Date.parse(review.submittedAt);
    return Number.isFinite(submittedMs) && submittedMs > afterMs;
  });
}

export function ensureLabel(name: string, description: string, color: string): void {
  const result = spawnSync(
    'gh',
    ['label', 'create', name, '--description', description, '--color', color, '--force'],
    { encoding: 'utf8' },
  );
  if (result.status !== 0) {
    throw new Error(`failed to ensure label '${name}': ${result.stderr.trim()}`);
  }
}

export function addIssueLabel(issueNumber: number, label: string): void {
  const result = spawnSync(
    'gh',
    ['issue', 'edit', String(issueNumber), '--add-label', label],
    { encoding: 'utf8' },
  );
  if (result.status !== 0) {
    throw new Error(
      `failed to add label '${label}' to issue #${String(issueNumber)}: ${result.stderr.trim()}`,
    );
  }
}

export function listMergedAgentPrs(): readonly MergedAgentPullRequest[] {
  const result = spawnSync(
    'gh',
    [
      'pr',
      'list',
      '--state',
      'merged',
      '--search',
      'head:agent/issue-',
      '--json',
      'number,headRefName',
      '--limit',
      '200',
    ],
    { encoding: 'utf8' },
  );
  if (result.status !== 0) {
    throw new Error(
      `gh pr list (merged agent branches) failed (exit ${String(result.status)}): ${result.stderr.trim()}`,
    );
  }
  const parsed = z.array(MergedAgentPrSchema).parse(JSON.parse(result.stdout));
  return parsed
    .filter((p) => p.headRefName.startsWith('agent/issue-'))
    .map((p) => ({ number: p.number, branch: p.headRefName }));
}

export function ensureReadyForReviewLabel(): void {
  ensureLabel(READY_FOR_REVIEW, 'Agent has opened a PR; awaiting review', 'BFD4F2');
}

export function ensureReviewedByAgentLabel(): void {
  ensureLabel(REVIEWED_BY_AGENT, 'Agent has posted a neutral PR review', '0E8A16');
}

export function flipIssueToReadyForReview(issueNumber: number): void {
  const result = spawnSync(
    'gh',
    [
      'issue',
      'edit',
      String(issueNumber),
      '--remove-label',
      READY_FOR_AGENT,
      '--add-label',
      READY_FOR_REVIEW,
    ],
    { encoding: 'utf8' },
  );
  if (result.status !== 0) {
    process.stderr.write(
      `klaus: label flip failed for issue #${String(issueNumber)}: ${result.stderr.trim()}\n`,
    );
  }
}

export function flipIssueToReviewedByAgent(issueNumber: number): void {
  ensureReviewedByAgentLabel();
  const result = spawnSync(
    'gh',
    [
      'issue',
      'edit',
      String(issueNumber),
      '--remove-label',
      READY_FOR_REVIEW,
      '--add-label',
      REVIEWED_BY_AGENT,
    ],
    { encoding: 'utf8' },
  );
  if (result.status !== 0) {
    process.stderr.write(
      `klaus: label flip failed for issue #${String(issueNumber)}: ${result.stderr.trim()}\n`,
    );
  }
}
