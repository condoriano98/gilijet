import Link from 'next/link';
import type { ReactNode } from 'react';
import type { PostMeta } from '../index';

export const meta: PostMeta = {
  slug: 'wahana-virendra-checkin-guide',
  title: 'Where to check in for Wahana Virendra fast boats: a harbour-by-harbour guide',
  description:
    'First time on a fast boat? Exactly where to go for Wahana Virendra check-in at Sanur, Nusa Penida, Padang Bai, Gili Trawangan, Gili Air, Senggigi and Bangsal, plus the harbour tax at each.',
  publishedAt: '2026-10-24',
  author: 'Tim Gilifast',
  readingMinutes: 7,
  tags: ['Check-in', 'Wahana Virendra', 'Harbours', 'Travel tips'],
};

type Harbour = {
  region: string;
  name: string;
  sublabel: string;
  mapUrl: string;
  landmarkIcon: string;
  landmark: ReactNode;
  story: string;
  tips: string[];
  todo: ReactNode;
  taxTitle: string;
  ticketTag?: { label: string; kind: 'thermal' | 'paper' };
  taxItems: ReactNode[];
  taxNote: string;
};

const HARBOURS: Harbour[] = [
  {
    region: 'Bali',
    name: 'Sanur Beach Harbour',
    sublabel: 'Main Bali departure for Gili Islands & Lombok',
    mapUrl: 'https://maps.app.goo.gl/u2V9aQ3f7SAMTW2o6',
    landmarkIcon: '🏪',
    landmark: (
      <>
        Head directly to the <strong>Sanur Harbour area</strong>, not just the beach. The Wahana
        Virendra check-in counter is at the <strong>teras (terrace) next to Circle K</strong>,
        right at the harbour strip.
      </>
    ),
    story:
      "Sanur is where it all starts, and it's one of the better-run departure harbours in the region. The strip is well organised: operators in their designated spots, porters who know their routes, and enough warungs nearby for a pre-departure coffee. Busy in the early mornings, but busy in a way that moves. One important thing: Sanur has a long beachfront with several access points. Make sure you head to the Sanur Harbour area specifically. Once you're there, find the Circle K; the Wahana Virendra counter is right on the terrace beside it.",
    tips: [
      '⚠️ Go to Sanur Harbour, not just any beach access',
      '🏪 Look for Circle K: the counter is on the teras next to it',
      '🌅 Busiest 7–9am',
      '🧳 Luggage tag given at counter',
    ],
    todo: (
      <>
        <strong>What to do:</strong> Show your e-ticket (printed or on phone) at the Wahana
        Virendra counter beside Circle K. They&apos;ll issue a boarding pass and weigh luggage for
        the hold. Keep your boarding pass: crew check it at the boat ramp.
      </>
    ),
    taxTitle: 'Harbour tax / Retribution Dock · JettyPass: pay at the counter',
    taxItems: [
      <>
        To <strong>Nusa Penida (Banjar Nyuh)</strong>: <strong>IDR 10,000</strong> per person
      </>,
      <>
        To <strong>Gili Islands or Lombok</strong> (Bangsal / Senggigi): <strong>IDR 25,000</strong>{' '}
        per person
      </>,
    ],
    taxNote: '💵 Cash only · Pay at the check-in counter when presenting your e-ticket',
  },
  {
    region: 'Nusa Islands',
    name: 'Nusa Penida · Banjar Nyuh',
    sublabel: 'Also known as Toyapakeh Harbour: departures to Bali & Lombok',
    mapUrl: 'https://maps.app.goo.gl/pqkSXVDRUcdADM7B9',
    landmarkIcon: '⚓',
    landmark: (
      <>
        Located at <strong>Banjar Nyuh</strong>, commonly listed as <strong>Toyapakeh</strong> on
        maps and boat schedules. Both names refer to the same harbour. Multiple operators share
        this jetty and it&apos;s well-organised.
      </>
    ),
    story:
      "After two days of chasing Kelingking Beach and Crystal Bay on a scooter, you'll be heading out from Nusa Penida tired but very happy. The departure point goes by two names: locals say Banjar Nyuh, most maps and boat schedules say Toyapakeh. Both mean the same place. It's tidier than you might expect: several fast boat operators have counters side by side, the signage is clear, and the strait view toward Bali while you wait is genuinely stunning.",
    tips: [
      '📍 Ask for "Toyapakeh" or "Banjar Nyuh Harbour"',
      '🏝️ Multiple operators: look for the Wahana sign',
      '⚠️ Road from Kelingking takes 45+ min',
      '🛺 Book transport the night before',
    ],
    todo: (
      <>
        <strong>What to do:</strong> Navigate to Toyapakeh / Banjar Nyuh harbour. Wahana&apos;s
        counter is in the operator row. If seas are choppy, crew may ask everyone to standby: stay
        near the counter and listen for your boat&apos;s call.
      </>
    ),
    taxTitle: 'Harbour tax / Retribution Dock · JettyPass',
    taxItems: [
      <>
        All departures from Nusa Penida (Banjar Nyuh): <strong>IDR 10,000</strong> per person
      </>,
    ],
    taxNote: '💵 Cash only · Pay at the check-in counter when presenting your e-ticket',
  },
  {
    region: 'Bali (East)',
    name: 'Padang Bai',
    sublabel: 'Eastern Bali fast boat point: shorter crossing to Lombok',
    mapUrl: 'https://maps.app.goo.gl/etT4LZGcTNQmuenYA',
    landmarkIcon: '🏢',
    landmark: (
      <>
        Look for the <strong>Wahana Virendra building</strong>. There is a proper plang
        (signboard) and building signage visible from the fast boat pier area. Very hard to miss.
      </>
    ),
    story:
      "Padang Bai has a split personality. There's the slow-ferry terminal at the top of the hill, which is for car ferries, not you. Then there's the fast boat side, tucked down by the small beach bay. Once you find the right area, Wahana Virendra has a proper building here with clear signage out front, a plang you can spot from a distance. One of the more straightforward check-ins on this whole route. The little bay is beautiful; arrive early to take it in.",
    tips: [
      '⚠️ Do NOT go to the slow ferry terminal',
      '🏢 Look for the Wahana Virendra building & plang',
      '🚕 Tell your driver "pelabuhan speedboat Padang Bai"',
      '🍜 Good warung for breakfast nearby',
    ],
    todo: (
      <>
        <strong>What to do:</strong> Direct your driver to <em>&quot;pelabuhan speedboat Padang
        Bai&quot;</em>, not just &quot;harbour&quot;, or they may drop you at the car ferry. The
        Wahana Virendra building has clearly visible signage. Check in there and wait near the pier
        for boarding.
      </>
    ),
    taxTitle: 'Harbour tax / Retribution Dock · JettyPass: pay at the counter',
    ticketTag: { label: 'Karcis paper ticket', kind: 'paper' },
    taxItems: [
      <>
        To <strong>Gili Trawangan</strong>: <strong>IDR 30,000</strong> per person
      </>,
      <>
        To <strong>Gili Air</strong>: <strong>IDR 30,000</strong> retribution +{' '}
        <strong>IDR 15,000</strong> small boat to ponton = <strong>IDR 45,000</strong> total
      </>,
      <>
        To <strong>Bangsal (Lombok)</strong>: <strong>IDR 10,000</strong> per person
      </>,
      <>
        To <strong>Senggigi (Lombok)</strong>: <strong>IDR 10,000</strong> per person
      </>,
    ],
    taxNote:
      '💵 Cash only · All fees paid at the Wahana Virendra counter · You will receive a paper karcis (ticket) as receipt',
  },
  {
    region: 'Gili Islands',
    name: 'Gili Trawangan',
    sublabel: 'Busiest island departure: back to Bali or onward to Lombok',
    mapUrl: 'https://maps.app.goo.gl/h5S216JGYMsAZABP8',
    landmarkIcon: '🌴',
    landmark: (
      <>
        Same location as <strong>Lolita Gili Cafe</strong>. The Wahana Virendra counter is here, in
        the operator row along the beachfront.
      </>
    ),
    story:
      "Gili T's harbour looks straight out of a travel magazine: turquoise water, horse carts clip-clopping past (no motorbikes on the island), and a whole row of fast boat counters facing the sea. It's the busiest departure point in the islands, with competing operators literally counter-to-counter. Make sure you find the Wahana Virendra desk specifically; it's at the same spot as Lolita Gili Cafe. Once you've checked in, note that the retribusi is collected separately at a dedicated gate before boarding. Don't miss it.",
    tips: [
      '🌴 Next to Lolita Gili Cafe: use it as your landmark',
      '🐴 Cidomo (horse cart) to the harbour',
      '⚠️ Retribution is paid at a dedicated gate, not at the counter',
      '📱 Signal is patchy: screenshot maps offline',
    ],
    todo: (
      <>
        <strong>What to do:</strong> No motorbikes on Gili T, so arrange a cidomo from your villa
        the night before. Head to Lolita Gili Cafe at the harbour beachfront; Wahana&apos;s counter
        is right there. After check-in, proceed to the dedicated{' '}
        <strong>retribution / harbour tax gate</strong> at the departure point to pay before
        boarding.
      </>
    ),
    taxTitle: 'Harbour tax / Retribution Dock · JettyPass: paid at a dedicated gate',
    ticketTag: { label: 'Thermal ticket printed', kind: 'thermal' },
    taxItems: [
      <>
        All departures from Gili Trawangan: <strong>IDR 25,000</strong> per person
      </>,
    ],
    taxNote:
      '💵 Cash only · Paid at the dedicated retribusi / harbour tax gate at the departure point, separate from the check-in counter · You will receive a printed thermal ticket as receipt',
  },
  {
    region: 'Gili Islands',
    name: 'Gili Air',
    sublabel: 'Quieter island: harbour area near the main departure point',
    mapUrl: 'https://maps.app.goo.gl/jNeveHmqLKXo49BL9',
    landmarkIcon: '⚓',
    landmark: (
      <>
        The departure area near the <strong>main harbour</strong>. The check-in counter may not be
        the most prominent thing you see, but the Maps pin takes you directly there. All operators
        on the island depart from this zone.
      </>
    ),
    story:
      "Gili Air is the quiet, grown-up sibling of Gili T. The check-in process here is calmer, more human, and genuinely easier. The counter area isn't visually loud, but all the fast boat operators on the island converge at this harbour zone, so just follow the Maps pin. Worth knowing: departing from Gili Air involves a small additional fee for the service boat that ferries you out to the ponton (floating pontoon), since the main boat anchors offshore. It's part of the process and the crew handles it smoothly.",
    tips: [
      '😌 Calmer and less crowded than Gili T',
      '🚤 Small boat to the ponton is included in the harbour fee',
      '🚶 Most villas are within walking distance',
      '📡 Save your ticket offline: signal is unreliable',
    ],
    todo: (
      <>
        <strong>What to do:</strong> Navigate to the Wahana counter using the Maps link. After
        check-in, you&apos;ll pay the retribusi and small boat service fee at the counter. You&apos;ll
        then be taken out to the boat by a small local boat, which is normal procedure on Gili Air.
        If in doubt at any point, ask any local and they&apos;ll be happy to help.
      </>
    ),
    taxTitle: 'Harbour tax / Retribution Dock · JettyPass: pay at the counter',
    ticketTag: { label: 'Thermal ticket printed', kind: 'thermal' },
    taxItems: [
      <>
        Retribusi / harbour tax: <strong>IDR 20,000</strong> per person
      </>,
      <>
        Small boat service to ponton: <strong>IDR 15,000</strong> per person
      </>,
      <>
        <strong>Total: IDR 35,000</strong> per person
      </>,
    ],
    taxNote:
      '💵 Cash only · Both fees paid together at the check-in counter · You will receive a printed thermal ticket as receipt',
  },
  {
    region: 'Lombok',
    name: 'Senggigi',
    sublabel: 'Lombok Senggigi Harbor: direct pier, multiple operators',
    mapUrl: 'https://maps.app.goo.gl/mpzToqS9uPA1RkPp6',
    landmarkIcon: '⛵',
    landmark: (
      <>
        Located <strong>right on the pier at Lombok Senggigi Harbor</strong>. Wahana
        Virendra&apos;s counter is here alongside other fast boat operators, directly at the
        water&apos;s edge.
      </>
    ),
    story:
      "Senggigi sits on Lombok's west coast, stretched along a coastal road lined with hotels and surf shops. Quieter than Bali, with genuinely good sunsets. The departure point is clean and organised: the Lombok Senggigi Harbor pier has multiple fast boat operators sharing the same jetty, Wahana included. You're checking in at the pier itself, right at the water. On a clear morning crossing you'll get views of Bali's Mount Agung rising purple on the horizon. Worth waking up early for.",
    tips: [
      '⛵ The counter is on the pier itself',
      '🌋 Agung views on clear crossing days',
      '🏨 Your hotel concierge can arrange a transfer',
      '🕖 Fewer morning services: check your schedule',
    ],
    todo: (
      <>
        <strong>What to do:</strong> Tell your hotel concierge the evening before; most can arrange
        a car. Navigate to Lombok Senggigi Harbor pier using the Maps link. Wahana Virendra is among
        the operator counters on the pier. Coastal traffic can back up in peak season, so allow
        extra time.
      </>
    ),
    taxTitle: 'Harbour tax / Retribution Dock · JettyPass: pay at the counter',
    taxItems: [
      <>
        All departures from Senggigi: <strong>IDR 10,000</strong> per person
      </>,
    ],
    taxNote: '💵 Cash only · Pay at the check-in counter when presenting your e-ticket',
  },
  {
    region: 'Lombok',
    name: 'Bangsal',
    sublabel: 'Gateway to the Gili Islands: at KOKONANA Lombok',
    mapUrl: 'https://maps.app.goo.gl/YFTvU46HFtiouDjW9',
    landmarkIcon: '🥥',
    landmark: (
      <>
        Located at <strong>KOKONANA Lombok</strong>. Use this as your primary landmark when
        navigating or asking locals for directions.
      </>
    ),
    story:
      "Bangsal is the real deal. A proper working fishing village that also happens to be the main fast boat gateway between Lombok and the Gili Islands. It's not polished: there are hawkers, horse carts waiting, and the smell of the sea is very present. But it's authentic, unpretentious, and genuinely memorable. The Wahana Virendra counter is at KOKONANA Lombok. Use that name when asking locals and you'll be pointed there without confusion.",
    tips: [
      '🥥 Landmark: KOKONANA Lombok',
      '💵 Bring small Rupiah: the harbour fee is paid at the counter',
      '⚠️ Ignore unofficial "helpers" outside the terminal',
      '🚕 Mataram taxis know this route well',
    ],
    todo: (
      <>
        <strong>What to do:</strong> If anyone approaches you outside the terminal offering to
        &quot;help with your ticket&quot;, they are not Wahana staff. Walk directly to the Wahana
        Virendra counter at KOKONANA Lombok. Pay the harbour retribusi at the counter when checking
        in. Present your e-ticket and collect your boarding stub.
      </>
    ),
    taxTitle: 'Harbour tax / Retribution Dock · JettyPass: pay at the counter',
    ticketTag: { label: 'Thermal ticket printed', kind: 'thermal' },
    taxItems: [
      <>
        All departures from Bangsal: <strong>IDR 10,000</strong> per person
      </>,
    ],
    taxNote:
      '💵 Cash only · Pay at the Wahana Virendra counter when checking in · You will receive a printed thermal ticket as receipt',
  },
];

