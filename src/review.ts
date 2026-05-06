import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline';

import {
  createReviewWorktree,
  pathsForIssue,
  pathsForReview,
  removeReviewWorktree,
  worktreeExists,
  type ReviewWorktreePaths,
} from './git.js';
import {
  fetchPrDetails,
  findPrForBranch,
  hasCommentReviewAfter,
  listMilestoneIssues,
  flipIssueToReviewedByAgent,
  type IssueListItem,
  type PullRequest,
  READY_FOR_REVIEW,
} from './github.js';
import { readConventions } from './implement.js';
import { buildReviewPrompt } from './prompts.js';
import { createSemaphore } from './semaphore.js';
import {
  AGENTS_WINDOW,
  POLL_INTERVAL_MS,
  SIGTERM_GRACE_MS,
  ensureAgentsWindow,
  ensureSession,
  killPane,
  newAgentPane,
  retileAgents,
  sendKeys,
  signalChannel,
  waitFor,
} from './tmux.js';

export type ReviewRunOutcome = 'review-posted' | 'abandoned';

export type RunReviewerWorkflowOptions = Readonly<{
  milestone: string;
  repoRoot: string;
  runDir: string;
  skipPlanConfirmation: boolean;
  parallel: number;
  session: string;
  agentsWindow: string;
}>;

export type ReviewerWorkflowOutcome = Readonly<{
  reviewed: readonly { issueNumber: number; prNumber: number }[];
  abandoned: readonly { issueNumber: number; prNumber: number }[];
  skipped: readonly { number: number; reason: string }[];
  errors: readonly { issueNumber: number; prNumber: number; message: string }[];
}>;

export type ReviewTarget = Readonly<{
  issue: IssueListItem;
  branch: string;
  pr: PullRequest;
  reviewPaths: ReviewWorktreePaths;
}>;

export type ReviewTargetPlan = Readonly<{
  targets: readonly ReviewTarget[];
  skipped: readonly { number: number; reason: string }[];
}>;

