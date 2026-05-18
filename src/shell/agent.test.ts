import { describe, expect, it } from 'vitest';

import {
  buildCodingAgentPromptCommand,
  codingAgentTranscriptHint,
  parseCodingAgent,
} from './agent.js';

describe('parseCodingAgent', () => {
  it('accepts supported coding agents', () => {
    expect(parseCodingAgent('claude')).toBe('claude');
    expect(parseCodingAgent('codex')).toBe('codex');
  });

  it('rejects unsupported coding agents', () => {
    expect(parseCodingAgent('cursor')).toBeNull();
  });
});

describe('buildCodingAgentPromptCommand', () => {
  it('builds the Claude prompt command', () => {
    expect(
      buildCodingAgentPromptCommand({
        agent: 'claude',
        promptPath: "/repo/.klaus/runs/issue-1's.prompt.md",
      }),
    ).toBe(`claude "$(cat '/repo/.klaus/runs/issue-1'\\''s.prompt.md')"`);
  });

  it('builds the Codex prompt command without the alternate screen', () => {
    expect(
      buildCodingAgentPromptCommand({
        agent: 'codex',
        promptPath: '/repo/.klaus/runs/issue-1.prompt.md',
      }),
    ).toBe(`codex --no-alt-screen "$(cat '/repo/.klaus/runs/issue-1.prompt.md')"`);
  });
});

describe('codingAgentTranscriptHint', () => {
  it('returns Claude transcript paths for Claude', () => {
    expect(
      codingAgentTranscriptHint({
        agent: 'claude',
        worktreePath: '/repo/.klaus/worktrees/issue-1-example',
        homeDir: '/home/user',
      }),
    ).toBe('/home/user/.claude/projects/-repo-.klaus-worktrees-issue-1-example/<session>.jsonl');
  });

  it('does not claim a stable Codex transcript path', () => {
    expect(
      codingAgentTranscriptHint({
        agent: 'codex',
        worktreePath: '/repo/.klaus/worktrees/issue-1-example',
        homeDir: '/home/user',
      }),
    ).toBeNull();
  });
});
