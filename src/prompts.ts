import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type PromptInputs = Readonly<{
  issueNumber: number;
  issueTitle: string;
  issueBody: string;
  conventions: string;
  branch: string;
}>;

export type ReviewPromptInputs = Readonly<{
  issueNumber: number;
  issueTitle: string;
  issueBody: string;
  prNumber: number;
  prTitle: string;
  prBody: string;
  prUrl: string;
  branch: string;
  baseBranch: string;
  reviewPayloadPath: string;
  conventions: string;
}>;

export function findPromptsDir(startFile: string): string {
  let dir = path.dirname(startFile);
  while (true) {
    const candidate = path.join(dir, 'prompts');
    if (existsSync(path.join(candidate, 'implementer.md'))) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(`klaus: could not locate prompts/ directory starting from ${startFile}`);
    }
    dir = parent;
  }
}

const PROMPTS_DIR = findPromptsDir(fileURLToPath(import.meta.url));

const IMPLEMENT_TEMPLATE_PATH = path.join(PROMPTS_DIR, 'implementer.md');
const REVIEW_TEMPLATE_PATH = path.join(PROMPTS_DIR, 'reviewer.md');

export async function buildImplementerPrompt(inputs: PromptInputs): Promise<string> {
  const template = await readFile(IMPLEMENT_TEMPLATE_PATH, 'utf8');
  return renderTemplate(template, inputs);
}

export async function buildReviewPrompt(inputs: ReviewPromptInputs): Promise<string> {
  const template = await readFile(REVIEW_TEMPLATE_PATH, 'utf8');
  return renderReviewTemplate(template, inputs);
}

export function renderTemplate(template: string, inputs: PromptInputs): string {
  return template
    .replaceAll('{{ISSUE_NUMBER}}', () => String(inputs.issueNumber))
    .replaceAll('{{ISSUE_TITLE}}', () => inputs.issueTitle)
    .replaceAll('{{ISSUE_BODY}}', () => inputs.issueBody)
    .replaceAll('{{CONVENTIONS}}', () => inputs.conventions)
    .replaceAll('{{BRANCH}}', () => inputs.branch);
}

export function renderReviewTemplate(template: string, inputs: ReviewPromptInputs): string {
  return template
    .replaceAll('{{ISSUE_NUMBER}}', () => String(inputs.issueNumber))
    .replaceAll('{{ISSUE_TITLE}}', () => inputs.issueTitle)
    .replaceAll('{{ISSUE_BODY}}', () => inputs.issueBody)
    .replaceAll('{{PR_NUMBER}}', () => String(inputs.prNumber))
    .replaceAll('{{PR_TITLE}}', () => inputs.prTitle)
    .replaceAll('{{PR_BODY}}', () => inputs.prBody)
    .replaceAll('{{PR_URL}}', () => inputs.prUrl)
    .replaceAll('{{BRANCH}}', () => inputs.branch)
    .replaceAll('{{BASE_BRANCH}}', () => inputs.baseBranch)
    .replaceAll('{{REVIEW_PAYLOAD_PATH}}', () => inputs.reviewPayloadPath)
    .replaceAll('{{CONVENTIONS}}', () => inputs.conventions);
}
