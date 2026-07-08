import type { PostMeta } from "../index";

export const meta: PostMeta = {
  slug: "seasickness-on-the-crossing",
  title: "Seasickness on the Bali-Gili crossing: what works, what doesn't",
  description:
    "Practical, no-nonsense advice for staying comfortable on a 90-minute fast-boat crossing — from where to sit to what to take before you board.",
  publishedAt: "2026-06-05",
  author: "Tim Gilibali",
  readingMinutes: 4,
  tags: ["Seasickness", "Travel tips", "Comfort"],
};

export default function SeasicknessOnTheCrossing() {
  return (
    <article className="prose-content">
      <p className="lead">
        A 90-minute crossing in 1.5m swell is not a trivial trip if you've never
        been on a small boat at sea. The good news: most seasickness on this
        route is preventable with simple choices made before you board.
      </p>

      <h2>Where to sit</h2>
      <p>
        The smoothest spot on a speedboat is the middle of the cabin, low and
        central, near the boat's pivot point. Avoid the very front (pounding
        slams) and the very back (engine fumes plus diesel smell). On a
        catamaran the cabin is much more uniform, but the middle row is still
        marginally smoother.
      </p>

      <h2>Before you board</h2>
      <ul>
        <li>
          <strong>Eat something light, not nothing.</strong> An empty stomach
          handles motion worse than a moderate one. Plain rice or crackers
          work well; greasy fried food does not.
        </li>
        <li>
          <strong>Avoid coffee on a rough-sea morning.</strong> Caffeine on an
          irritated stomach is a recipe for problems.
        </li>
        <li>
          <strong>Take medication 30 minutes ahead.</strong> Dimenhydrinate
          (Dramamine, Antimo in Indonesia) or scopolamine patches are both
          effective. If you've never tried them, do a test dose at home first.
        </li>
        <li>
          <strong>Hydrate.</strong> Dehydration amplifies motion sickness. Bring
          a water bottle.
        </li>
      </ul>

      <h2>During the crossing</h2>
      <ul>
        <li>
          Look at the horizon, not your phone. Reading is the fastest way to
          make seasickness worse.
        </li>
        <li>
          If you start feeling queasy, get fresh air if you can do so safely.
          Wind on your face plus the horizon resets the inner ear faster than
          anything else.
        </li>
        <li>
          Sip water. Don't try to power through with food.
        </li>
      </ul>

      <h2>What doesn't actually work</h2>
      <p>
        Ginger candies, sea bands, and pressure-point bracelets have mixed
        evidence behind them. They might help you psychologically, but they
        aren't substitutes for the right seat plus a real medication if you're
        prone.
      </p>

      <h2>If conditions look rough</h2>
      <p>
        Check the sea forecast for your day. If wave height is over 1.5m and
        you know you're sensitive, consider rebooking to an earlier morning
        slot (calmer) or a catamaran on the same date. The price difference is
        smaller than the misery difference.
      </p>
    </article>
  );
}