const TIPS = [
  {
    emoji: '🎫',
    title: 'Save your ticket offline',
    body: "Screenshot your e-ticket or download the PDF. Harbours and jetties often have poor signal, so don't rely on loading your email at the counter.",
  },
  {
    emoji: '⏰',
    title: '30–45 minutes early',
    body: "The standard across all operators. Counters close before departure. If you're running late, WhatsApp the booking number on your ticket; don't just show up and hope.",
  },
  {
    emoji: '💴',
    title: 'Bring small Rupiah cash',
    body: 'Every harbour charges a Harbour Tax / Retribution Dock (JettyPass). Amounts vary by location, see each card above. Cash only, no card payment available. Amounts range from IDR 10,000–45,000 per person depending on your departure point.',
  },
  {
    emoji: '🗣️',
    title: "Ask a local: they'll love to help",
    body: "Stuck or unsure? Ask any warung owner, ojek driver, or person nearby. Locals know exactly where each boat operator's counter is and will happily show you the way.",
  },
  {
    emoji: '🎒',
    title: 'Bag into the hold',
    body: 'Large bags go in the luggage hold under the boat, not inside the cabin. Crew will take them at check-in. Keep valuables and anything you need during the crossing with you.',
  },
  {
    emoji: '🌊',
    title: 'Rough sea? Perfectly normal.',
    body: "Crossings can be choppy, especially July–August and during wet season (Nov–Mar). Take seasickness tablets 30 minutes before if you're prone. Sit in the middle of the boat for the smoothest ride.",
  },
];

