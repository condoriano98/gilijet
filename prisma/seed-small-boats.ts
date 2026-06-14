/**
 * Small boat travel seed — Bali & Lombok small islands.
 *
 * Focuses on the inter-island hops that payment gateways want to see
 * for MVP approval: Gili Trawangan, Gili Meno, Gili Air, Nusa Penida,
 * Nusa Lembongan, Nusa Ceningan, Gili Gede.
 *
 * Run:  npx tsx prisma/seed-small-boats.ts
 * Idempotent (upserts), additive (does not delete existing data).
 */

import bcrypt from "bcryptjs";
import { prisma } from "../lib/db";
import { generateLegsForSchedule } from "../lib/legs";

// ── Types ──────────────────────────────────────────────────────────────────

type SeedOperator = {
  key: string;
  email: string;
  companyName: string;
  contactPerson: string;
  phoneNumber: string;
};

type SeedBoat = {
  reg: string;
  name: string;
  operatorKey: string;
  capacity: number;
  description: string;
};

type SeedSchedule = {
  boatReg: string;
  origin: string;
  destination: string;
  time: string;
  duration: number; // minutes
  price: number; // IDR
};

// ── Operators ──────────────────────────────────────────────────────────────

const OPERATORS: SeedOperator[] = [
  {
    key: "scoot",
    email: "scoot@gilijet.local",
    companyName: "Scoot Fast Cruises",
    contactPerson: "Wayan Artana",
    phoneNumber: "+6287850000101",
  },
  {
    key: "bluewater",
    email: "bluewater@gilijet.local",
    companyName: "BlueWater Express",
    contactPerson: "Ketut Mangku",
    phoneNumber: "+6287850000102",
  },
  {
    key: "rocky",
    email: "rocky@gilijet.local",
    companyName: "Rocky Fast Cruise",
    contactPerson: "Made Sukadana",
    phoneNumber: "+6287850000103",
  },
  {
    key: "marina-srikandi",
    email: "marina-srikandi@gilijet.local",
    companyName: "Marina Srikandi",
    contactPerson: "Putu Astika",
    phoneNumber: "+6287850000104",
  },
  {
    key: "freebird",
    email: "freebird@gilijet.local",
    companyName: "FreeBird Express",
    contactPerson: "Gede Wijaya",
    phoneNumber: "+6287850000105",
  },
  {
    key: "manta",
    email: "manta@gilijet.local",
    companyName: "Manta Express",
    contactPerson: "Nyoman Suardana",
    phoneNumber: "+6287850000106",
  },
  {
    key: "crown",
    email: "crown@gilijet.local",
    companyName: "Crown Fast Cruise",
    contactPerson: "Wayan Sujana",
    phoneNumber: "+6287850000107",
  },
  {
    key: "idola",
    email: "idola@gilijet.local",
    companyName: "Idola Express",
    contactPerson: "Made Sudarma",
    phoneNumber: "+6287850000108",
  },
  {
    key: "arthamas",
    email: "arthamas@gilijet.local",
    companyName: "Arthamas Express",
    contactPerson: "Komang Ariawan",
    phoneNumber: "+6287850000109",
  },
  {
    key: "tanis",
    email: "tanis@gilijet.local",
    companyName: "The Tanis Lembongan Express",
    contactPerson: "Ketut Darma",
    phoneNumber: "+6287850000110",
  },
  {
    key: "glory",
    email: "glory@gilijet.local",
    companyName: "Glory Express",
    contactPerson: "Nyoman Artha",
    phoneNumber: "+6287850000111",
  },
  {
    key: "dcamel",
    email: "dcamel@gilijet.local",
    companyName: "D'Camel Fast Ferry",
    contactPerson: "Made Wiratama",
    phoneNumber: "+6287850000112",
  },
];

// ── Boats ──────────────────────────────────────────────────────────────────

