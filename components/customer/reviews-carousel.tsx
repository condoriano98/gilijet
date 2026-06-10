"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { HomeReview } from "@/lib/home-data";

const MONTHS_ID = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

export function ReviewsCarousel({ reviews }: { reviews: HomeReview[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (paused || reducedMotion || reviews.length <= 1) return;
    const id = setInterval(
      () => setIndex((i) => (i + 1) % reviews.length),
      6000,
    );
    return () => clearInterval(id);
  }, [paused, reducedMotion, reviews.length]);

  if (reviews.length === 0) return null;

  if (reducedMotion) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {reviews.slice(0, 3).map((r) => (
          <ReviewCard key={r.id} review={r} />
        ))}
      </div>
    );
  }

  const current = reviews[index]!;
  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="mx-auto max-w-3xl">
        <ReviewCard review={current} />
      </div>
      {reviews.length > 1 && (
        <div className="mt-4 flex justify-center gap-2">
          {reviews.map((r, i) => (
            <button
              key={r.id}
              type="button"
              onClick={() => {
                setIndex(i);
                setPaused(true);
              }}
              className={`h-2 rounded-full transition-all ${
                i === index ? "w-6 bg-gilijet-deep" : "w-2 bg-slate-300 hover:bg-slate-400"
              }`}
              aria-label={`Show review ${i + 1} of ${reviews.length}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ReviewCard({ review }: { review: HomeReview }) {
  const date = new Date(review.createdAt);
  const monthYear = `${MONTHS_ID[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
  return (
    <Card className="border-slate-200">
      <CardContent className="pt-6">
        <div className="flex items-center justify-between gap-3">
          <Stars rating={review.rating} />
          <Badge variant="outline" className="text-xs">
            {review.origin} → {review.destination}
          </Badge>
        </div>
        <blockquote className="mt-3 text-sm leading-relaxed text-slate-700 line-clamp-4">
          “{review.text}”
        </blockquote>
        <div className="mt-3 text-xs text-slate-500">
          — {review.customerFirstName}, {monthYear}
        </div>
      </CardContent>
    </Card>
  );
}

function Stars({ rating }: { rating: number }) {
  const r = Math.max(0, Math.min(5, rating));
  return (
    <div
      aria-label={`Rated ${r} out of 5`}
      className="text-base text-amber-500"
    >
      {"★".repeat(r)}
      <span className="text-slate-200">{"★".repeat(5 - r)}</span>
    </div>
  );
}
