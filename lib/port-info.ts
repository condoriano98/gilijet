/**
 * Static port info — dock addresses and operational tips per port.
 * Used on booking confirmations and pre-departure emails so customers
 * arrive at the right pier on time.
 */

export type PortInfo = {
  address: string;
  dockTip: string;
  arrivalBuffer: number; // suggested minutes before departure
};

const PORTS: Record<string, PortInfo> = {
  // ═══ BALI ═══
  "Padang Bai": {
    address: "Pelabuhan Padang Bai, Karangasem, Bali 80871",
    dockTip: "Main ferry terminal. Fast-boat counters near the east jetty. Arrive early — traffic to Karangasem can be heavy.",
    arrivalBuffer: 45,
  },
  Serangan: {
    address: "Jl. Tukad Punggawa, Serangan, Denpasar Selatan, Bali 80229",
    dockTip: "Enter through Serangan harbour gate. Samudra Jet terminal is the blue building on the north side.",
    arrivalBuffer: 30,
  },
  Sanur: {
    address: "Jl. Hang Tuah, Sanur, Denpasar Selatan, Bali 80228",
    dockTip: "Sanur Beach access road. Fast-boat pier is on the north end. Parking available at the beach entrance.",
    arrivalBuffer: 30,
  },
  Amed: {
    address: "Jl. Raya Amed, Karangasem, Bali 80852",
    dockTip: "Beach departure — boats launch from the shore. Wear sandals, you may need to wade.",
    arrivalBuffer: 30,
  },

  // ═══ NUSA PENIDA / LEMBONGAN ═══
  "Nusa Penida": {
    address: "Pelabuhan Banjar Nyuh, Nusa Penida, Klungkung, Bali 80771",
    dockTip: "Most operators dock at Banjar Nyuh. Some use Toya Pakeh — check your boat name on the ticket.",
    arrivalBuffer: 30,
  },
  "Nusa Lembongan": {
    address: "Pelabuhan Jungut Batu, Nusa Lembongan, Klungkung, Bali 80771",
    dockTip: "Jungut Batu beach landing — boats anchor offshore; you'll wade or use a small skiff (included).",
    arrivalBuffer: 30,
  },

  // ═══ GILI ISLANDS ═══
  "Gili Trawangan": {
    address: "Gili Trawangan harbour, Gili Indah, Pemenang, North Lombok, NTB 83352",
    dockTip: "Main harbour on the east side. No cars — arrange a cidomo (horse cart) for your hotel. Bring cash, no ATMs.",
    arrivalBuffer: 30,
  },
  "Gili Air": {
    address: "Gili Air harbour, Gili Indah, Pemenang, North Lombok, NTB 83352",
    dockTip: "Main jetty on the east coast facing Lombok mainland. Walk or rent a bicycle for island transport.",
    arrivalBuffer: 30,
  },
  "Gili Meno": {
    address: "Gili Meno harbour, Gili Indah, Pemenang, North Lombok, NTB 83352",
    dockTip: "Small jetty on the east side. Quietest of the three Gilis — bring everything you need.",
    arrivalBuffer: 30,
  },

  // ═══ LOMBOK ═══
  "Gili Gede": {
    address: "Gili Gede harbour, Sekotong, West Lombok, NTB 83365",
    dockTip: "Southwest Lombok island. Smaller and less visited — boats dock at the main wooden pier.",
    arrivalBuffer: 30,
  },
  Bangsal: {
    address: "Pelabuhan Bangsal, Pemenang, North Lombok, NTB 83352",
    dockTip: "Public harbour — fast boats use the dedicated wooden jetty south of the main port. Watch for touts.",
    arrivalBuffer: 30,
  },
  "Kuta Lombok": {
    address: "Jl. Pariwisata, Kuta, Pujut, Central Lombok, NTB 83573",
    dockTip: "Kuta Mandalika area. Boats depart from the main Kuta beach. Parking near the Novotel.",
    arrivalBuffer: 30,
  },
  Kayangan: {
    address: "Pelabuhan Kayangan, Labuhan Lombok, East Lombok, NTB 83654",
    dockTip: "Eastern Lombok ferry terminal. Connects to Poto Tano, Sumbawa. Part of the Trans-Sumbawa route.",
    arrivalBuffer: 45,
  },
  Lembar: {
    address: "Pelabuhan Lembar, West Lombok, NTB 83364",
    dockTip: "Main cargo & ferry harbour in southwest Lombok. ASDP Padang Bai ↔ Lembar route uses this terminal.",
    arrivalBuffer: 60,
  },

  // ═══ FLORES / NTT ═══
  "Labuan Bajo": {
    address: "Pelabuhan Labuan Bajo, West Manggarai, NTT 86754",
    dockTip: "Main port near town centre. Komodo trips depart from the south pier. Arrive 45 min early for check-in.",
    arrivalBuffer: 45,
  },
  "Komodo Island": {
    address: "Loh Liang Ranger Station, Komodo Island, West Manggarai, NTT",
    dockTip: "National Park entry fees collected at the dock — bring cash in IDR (~400K/person). Rangers required.",
    arrivalBuffer: 30,
  },
};

export function getPortInfo(portName: string): PortInfo {
  return (
    PORTS[portName] ?? {
      address: portName,
      dockTip: "Check with your operator for the exact dock location.",
      arrivalBuffer: 30,
    }
  );
}