const BOATS: SeedBoat[] = [
  // Scoot: Sanur ↔ Lembongan/Penida specialist
  {
    reg: "SCOOT-001",
    name: "Scoot I",
    operatorKey: "scoot",
    capacity: 35,
    description: "Small fast boat — Sanur ↔ Nusa Lembongan / Nusa Penida.",
  },
  {
    reg: "SCOOT-002",
    name: "Scoot II",
    operatorKey: "scoot",
    capacity: 28,
    description: "Compact speedboat — afternoon departures.",
  },
  {
    reg: "SCOOT-003",
    name: "Scoot III",
    operatorKey: "scoot",
    capacity: 22,
    description: "Island hopper — Nusa Penida ↔ Nusa Lembongan.",
  },

  // BlueWater: Sanur ↔ Nusa Penida / Gili T
  {
    reg: "BLUEWATER-001",
    name: "BlueWater I",
    operatorKey: "bluewater",
    capacity: 40,
    description: "Premium small boat — Sanur ↔ Nusa Penida.",
  },
  {
    reg: "BLUEWATER-002",
    name: "BlueWater II",
    operatorKey: "bluewater",
    capacity: 30,
    description: "Longer range — Sanur ↔ Gili Trawangan.",
  },

  // Rocky: Padang Bai ↔ Gili islands
  {
    reg: "ROCKY-001",
    name: "Rocky I",
    operatorKey: "rocky",
    capacity: 32,
    description: "Padang Bai ↔ Gili Islands daily service.",
  },
  {
    reg: "ROCKY-002",
    name: "Rocky II",
    operatorKey: "rocky",
    capacity: 28,
    description: "Gili inter-island hopper — Gili T ↔ Gili Meno ↔ Gili Air.",
  },

  // Marina Srikandi: Sanur ↔ Nusa Islands
  {
    reg: "MARINA-SRIKANDI-001",
    name: "Marina Srikandi I",
    operatorKey: "marina-srikandi",
    capacity: 30,
    description: "Sanur ↔ Nusa Penida / Nusa Lembongan.",
  },

  // FreeBird: Amed & Padang Bai ↔ Gili
  {
    reg: "FREEBIRD-001",
    name: "FreeBird I",
    operatorKey: "freebird",
    capacity: 30,
    description: "Amed ↔ Gili Trawangan fast boat.",
  },
  {
    reg: "FREEBIRD-002",
    name: "FreeBird II",
    operatorKey: "freebird",
    capacity: 25,
    description: "Padang Bai ↔ Gili Air afternoon service.",
  },

  // Manta: Nusa Penida ↔ Gili T inter-island
  {
    reg: "MANTA-001",
    name: "Manta I",
    operatorKey: "manta",
    capacity: 35,
    description: "Nusa Penida ↔ Gili Trawangan / Nusa Lembongan inter-island.",
  },
  {
    reg: "MANTA-002",
    name: "Manta II",
    operatorKey: "manta",
    capacity: 25,
    description: "Small island express — Sanur ↔ Nusa Penida.",
  },

  // Crown: Bangsal ↔ Gili / Lombok
  {
    reg: "CROWN-001",
    name: "Crown I",
    operatorKey: "crown",
    capacity: 30,
    description: "Bangsal ↔ Gili Islands public boat style.",
  },
  {
    reg: "CROWN-002",
    name: "Crown II",
    operatorKey: "crown",
    capacity: 20,
    description: "Gili inter-island shuttle — 10 min hops.",
  },

  // Idola: Sanur ↔ Nusa Lembongan / Nusa Ceningan
  {
    reg: "IDOLA-001",
    name: "Idola I",
    operatorKey: "idola",
    capacity: 28,
    description: "Sanur ↔ Nusa Lembongan / Nusa Ceningan.",
  },

  // Arthamas: Padang Bai ↔ Gili
  {
    reg: "ARTHAMAS-001",
    name: "Arthamas I",
    operatorKey: "arthamas",
    capacity: 30,
    description: "Padang Bai ↔ Gili Trawangan / Gili Meno.",
  },

  // Tanis: Sanur ↔ Nusa Lembongan
  {
    reg: "TANIS-001",
    name: "Tanis Lembongan I",
    operatorKey: "tanis",
    capacity: 24,
    description: "Sanur ↔ Nusa Lembongan daily express.",
  },

  // Glory: Sanur ↔ Nusa Penida
  {
    reg: "GLORY-001",
    name: "Glory I",
    operatorKey: "glory",
    capacity: 28,
    description: "Sanur ↔ Nusa Penida (Sampalan) fast service.",
  },

  // D'Camel: Bangsal ↔ Gili inter-island
  {
    reg: "DCAMEL-001",
    name: "D'Camel I",
    operatorKey: "dcamel",
    capacity: 20,
    description: "Bangsal ↔ Gili T/Meno/Air — traditional wooden boat style.",
  },
];

// ── Schedules ──────────────────────────────────────────────────────────────

