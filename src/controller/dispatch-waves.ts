import { createSemaphore } from './semaphore.js';
import type { IssueRef } from './scheduler.js';

type RunResult<TOutcome extends string> =
  | { kind: 'ok'; outcome: TOutcome }
  | { kind: 'error'; message: string };

export async function dispatchWaves<TOutcome extends string>(args: {
  issues: readonly IssueRef[];
  blockerMap: ReadonlyMap<number, ReadonlySet<number>>;
  parallel: number;
  onStart: (issue: IssueRef) => void;
  runOne: (issue: IssueRef) => Promise<TOutcome>;
  onFinish: (issue: IssueRef, result: RunResult<TOutcome>) => Promise<void>;
}): Promise<{
  ranIssues: { number: number; outcome: TOutcome }[];
  errors: { number: number; message: string }[];
}> {
  const sem = createSemaphore(args.parallel);
  const completed = new Set<number>();
  const dispatched = new Set<number>();
  const ranIssues: { number: number; outcome: TOutcome }[] = [];
  const errors: { number: number; message: string }[] = [];

  let active = 0;
  let resolveAll!: () => void;
  const allDone = new Promise<void>((resolve) => {
    resolveAll = resolve;
  });

  const tryDispatch = (): void => {
    for (const issue of args.issues) {
      if (dispatched.has(issue.number)) continue;
      const blockers = args.blockerMap.get(issue.number);
      const ready = blockers === undefined || [...blockers].every((b) => completed.has(b));
      if (!ready) continue;
      dispatched.add(issue.number);
      active += 1;
      void (async () => {
        const release = await sem.acquire();
        let result: RunResult<TOutcome>;
        try {
          args.onStart(issue);
          const outcome = await args.runOne(issue);
          result = { kind: 'ok', outcome };
          ranIssues.push({ number: issue.number, outcome });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          result = { kind: 'error', message };
          errors.push({ number: issue.number, message });
        } finally {
          completed.add(issue.number);
          release();
        }
        await args.onFinish(issue, result);
        active -= 1;
        tryDispatch();
        if (active === 0) resolveAll();
      })();
    }
  };

  tryDispatch();
  if (active === 0) resolveAll();
  await allDone;
  return { ranIssues, errors };
}