const TICKET_TAG_CLASS = {
  thermal: 'bg-green-100 text-green-800',
  paper: 'bg-amber-100 text-amber-800',
} as const;

export default function WahanaVirendraCheckinGuide() {
  return (
    <article className="prose-content">
      <p className="lead">
        Fast boats in Bali have their own rhythm: each harbour has its own character, each operator
        has their own counter, and finding your boat is part of the journey. Your e-ticket tells
        you the departure harbour. This guide tells you <em>exactly where to walk</em> once you get
        there: which counter, what landmark to look for, and how early to show up.
      </p>

      <aside className="not-prose rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-slate-800">
        <p className="font-semibold text-amber-800">⏱ Arrive 30–45 minutes before departure</p>
        <p className="mt-1">
          Check-in counters close 15 minutes before departure. Fast boat operators can, and will,
          give away your seat if you&apos;re late. The boats don&apos;t wait. If you&apos;re running
          behind, WhatsApp the contact number on your e-ticket.
        </p>
      </aside>

      <aside className="rounded-xl border border-slate-200 bg-gilifast-foam/50 p-4 text-sm">
        <p className="font-semibold text-gilifast-deep">🧭 Part of the adventure</p>
        <p className="mt-1">
          Fast boat harbours have their own village-market energy: each operator has their own
          corner, the sea is right there, and local life happens all around you. It&apos;s a
          different kind of travel experience. Don&apos;t hesitate to ask a local if you&apos;re
          unsure; they will gladly point the way.
        </p>
      </aside>

      <h2>The 7 Wahana Virendra check-in points</h2>
      <p>
        PT Wahana Virendra Group check-in locations, with the harbour tax you pay at each one.
      </p>

      <div className="space-y-8">
        {HARBOURS.map((h, i) => (
          <section
            key={h.name}
            className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
          >
            <div className="flex items-stretch border-b border-slate-200">
              <div className="flex w-14 shrink-0 items-center justify-center bg-gilifast-deep text-2xl font-bold text-white">
                {i + 1}
              </div>
              <div className="flex-1 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-gilifast-ocean">
                  {h.region}
                </p>
                <h3 className="!mb-0 !mt-1 text-xl font-bold text-slate-900">{h.name}</h3>
                <p className="mt-1 text-xs text-slate-500">{h.sublabel}</p>
              </div>
            </div>

            <div className="space-y-4 p-4 sm:p-5">
              <div className="flex gap-2 rounded-lg border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-900">
                <span aria-hidden>{h.landmarkIcon}</span>
                <span>{h.landmark}</span>
              </div>

              <p className="text-sm italic text-slate-600">{h.story}</p>

              <ul className="flex !list-none flex-wrap gap-2 !pl-0">
                {h.tips.map((t) => (
                  <li
                    key={t}
                    className="!mt-0 rounded-full border border-slate-200 bg-gilifast-foam/60 px-3 py-1 text-xs font-medium text-gilifast-deep"
                  >
                    {t}
                  </li>
                ))}
              </ul>

              <p className="rounded-lg bg-slate-50 p-3 text-sm">{h.todo}</p>

              <div className="rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-900">
                <p className="text-xs font-semibold uppercase tracking-wide text-green-700">
                  💴 {h.taxTitle}
                  {h.ticketTag ? (
                    <span
                      className={`ml-2 rounded px-2 py-0.5 text-[11px] normal-case ${TICKET_TAG_CLASS[h.ticketTag.kind]}`}
                    >
                      {h.ticketTag.label}
                    </span>
                  ) : null}
                </p>
                <ul className="!mt-2 !pl-4">
                  {h.taxItems.map((item, j) => (
                    <li key={j}>{item}</li>
                  ))}
                </ul>
                <p className="mt-2 text-xs italic opacity-80">{h.taxNote}</p>
              </div>

              <a
                href={h.mapUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-gilifast-deep px-4 py-2 text-sm font-medium !text-white !no-underline hover:bg-gilifast-ocean"
              >
                📍 Check-in counter: open in Google Maps
              </a>
            </div>
          </section>
        ))}
      </div>

      <h2>Before you board: the short version</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {TIPS.map((t) => (
          <div key={t.title} className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
            <p className="font-semibold text-slate-900">
              <span aria-hidden>{t.emoji}</span> {t.title}
            </p>
            <p className="mt-1">{t.body}</p>
          </div>
        ))}
      </div>

      <p>
        Ready to go? <Link href="/">Book your fast boat with Gilifast</Link>.
      </p>
    </article>
  );
}
