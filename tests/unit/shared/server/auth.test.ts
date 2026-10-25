import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, operatorScope } from '@/shared/server/auth';

/**
 * Unit tests for src/shared/server/auth.ts
 *
 * Tests password hashing, verification, and operator scoping.
 * Session/cookie/redirect tests are covered by E2E tests due to Next.js context complexity.
 */

describe('hashPassword & verifyPassword', () => {
  it('hashes a password and verification succeeds', async () => {
    const plain = 'MyS3cur3P@ssw0rd!';
    const hash = await hashPassword(plain);

    expect(hash).not.toBe(plain);
    expect(hash).toHaveLength(60); // bcryptjs hash length

    const isValid = await verifyPassword(plain, hash);
    expect(isValid).toBe(true);
  });

  it('verification fails with wrong password', async () => {
    const correct = 'CorrectPassword123!';
    const wrong = 'WrongPassword123!';
    const hash = await hashPassword(correct);

    const isValid = await verifyPassword(wrong, hash);
    expect(isValid).toBe(false);
  });

  it('produces different hashes for the same password (different salts)', async () => {
    const plain = 'SamePassword';
    const hash1 = await hashPassword(plain);
    const hash2 = await hashPassword(plain);

    expect(hash1).not.toBe(hash2);
    expect(await verifyPassword(plain, hash1)).toBe(true);
    expect(await verifyPassword(plain, hash2)).toBe(true);
  });

  it('handles empty password', async () => {
    const hash = await hashPassword('');
    const isValid = await verifyPassword('', hash);
    expect(isValid).toBe(true);
  });

  it('verification fails with corrupted hash', async () => {
    const plain = 'TestPassword';
    const badHash = 'not-a-valid-bcrypt-hash-$2y$12$corrupted';

    const result = await verifyPassword(plain, badHash);
    expect(result).toBe(false);
  });

  it('handles long passwords', async () => {
    const longPassword = 'a'.repeat(1000);
    const hash = await hashPassword(longPassword);
    const isValid = await verifyPassword(longPassword, hash);
    expect(isValid).toBe(true);
  });

  it('rejects wrong password even if similar', async () => {
    const correct = 'Password123!';
    const similar = 'Password124!'; // Off by 1 character
    const hash = await hashPassword(correct);

    const isValid = await verifyPassword(similar, hash);
    expect(isValid).toBe(false);
  });

  it('handles special characters in password', async () => {
    const specialPassword = '!@#$%^&*()_+-=[]{}|;:,.<>?';
    const hash = await hashPassword(specialPassword);
    const isValid = await verifyPassword(specialPassword, hash);
    expect(isValid).toBe(true);
  });

  it('handles unicode characters in password', async () => {
    const unicodePassword = 'Пароль密码🔐';
    const hash = await hashPassword(unicodePassword);
    const isValid = await verifyPassword(unicodePassword, hash);
    expect(isValid).toBe(true);
  });

  it('is case-sensitive', async () => {
    const lowercase = 'password123';
    const uppercase = 'PASSWORD123';
    const hash = await hashPassword(lowercase);

    const isValidLower = await verifyPassword(lowercase, hash);
    const isValidUpper = await verifyPassword(uppercase, hash);

    expect(isValidLower).toBe(true);
    expect(isValidUpper).toBe(false);
  });

  it('hash is not reversible', async () => {
    const plain = 'SecretPassword';
    const hash = await hashPassword(plain);

    // Hash should not contain original password
    expect(hash).not.toContain(plain);
    expect(hash).not.toContain(plain.toLowerCase());
  });
});

describe('operatorScope', () => {
  it('returns operatorId in where clause object', () => {
    const session = {
      sub: 'op-123',
      role: 'operator' as const,
      email: 'operator@example.com',
    };

    const scope = operatorScope(session);
    expect(scope).toEqual({ operatorId: 'op-123' });
  });

  it('extracts correct operatorId from session', () => {
    const session = {
      sub: 'op-xyz-789',
      role: 'operator' as const,
      email: 'test@example.com',
    };

    const scope = operatorScope(session);
    expect(scope.operatorId).toBe('op-xyz-789');
  });

  it('returns object with only operatorId property', () => {
    const session = {
      sub: 'op-999',
      role: 'operator' as const,
      email: 'email@example.com',
    };

    const scope = operatorScope(session);
    expect(Object.keys(scope)).toEqual(['operatorId']);
    expect(Object.keys(scope).length).toBe(1);
  });

  it('handles different operatorId formats', () => {
    const ids = ['op-1', 'OP-ABC-XYZ-123', 'operator_id_001', 'uuid-like-format'];

    for (const id of ids) {
      const session = {
        sub: id,
        role: 'operator' as const,
        email: 'test@example.com',
      };

      const scope = operatorScope(session);
      expect(scope.operatorId).toBe(id);
    }
  });

  it('is a pure function (same input = same output)', () => {
    const session = {
      sub: 'op-pure-test',
      role: 'operator' as const,
      email: 'test@example.com',
    };

    const result1 = operatorScope(session);
    const result2 = operatorScope(session);

    expect(result1).toEqual(result2);
  });
});

describe('Password hashing security', () => {
  it('different passwords produce different hashes', async () => {
    const pwd1 = 'password1';
    const pwd2 = 'password2';

    const hash1 = await hashPassword(pwd1);
    const hash2 = await hashPassword(pwd2);

    expect(hash1).not.toBe(hash2);
  });

  it('same password with different runs produces different hashes', async () => {
    const pwd = 'test-password';

    const hashes = await Promise.all([
      hashPassword(pwd),
      hashPassword(pwd),
      hashPassword(pwd),
    ]);

    // All should be different (different salts)
    const uniqueHashes = new Set(hashes);
    expect(uniqueHashes.size).toBe(3);

    // But all should verify against same password
    for (const hash of hashes) {
      const isValid = await verifyPassword(pwd, hash);
      expect(isValid).toBe(true);
    }
  });

  it('handles whitespace in passwords', async () => {
    const pwdWithSpace = 'pass word';
    const pwdWithTab = 'pass\tword';
    const pwdWithNewline = 'pass\nword';

    const hash1 = await hashPassword(pwdWithSpace);
    const hash2 = await hashPassword(pwdWithTab);
    const hash3 = await hashPassword(pwdWithNewline);

    expect(await verifyPassword(pwdWithSpace, hash1)).toBe(true);
    expect(await verifyPassword(pwdWithTab, hash2)).toBe(true);
    expect(await verifyPassword(pwdWithNewline, hash3)).toBe(true);

    // Different passwords should not verify with other hashes
    expect(await verifyPassword(pwdWithSpace, hash2)).toBe(false);
    expect(await verifyPassword(pwdWithTab, hash3)).toBe(false);
  });
});
