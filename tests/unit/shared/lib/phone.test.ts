import { describe, it, expect } from 'vitest';
import { phoneKey } from '@/shared/lib/phone';

describe('phoneKey', () => {
  it('keeps the digits only', () => {
    expect(phoneKey('+62 812-3456-7890')).toBe('6281234567890');
  });

  it('reads the trunk 0 typed after +62 as the same line', () => {
    expect(phoneKey('+620812 3456 7890')).toBe(phoneKey('+62 812 3456 7890'));
  });

  it('keeps a foreign number apart from an Indonesian one', () => {
    expect(phoneKey('+44 7911 123456')).toBe('447911123456');
  });

  it('is empty for nothing', () => {
    expect(phoneKey(null)).toBe('');
    expect(phoneKey(undefined)).toBe('');
    expect(phoneKey('')).toBe('');
  });
});
