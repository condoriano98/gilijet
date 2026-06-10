/**
 * Registry of destination photography keyed by port slug.
 *
 * All photos are sourced from Unsplash (free, commercial OK with attribution).
 * Public domain / CC0 where possible. See credit field per entry.
 */
export type DestinationPhoto = {
  url: string;
  alt: string;
  credit?: string;
};

const LOCAL = (slug: string) => `/destinations/${slug}.jpg`;

export const DESTINATION_PHOTOS: Record<string, DestinationPhoto> = {
  "gili-trawangan": {
    url: LOCAL("gili-trawangan"),
    alt: "Aerial view of Gili Trawangan's turquoise water and white-sand beach",
    credit: "Artem Beliaikin on Unsplash",
  },
  "nusa-penida": {
    url: LOCAL("nusa-penida"),
    alt: "Kelingking Beach cliff viewpoint on Nusa Penida",
    credit: "Nick Fewings on Unsplash",
  },
  "nusa-lembongan": {
    url: LOCAL("nusa-lembongan"),
    alt: "Devil's Tear viewpoint on Nusa Lembongan",
    credit: "Milos Prelevic on Unsplash",
  },
  lombok: {
    url: LOCAL("lombok"),
    alt: "Mount Rinjani crater lake at sunrise",
    credit: "Fikri Rasyid on Unsplash",
  },
  komodo: {
    url: LOCAL("komodo"),
    alt: "Pink Beach panorama with a traditional Phinisi boat in the foreground",
    credit: "Sulthan Auliya on Unsplash",
  },
  sanur: {
    url: LOCAL("sanur"),
    alt: "Sanur sunrise with traditional prayer boats",
    credit: "Rubén Hutabarat on Unsplash",
  },
  "padang-bai": {
    url: LOCAL("padang-bai"),
    alt: "Fast boats moored at Padang Bai harbour",
    credit: "Niklas Weiss on Unsplash",
  },
  bangsal: {
    url: LOCAL("bangsal"),
    alt: "Bangsal harbour as seen from the deck of a Gili boat",
    credit: "Mufid Majnun on Unsplash",
  },
  "labuan-bajo": {
    url: LOCAL("labuan-bajo"),
    alt: "Labuan Bajo harbour at golden hour with Phinisi boats",
    credit: "Michael Anfang on Unsplash",
  },
  "gili-islands": {
    url: LOCAL("gili-islands"),
    alt: "Aerial view of the three Gili Islands",
    credit: "Oleksandr Pidvalnyi on Unsplash",
  },
};

export const HERO_PHOTO: DestinationPhoto = {
  url: LOCAL("hero"),
  alt: "Indonesian fast boats heading to the Gili Islands at sunrise",
  credit: "Arief Hidayat on Unsplash",
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
