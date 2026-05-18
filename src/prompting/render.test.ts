import { describe, expect, it } from 'vitest';

import path from 'node:path';

import { findPromptsDir, renderReviewTemplate, renderTemplate } from './render.js';

describe('findPromptsDir', () => {
  it('finds the root prompts directory from a nested source path', () => {
    const nestedSourcePath = path.join(process.cwd(), 'src', 'prompting', 'render.ts');

    expect(findPromptsDir(nestedSourcePath)).toBe(path.join(process.cwd(), 'prompts'));
  });
});

describe('renderTemplate', () => {
  it('substitutes every placeholder with its input value', () => {
    const template = [
      '# Task: Issue #{{ISSUE_NUMBER}} — {{ISSUE_TITLE}}',
      '{{ISSUE_BODY}}',
      'branch={{BRANCH}}',
      '---',
      '{{CONVENTIONS}}',
      '---',
      'closes #{{ISSUE_NUMBER}}',
    ].join('\n');

    const out = renderTemplate(template, {
      issueNumber: 42,
      issueTitle: 'Fix the thing',
      issueBody: 'Body text\nover two lines.',
      conventions: 'CONVENTIONS_CONTENT',
      branch: 'agent/issue-42',
    });

    expect(out).toContain('# Task: Issue #42 — Fix the thing');
    expect(out).toContain('Body text\nover two lines.');
    expect(out).toContain('branch=agent/issue-42');
    expect(out).toContain('CONVENTIONS_CONTENT');
    expect(out).toContain('closes #42');
    expect(out).not.toContain('{{');
  });

  it('does not interpret regex specials in input values', () => {
    const out = renderTemplate('{{ISSUE_BODY}}', {
      issueNumber: 1,
      issueTitle: 't',
      issueBody: '$&\\1{{ISSUE_NUMBER}}',
      conventions: 'c',
      branch: 'b',
    });
    expect(out).toBe('$&\\1{{ISSUE_NUMBER}}');
  });
});

describe('renderReviewTemplate', () => {
  it('substitutes review placeholders with PR and issue context', () => {
    const template = [
      'PR #{{PR_NUMBER}} {{PR_TITLE}}',
      '{{PR_BODY}}',
      '{{PR_URL}}',
      '{{BASE_BRANCH}} <- {{BRANCH}}',
      'Issue #{{ISSUE_NUMBER}} {{ISSUE_TITLE}}',
      '{{ISSUE_BODY}}',
      '{{REVIEW_PAYLOAD_PATH}}',
      '{{CONVENTIONS}}',
    ].join('\n');

    const out = renderReviewTemplate(template, {
      issueNumber: 7,
      issueTitle: 'Add review bot',
      issueBody: 'Issue body',
      prNumber: 44,
      prTitle: 'Review command',
      prBody: 'PR body',
      prUrl: 'https://github.com/example/repo/pull/44',
      branch: 'agent/issue-7-add-review-bot',
      baseBranch: 'main',
      reviewPayloadPath: '/repo/.klaus/runs/review-pr-44.json',
      conventions: 'CONVENTIONS',
    });

    expect(out).toContain('PR #44 Review command');
    expect(out).toContain('https://github.com/example/repo/pull/44');
    expect(out).toContain('main <- agent/issue-7-add-review-bot');
    expect(out).toContain('Issue #7 Add review bot');
    expect(out).toContain('/repo/.klaus/runs/review-pr-44.json');
    expect(out).toContain('CONVENTIONS');
    expect(out).not.toContain('{{');
  });

  it('renders the review prompt as an interactive gh api review task', () => {
    const template = [
      'Run `gh pr view {{PR_NUMBER}} --json title,body,files,commits,comments,reviews,statusCheckRollup`.',
      'Run `gh pr diff {{PR_NUMBER}}`.',
      'Read existing PR comments and reviews from `gh pr view`.',
      'Write payload to `{{REVIEW_PAYLOAD_PATH}}`.',
      '`"event": "COMMENT"`.',
      '`body` must identify itself in the first line as `Klaus agent review`.',
      'Include a `PR discussion` section in the body.',
      'Include at most 10 inline comments.',
      'Submit `gh api --method POST repos/{owner}/{repo}/pulls/{{PR_NUMBER}}/reviews --input {{REVIEW_PAYLOAD_PATH}}`.',
      'Do not use `gh pr review`.',
      'Do not use an API payload with `"event": "APPROVE"`.',
      'Do not use an API payload with `"event": "REQUEST_CHANGES"`.',
      'Do not commit.',
      '{{CONVENTIONS}}',
    ].join('\n');

    const out = renderReviewTemplate(template, {
      issueNumber: 7,
      issueTitle: 'Add review bot',
      issueBody: 'Issue body',
      prNumber: 44,
      prTitle: 'Review command',
      prBody: 'PR body',
      prUrl: 'https://github.com/example/repo/pull/44',
      branch: 'agent/issue-7-add-review-bot',
      baseBranch: 'main',
      reviewPayloadPath: '/tmp/review.json',
      conventions: 'CONVENTIONS',
    });

    expect(out).toContain(
      'gh pr view 44 --json title,body,files,commits,comments,reviews,statusCheckRollup',
    );
    expect(out).toContain('gh pr diff 44');
    expect(out).toContain('Read existing PR comments and reviews from `gh pr view`.');
    expect(out).toContain('/tmp/review.json');
    expect(out).toContain('"event": "COMMENT"');
    expect(out).toContain('Klaus agent review');
    expect(out).toContain('Include a `PR discussion` section in the body.');
    expect(out).toContain('at most 10 inline comments');
    expect(out).toContain(
      'gh api --method POST repos/{owner}/{repo}/pulls/44/reviews --input /tmp/review.json',
    );
    expect(out).toContain('Do not use `gh pr review`.');
    expect(out).toContain('Do not use an API payload with `"event": "APPROVE"`.');
    expect(out).toContain('Do not use an API payload with `"event": "REQUEST_CHANGES"`.');
    expect(out).toContain('Do not commit.');
  });
});
