import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

import { confirmAtTty } from '../../controller/confirmation.js';
import { readConventions } from '../../controller/conventions.js';
import { dispatchWaves } from '../../controller/dispatch-waves.js';
import {
  buildHardBlockerMap,
  parseBlockedBy,
  planSequential,
  type BlockedIssue,
  type IssueRef,
} from '../../controller/scheduler.js';
import {
  createWorktree,
  deleteLocalBranch,
  pathsForIssue,
  removeWorktree,
  worktreeExists,
} from '../../shell/git.js';
import {
  NEEDS_INFO,
  READY_FOR_AGENT,
  ensureReadyForReviewLabel,
  fetchIssue,
  fetchIssueState,
  findPrForBranch,
  flipIssueToReadyForReview,
  listMergedAgentPrs,
  listMilestoneIssues,
} from '../../shell/github.js';
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
} from '../../shell/tmux.js';
import { buildImplementerPrompt } from '../../prompting/render.js';

export type ImplementerTargetOutcome = 'pr-opened' | 'abandoned';

export type RunImplementerWorkflowOptions = Readonly<{
  milestone: string;
  repoRoot: string;
  runDir: string;
  skipPlanConfirmation: boolean;
  parallel: number;
  session: string;
  agentsWindow: string;
}>;

export type ImplementerWorkflowOutcome = Readonly<{
  ranIssues: readonly { number: number; outcome: ImplementerTargetOutcome }[];
  errors: readonly { number: number; message: string }[];
  skipped: readonly { number: number; reason: string }[];
  blocked: readonly { number: number; waitingOn: readonly number[] }[];
}>;

