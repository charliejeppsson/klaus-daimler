export type Blocker = Readonly<{
  number: number;
  soft: boolean;
}>;

export type IssueRef = Readonly<{
  number: number;
  title: string;
  body: string;
}>;

export type BlockedIssue = Readonly<{
  issue: IssueRef;
  waitingOn: readonly number[];
}>;

export type Plan = Readonly<{
  ordered: readonly IssueRef[];
  blocked: readonly BlockedIssue[];
}>;

const HEADING_RE = /^##\s+Blocked\s+by\s*$/im;
const NEXT_HEADING_RE = /\n##\s/m;
const BLOCKER_RE = /#(\d+)(\s*\(soft\))?/gi;

export function parseBlockedBy(body: string): readonly Blocker[] {
  const heading = HEADING_RE.exec(body);
  if (heading === null) return [];

  const start = heading.index + heading[0].length;
  const rest = body.slice(start);
  const next = NEXT_HEADING_RE.exec(rest);
  const section = next === null ? rest : rest.slice(0, next.index);

  const seen = new Map<number, boolean>();
  for (const m of section.matchAll(BLOCKER_RE)) {
    const numRaw = m[1];
    if (numRaw === undefined) continue;
    const number = Number.parseInt(numRaw, 10);
    const soft = m[2] !== undefined;
    const prior = seen.get(number);
    if (prior === undefined) {
      seen.set(number, soft);
      continue;
    }
    if (prior && !soft) seen.set(number, false);
  }
  return [...seen.entries()].map(([number, soft]) => ({ number, soft }));
}

export function buildHardBlockerMap(
  issues: readonly IssueRef[],
  isClosed: (issueNumber: number) => boolean,
): ReadonlyMap<number, ReadonlySet<number>> {
  const candidates = new Set(issues.map((i) => i.number));
  const map = new Map<number, Set<number>>();
  for (const issue of issues) {
    const pending = new Set<number>();
    for (const b of parseBlockedBy(issue.body)) {
      if (b.soft) continue;
      if (!candidates.has(b.number)) continue;
      if (isClosed(b.number)) continue;
      pending.add(b.number);
    }
    if (pending.size > 0) map.set(issue.number, pending);
  }
  return map;
}

export function planSequential(
  issues: readonly IssueRef[],
  isClosed: (issueNumber: number) => boolean,
): Plan {
  const candidates = new Map(issues.map((i) => [i.number, i]));
  const blocked: BlockedIssue[] = [];
  const runnable: IssueRef[] = [];
  const hardEdges = new Map<number, Set<number>>();
  const softEdges = new Map<number, Set<number>>();

  for (const issue of issues) {
    const blockers = parseBlockedBy(issue.body);
    const hard = blockers.filter((b) => !b.soft);
    const soft = blockers.filter((b) => b.soft);

    const unsatisfied = hard.filter((b) => !isClosed(b.number) && !candidates.has(b.number));
    if (unsatisfied.length > 0) {
      blocked.push({ issue, waitingOn: unsatisfied.map((b) => b.number) });
      continue;
    }

    runnable.push(issue);
    addPendingEdges(hardEdges, issue.number, hard, candidates, isClosed);
    addPendingEdges(softEdges, issue.number, soft, candidates, isClosed);
  }

  const remaining = new Set(runnable.map((i) => i.number));
  const ordered: IssueRef[] = [];
  while (remaining.size > 0) {
    const ready: number[] = [];
    for (const n of remaining) {
      const inc = hardEdges.get(n);
      const allEmitted = inc === undefined || [...inc].every((b) => !remaining.has(b));
      if (allEmitted) ready.push(n);
    }
    if (ready.length === 0) {
      const cycle = [...remaining].sort((a, b) => a - b).join(', ');
      throw new Error(`scheduler: hard-blocker cycle detected among issues ${cycle}`);
    }
    ready.sort((a, b) => {
      const sa = countPendingSoft(a, softEdges, remaining);
      const sb = countPendingSoft(b, softEdges, remaining);
      if (sa !== sb) return sa - sb;
      return a - b;
    });
    const pick = ready[0];
    if (pick === undefined) throw new Error('scheduler: unreachable');
    const issue = candidates.get(pick);
    if (issue === undefined) throw new Error('scheduler: unreachable');
    ordered.push(issue);
    remaining.delete(pick);
  }

  blocked.sort((a, b) => a.issue.number - b.issue.number);
  return { ordered, blocked };
}

function addPendingEdges(
  edges: Map<number, Set<number>>,
  dependent: number,
  blockers: readonly Blocker[],
  candidates: ReadonlyMap<number, IssueRef>,
  isClosed: (n: number) => boolean,
): void {
  for (const b of blockers) {
    if (!candidates.has(b.number)) continue;
    if (isClosed(b.number)) continue;
    const set = edges.get(dependent) ?? new Set<number>();
    set.add(b.number);
    edges.set(dependent, set);
  }
}

function countPendingSoft(
  dependent: number,
  softEdges: ReadonlyMap<number, ReadonlySet<number>>,
  remaining: ReadonlySet<number>,
): number {
  const inc = softEdges.get(dependent);
  if (inc === undefined) return 0;
  let count = 0;
  for (const b of inc) if (remaining.has(b)) count += 1;
  return count;
}
