/**
 * Registry of destination photography keyed by port slug.
 *
 * The URLs below are deterministic placeholders (picsum.photos with a
 * stable seed) so the integration ships green. Swap each entry for a
 * curated Unsplash / operator-supplied photo before launch — the keys,
 * shape, and consumer code stay unchanged.
 */
export type DestinationPhoto = {
  url: string;
  alt: string;
  credit?: string;
};

const PLACEHOLDER = (seed: string) =>
  `https://picsum.photos/seed/${seed}/1600/900`;

export const DESTINATION_PHOTOS: Record<string, DestinationPhoto> = {
  "gili-trawangan": {
    url: PLACEHOLDER("gili-trawangan"),
    alt: "Aerial view of Gili Trawangan's turquoise water and white-sand beach",
  },
  "nusa-penida": {
    url: PLACEHOLDER("nusa-penida"),
    alt: "Kelingking Beach cliff viewpoint on Nusa Penida",
  },
  "nusa-lembongan": {
    url: PLACEHOLDER("nusa-lembongan"),
    alt: "Devil's Tear viewpoint on Nusa Lembongan",
  },
  lombok: {
    url: PLACEHOLDER("lombok"),
    alt: "Mount Rinjani crater lake at sunrise",
  },
  komodo: {
    url: PLACEHOLDER("komodo"),
    alt: "Pink Beach panorama with a traditional Phinisi boat in the foreground",
  },
  sanur: {
    url: PLACEHOLDER("sanur"),
    alt: "Sanur sunrise with traditional prayer boats",
  },
  "padang-bai": {
    url: PLACEHOLDER("padang-bai"),
    alt: "Fast boats moored at Padang Bai harbour",
  },
  bangsal: {
    url: PLACEHOLDER("bangsal"),
    alt: "Bangsal harbour as seen from the deck of a Gili boat",
  },
  "labuan-bajo": {
    url: PLACEHOLDER("labuan-bajo"),
    alt: "Labuan Bajo harbour at golden hour with Phinisi boats",
  },
  "gili-islands": {
    url: PLACEHOLDER("gili-islands"),
    alt: "Aerial view of the three Gili Islands",
  },
};

export const HERO_PHOTO: DestinationPhoto = {
  url: PLACEHOLDER("gilijet-hero-bali"),
  alt: "Indonesian fast boats heading to the Gili Islands at sunrise",
};

export function slugForPort(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function photoForPort(name: string): DestinationPhoto | null {
  return DESTINATION_PHOTOS[slugForPort(name)] ?? null;
}
