/**
 * Static port info — dock addresses and operational tips per port.
 * Used on booking confirmations and pre-departure emails so customers
 * arrive at the right pier on time.
 */

export type PortInfo = {
  address: string;
  dockTip: string;
  /** Suggested minutes to arrive before departure. */
  arrivalBuffer: number;
  region: string;
};

export type PortRegion = {
  name: string;
  ports: string[];
};

export const PORT_REGIONS: PortRegion[] = [
  { name: "Bali", ports: ["Sanur", "Padang Bai"] },
  { name: "Gili Islands", ports: ["Gili Trawangan", "Gili Air"] },
  { name: "Lombok", ports: ["Bangsal", "Lombok"] },
  { name: "Nusa Islands", ports: ["Nusa Penida", "Nusa Lembongan"] },
  { name: "Komodo", ports: ["Labuan Bajo", "Komodo"] },
];

const PORTS: Record<string, PortInfo> = {
  Sanur: {
    address: "Jl. Hang Tuah, Sanur, Denpasar Selatan, Bali",
    dockTip: "Use the Sanur Beach access road; fast-boat pier is on the north end.",
    arrivalBuffer: 30,
    region: "Bali",
  },
  "Padang Bai": {
    address: "Pelabuhan Padang Bai, Karangasem, Bali",
    dockTip: "Main ferry terminal — look for the fast-boat counter near the east jetty.",
    arrivalBuffer: 45,
    region: "Bali",
  },
  Bangsal: {
    address: "Pelabuhan Bangsal, Pemenang, North Lombok",
    dockTip: "Public harbour; fast boats depart from the dedicated wooden jetty south of the main port.",
    arrivalBuffer: 30,
    region: "Lombok",
  },
  "Nusa Penida": {
    address: "Pelabuhan Banjar Nyuh, Nusa Penida",
    dockTip: "Most operators dock at Banjar Nyuh; some use Toya Pakeh — check your boat name.",
    arrivalBuffer: 30,
    region: "Nusa Islands",
  },
  "Nusa Lembongan": {
    address: "Pelabuhan Jungut Batu, Nusa Lembongan",
    dockTip: "Jungut Batu beach landing — boats anchor offshore; you'll wade or use a small skiff.",
    arrivalBuffer: 30,
    region: "Nusa Islands",
  },
  "Gili Trawangan": {
    address: "Gili Trawangan harbour, North Lombok",
    dockTip: "Single main harbour on the east side of the island. No cars on Gili T — arrange a cidomo (horse cart) for your hotel.",
    arrivalBuffer: 30,
    region: "Gili Islands",
  },
  "Gili Air": {
    address: "Gili Air harbour, North Lombok",
    dockTip: "Main jetty on the east coast facing Lombok mainland.",
    arrivalBuffer: 30,
    region: "Gili Islands",
  },
  Lombok: {
    address: "Pelabuhan Lembar, West Lombok",
    dockTip: "Lembar Harbour — confirm with your operator if a different jetty (e.g. Senggigi) is used.",
    arrivalBuffer: 45,
    region: "Lombok",
  },
  "Labuan Bajo": {
    address: "Pelabuhan Labuan Bajo, West Manggarai, NTT",
    dockTip: "Main port near the town centre. Komodo trips usually depart from the south pier.",
    arrivalBuffer: 45,
    region: "Komodo",
  },
  Komodo: {
    address: "Loh Liang Ranger Station, Komodo Island",
    dockTip: "Park entrance fees collected at the dock — bring cash in IDR.",
    arrivalBuffer: 30,
    region: "Komodo",
  },
};

export function getPortInfo(portName: string): PortInfo {
  return (
    PORTS[portName] ?? {
      address: portName,
      dockTip: "Check with your operator for the exact dock location.",
      arrivalBuffer: 30,
      region: "Other",
    }
  );
}

export function getAllPorts(): string[] {
  return Object.keys(PORTS);
}

export function getPortsByRegion(): { region: string; ports: string[] }[] {
  return PORT_REGIONS.map((r) => ({
    region: r.name,
    ports: r.ports.filter((p) => PORTS[p]),
  })).filter((r) => r.ports.length > 0);
}
