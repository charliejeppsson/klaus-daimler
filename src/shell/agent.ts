import path from 'node:path';

export type CodingAgent = 'claude' | 'codex';

export const DEFAULT_CODING_AGENT: CodingAgent = 'claude';

export function parseCodingAgent(value: string): CodingAgent | null {
  if (value === 'claude' || value === 'codex') return value;
  return null;
}

export function buildCodingAgentPromptCommand(args: {
  readonly agent: CodingAgent;
  readonly promptPath: string;
}): string {
  const promptArg = `"$(cat ${shellQuote(args.promptPath)})"`;
  if (args.agent === 'codex') return `codex --no-alt-screen ${promptArg}`;
  return `claude ${promptArg}`;
}

export function codingAgentTranscriptHint(args: {
  readonly agent: CodingAgent;
  readonly worktreePath: string;
  readonly homeDir: string;
}): string | null {
  if (args.agent !== 'claude') return null;
  const transcriptDir = path.join(
    args.homeDir,
    '.claude',
    'projects',
    args.worktreePath.replaceAll('/', '-'),
  );
  return `${transcriptDir}/<session>.jsonl`;
}

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}
