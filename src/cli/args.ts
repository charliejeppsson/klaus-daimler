import { TMUX_SESSION } from '../shell/tmux.js';

export type KlausCommand = 'implement' | 'review';

export type MilestoneWorkflowArgs = Readonly<{
  command: KlausCommand;
  milestone: string;
  skipPlanConfirmation: boolean;
  parallel: number;
}>;

export type ParsedArgs = MilestoneWorkflowArgs;

const USAGE = `Usage:
  klaus implement --milestone <name> [--parallel N] [--skip-plan-confirmation]
  klaus review --milestone <name> [--parallel N] [--skip-plan-confirmation]

  --parallel N:                 dispatch up to N agents concurrently (default 1).
                                Implementer and reviewer workflows boot a tmux
                                session '${TMUX_SESSION}' and auto-attach, even when N = 1.
  --skip-plan-confirmation:     skip the interactive "Set sail, Captain? [y/N]"
                                confirmation shown after the plan is printed.
`;

export function parseArgs(argv: readonly string[]): ParsedArgs {
  const [command, ...rest] = argv;
  if (command === 'implement') return parseMilestoneWorkflowArgs('klaus implement', command, rest);
  if (command === 'review') return parseMilestoneWorkflowArgs('klaus review', command, rest);
  process.stderr.write(USAGE);
  process.exit(2);
}

function parseMilestoneWorkflowArgs(
  commandName: string,
  command: KlausCommand,
  rest: readonly string[],
): MilestoneWorkflowArgs {
  let milestone: string | undefined;
  let skipPlanConfirmation = false;
  let parallel = 1;
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (arg === '--milestone') {
      const value = rest[i + 1];
      if (value === undefined || value.startsWith('--')) {
        process.stderr.write(`${commandName}: --milestone requires a value\n${USAGE}`);
        process.exit(2);
      }
      milestone = value;
      i += 1;
      continue;
    }
    if (arg === '--parallel') {
      const value = rest[i + 1];
      if (value === undefined || value.startsWith('--')) {
        process.stderr.write(`${commandName}: --parallel requires a positive integer\n${USAGE}`);
        process.exit(2);
      }
      const parsed = Number.parseInt(value, 10);
      if (!Number.isInteger(parsed) || parsed < 1 || String(parsed) !== value) {
        process.stderr.write(
          `${commandName}: --parallel must be a positive integer (got '${value}')\n`,
        );
        process.exit(2);
      }
      parallel = parsed;
      i += 1;
      continue;
    }
    if (arg === '--skip-plan-confirmation') {
      skipPlanConfirmation = true;
      continue;
    }
    process.stderr.write(`${commandName}: unknown arg '${arg ?? ''}'\n${USAGE}`);
    process.exit(2);
  }
  if (milestone === undefined) {
    process.stderr.write(`${commandName}: --milestone <name> is required\n${USAGE}`);
    process.exit(2);
  }
  return { command, milestone, skipPlanConfirmation, parallel };
}
