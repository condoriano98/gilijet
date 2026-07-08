import type { PostMeta } from "../index";

export const meta: PostMeta = {
  slug: "choosing-fast-boat-bali-gili",
  title: "How to choose a fast boat from Bali to Gili Islands",
  description:
    "Speedboat vs. cabin catamaran, departure port trade-offs, and the questions every traveler should ask before booking the Bali → Gili crossing.",
  publishedAt: "2026-06-18",
  author: "Tim Gilibali",
  readingMinutes: 6,
  tags: ["Bali", "Gili", "Fast boat", "Travel guide"],
};

export default function ChoosingFastBoatBaliGili() {
  return (
    <article className="prose-content">
      <p className="lead">
        The Bali to Gili Islands crossing is one of the most-trafficked sea
        routes in Indonesia — and one of the most variable. Same destination,
        same hour, three different operators, three different experiences. This
        guide walks through what actually matters when you pick.
      </p>

      <h2>The three departure ports — and why they differ</h2>
      <p>
        Most fast boats leave Bali from one of three ports: Padang Bai,
        Serangan, or Amed. Each has a different sea exposure and total travel
        time.
      </p>
      <ul>
        <li>
          <strong>Padang Bai</strong> — the workhorse. Most departures, most
          competitive pricing, ~1h 30m crossing in calm conditions. Exposed to
          the Lombok Strait so swell can be felt mid-route.
        </li>
        <li>
          <strong>Serangan</strong> — south Bali, closer to the airport and
          Seminyak. Longer crossing (~2h) but the route hugs the south coast
          before turning, which can be calmer in dry season.
        </li>
        <li>
          <strong>Amed</strong> — northeast Bali. Shortest crossing distance
          (~45 min) but limited departures and operators.
        </li>
      </ul>

      <h2>Speedboat vs. cabin catamaran</h2>
      <p>
        The same route is sold by very different vessels. A flat-bottomed
        open speedboat carries 30 passengers and feels every wave. A
        twin-hull cabin catamaran carries 80, has air-conditioned seating, and
        cuts swell by ~60%.
      </p>
      <p>
        On a calm-sea day the difference is irrelevant. On a 1.5m swell day it
        is the entire experience. If anyone in your group is seasick-prone or
        you are traveling with infants, pay the catamaran premium — usually
        IDR 50,000–100,000 more per passenger.
      </p>

      <h2>Questions to ask before booking</h2>
      <ol>
        <li>What is the boat's hull class — speedboat, catamaran, or ferry?</li>
        <li>How many passengers does it carry at capacity?</li>
        <li>Is there a covered cabin with air conditioning?</li>
        <li>Are life jackets KSOP-compliant (look for the safety badge)?</li>
        <li>What is the cancellation and weather-refund policy?</li>
      </ol>

      <h2>What seasoned travelers actually do</h2>
      <p>
        Local crew matters more than brand. The captain is usually
        owner-operator, knows the strait, and decides whether to push through
        chop or wait an hour. Ratings tied to the operator (not just the boat
        name) tell you more than glossy marketing photos.
      </p>

      <h2>One last check</h2>
      <p>
        Look at the sea conditions for your departure date — wave height and
        wind. A 0.5m morning crossing and a 1.8m afternoon crossing on the same
        route are different products. If your dates are flexible, choosing the
        calmer slot will dwarf any boat-class difference.
      </p>
    </article>
  );
}