const SCHEDULES: SeedSchedule[] = [
  // ── Sanur ↔ Nusa Penida ────────────────────────────────────────────────

  // Scoot
  { boatReg: "SCOOT-001", origin: "Sanur", destination: "Nusa Penida", time: "07:30", duration: 40, price: 175000 },
  { boatReg: "SCOOT-001", origin: "Nusa Penida", destination: "Sanur", time: "16:00", duration: 40, price: 175000 },
  { boatReg: "SCOOT-002", origin: "Sanur", destination: "Nusa Penida", time: "09:30", duration: 40, price: 175000 },
  { boatReg: "SCOOT-002", origin: "Nusa Penida", destination: "Sanur", time: "17:00", duration: 40, price: 175000 },

  // BlueWater
  { boatReg: "BLUEWATER-001", origin: "Sanur", destination: "Nusa Penida", time: "08:00", duration: 35, price: 200000 },
  { boatReg: "BLUEWATER-001", origin: "Nusa Penida", destination: "Sanur", time: "15:00", duration: 35, price: 200000 },
  { boatReg: "BLUEWATER-001", origin: "Sanur", destination: "Nusa Penida", time: "13:00", duration: 35, price: 200000 },
  { boatReg: "BLUEWATER-001", origin: "Nusa Penida", destination: "Sanur", time: "10:00", duration: 35, price: 200000 },

  // Manta
  { boatReg: "MANTA-002", origin: "Sanur", destination: "Nusa Penida", time: "10:00", duration: 45, price: 185000 },
  { boatReg: "MANTA-002", origin: "Nusa Penida", destination: "Sanur", time: "13:30", duration: 45, price: 185000 },

  // Glory
  { boatReg: "GLORY-001", origin: "Sanur", destination: "Nusa Penida", time: "08:30", duration: 40, price: 150000 },
  { boatReg: "GLORY-001", origin: "Nusa Penida", destination: "Sanur", time: "14:00", duration: 40, price: 150000 },
  { boatReg: "GLORY-001", origin: "Sanur", destination: "Nusa Penida", time: "11:00", duration: 40, price: 150000 },
  { boatReg: "GLORY-001", origin: "Nusa Penida", destination: "Sanur", time: "16:30", duration: 40, price: 150000 },

  // ── Sanur ↔ Nusa Lembongan ─────────────────────────────────────────────

  // Scoot
  { boatReg: "SCOOT-001", origin: "Sanur", destination: "Nusa Lembongan", time: "09:00", duration: 30, price: 150000 },
  { boatReg: "SCOOT-001", origin: "Nusa Lembongan", destination: "Sanur", time: "15:30", duration: 30, price: 150000 },
  { boatReg: "SCOOT-002", origin: "Sanur", destination: "Nusa Lembongan", time: "11:00", duration: 30, price: 150000 },
  { boatReg: "SCOOT-002", origin: "Nusa Lembongan", destination: "Sanur", time: "17:30", duration: 30, price: 150000 },

  // Marina Srikandi
  { boatReg: "MARINA-SRIKANDI-001", origin: "Sanur", destination: "Nusa Lembongan", time: "08:30", duration: 30, price: 160000 },
  { boatReg: "MARINA-SRIKANDI-001", origin: "Nusa Lembongan", destination: "Sanur", time: "14:30", duration: 30, price: 160000 },
  { boatReg: "MARINA-SRIKANDI-001", origin: "Sanur", destination: "Nusa Penida", time: "10:00", duration: 45, price: 175000 },
  { boatReg: "MARINA-SRIKANDI-001", origin: "Nusa Penida", destination: "Sanur", time: "16:00", duration: 45, price: 175000 },

  // Idola
  { boatReg: "IDOLA-001", origin: "Sanur", destination: "Nusa Lembongan", time: "08:00", duration: 30, price: 140000 },
  { boatReg: "IDOLA-001", origin: "Nusa Lembongan", destination: "Sanur", time: "16:30", duration: 30, price: 140000 },
  { boatReg: "IDOLA-001", origin: "Sanur", destination: "Nusa Lembongan", time: "13:00", duration: 30, price: 140000 },
  { boatReg: "IDOLA-001", origin: "Nusa Lembongan", destination: "Sanur", time: "10:30", duration: 30, price: 140000 },

  // Tanis
  { boatReg: "TANIS-001", origin: "Sanur", destination: "Nusa Lembongan", time: "09:00", duration: 35, price: 145000 },
  { boatReg: "TANIS-001", origin: "Nusa Lembongan", destination: "Sanur", time: "15:00", duration: 35, price: 145000 },
  { boatReg: "TANIS-001", origin: "Sanur", destination: "Nusa Lembongan", time: "12:30", duration: 35, price: 145000 },
  { boatReg: "TANIS-001", origin: "Nusa Lembongan", destination: "Sanur", time: "17:00", duration: 35, price: 145000 },

  // ── Sanur ↔ Nusa Ceningan ──────────────────────────────────────────────

  // Idola
  { boatReg: "IDOLA-001", origin: "Sanur", destination: "Nusa Ceningan", time: "10:30", duration: 35, price: 140000 },
  { boatReg: "IDOLA-001", origin: "Nusa Ceningan", destination: "Sanur", time: "08:00", duration: 35, price: 140000 },

  // Marina Srikandi
  { boatReg: "MARINA-SRIKANDI-001", origin: "Sanur", destination: "Nusa Ceningan", time: "13:30", duration: 35, price: 160000 },
  { boatReg: "MARINA-SRIKANDI-001", origin: "Nusa Ceningan", destination: "Sanur", time: "10:00", duration: 35, price: 160000 },

  // ── Nusa Penida ↔ Nusa Lembongan (inter-island hops) ───────────────────

  // Scoot
  { boatReg: "SCOOT-003", origin: "Nusa Penida", destination: "Nusa Lembongan", time: "08:00", duration: 10, price: 50000 },
  { boatReg: "SCOOT-003", origin: "Nusa Lembongan", destination: "Nusa Penida", time: "08:30", duration: 10, price: 50000 },
  { boatReg: "SCOOT-003", origin: "Nusa Penida", destination: "Nusa Lembongan", time: "11:00", duration: 10, price: 50000 },
  { boatReg: "SCOOT-003", origin: "Nusa Lembongan", destination: "Nusa Penida", time: "11:30", duration: 10, price: 50000 },
  { boatReg: "SCOOT-003", origin: "Nusa Penida", destination: "Nusa Lembongan", time: "14:00", duration: 10, price: 50000 },
  { boatReg: "SCOOT-003", origin: "Nusa Lembongan", destination: "Nusa Penida", time: "14:30", duration: 10, price: 50000 },

  // Manta
  { boatReg: "MANTA-001", origin: "Nusa Penida", destination: "Nusa Lembongan", time: "09:00", duration: 15, price: 65000 },
  { boatReg: "MANTA-001", origin: "Nusa Lembongan", destination: "Nusa Penida", time: "10:00", duration: 15, price: 65000 },
  { boatReg: "MANTA-001", origin: "Nusa Penida", destination: "Nusa Lembongan", time: "15:30", duration: 15, price: 65000 },
  { boatReg: "MANTA-001", origin: "Nusa Lembongan", destination: "Nusa Penida", time: "16:15", duration: 15, price: 65000 },

  // ── Nusa Lembongan ↔ Nusa Ceningan (yellow bridge walkable, but boats exist) ──

  { boatReg: "IDOLA-001", origin: "Nusa Lembongan", destination: "Nusa Ceningan", time: "09:00", duration: 5, price: 25000 },
  { boatReg: "IDOLA-001", origin: "Nusa Ceningan", destination: "Nusa Lembongan", time: "09:15", duration: 5, price: 25000 },

  // ── Nusa Penida ↔ Gili Trawangan (inter-island long hop) ───────────────

  // Manta
  { boatReg: "MANTA-001", origin: "Nusa Penida", destination: "Gili Trawangan", time: "08:30", duration: 120, price: 350000 },
  { boatReg: "MANTA-001", origin: "Gili Trawangan", destination: "Nusa Penida", time: "11:00", duration: 120, price: 350000 },

  // ── Padang Bai ↔ Gili Trawangan ────────────────────────────────────────

  // Rocky
  { boatReg: "ROCKY-001", origin: "Padang Bai", destination: "Gili Trawangan", time: "08:30", duration: 120, price: 300000 },
  { boatReg: "ROCKY-001", origin: "Gili Trawangan", destination: "Padang Bai", time: "11:00", duration: 120, price: 300000 },
  { boatReg: "ROCKY-001", origin: "Padang Bai", destination: "Gili Trawangan", time: "13:30", duration: 120, price: 300000 },
  { boatReg: "ROCKY-001", origin: "Gili Trawangan", destination: "Padang Bai", time: "16:00", duration: 120, price: 300000 },

  // Arthamas
  { boatReg: "ARTHAMAS-001", origin: "Padang Bai", destination: "Gili Trawangan", time: "09:00", duration: 135, price: 275000 },
  { boatReg: "ARTHAMAS-001", origin: "Gili Trawangan", destination: "Padang Bai", time: "12:00", duration: 135, price: 275000 },

  // ── Padang Bai ↔ Gili Meno ─────────────────────────────────────────────

  // Rocky
  { boatReg: "ROCKY-001", origin: "Padang Bai", destination: "Gili Meno", time: "08:30", duration: 135, price: 300000 },
  { boatReg: "ROCKY-001", origin: "Gili Meno", destination: "Padang Bai", time: "11:15", duration: 135, price: 300000 },

  // Arthamas
  { boatReg: "ARTHAMAS-001", origin: "Padang Bai", destination: "Gili Meno", time: "09:00", duration: 150, price: 275000 },
  { boatReg: "ARTHAMAS-001", origin: "Gili Meno", destination: "Padang Bai", time: "12:15", duration: 150, price: 275000 },

  // ── Padang Bai ↔ Gili Air ──────────────────────────────────────────────

  // Rocky
  { boatReg: "ROCKY-001", origin: "Padang Bai", destination: "Gili Air", time: "08:30", duration: 150, price: 300000 },
  { boatReg: "ROCKY-001", origin: "Gili Air", destination: "Padang Bai", time: "11:30", duration: 150, price: 300000 },

  // FreeBird
  { boatReg: "FREEBIRD-002", origin: "Padang Bai", destination: "Gili Air", time: "14:00", duration: 150, price: 285000 },
  { boatReg: "FREEBIRD-002", origin: "Gili Air", destination: "Padang Bai", time: "09:30", duration: 150, price: 285000 },

  // Arthamas
  { boatReg: "ARTHAMAS-001", origin: "Padang Bai", destination: "Gili Air", time: "09:00", duration: 165, price: 275000 },
  { boatReg: "ARTHAMAS-001", origin: "Gili Air", destination: "Padang Bai", time: "12:30", duration: 165, price: 275000 },

  // ── Amed ↔ Gili Trawangan ──────────────────────────────────────────────

  // FreeBird
  { boatReg: "FREEBIRD-001", origin: "Amed", destination: "Gili Trawangan", time: "09:00", duration: 60, price: 275000 },
  { boatReg: "FREEBIRD-001", origin: "Gili Trawangan", destination: "Amed", time: "10:30", duration: 60, price: 275000 },

  // ── Sanur ↔ Gili Trawangan ─────────────────────────────────────────────

  // BlueWater
  { boatReg: "BLUEWATER-002", origin: "Sanur", destination: "Gili Trawangan", time: "08:00", duration: 150, price: 425000 },
  { boatReg: "BLUEWATER-002", origin: "Gili Trawangan", destination: "Sanur", time: "11:30", duration: 150, price: 425000 },

  // ── Bangsal ↔ Gili Trawangan ───────────────────────────────────────────

  // Crown
  { boatReg: "CROWN-001", origin: "Bangsal", destination: "Gili Trawangan", time: "08:00", duration: 20, price: 85000 },
  { boatReg: "CROWN-001", origin: "Gili Trawangan", destination: "Bangsal", time: "08:30", duration: 20, price: 85000 },
  { boatReg: "CROWN-001", origin: "Bangsal", destination: "Gili Trawangan", time: "10:00", duration: 20, price: 85000 },
  { boatReg: "CROWN-001", origin: "Gili Trawangan", destination: "Bangsal", time: "10:30", duration: 20, price: 85000 },
  { boatReg: "CROWN-001", origin: "Bangsal", destination: "Gili Trawangan", time: "13:00", duration: 20, price: 85000 },
  { boatReg: "CROWN-001", origin: "Gili Trawangan", destination: "Bangsal", time: "13:30", duration: 20, price: 85000 },
  { boatReg: "CROWN-001", origin: "Bangsal", destination: "Gili Trawangan", time: "16:00", duration: 20, price: 85000 },
  { boatReg: "CROWN-001", origin: "Gili Trawangan", destination: "Bangsal", time: "16:30", duration: 20, price: 85000 },

  // D'Camel
  { boatReg: "DCAMEL-001", origin: "Bangsal", destination: "Gili Trawangan", time: "09:00", duration: 30, price: 75000 },
  { boatReg: "DCAMEL-001", origin: "Gili Trawangan", destination: "Bangsal", time: "09:45", duration: 30, price: 75000 },
  { boatReg: "DCAMEL-001", origin: "Bangsal", destination: "Gili Trawangan", time: "14:00", duration: 30, price: 75000 },
  { boatReg: "DCAMEL-001", origin: "Gili Trawangan", destination: "Bangsal", time: "14:45", duration: 30, price: 75000 },

  // ── Bangsal ↔ Gili Meno ────────────────────────────────────────────────

  // Crown
  { boatReg: "CROWN-001", origin: "Bangsal", destination: "Gili Meno", time: "08:00", duration: 15, price: 85000 },
  { boatReg: "CROWN-001", origin: "Gili Meno", destination: "Bangsal", time: "08:25", duration: 15, price: 85000 },
  { boatReg: "CROWN-001", origin: "Bangsal", destination: "Gili Meno", time: "13:00", duration: 15, price: 85000 },
  { boatReg: "CROWN-001", origin: "Gili Meno", destination: "Bangsal", time: "13:25", duration: 15, price: 85000 },

  // D'Camel
  { boatReg: "DCAMEL-001", origin: "Bangsal", destination: "Gili Meno", time: "09:00", duration: 25, price: 75000 },
  { boatReg: "DCAMEL-001", origin: "Gili Meno", destination: "Bangsal", time: "09:35", duration: 25, price: 75000 },

  // ── Bangsal ↔ Gili Air ─────────────────────────────────────────────────

  // Crown
  { boatReg: "CROWN-001", origin: "Bangsal", destination: "Gili Air", time: "08:00", duration: 25, price: 85000 },
  { boatReg: "CROWN-001", origin: "Gili Air", destination: "Bangsal", time: "08:35", duration: 25, price: 85000 },
  { boatReg: "CROWN-001", origin: "Bangsal", destination: "Gili Air", time: "10:00", duration: 25, price: 85000 },
  { boatReg: "CROWN-001", origin: "Gili Air", destination: "Bangsal", time: "10:35", duration: 25, price: 85000 },
  { boatReg: "CROWN-001", origin: "Bangsal", destination: "Gili Air", time: "16:00", duration: 25, price: 85000 },
  { boatReg: "CROWN-001", origin: "Gili Air", destination: "Bangsal", time: "16:35", duration: 25, price: 85000 },

  // D'Camel
  { boatReg: "DCAMEL-001", origin: "Bangsal", destination: "Gili Air", time: "09:00", duration: 35, price: 75000 },
  { boatReg: "DCAMEL-001", origin: "Gili Air", destination: "Bangsal", time: "10:00", duration: 35, price: 75000 },

  // ── Gili Trawangan ↔ Gili Meno (inter-island hop) ──────────────────────

  // Rocky
  { boatReg: "ROCKY-002", origin: "Gili Trawangan", destination: "Gili Meno", time: "07:30", duration: 10, price: 50000 },
  { boatReg: "ROCKY-002", origin: "Gili Meno", destination: "Gili Trawangan", time: "07:50", duration: 10, price: 50000 },
  { boatReg: "ROCKY-002", origin: "Gili Trawangan", destination: "Gili Meno", time: "12:00", duration: 10, price: 50000 },
  { boatReg: "ROCKY-002", origin: "Gili Meno", destination: "Gili Trawangan", time: "12:20", duration: 10, price: 50000 },

  // Crown
  { boatReg: "CROWN-002", origin: "Gili Trawangan", destination: "Gili Meno", time: "09:00", duration: 15, price: 60000 },
  { boatReg: "CROWN-002", origin: "Gili Meno", destination: "Gili Trawangan", time: "09:30", duration: 15, price: 60000 },
  { boatReg: "CROWN-002", origin: "Gili Trawangan", destination: "Gili Meno", time: "14:00", duration: 15, price: 60000 },
  { boatReg: "CROWN-002", origin: "Gili Meno", destination: "Gili Trawangan", time: "14:30", duration: 15, price: 60000 },

  // ── Gili Trawangan ↔ Gili Air (inter-island hop) ───────────────────────

  // Rocky
  { boatReg: "ROCKY-002", origin: "Gili Trawangan", destination: "Gili Air", time: "08:00", duration: 15, price: 55000 },
  { boatReg: "ROCKY-002", origin: "Gili Air", destination: "Gili Trawangan", time: "08:25", duration: 15, price: 55000 },
  { boatReg: "ROCKY-002", origin: "Gili Trawangan", destination: "Gili Air", time: "12:30", duration: 15, price: 55000 },
  { boatReg: "ROCKY-002", origin: "Gili Air", destination: "Gili Trawangan", time: "13:00", duration: 15, price: 55000 },
  { boatReg: "ROCKY-002", origin: "Gili Trawangan", destination: "Gili Air", time: "17:00", duration: 15, price: 55000 },
  { boatReg: "ROCKY-002", origin: "Gili Air", destination: "Gili Trawangan", time: "17:30", duration: 15, price: 55000 },

  // Crown
  { boatReg: "CROWN-002", origin: "Gili Trawangan", destination: "Gili Air", time: "10:00", duration: 20, price: 65000 },
  { boatReg: "CROWN-002", origin: "Gili Air", destination: "Gili Trawangan", time: "10:35", duration: 20, price: 65000 },
  { boatReg: "CROWN-002", origin: "Gili Trawangan", destination: "Gili Air", time: "15:00", duration: 20, price: 65000 },
  { boatReg: "CROWN-002", origin: "Gili Air", destination: "Gili Trawangan", time: "15:35", duration: 20, price: 65000 },

  // ── Gili Meno ↔ Gili Air (inter-island hop) ────────────────────────────

  // Rocky
  { boatReg: "ROCKY-002", origin: "Gili Meno", destination: "Gili Air", time: "08:10", duration: 10, price: 45000 },
  { boatReg: "ROCKY-002", origin: "Gili Air", destination: "Gili Meno", time: "08:30", duration: 10, price: 45000 },
  { boatReg: "ROCKY-002", origin: "Gili Meno", destination: "Gili Air", time: "13:00", duration: 10, price: 45000 },
  { boatReg: "ROCKY-002", origin: "Gili Air", destination: "Gili Meno", time: "13:20", duration: 10, price: 45000 },

  // Crown
  { boatReg: "CROWN-002", origin: "Gili Meno", destination: "Gili Air", time: "10:15", duration: 15, price: 55000 },
  { boatReg: "CROWN-002", origin: "Gili Air", destination: "Gili Meno", time: "10:45", duration: 15, price: 55000 },
  { boatReg: "CROWN-002", origin: "Gili Meno", destination: "Gili Air", time: "16:00", duration: 15, price: 55000 },
  { boatReg: "CROWN-002", origin: "Gili Air", destination: "Gili Meno", time: "16:30", duration: 15, price: 55000 },

  // ── Kusamba ↔ Nusa Penida ──────────────────────────────────────────────

  // Glory
  { boatReg: "GLORY-001", origin: "Kusamba", destination: "Nusa Penida", time: "08:00", duration: 25, price: 120000 },
  { boatReg: "GLORY-001", origin: "Nusa Penida", destination: "Kusamba", time: "09:00", duration: 25, price: 120000 },
  { boatReg: "GLORY-001", origin: "Kusamba", destination: "Nusa Penida", time: "14:00", duration: 25, price: 120000 },
  { boatReg: "GLORY-001", origin: "Nusa Penida", destination: "Kusamba", time: "15:00", duration: 25, price: 120000 },

  // ── Serangan ↔ Nusa Penida ─────────────────────────────────────────────

  // BlueWater
  { boatReg: "BLUEWATER-002", origin: "Serangan", destination: "Nusa Penida", time: "10:30", duration: 60, price: 350000 },
  { boatReg: "BLUEWATER-002", origin: "Nusa Penida", destination: "Serangan", time: "15:00", duration: 60, price: 350000 },

  // ── Serangan ↔ Nusa Lembongan ──────────────────────────────────────────

  // Marina Srikandi
  { boatReg: "MARINA-SRIKANDI-001", origin: "Serangan", destination: "Nusa Lembongan", time: "09:00", duration: 50, price: 300000 },
  { boatReg: "MARINA-SRIKANDI-001", origin: "Nusa Lembongan", destination: "Serangan", time: "14:00", duration: 50, price: 300000 },

  // ── Teluk Kode ↔ Gili Trawangan ────────────────────────────────────────

  // Crown
  { boatReg: "CROWN-001", origin: "Teluk Kode", destination: "Gili Trawangan", time: "08:30", duration: 30, price: 100000 },
  { boatReg: "CROWN-001", origin: "Gili Trawangan", destination: "Teluk Kode", time: "09:15", duration: 30, price: 100000 },
  { boatReg: "CROWN-001", origin: "Teluk Kode", destination: "Gili Trawangan", time: "14:30", duration: 30, price: 100000 },
  { boatReg: "CROWN-001", origin: "Gili Trawangan", destination: "Teluk Kode", time: "15:15", duration: 30, price: 100000 },

  // ── Teluk Kode ↔ Gili Meno ─────────────────────────────────────────────

  // Crown
  { boatReg: "CROWN-001", origin: "Teluk Kode", destination: "Gili Meno", time: "08:30", duration: 25, price: 100000 },
  { boatReg: "CROWN-001", origin: "Gili Meno", destination: "Teluk Kode", time: "09:10", duration: 25, price: 100000 },

  // ── Teluk Kode ↔ Gili Air ──────────────────────────────────────────────

  // Crown
  { boatReg: "CROWN-001", origin: "Teluk Kode", destination: "Gili Air", time: "08:30", duration: 35, price: 100000 },
  { boatReg: "CROWN-001", origin: "Gili Air", destination: "Teluk Kode", time: "09:20", duration: 35, price: 100000 },

  // ── Nusa Penida ↔ Gili Gede ────────────────────────────────────────────

  // Manta
  { boatReg: "MANTA-001", origin: "Nusa Penida", destination: "Gili Gede", time: "09:30", duration: 90, price: 400000 },
  { boatReg: "MANTA-001", origin: "Gili Gede", destination: "Nusa Penida", time: "11:30", duration: 90, price: 400000 },
];

