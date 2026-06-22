import type { ComponentType } from "react";

export type PostMeta = {
  slug: string;
  title: string;
  description: string;
  publishedAt: string; // ISO date string, e.g. "2026-06-15"
  author: string;
  readingMinutes: number;
  tags: string[];
  /** Optional override; defaults to root opengraph-image */
  ogImage?: string;
};

export type Post = {
  meta: PostMeta;
  Body: ComponentType;
};

import * as choosingFastBoat from "./posts/choosing-fast-boat-bali-gili";
import * as bestSeason from "./posts/best-season-cross-lombok";
import * as seasicknessTips from "./posts/seasickness-on-the-crossing";

const MODULES = [choosingFastBoat, bestSeason, seasicknessTips] as const;

export const POSTS: Post[] = MODULES.map((m) => ({
  meta: m.meta,
  Body: m.default,
})).sort((a, b) => b.meta.publishedAt.localeCompare(a.meta.publishedAt));

export function findPost(slug: string): Post | undefined {
  return POSTS.find((p) => p.meta.slug === slug);
}

export function getAllSlugs(): string[] {
  return POSTS.map((p) => p.meta.slug);
}
