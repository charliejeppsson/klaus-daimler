import { describe, expect, it } from 'vitest';

import { createSemaphore } from './semaphore.js';

describe('createSemaphore', () => {
  it('rejects non-positive max values', () => {
    expect(() => createSemaphore(0)).toThrow(/positive integer/);
    expect(() => createSemaphore(-1)).toThrow(/positive integer/);
    expect(() => createSemaphore(1.5)).toThrow(/positive integer/);
  });

  it('caps concurrent in-flight work at max', async () => {
    const sem = createSemaphore(2);
    const order: string[] = [];
    let active = 0;
    let peak = 0;

    const job = (label: string) => async () => {
      const release = await sem.acquire();
      active += 1;
      peak = Math.max(peak, active);
      order.push(`start:${label}`);
      await new Promise((r) => setTimeout(r, 5));
      order.push(`end:${label}`);
      active -= 1;
      release();
    };

    await Promise.all([job('a')(), job('b')(), job('c')(), job('d')()]);

    expect(peak).toBe(2);
    expect(order.filter((s) => s.startsWith('start:'))).toHaveLength(4);
  });

  it('hands a slot to the next waiter on release', async () => {
    const sem = createSemaphore(1);
    const release1 = await sem.acquire();

    let acquired = false;
    const second = sem.acquire().then(() => {
      acquired = true;
    });

    await new Promise((r) => setTimeout(r, 5));
    expect(acquired).toBe(false);

    release1();
    await second;
    expect(acquired).toBe(true);
  });
});