// ── Seed function ──────────────────────────────────────────────────────────

export type SeedSmallBoatsResult = {
  operators: number;
  boats: number;
  schedules: number;
  legsGenerated: number;
  operatorEmails: string[];
};

export async function seedSmallBoats(opts: {
  defaultPassword?: string;
} = {}): Promise<SeedSmallBoatsResult> {
  const opPasswordHash = await bcrypt.hash(
    opts.defaultPassword ?? "changeme123",
    12,
  );

  // 1. Upsert operators
  const operatorIds: Record<string, string> = {};
  for (const op of OPERATORS) {
    const row = await prisma.operator.upsert({
      where: { email: op.email },
      create: {
        email: op.email,
        passwordHash: opPasswordHash,
        companyName: op.companyName,
        contactPerson: op.contactPerson,
        phoneNumber: op.phoneNumber,
        status: "ACTIVE",
        documentsVerified: true,
        bankAccountInfo: {
          bankName: "BCA",
          accountNumber: "0000000000",
          accountHolder: op.companyName,
        },
      },
      update: {
        companyName: op.companyName,
        contactPerson: op.contactPerson,
        phoneNumber: op.phoneNumber,
        status: "ACTIVE",
      },
    });
    operatorIds[op.key] = row.id;
    console.log(`  ✓ operator: ${op.companyName}`);
  }

  // 2. Upsert boats
  const boatIds: Record<string, string> = {};
  for (const b of BOATS) {
    const opId = operatorIds[b.operatorKey];
    if (!opId) {
      console.warn(`  ⚠ skipping boat ${b.reg}: operator "${b.operatorKey}" not found`);
      continue;
    }
    const row = await prisma.boat.upsert({
      where: { registrationNumber: b.reg },
      create: {
        operatorId: opId,
        name: b.name,
        registrationNumber: b.reg,
        capacity: b.capacity,
        photos: [],
        description: b.description,
        status: "ACTIVE",
      },
      update: {
        operatorId: opId,
        name: b.name,
        capacity: b.capacity,
        description: b.description,
        status: "ACTIVE",
      },
    });
    boatIds[b.reg] = row.id;
    console.log(`  ✓ boat: ${b.name} (${b.reg}, cap ${b.capacity})`);
  }

  // 3. Upsert schedules
  const pricingTiers = [
    { minOccupancyPct: 50, multiplier: 1.1 },
    { minOccupancyPct: 80, multiplier: 1.25 },
  ];

  const scheduleIds: string[] = [];
  for (const s of SCHEDULES) {
    const boatId = boatIds[s.boatReg];
    if (!boatId) {
      console.warn(`  ⚠ skipping schedule: boat "${s.boatReg}" not found`);
      continue;
    }
    const existing = await prisma.schedule.findFirst({
      where: {
        boatId,
        originPort: s.origin,
        destinationPort: s.destination,
        departureTime: s.time,
      },
    });
    const row = existing
      ? await prisma.schedule.update({
          where: { id: existing.id },
          data: {
            durationMinutes: s.duration,
            basePrice: s.price,
            daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
            status: "ACTIVE",
            pricingTiers,
          },
        })
      : await prisma.schedule.create({
          data: {
            boatId,
            originPort: s.origin,
            destinationPort: s.destination,
            departureTime: s.time,
            durationMinutes: s.duration,
            basePrice: s.price,
            daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
            status: "ACTIVE",
            pricingTiers,
          },
        });
    scheduleIds.push(row.id);
  }
  console.log(`  ✓ ${scheduleIds.length} schedules upserted`);

  // 4. Generate upcoming legs
  let totalLegs = 0;
  for (const sid of scheduleIds) {
    const n = await generateLegsForSchedule(sid);
    totalLegs += n;
  }
  console.log(`  ✓ ${totalLegs} upcoming legs generated`);

  return {
    operators: OPERATORS.length,
    boats: BOATS.length,
    schedules: scheduleIds.length,
    legsGenerated: totalLegs,
    operatorEmails: OPERATORS.map((o) => o.email),
  };
}

// ── CLI entry ──────────────────────────────────────────────────────────────

async function main() {
  console.log("🌊 Seeding small boat travel data (Bali & Lombok small islands)...\n");

  const result = await seedSmallBoats();

  console.log("\n✅ Seed complete!");
  console.log(`   ${result.operators} operators`);
  console.log(`   ${result.boats} boats`);
  console.log(`   ${result.schedules} schedules`);
  console.log(`   ${result.legsGenerated} upcoming legs generated`);
  console.log("\n📋 Operator login credentials (password: changeme123):");
  for (const email of result.operatorEmails) {
    console.log(`   ${email}`);
  }
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
