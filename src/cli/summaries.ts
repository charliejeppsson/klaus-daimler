import type { ImplementerWorkflowOutcome } from '../workflows/implement/workflow.js';
import type { ReviewerWorkflowOutcome } from '../workflows/review/workflow.js';

export function printImplementerSummary(result: ImplementerWorkflowOutcome): void {
  const ran = result.ranIssues.length;
  const opened = result.ranIssues.filter((r) => r.outcome === 'pr-opened').length;
  const abandoned = result.ranIssues.filter((r) => r.outcome === 'abandoned').length;
  process.stdout.write(
    `\nKlaus reporting, Captain: ${String(ran)} dispatched (${String(opened)} pr-opened, ${String(abandoned)} abandoned), ${String(result.skipped.length)} skipped, ${String(result.blocked.length)} blocked, ${String(result.errors.length)} errored.\n`,
  );
  if (result.errors.length > 0) {
    process.stdout.write('Errors:\n');
    for (const e of result.errors) {
      process.stdout.write(`  #${String(e.number)}: ${e.message}\n`);
    }
  }
}

export function printReviewSummary(result: ReviewerWorkflowOutcome): void {
  process.stdout.write(
    `\nKlaus reporting, Captain: ${String(result.reviewed.length)} review-posted, ${String(result.abandoned.length)} abandoned, ${String(result.skipped.length)} skipped, ${String(result.errors.length)} errored.\n`,
  );
  if (result.errors.length > 0) {
    process.stdout.write('Errors:\n');
    for (const e of result.errors) {
      process.stdout.write(
        `  PR #${String(e.prNumber)} / issue #${String(e.issueNumber)}: ${e.message}\n`,
      );
    }
  }
}
