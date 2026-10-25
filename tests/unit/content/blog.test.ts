import { describe, it, expect } from 'vitest';
import { POSTS, findPost, getAllSlugs } from '@/content/blog';

describe('blog registry', () => {
  it('has unique slugs and lists the newest post first', () => {
    const slugs = getAllSlugs();
    expect(new Set(slugs).size).toBe(slugs.length);
    const dates = POSTS.map((p) => p.meta.publishedAt);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it('registers the Wahana Virendra check-in guide', () => {
    const post = findPost('wahana-virendra-checkin-guide');
    expect(post).toBeDefined();
    expect(post!.meta.title).toMatch(/check in/i);
    expect(post!.meta.description.length).toBeGreaterThan(50);
    expect(post!.meta.tags).toContain('Check-in');
  });
});
