import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ after: vi.fn() }));
vi.mock('next/server', () => ({ after: mocks.after }));

import { afterResponse } from '@/shared/server/after-response';

describe('afterResponse', () => {
  beforeEach(() => {
    mocks.after.mockReset();
  });

  it('hands the promise to next/server after() so the function stays alive', () => {
    const work = Promise.resolve();
    afterResponse(work);
    expect(mocks.after).toHaveBeenCalledWith(work);
  });

  it('does not throw outside a request scope', () => {
    mocks.after.mockImplementation(() => {
      throw new Error('`after` was called outside a request scope');
    });
    let result = 'returned';
    try {
      afterResponse(Promise.resolve());
    } catch {
      result = 'threw';
    }
    expect(result).toBe('returned');
  });
});
