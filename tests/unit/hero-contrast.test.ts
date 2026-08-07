import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * The hero slogan and subtitle are white text over a pale illustration. Measured
 * against the rendered page, the previous scrim left them at 1.17:1 — WCAG AA
 * body text needs 4.5:1 — because it was `from-black/20 via-transparent` and
 * Tailwind puts `via` at 50%, so everything below the midpoint had no scrim at
 * all. That is invisible in code review and only shows up on a phone in
 * daylight, so the two properties that fix it are asserted here.
 */
describe("hero copy stays legible over the illustration", () => {
  const source = readFileSync(
    new URL("../../app/(customer)/[locale]/page.tsx", import.meta.url),
    "utf8",
  );
  const hero = source.slice(0, source.indexOf("Wave divider"));

  it("keeps the scrim opaque past the middle, where the subtitle sits", () => {
    const gradient = hero.match(/linear-gradient\(to_bottom,([^)]*\)[^\]]*)\]/)?.[1];
    expect(gradient, "hero scrim is no longer a linear-gradient").toBeTruthy();

    // Every colour stop that still has opacity, with the position it sits at.
    const stops = [...gradient!.matchAll(/rgba\([^)]*,\s*([\d.]+)\)_(\d+)%/g)].map(
      (m) => ({ alpha: Number(m[1]), at: Number(m[2]) }),
    );
    expect(stops.length).toBeGreaterThanOrEqual(3);

    const lastOpaque = Math.max(
      ...stops.filter((s) => s.alpha >= 0.5).map((s) => s.at),
    );
    // The copy block ends around two thirds down the hero.
    expect(lastOpaque).toBeGreaterThanOrEqual(60);
  });

  it("releases the scrim before the bottom third, so the boat stays bright", () => {
    const gradient = hero.match(/linear-gradient\(to_bottom,([^)]*\)[^\]]*)\]/)?.[1] ?? "";
    const clear = [...gradient.matchAll(/rgba\([^)]*,\s*0\)_(\d+)%/g)].map((m) =>
      Number(m[1]),
    );
    // Hull and water already exceed 4.5:1 unaided; darkening them buys nothing
    // and costs the best part of the artwork.
    expect(Math.min(...clear)).toBeLessThanOrEqual(85);
  });

  it("renders the subtitle in solid white, not a dimmed variant", () => {
    const subtitle = hero.match(/<p className="([^"]*heroSubtitle[^"]*)"|<p className="([^"]*)">\s*\{t\("home\.heroSubtitle"\)/);
    const classes = subtitle?.[1] ?? subtitle?.[2] ?? "";
    expect(classes).toContain("text-white");
    // text-white/90 made the value proposition lower contrast than the heading.
    expect(classes).not.toMatch(/text-white\/\d/);
  });
});
