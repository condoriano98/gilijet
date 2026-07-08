import type { PostMeta } from "../index";

export const meta: PostMeta = {
  slug: "best-season-cross-lombok",
  title: "The best season to cross from Bali to Lombok by boat",
  description:
    "Wave height, wind patterns, and crossing reliability month-by-month so you can pick a date that avoids cancellations and rough seas.",
  publishedAt: "2026-06-12",
  author: "Tim Gilibali",
  readingMinutes: 5,
  tags: ["Lombok", "Sea conditions", "Travel planning"],
};

export default function BestSeasonCrossLombok() {
  return (
    <article className="prose-content">
      <p className="lead">
        Sea conditions in the Lombok Strait swing dramatically across the year.
        The same crossing that takes 90 minutes in calm August can be cancelled
        outright in February. Here is what to expect month by month.
      </p>

      <h2>Dry season — May through October</h2>
      <p>
        Trade winds blow from the southeast, the strait is generally calm in
        the morning, and afternoon swell rarely exceeds 1.2m. This is the
        booking sweet spot.
      </p>
      <ul>
        <li>
          <strong>July–August:</strong> peak season; book operators 2 weeks
          ahead. Sea conditions are reliably calm, with morning crossings
          almost glassy.
        </li>
        <li>
          <strong>May–June, September:</strong> shoulder months with the same
          calm seas but lower fares and less crowded boats.
        </li>
      </ul>

      <h2>Wet season — November through March</h2>
      <p>
        Northwest monsoon brings swell, lightning storms, and weather-related
        cancellations. Some operators suspend service for days at a stretch.
      </p>
      <ul>
        <li>
          <strong>December–February:</strong> highest cancellation risk.
          Always travel with at least one buffer day before any onward flight.
        </li>
        <li>
          <strong>November, March:</strong> transitional months. Calm days
          exist but are unpredictable.
        </li>
      </ul>

      <h2>April — the wildcard</h2>
      <p>
        April starts the dry season but residual swell from March often
        lingers. Bookings are cheap, but check the 7-day sea forecast before
        committing.
      </p>

      <h2>How to read the conditions</h2>
      <p>
        Wave height in meters is the single number that matters. A simple
        rule of thumb:
      </p>
      <ul>
        <li><strong>&lt; 0.6m</strong> — calm. Any boat class is comfortable.</li>
        <li><strong>0.6–1.2m</strong> — light chop. Catamarans are noticeably smoother.</li>
        <li><strong>1.2–1.8m</strong> — choppy. Avoid open speedboats if you're seasick-prone.</li>
        <li><strong>&gt; 1.8m</strong> — rough. Many operators delay; some cancel.</li>
      </ul>

      <h2>Booking strategy</h2>
      <p>
        If your dates are firm, pick the earliest morning departure — winds
        build during the day, so morning swell is almost always lower than
        afternoon. If your dates are flexible, watch the forecast for a day
        with sustained &lt;1m waves and book that slot.
      </p>
    </article>
  );
}
