export type Release = () => void;

export type Semaphore = Readonly<{
  acquire: () => Promise<Release>;
}>;

export function createSemaphore(max: number): Semaphore {
  if (!Number.isInteger(max) || max < 1) {
    throw new Error(`semaphore: max must be a positive integer, got ${String(max)}`);
  }

  let inFlight = 0;
  const waiters: (() => void)[] = [];

  const release: Release = () => {
    inFlight -= 1;
    const next = waiters.shift();
    if (next !== undefined) next();
  };

  const acquire = async (): Promise<Release> => {
    if (inFlight < max) {
      inFlight += 1;
      return release;
    }
    await new Promise<void>((resolve) => waiters.push(resolve));
    inFlight += 1;
    return release;
  };

  return { acquire };
}
