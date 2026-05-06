export interface KlausConfig {
  conventionsPath: string | null;
  labels: {
    readyForAgent: string;
    needsInfo: string;
    readyForReview: string;
    reviewedByAgent: string;
  };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): KlausConfig {
  return {
    conventionsPath: env.KLAUS_CONVENTIONS_PATH ?? null,
    labels: {
      readyForAgent:   env.KLAUS_LABEL_READY_FOR_AGENT   ?? 'ready-for-agent',
      needsInfo:       env.KLAUS_LABEL_NEEDS_INFO        ?? 'needs-info',
      readyForReview:  env.KLAUS_LABEL_READY_FOR_REVIEW  ?? 'ready-for-review',
      reviewedByAgent: env.KLAUS_LABEL_REVIEWED_BY_AGENT ?? 'reviewed-by-agent',
    },
  };
}