export async function runImplementerWorkflow(
  options: RunImplementerWorkflowOptions,
): Promise<ImplementerWorkflowOutcome> {
  const { milestone, repoRoot, runDir, skipPlanConfirmation, parallel, session, agentsWindow } =
    options;
  if (!Number.isInteger(parallel) || parallel < 1) {
    throw new Error(
      `runImplementerWorkflow: parallel must be a positive integer, got ${String(parallel)}`,
    );
  }

  process.stdout.write(
    `Spyglass up, Captain — scanning the horizon for ready issues in milestone '${milestone}'...\n`,
  );
  cleanupMergedWorktrees(repoRoot);

  const issues = listMilestoneIssues(milestone, READY_FOR_AGENT);
  if (issues.length === 0) {
    process.stdout.write(
      `Captain — no issues in milestone '${milestone}' with label '${READY_FOR_AGENT}'.\n`,
    );
    return { ranIssues: [], errors: [], skipped: [], blocked: [] };
  }

  const refs: IssueRef[] = issues.map((i) => ({
    number: i.number,
    title: i.title,
    body: i.body,
  }));
  const closedBlockers = resolveExternalBlockerStates(refs, new Set(issues.map((i) => i.number)));
  const plan = planSequential(refs, (n) => closedBlockers.has(n));
  const labelsByNumber = new Map(
    issues.map((i) => [i.number, new Set(i.labels.map((l) => l.name))]),
  );
  const dispatch: IssueRef[] = [];
  const skipped: { number: number; reason: string }[] = [];

  for (const issue of plan.ordered) {
    const labels = labelsByNumber.get(issue.number);
    if (labels?.has(NEEDS_INFO) === true) {
      skipped.push({ number: issue.number, reason: `${NEEDS_INFO} label` });
      continue;
    }
    const paths = pathsForIssue(repoRoot, issue.number, issue.title);
    const pr = findPrForBranch(paths.branch);
    if (pr !== null && pr.state === 'OPEN') {
      skipped.push({ number: issue.number, reason: `open PR #${String(pr.number)}` });
      continue;
    }
    dispatch.push(issue);
  }

  printImplementerPlan({ milestone, dispatch, skipped, blocked: plan.blocked, parallel });

  if (dispatch.length === 0) {
    process.stdout.write('Captain — nothing to dispatch.\n');
    return {
      ranIssues: [],
      errors: [],
      skipped,
      blocked: plan.blocked.map((b) => ({ number: b.issue.number, waitingOn: b.waitingOn })),
    };
  }

  if (!skipPlanConfirmation) {
    const proceed = await confirmAtTty('Set sail, Captain? [y/N] ');
    if (!proceed) {
      process.stdout.write('Aye, Captain. Standing down.\n');
      return {
        ranIssues: [],
        errors: [],
        skipped,
        blocked: plan.blocked.map((b) => ({ number: b.issue.number, waitingOn: b.waitingOn })),
      };
    }
  }

  await mkdir(runDir, { recursive: true });
  const controlLogPath = path.join(runDir, 'implementer-control.log');
  await writeFile(
    controlLogPath,
    formatImplementerControlHeader({
      milestone,
      dispatch,
      skipped,
      blocked: plan.blocked,
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

  const blockerMap = buildHardBlockerMap(dispatch, (n) => closedBlockers.has(n));
  const { ranIssues, errors } = await dispatchWaves({
    issues: dispatch,
    blockerMap,
    parallel,
    onStart: (issue) => {
      process.stdout.write(
        `\n=== klaus: implementing #${String(issue.number)} ${issue.title} ===\n`,
      );
    },
    runOne: (issue) =>
      runImplementerTarget({
        issueNumber: issue.number,
        repoRoot,
        runDir,
        session,
      }),
    onFinish: async (issue, result) => {
      if (result.kind === 'ok') {
        await appendFile(controlLogPath, `#${String(issue.number)} -> ${result.outcome}\n`, 'utf8');
        return;
      }
      process.stderr.write(`klaus: #${String(issue.number)} failed: ${result.message}\n`);
      await appendFile(
        controlLogPath,
        `#${String(issue.number)} -> ERROR: ${result.message}\n`,
        'utf8',
      );
    },
  });

  return {
    ranIssues,
    errors,
    skipped,
    blocked: plan.blocked.map((b) => ({ number: b.issue.number, waitingOn: b.waitingOn })),
  };
}

async function runImplementerTarget(args: {
  readonly issueNumber: number;
  readonly repoRoot: string;
  readonly runDir: string;
  readonly session: string;
}): Promise<ImplementerTargetOutcome> {
  const { issueNumber, repoRoot, runDir, session } = args;
  const issue = fetchIssue(issueNumber);
  if (issue.state !== 'OPEN') {
    throw new Error(`Issue #${String(issueNumber)} is ${issue.state}; refusing to run.`);
  }

  const paths = pathsForIssue(repoRoot, issueNumber, issue.title);
  if (worktreeExists(paths)) {
    throw new Error(`Worktree already exists at ${paths.worktreePath}.`);
  }

  createWorktree(repoRoot, paths);
  ensureReadyForReviewLabel();

  const conventions = await readConventions(repoRoot);
  const prompt = await buildImplementerPrompt({
    issueNumber: issue.number,
    issueTitle: issue.title,
    issueBody: issue.body,
    conventions,
    branch: paths.branch,
  });

  const promptPath = path.join(runDir, `issue-${String(issueNumber)}.prompt.md`);
  await mkdir(runDir, { recursive: true });
  await writeFile(promptPath, prompt, 'utf8');

  const transcriptDir = path.join(
    homedir(),
    '.claude',
    'projects',
    paths.worktreePath.replaceAll('/', '-'),
  );

  process.stdout.write(
    `\n-> launching implementer in ${path.relative(repoRoot, paths.worktreePath)} (branch ${paths.branch})\n` +
      `  prompt: ${path.relative(repoRoot, promptPath)}\n` +
      `  tmux: session '${session}', pane 'i-${String(issueNumber)}'\n` +
      `  transcript: ${transcriptDir}/<session>.jsonl\n\n`,
  );

  await runImplementerClaudeInTmux({
    session,
    issueNumber,
    branch: paths.branch,
    cwd: paths.worktreePath,
    promptPath,
  });

  const pr = findPrForBranch(paths.branch);
  if (pr === null) {
    process.stdout.write(
      `\n<- implementer exited without opening a PR for ${paths.branch} (abandoned).\n`,
    );
    return 'abandoned';
  }
  process.stdout.write(`\n<- PR #${String(pr.number)} (${pr.state}): ${pr.url}\n`);
  try {
    removeWorktree(repoRoot, paths);
    process.stdout.write(
      `klaus: cleaned up worktree for PR #${String(pr.number)} (${paths.branch})\n`,
    );
  } catch (err) {
    process.stderr.write(
      `klaus: failed to clean up worktree ${paths.worktreePath}: ${err instanceof Error ? err.message : String(err)}\n`,
    );
  }
  return 'pr-opened';
}

function runImplementerClaudeInTmux(args: {
  session: string;
  issueNumber: number;
  branch: string;
  cwd: string;
  promptPath: string;
}): Promise<void> {
  const { session, issueNumber, branch, cwd, promptPath } = args;
  const channel = `klaus-issue-${String(issueNumber)}`;
  const paneTitle = `i-${String(issueNumber)}`;

  const command =
    `env KLAUS=1 ` +
    `KLAUS_ISSUE=${shellQuote(String(issueNumber))} ` +
    `KLAUS_BRANCH=${shellQuote(branch)} ` +
    `KLAUS_PANE_TITLE=${shellQuote(paneTitle)} ` +
    `KLAUS_RUN_DIR=${shellQuote(path.dirname(promptPath))} ` +
    `KLAUS_TMUX_PANE="$(tmux display-message -p '#{pane_id}')" ` +
    `claude "$(cat ${shellQuote(promptPath)})"; ` +
    `tmux wait-for -S ${channel}; exec zsh`;

  const paneId = newAgentPane({
    session,
    windowName: AGENTS_WINDOW,
    paneTitle,
    cwd,
    command,
  });

  return new Promise((resolve) => {
    let resolved = false;
    let detected = false;

    const finish = (): void => {
      if (resolved) return;
      resolved = true;
      clearInterval(poll);
      resolve();
    };

    waitFor(channel)
      .then(() => {
        if (detected) {
          killPane(paneId);
          retileAgents(session, AGENTS_WINDOW);
        }
        finish();
      })
      .catch((err: unknown) => {
        process.stderr.write(
          `klaus: tmux wait-for ${channel} failed: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        finish();
      });

    const poll = setInterval(() => {
      if (detected || resolved) return;
      try {
        const pr = findPrForBranch(branch);
        if (pr === null) return;
        detected = true;
        process.stdout.write(
          `\n→ PR #${String(pr.number)} detected for #${String(issueNumber)}; flipping label and closing tmux pane\n`,
        );
        flipIssueToReadyForReview(issueNumber);
        sendKeys(paneId, 'C-c');
        setTimeout(() => {
          if (resolved) return;
          killPane(paneId);
          retileAgents(session, AGENTS_WINDOW);
          signalChannel(channel);
          finish();
        }, SIGTERM_GRACE_MS).unref();
      } catch (err) {
        process.stderr.write(
          `klaus: poll error for #${String(issueNumber)} (continuing): ${err instanceof Error ? err.message : String(err)}\n`,
        );
      }
    }, POLL_INTERVAL_MS);
  });
}

function resolveExternalBlockerStates(
  issues: readonly IssueRef[],
  candidates: ReadonlySet<number>,
): ReadonlySet<number> {
  const referenced = new Set<number>();
  for (const issue of issues) {
    for (const blocker of parseBlockedBy(issue.body)) referenced.add(blocker.number);
  }
  const closed = new Set<number>();
  for (const n of referenced) {
    if (candidates.has(n)) continue;
    if (fetchIssueState(n) === 'CLOSED') closed.add(n);
  }
  return closed;
}

export function printImplementerPlan(args: {
  milestone: string;
  dispatch: readonly IssueRef[];
  skipped: readonly { number: number; reason: string }[];
  blocked: readonly BlockedIssue[];
  parallel: number;
}): void {
  process.stdout.write(
    `\nImplement plan (milestone: ${args.milestone}, parallel: ${String(args.parallel)})\n`,
  );
  if (args.dispatch.length > 0) {
    process.stdout.write('  Dispatch order:\n');
    for (const issue of args.dispatch) {
      process.stdout.write(`    #${String(issue.number)} ${issue.title}\n`);
    }
  }
  if (args.skipped.length > 0) {
    process.stdout.write('  Skip:\n');
    for (const s of args.skipped) {
      process.stdout.write(`    #${String(s.number)} (${s.reason})\n`);
    }
  }
  if (args.blocked.length > 0) {
    process.stdout.write('  Blocked (hard blockers still open):\n');
    for (const b of args.blocked) {
      const waits = b.waitingOn.map((n) => `#${String(n)}`).join(', ');
      process.stdout.write(`    #${String(b.issue.number)} → waiting on ${waits}\n`);
    }
  }
  process.stdout.write('\n');
}

export function formatImplementerControlHeader(args: {
  milestone: string;
  dispatch: readonly IssueRef[];
  skipped: readonly { number: number; reason: string }[];
  blocked: readonly BlockedIssue[];
  parallel: number;
}): string {
  const lines: string[] = [];
  lines.push(`klaus implementer @ ${new Date().toISOString()}`);
  lines.push(`milestone: ${args.milestone}`);
  lines.push(`parallel: ${String(args.parallel)}`);
  lines.push('');
  lines.push('dispatch:');
  for (const i of args.dispatch) lines.push(`  #${String(i.number)} ${i.title}`);
  if (args.skipped.length > 0) {
    lines.push('skipped:');
    for (const s of args.skipped) lines.push(`  #${String(s.number)} (${s.reason})`);
  }
  if (args.blocked.length > 0) {
    lines.push('blocked:');
    for (const b of args.blocked) {
      const waits = b.waitingOn.map((n) => `#${String(n)}`).join(', ');
      lines.push(`  #${String(b.issue.number)} waiting on ${waits}`);
    }
  }
  lines.push('');
  lines.push('outcomes:');
  return `${lines.join('\n')}\n`;
}

function cleanupMergedWorktrees(repoRoot: string): void {
  const merged = listMergedAgentPrs();
  for (const pr of merged) {
    const suffix = pr.branch.replace(/^agent\//, '');
    const paths = {
      worktreePath: `${repoRoot.replace(/\/+$/g, '')}/.klaus/worktrees/${suffix}`,
      branch: pr.branch,
    };
    if (worktreeExists(paths)) {
      try {
        removeWorktree(repoRoot, paths);
        process.stdout.write(
          `klaus: cleaned up worktree for merged PR #${String(pr.number)} (${pr.branch})\n`,
        );
      } catch (err) {
        process.stderr.write(
          `klaus: failed to remove worktree ${paths.worktreePath}: ${err instanceof Error ? err.message : String(err)}\n`,
        );
      }
      continue;
    }
    deleteLocalBranch(repoRoot, pr.branch);
  }
}

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}