export async function runReviewerWorkflow(
  options: RunReviewerWorkflowOptions,
): Promise<ReviewerWorkflowOutcome> {
  const { milestone, repoRoot, runDir, skipPlanConfirmation, parallel, session, agentsWindow } =
    options;
  if (!Number.isInteger(parallel) || parallel < 1) {
    throw new Error(
      `runReviewerWorkflow: parallel must be a positive integer, got ${String(parallel)}`,
    );
  }

  const issues = listMilestoneIssues(milestone, READY_FOR_REVIEW);
  if (issues.length === 0) {
    process.stdout.write(
      `Captain — no issues in milestone '${milestone}' with label '${READY_FOR_REVIEW}'.\n`,
    );
    return { reviewed: [], abandoned: [], skipped: [], errors: [] };
  }

  const plan = collectReviewTargets({ repoRoot, issues });
  printReviewPlan({ milestone, targets: plan.targets, skipped: plan.skipped, parallel });

  if (plan.targets.length === 0) {
    process.stdout.write('Captain — nothing to review.\n');
    return { reviewed: [], abandoned: [], skipped: plan.skipped, errors: [] };
  }

  if (!skipPlanConfirmation) {
    const proceed = await confirmAtTty('Set sail, Captain? [y/N] ');
    if (!proceed) {
      process.stdout.write('Aye, Captain. Standing down.\n');
      return { reviewed: [], abandoned: [], skipped: plan.skipped, errors: [] };
    }
  }

  await mkdir(runDir, { recursive: true });
  const controlLogPath = path.join(runDir, 'reviewer-control.log');
  await writeFile(
    controlLogPath,
    formatReviewControlHeader({
      milestone,
      targets: plan.targets,
      skipped: plan.skipped,
      parallel,
    }),
    'utf8',
  );

  ensureSession({ name: session, controlLogPath });
  ensureAgentsWindow(session, agentsWindow, repoRoot);
  process.stdout.write(
    `\nklaus: tmux session '${session}' ready. ` +
      `View will switch to agents once panes spawn; Ctrl-b 0 returns to the controller log.\n\n`,
  );

  const conventions = await readConventions(repoRoot);
  const sem = createSemaphore(parallel);
  const reviewed: { issueNumber: number; prNumber: number }[] = [];
  const abandoned: { issueNumber: number; prNumber: number }[] = [];
  const errors: { issueNumber: number; prNumber: number; message: string }[] = [];

  await Promise.all(
    plan.targets.map(async (target) => {
      const release = await sem.acquire();
      try {
        process.stdout.write(
          `\n=== klaus: reviewing PR #${String(target.pr.number)} for issue #${String(target.issue.number)} ===\n`,
        );
        const outcome = await runReviewerTarget({
          target,
          repoRoot,
          runDir,
          conventions,
          session,
          agentsWindow,
        });
        if (outcome === 'review-posted') {
          reviewed.push({ issueNumber: target.issue.number, prNumber: target.pr.number });
        } else {
          abandoned.push({ issueNumber: target.issue.number, prNumber: target.pr.number });
        }
        await appendFile(
          controlLogPath,
          `PR #${String(target.pr.number)} / issue #${String(target.issue.number)} -> ${outcome}\n`,
          'utf8',
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push({
          issueNumber: target.issue.number,
          prNumber: target.pr.number,
          message,
        });
        process.stderr.write(
          `klaus: review failed for PR #${String(target.pr.number)}: ${message}\n`,
        );
        await appendFile(
          controlLogPath,
          `PR #${String(target.pr.number)} / issue #${String(target.issue.number)} -> ERROR: ${message}\n`,
          'utf8',
        );
      } finally {
        release();
      }
    }),
  );

  return { reviewed, abandoned, skipped: plan.skipped, errors };
}

async function runReviewerTarget(args: {
  readonly target: ReviewTarget;
  readonly repoRoot: string;
  readonly runDir: string;
  readonly conventions: string;
  readonly session: string;
  readonly agentsWindow: string;
}): Promise<ReviewRunOutcome> {
  const { target, repoRoot, runDir, conventions, session, agentsWindow } = args;
  const details = fetchPrDetails(target.pr.number);
  createReviewWorktree(repoRoot, target.reviewPaths);

  const reviewPayloadPath = `${target.reviewPaths.worktreePath}/review-pr-${String(target.pr.number)}.json`;
  const prompt = await buildReviewPrompt({
    issueNumber: target.issue.number,
    issueTitle: target.issue.title,
    issueBody: target.issue.body,
    prNumber: details.number,
    prTitle: details.title,
    prBody: details.body,
    prUrl: details.url,
    branch: details.headRefName,
    baseBranch: details.baseRefName,
    reviewPayloadPath,
    conventions,
  });

  await mkdir(runDir, { recursive: true });
  const promptPath = path.join(runDir, `review-pr-${String(target.pr.number)}.prompt.md`);
  await writeFile(promptPath, prompt, 'utf8');

  const startedAt = new Date().toISOString();
  const pane = launchReviewClaudeInTmux({
    session,
    prNumber: target.pr.number,
    issueNumber: target.issue.number,
    branch: target.branch,
    cwd: target.reviewPaths.worktreePath,
    promptPath,
  });

  const posted = await waitForReviewPostOrPaneExit({
    prNumber: target.pr.number,
    startedAt,
    pane,
  });

  if (!posted) {
    process.stdout.write(
      `klaus: no new comment review detected for PR #${String(target.pr.number)} after ${startedAt}; preserving ${target.reviewPaths.worktreePath}\n`,
    );
    return 'abandoned';
  }

  flipIssueToReviewedByAgent(target.issue.number);
  try {
    removeReviewWorktree(repoRoot, target.reviewPaths);
    process.stdout.write(
      `klaus: cleaned up review worktree for PR #${String(target.pr.number)} (${target.reviewPaths.worktreePath})\n`,
    );
  } catch (err) {
    process.stderr.write(
      `klaus: failed to clean up review worktree ${target.reviewPaths.worktreePath}: ${err instanceof Error ? err.message : String(err)}\n`,
    );
  }
  killPane(pane.paneId);
  retileAgents(session, agentsWindow);
  process.stdout.write(
    `klaus: verified review for PR #${String(target.pr.number)} and labeled issue #${String(target.issue.number)} (${target.pr.url})\n`,
  );
  return 'review-posted';
}

export type ReviewPane = Readonly<{
  paneId: string;
  channel: string;
}>;

function launchReviewClaudeInTmux(args: {
  session: string;
  prNumber: number;
  issueNumber: number;
  branch: string;
  cwd: string;
  promptPath: string;
}): ReviewPane {
  const { session, prNumber, issueNumber, branch, cwd, promptPath } = args;
  const channel = `klaus-review-pr-${String(prNumber)}`;
  const paneTitle = `r-${String(prNumber)}`;

  const paneId = newAgentPane({
    session,
    windowName: AGENTS_WINDOW,
    paneTitle,
    cwd,
    command: buildReviewPaneCommand({
      prNumber,
      issueNumber,
      branch,
      paneTitle,
      promptPath,
      channel,
    }),
  });

  return { paneId, channel };
}

export function buildReviewPaneCommand(args: {
  prNumber: number;
  issueNumber: number;
  branch: string;
  paneTitle: string;
  promptPath: string;
  channel: string;
}): string {
  return (
    `env KLAUS=1 ` +
    `KLAUS_REVIEW=1 ` +
    `KLAUS_PR=${shellQuote(String(args.prNumber))} ` +
    `KLAUS_ISSUE=${shellQuote(String(args.issueNumber))} ` +
    `KLAUS_BRANCH=${shellQuote(args.branch)} ` +
    `KLAUS_PANE_TITLE=${shellQuote(args.paneTitle)} ` +
    `KLAUS_RUN_DIR=${shellQuote(path.dirname(args.promptPath))} ` +
    `KLAUS_TMUX_PANE="$(tmux display-message -p '#{pane_id}')" ` +
    `claude "$(cat ${shellQuote(args.promptPath)})"; ` +
    `tmux wait-for -S ${args.channel}; exec zsh`
  );
}

function waitForReviewPostOrPaneExit(args: {
  prNumber: number;
  startedAt: string;
  pane: ReviewPane;
}): Promise<boolean> {
  const { prNumber, startedAt, pane } = args;
  return new Promise((resolve) => {
    let resolved = false;
    const poll = setInterval(() => {
      if (resolved) return;
      try {
        if (!hasCommentReviewAfter(prNumber, startedAt)) return;
        sendKeys(pane.paneId, 'C-c');
        signalChannel(pane.channel);
        setTimeout(() => {
          if (resolved) return;
          killPane(pane.paneId);
          signalChannel(pane.channel);
        }, SIGTERM_GRACE_MS).unref();
        finish(true);
      } catch (err) {
        process.stderr.write(
          `klaus: review poll error for PR #${String(prNumber)} (continuing): ${err instanceof Error ? err.message : String(err)}\n`,
        );
      }
    }, POLL_INTERVAL_MS);

    const finish = (posted: boolean): void => {
      if (resolved) return;
      resolved = true;
      clearInterval(poll);
      resolve(posted);
    };

    waitFor(pane.channel)
      .then(() => {
        if (resolved) return;
        finish(hasCommentReviewAfter(prNumber, startedAt));
      })
      .catch((err: unknown) => {
        process.stderr.write(
          `klaus: tmux wait-for ${pane.channel} failed: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        finish(false);
      });
  });
}

export function collectReviewTargets(args: {
  repoRoot: string;
  issues: readonly IssueListItem[];
  findPrForBranch?: (branch: string) => PullRequest | null;
  worktreeExists?: (paths: { readonly worktreePath: string }) => boolean;
}): ReviewTargetPlan {
  const findPr = args.findPrForBranch ?? findPrForBranch;
  const wtExists = args.worktreeExists ?? worktreeExists;
  const targets: ReviewTarget[] = [];
  const skipped: { number: number; reason: string }[] = [];
  for (const issue of args.issues) {
    const paths = pathsForIssue(args.repoRoot, issue.number, issue.title);
    const pr = findPr(paths.branch);
    if (pr === null) {
      skipped.push({ number: issue.number, reason: `no PR for ${paths.branch}` });
      continue;
    }
    if (pr.state !== 'OPEN') {
      skipped.push({ number: issue.number, reason: `PR #${String(pr.number)} is ${pr.state}` });
      continue;
    }
    const reviewPaths = pathsForReview(
      args.repoRoot,
      pr.number,
      issue.number,
      issue.title,
      paths.branch,
    );
    if (wtExists(reviewPaths)) {
      skipped.push({
        number: issue.number,
        reason: `review worktree already exists at ${reviewPaths.worktreePath}`,
      });
      continue;
    }
    targets.push({ issue, branch: paths.branch, pr, reviewPaths });
  }
  return { targets, skipped };
}

export function printReviewPlan(args: {
  milestone: string;
  targets: readonly ReviewTarget[];
  skipped: readonly { number: number; reason: string }[];
  parallel: number;
}): void {
  process.stdout.write(
    `\nOrders, Captain — review plan (milestone: ${args.milestone}, parallel: ${String(args.parallel)})\n`,
  );
  if (args.targets.length > 0) {
    process.stdout.write('  Review:\n');
    for (const target of args.targets) {
      process.stdout.write(
        `    PR #${String(target.pr.number)} for issue #${String(target.issue.number)} ${target.issue.title}\n`,
      );
    }
  }
  if (args.skipped.length > 0) {
    process.stdout.write('  Skip:\n');
    for (const s of args.skipped) {
      process.stdout.write(`    #${String(s.number)} (${s.reason})\n`);
    }
  }
  process.stdout.write('\n');
}

export function formatReviewControlHeader(args: {
  milestone: string;
  targets: readonly ReviewTarget[];
  skipped: readonly { number: number; reason: string }[];
  parallel: number;
}): string {
  const lines: string[] = [];
  lines.push(`klaus review @ ${new Date().toISOString()}`);
  lines.push(`milestone: ${args.milestone}`);
  lines.push(`parallel: ${String(args.parallel)}`);
  lines.push('');
  lines.push('review:');
  for (const target of args.targets) {
    lines.push(
      `  PR #${String(target.pr.number)} / issue #${String(target.issue.number)} ${target.issue.title}`,
    );
  }
  if (args.skipped.length > 0) {
    lines.push('skipped:');
    for (const s of args.skipped) lines.push(`  #${String(s.number)} (${s.reason})`);
  }
  lines.push('');
  lines.push('outcomes:');
  return `${lines.join('\n')}\n`;
}

function confirmAtTty(prompt: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(/^y(es)?$/i.test(answer.trim()));
    });
  });
}

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}
