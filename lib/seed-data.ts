/**
 * Comprehensive operator + schedule data for Bali, Lombok, NTB & NTT.
 *
 * Sources: published fast-boat rates, ASDP public ferry timetable,
 * competitor analysis (see docs/giligetaway-synthesis.md).
 *
 * All prices are PUBLISH (rack) rates in IDR — what customers pay.
 * Commission is computed at booking time by lib/pricing.ts.
 *
 * Idempotent (upserts), additive (does not delete existing data).
 */

import bcrypt from "bcryptjs";
import type { BoatFacility, OperatorService, FareRefundability, ScheduleType } from "@prisma/client";
import { prisma } from "./db";
import { generateLegsForSchedule } from "./legs";

// ============ PORT CONSTANTS ============

const P = {
  PADANG_BAI:    "Padang Bai",
  SERANGAN:      "Serangan",
  SANUR:         "Sanur",
  AMED:          "Amed",
  PENIDA:        "Nusa Penida",
  LEMBONGAN:     "Nusa Lembongan",
  GILI_T:        "Gili Trawangan",
  GILI_AIR:      "Gili Air",
  GILI_MENO:     "Gili Meno",
  GILI_GEDE:     "Gili Gede",
  BANGSAL:       "Bangsal",
  KUTA_LOMBOK:   "Kuta Lombok",
  KAYANGAN:      "Kayangan",
  LEMBAR:        "Lembar",
  LABUAN_BAJO:   "Labuan Bajo",
  KOMODO:        "Komodo Island",
} as const;

// ============ REAL OPERATORS ============

type SeedOperator = {
  key: string;
  email: string;
  companyName: string;
  contactPerson: string;
  phoneNumber: string;
  services: OperatorService[];
};

const OPERATORS: SeedOperator[] = [
  // ── Padang Bai fast boats ──
  {
    key: "eka-jaya",
    email: "eka-jaya@gilijet.local",
    companyName: "PT. BALI EKA JAYA",
    contactPerson: "Bali Eka Jaya",
    phoneNumber: "+62 361 234 5670",
    services: ["BAGGAGE_INSURANCE", "HOTEL_TRANSFER", "CHILD_DISCOUNT"],
  },
  {
    key: "wijaya",
    email: "wijaya@gilijet.local",
    companyName: "PT. WIJAYA BUYUK ABADI",
    contactPerson: "Wijaya Buyuk Abadi",
    phoneNumber: "+62 361 234 5671",
    services: ["CHILD_DISCOUNT", "GROUP_BOOKING"],
  },
  {
    key: "golden-queen",
    email: "golden-queen@gilijet.local",
    companyName: "PT. GOLDEN QUEEN BALI",
    contactPerson: "Golden Queen Bali",
    phoneNumber: "+62 361 234 5672",
    services: ["HOTEL_TRANSFER", "CHILD_DISCOUNT", "GROUP_BOOKING"],
  },
  {
    key: "ostina",
    email: "ostina@gilijet.local",
    companyName: "PT. OSTINA",
    contactPerson: "Ostina",
    phoneNumber: "+62 361 234 5673",
    services: ["CHILD_DISCOUNT", "FLEXIBLE_RESCHEDULE"],
  },
  {
    key: "inami",
    email: "inami@gilijet.local",
    companyName: "PT. INAMI CRUISE",
    contactPerson: "Inami Cruise",
    phoneNumber: "+62 361 234 5674",
    services: ["BAGGAGE_INSURANCE", "MEAL_INCLUDED", "PRIORITY_BOARDING"],
  },
  {
    key: "gili-gili",
    email: "gili-gili@gilijet.local",
    companyName: "PT. GILI GILI FASTBOAT",
    contactPerson: "Gili Gili Fastboat",
    phoneNumber: "+62 361 234 5675",
    services: ["CHILD_DISCOUNT"],
  },
  {
    key: "wahana",
    email: "wahana@gilijet.local",
    companyName: "PT. WAHANA GILI OCEAN",
    contactPerson: "Wahana Gili Ocean",
    phoneNumber: "+62 361 234 5676",
    services: ["FLEXIBLE_RESCHEDULE", "CHILD_DISCOUNT", "GROUP_BOOKING"],
  },
  // ── Serangan corridor ──
  {
    key: "samudra-jet",
    email: "samudra-jet@gilijet.local",
    companyName: "PT. SAMUDRA JET BALI",
    contactPerson: "Samudra Jet Bali",
    phoneNumber: "+62 361 234 5680",
    services: ["BAGGAGE_INSURANCE", "TRAVEL_INSURANCE", "MEAL_INCLUDED", "PRIORITY_BOARDING"],
  },
  {
    key: "maruti",
    email: "maruti@gilijet.local",
    companyName: "PT. MARUTI EXPRESS",
    contactPerson: "Maruti Express",
    phoneNumber: "+62 361 234 5681",
    services: ["HOTEL_TRANSFER", "CHILD_DISCOUNT"],
  },
  // ── Sanur → Penida/Lembongan ──
  {
    key: "glory-express",
    email: "glory@gilijet.local",
    companyName: "PT. GLORY EXPRESS",
    contactPerson: "Glory Express",
    phoneNumber: "+62 361 234 5682",
    services: ["WHEELCHAIR_ACCESSIBLE", "CHILD_DISCOUNT"],
  },
  {
    key: "marlin",
    email: "marlin@gilijet.local",
    companyName: "PT. MARLIN FAST BOAT",
    contactPerson: "Marlin Fast Boat",
    phoneNumber: "+62 361 234 5683",
    services: ["GROUP_BOOKING", "CHILD_DISCOUNT"],
  },
  // ── Amed / Gili inter-island ──
  {
    key: "free-bird",
    email: "free-bird@gilijet.local",
    companyName: "PT. FREE BIRD EXPRESS",
    contactPerson: "Free Bird Express",
    phoneNumber: "+62 361 234 5684",
    services: ["FLEXIBLE_RESCHEDULE", "CHILD_DISCOUNT", "GROUP_BOOKING"],
  },
  // ── Public ferry ──
  {
    key: "asdp",
    email: "asdp@gilijet.local",
    companyName: "PT. ASDP INDONESIA FERRY",
    contactPerson: "ASDP Ferry",
    phoneNumber: "+62 361 234 5677",
    services: ["WHEELCHAIR_ACCESSIBLE", "PET_FRIENDLY", "GROUP_BOOKING"],
  },
  // ── NTT / Flores corridor ──
  {
    key: "wanua",
    email: "wanua@gilijet.local",
    companyName: "PT. WANUA ADVENTURE",
    contactPerson: "Wanua Adventure",
    phoneNumber: "+62 370 234 5678",
    services: ["MEAL_INCLUDED", "TRAVEL_INSURANCE", "GROUP_BOOKING"],
  },
  {
    key: "le-pirate",
    email: "le-pirate@gilijet.local",
    companyName: "PT. LE PIRATE EXPLORER",
    contactPerson: "Le Pirate Explorer",
    phoneNumber: "+62 385 234 5679",
    services: ["MEAL_INCLUDED", "TRAVEL_INSURANCE", "PRIORITY_BOARDING"],
  },
];

// ============ BOATS ============

type SeedBoat = {
  reg: string;
  name: string;
  operatorKey: string;
  capacity: number;
  description: string;
  facilities: BoatFacility[];
};

const BOATS: SeedBoat[] = [
  // Eka Jaya (premium fast boat)
  { reg: "EKA-JAYA-I",  name: "EKA JAYA I",   operatorKey: "eka-jaya",  capacity: 80, description: "Premium fast boat — Padang Bai ↔ Gili / Bangsal / Amed.", facilities: ["AIR_CONDITIONING", "TOILET", "LIFE_JACKET", "LIFE_RAFT", "ENTERTAINMENT_SYSTEM", "BAGGAGE_COMPARTMENT", "CABIN_SEATING"] },
  { reg: "EKA-JAYA-II", name: "EKA JAYA II",  operatorKey: "eka-jaya",  capacity: 80, description: "Afternoon Padang Bai departures + Penida corridor.", facilities: ["AIR_CONDITIONING", "TOILET", "LIFE_JACKET", "LIFE_RAFT", "ENTERTAINMENT_SYSTEM", "BAGGAGE_COMPARTMENT", "CABIN_SEATING"] },
  // Wijaya
  { reg: "WIJAYA-I",  name: "WIJAYA I",   operatorKey: "wijaya",  capacity: 60, description: "Daily Padang Bai ↔ Gili route.", facilities: ["LIFE_JACKET", "LIFE_RAFT", "TOILET", "CABIN_SEATING"] },
  { reg: "WIJAYA-II", name: "WIJAYA II",  operatorKey: "wijaya",  capacity: 60, description: "Daily reverse Gili → Padang Bai route.", facilities: ["LIFE_JACKET", "LIFE_RAFT", "TOILET", "CABIN_SEATING"] },
  // Golden Queen
  { reg: "GOLDEN-QUEEN-I",  name: "GOLDEN QUEEN I",  operatorKey: "golden-queen",  capacity: 65, description: "Morning Padang Bai departures with hotel pickup.", facilities: ["AIR_CONDITIONING", "TOILET", "LIFE_JACKET", "LIFE_RAFT", "SNACK_SERVICE", "CABIN_SEATING"] },
  { reg: "GOLDEN-QUEEN-II", name: "GOLDEN QUEEN II", operatorKey: "golden-queen",  capacity: 65, description: "Midday departures, Padang Bai ↔ Gili.", facilities: ["AIR_CONDITIONING", "TOILET", "LIFE_JACKET", "LIFE_RAFT", "SNACK_SERVICE", "CABIN_SEATING"] },
  // Ostina
  { reg: "OSTINA", name: "OSTINA", operatorKey: "ostina", capacity: 50, description: "Competitive flat-rate pricing, Padang Bai ↔ Gili.", facilities: ["LIFE_JACKET", "LIFE_RAFT", "TOILET", "OUTDOOR_DECK"] },
  // Inami Luxury
  { reg: "INAMI-LUXURY", name: "INAMI LUXURY", operatorKey: "inami", capacity: 55, description: "Luxury AC cabin with snack service.", facilities: ["AIR_CONDITIONING", "TOILET", "WIFI", "LIFE_JACKET", "LIFE_RAFT", "SNACK_SERVICE", "DRINK_SERVICE", "BLANKET", "CABIN_SEATING"] },
  // Gili Gili
  { reg: "GILI-GILI-FASTBOAT", name: "GILI-GILI FASTBOAT", operatorKey: "gili-gili", capacity: 60, description: "Reliable daily fast boat.", facilities: ["LIFE_JACKET", "LIFE_RAFT", "TOILET", "CABIN_SEATING"] },
  // Wahana
  { reg: "WAHANA-VIRENDRA", name: "WAHANA VIRENDRA", operatorKey: "wahana", capacity: 60, description: "Inter-island including Gili-to-Gili hops.", facilities: ["LIFE_JACKET", "LIFE_RAFT", "TOILET", "OUTDOOR_DECK"] },
  // Samudra Jet (premium Serangan)
  { reg: "SAMUDRA-JET-I",  name: "SAMUDRA JET I",  operatorKey: "samudra-jet", capacity: 80, description: "Serangan ↔ Gili corridor — morning luxury.", facilities: ["AIR_CONDITIONING", "TOILET", "WIFI", "LIFE_JACKET", "LIFE_RAFT", "ENTERTAINMENT_SYSTEM", "SNACK_SERVICE", "DRINK_SERVICE", "BAGGAGE_COMPARTMENT", "CABIN_SEATING"] },
  { reg: "SAMUDRA-JET-II", name: "SAMUDRA JET II", operatorKey: "samudra-jet", capacity: 65, description: "Serangan ↔ Penida ↔ Gili Gede / Lombok.", facilities: ["AIR_CONDITIONING", "TOILET", "WIFI", "LIFE_JACKET", "LIFE_RAFT", "SNACK_SERVICE", "DRINK_SERVICE", "CABIN_SEATING"] },
  // Maruti (Serangan budget)
  { reg: "MARUTI-EXPRESS", name: "MARUTI EXPRESS", operatorKey: "maruti", capacity: 50, description: "Budget Serangan ↔ Lombok corridor.", facilities: ["LIFE_JACKET", "LIFE_RAFT", "OUTDOOR_DECK"] },
  // Sanur → Penida/Lembongan
  { reg: "GLORY-EXPRESS-I",  name: "GLORY EXPRESS I",  operatorKey: "glory-express", capacity: 45, description: "Sanur ↔ Penida fast express.", facilities: ["LIFE_JACKET", "LIFE_RAFT", "TOILET", "CHARGING_PORT"] },
  { reg: "GLORY-EXPRESS-II", name: "GLORY EXPRESS II", operatorKey: "glory-express", capacity: 45, description: "Sanur ↔ Lembongan + Penida.", facilities: ["LIFE_JACKET", "LIFE_RAFT", "TOILET", "CHARGING_PORT"] },
  { reg: "MARLIN-FAST", name: "MARLIN FAST", operatorKey: "marlin", capacity: 50, description: "Sanur → Penida / Lembongan fast boat.", facilities: ["LIFE_JACKET", "LIFE_RAFT", "OUTDOOR_DECK"] },
  // Free Bird (Amed / Penida)
  { reg: "FREE-BIRD-I",  name: "FREE BIRD I",  operatorKey: "free-bird",  capacity: 55, description: "Amed ↔ Gili + Penida ↔ Gili corridor.", facilities: ["LIFE_JACKET", "LIFE_RAFT", "TOILET", "CABIN_SEATING"] },
  { reg: "FREE-BIRD-II", name: "FREE BIRD II", operatorKey: "free-bird",  capacity: 55, description: "Penida ↔ Lombok corridor.", facilities: ["LIFE_JACKET", "LIFE_RAFT", "TOILET", "CABIN_SEATING"] },
  // ASDP Ferry
  { reg: "ASDP-KMP-1", name: "KMP. GILIMANUK I",  operatorKey: "asdp", capacity: 300, description: "Public ferry — cars, motorbikes, passengers. 4–5 hrs.", facilities: ["TOILET", "LIFE_JACKET", "LIFE_RAFT", "FIRST_AID_KIT", "OUTDOOR_DECK", "SMOKING_AREA", "PRAYER_ROOM"] },
  // Wanua Adventure (Lombok → Flores)
  { reg: "WANUA-ADVENTURE", name: "WANUA ADVENTURE", operatorKey: "wanua", capacity: 40, description: "Lombok → Komodo / Flores slow boat (overnight).", facilities: ["LIFE_JACKET", "LIFE_RAFT", "TOILET", "BLANKET", "OUTDOOR_DECK"] },
  // Le Pirate (Labuan Bajo)
  { reg: "LE-PIRATE-I", name: "LE PIRATE I", operatorKey: "le-pirate", capacity: 35, description: "Labuan Bajo → Komodo island hopping.", facilities: ["LIFE_JACKET", "LIFE_RAFT", "SNACK_SERVICE", "DRINK_SERVICE", "OUTDOOR_DECK"] },
];

// ============ SCHEDULES ============

type SeedSchedule = {
  boatReg: string;
  origin: string;
  destination: string;
  time: string;
  duration: number;
  price: number;
  scheduleType: ScheduleType;
  fareRefundability: FareRefundability;
};

const SCHEDULES: SeedSchedule[] = [
  // ═══ PADANG BAI → GILI ISLANDS (morning wave) ═══
  { boatReg: "EKA-JAYA-I",  origin: P.PADANG_BAI, destination: P.GILI_T,    time: "08:30", duration: 90,  price: 385_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "EKA-JAYA-I",  origin: P.PADANG_BAI, destination: P.GILI_AIR,  time: "08:30", duration: 115, price: 385_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "EKA-JAYA-I",  origin: P.PADANG_BAI, destination: P.GILI_MENO, time: "08:30", duration: 100, price: 385_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "EKA-JAYA-I",  origin: P.PADANG_BAI, destination: P.BANGSAL,   time: "08:30", duration: 135, price: 385_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "GOLDEN-QUEEN-I",  origin: P.PADANG_BAI, destination: P.GILI_T,   time: "09:00", duration: 100, price: 350_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "GOLDEN-QUEEN-I",  origin: P.PADANG_BAI, destination: P.GILI_AIR, time: "09:00", duration: 130, price: 350_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "OSTINA",       origin: P.PADANG_BAI, destination: P.GILI_T,    time: "09:00", duration: 110, price: 300_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "OSTINA",       origin: P.PADANG_BAI, destination: P.GILI_AIR,  time: "09:00", duration: 135, price: 300_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "WIJAYA-I",     origin: P.PADANG_BAI, destination: P.GILI_T,    time: "09:15", duration: 100, price: 275_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "WIJAYA-I",     origin: P.PADANG_BAI, destination: P.GILI_AIR,  time: "09:15", duration: 125, price: 275_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "WIJAYA-I",     origin: P.PADANG_BAI, destination: P.GILI_MENO, time: "09:15", duration: 110, price: 275_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "INAMI-LUXURY", origin: P.PADANG_BAI, destination: P.GILI_T,    time: "09:30", duration: 100, price: 425_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "INAMI-LUXURY", origin: P.PADANG_BAI, destination: P.GILI_AIR,  time: "09:30", duration: 125, price: 425_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "INAMI-LUXURY", origin: P.PADANG_BAI, destination: P.GILI_MENO, time: "09:30", duration: 110, price: 425_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "GILI-GILI-FASTBOAT", origin: P.PADANG_BAI, destination: P.GILI_T,   time: "09:30", duration: 100, price: 300_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "GILI-GILI-FASTBOAT", origin: P.PADANG_BAI, destination: P.GILI_AIR, time: "09:30", duration: 130, price: 300_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "GILI-GILI-FASTBOAT", origin: P.PADANG_BAI, destination: P.GILI_MENO,time: "09:30", duration: 115, price: 300_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "GOLDEN-QUEEN-II", origin: P.PADANG_BAI, destination: P.GILI_T,   time: "09:30", duration: 100, price: 350_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "GOLDEN-QUEEN-II", origin: P.PADANG_BAI, destination: P.GILI_AIR, time: "09:30", duration: 130, price: 350_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "GOLDEN-QUEEN-II", origin: P.PADANG_BAI, destination: P.BANGSAL,  time: "09:30", duration: 165, price: 350_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },

  // ═══ GILI → PADANG BAI (morning returns) ═══
  { boatReg: "EKA-JAYA-I",     origin: P.GILI_T,  destination: P.PADANG_BAI, time: "10:00", duration: 150, price: 385_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "EKA-JAYA-I",     origin: P.GILI_AIR,destination: P.PADANG_BAI, time: "10:30", duration: 125, price: 385_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "WIJAYA-II",      origin: P.GILI_T,  destination: P.PADANG_BAI, time: "09:00", duration: 150, price: 275_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "WIJAYA-II",      origin: P.BANGSAL, destination: P.PADANG_BAI, time: "10:00", duration: 120, price: 275_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "INAMI-LUXURY",   origin: P.GILI_T,  destination: P.PADANG_BAI, time: "12:00", duration: 120, price: 425_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "GOLDEN-QUEEN-II",origin: P.GILI_T,  destination: P.PADANG_BAI, time: "11:30", duration: 130, price: 350_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "GOLDEN-QUEEN-II",origin: P.GILI_AIR,destination: P.PADANG_BAI, time: "11:45", duration: 110, price: 350_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "OSTINA",          origin: P.GILI_T,  destination: P.PADANG_BAI, time: "11:30", duration: 120, price: 300_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "WIJAYA-I",       origin: P.GILI_T,  destination: P.PADANG_BAI, time: "12:00", duration: 150, price: 275_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "WIJAYA-II",      origin: P.GILI_AIR,destination: P.PADANG_BAI, time: "09:30", duration: 120, price: 275_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },

  // ═══ PADANG BAI → GILI (afternoon wave) ═══
  { boatReg: "EKA-JAYA-II",  origin: P.PADANG_BAI, destination: P.GILI_T,    time: "13:00", duration: 90,  price: 385_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "EKA-JAYA-II",  origin: P.PADANG_BAI, destination: P.GILI_AIR,  time: "13:00", duration: 115, price: 385_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "EKA-JAYA-II",  origin: P.PADANG_BAI, destination: P.GILI_MENO, time: "13:00", duration: 100, price: 385_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "EKA-JAYA-II",  origin: P.PADANG_BAI, destination: P.BANGSAL,   time: "13:00", duration: 135, price: 385_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "WIJAYA-II",    origin: P.PADANG_BAI, destination: P.GILI_T,    time: "13:00", duration: 100, price: 275_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "WAHANA-VIRENDRA",origin: P.PADANG_BAI, destination: P.GILI_T,  time: "13:30", duration: 90,  price: 325_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "WAHANA-VIRENDRA",origin: P.PADANG_BAI, destination: P.GILI_AIR,time: "13:30", duration: 120, price: 325_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "WAHANA-VIRENDRA",origin: P.PADANG_BAI, destination: P.BANGSAL, time: "13:30", duration: 135, price: 325_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },

  // ═══ GILI → PADANG BAI (afternoon returns) ═══
  { boatReg: "EKA-JAYA-II",   origin: P.GILI_T,   destination: P.PADANG_BAI, time: "15:00", duration: 150, price: 385_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "EKA-JAYA-II",   origin: P.GILI_AIR, destination: P.PADANG_BAI, time: "15:20", duration: 130, price: 385_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "WAHANA-VIRENDRA",origin: P.GILI_T,   destination: P.PADANG_BAI, time: "15:30", duration: 120, price: 325_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "WAHANA-VIRENDRA",origin: P.GILI_AIR, destination: P.PADANG_BAI, time: "16:00", duration: 100, price: 325_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "WAHANA-VIRENDRA",origin: P.BANGSAL,  destination: P.PADANG_BAI, time: "16:30", duration: 90,  price: 325_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "EKA-JAYA-II",   origin: P.BANGSAL,   destination: P.PADANG_BAI, time: "15:45", duration: 105, price: 385_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },

  // ═══ SERANGAN → GILI (Samudra Jet — premium) ═══
  { boatReg: "SAMUDRA-JET-I",  origin: P.SERANGAN, destination: P.GILI_T,    time: "09:00", duration: 135, price: 825_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "SAMUDRA-JET-I",  origin: P.SERANGAN, destination: P.GILI_AIR,  time: "09:00", duration: 165, price: 825_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "SAMUDRA-JET-I",  origin: P.SERANGAN, destination: P.GILI_MENO, time: "09:00", duration: 150, price: 825_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "SAMUDRA-JET-I",  origin: P.SERANGAN, destination: P.BANGSAL,   time: "09:00", duration: 180, price: 825_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "SAMUDRA-JET-I",  origin: P.GILI_T,    destination: P.SERANGAN, time: "11:30", duration: 165, price: 825_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "SAMUDRA-JET-I",  origin: P.GILI_AIR,  destination: P.SERANGAN, time: "11:45", duration: 150, price: 825_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "SAMUDRA-JET-I",  origin: P.BANGSAL,   destination: P.SERANGAN, time: "12:00", duration: 135, price: 825_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  // Samudra Jet II — Penida / Gili Gede corridor
  { boatReg: "SAMUDRA-JET-II", origin: P.SERANGAN, destination: P.PENIDA,    time: "10:30", duration: 60,  price: 450_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "SAMUDRA-JET-II", origin: P.SERANGAN, destination: P.GILI_GEDE, time: "10:30", duration: 120, price: 960_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "SAMUDRA-JET-II", origin: P.PENIDA,    destination: P.GILI_GEDE,time: "11:30", duration: 60,  price: 500_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "SAMUDRA-JET-II", origin: P.GILI_GEDE, destination: P.PENIDA,   time: "12:45", duration: 60,  price: 500_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "SAMUDRA-JET-II", origin: P.GILI_GEDE, destination: P.SERANGAN, time: "12:45", duration: 120, price: 960_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "SAMUDRA-JET-II", origin: P.PENIDA,    destination: P.SERANGAN, time: "13:45", duration: 60,  price: 450_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },

  // ═══ SERANGAN → LOMBOK (Maruti) ═══
  { boatReg: "MARUTI-EXPRESS", origin: P.SERANGAN, destination: P.BANGSAL,     time: "08:30", duration: 180, price: 400_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "MARUTI-EXPRESS", origin: P.SERANGAN, destination: P.KUTA_LOMBOK, time: "08:30", duration: 210, price: 450_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "MARUTI-EXPRESS", origin: P.BANGSAL,   destination: P.SERANGAN,   time: "13:00", duration: 180, price: 400_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },

  // ═══ SANUR → NUSA PENIDA / LEMBONGAN (highest volume corridor) ═══
  { boatReg: "GLORY-EXPRESS-I",  origin: P.SANUR, destination: P.PENIDA,    time: "07:30", duration: 45, price: 200_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "GLORY-EXPRESS-I",  origin: P.SANUR, destination: P.PENIDA,    time: "08:30", duration: 45, price: 200_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "GLORY-EXPRESS-I",  origin: P.SANUR, destination: P.PENIDA,    time: "09:30", duration: 45, price: 200_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "GLORY-EXPRESS-I",  origin: P.SANUR, destination: P.PENIDA,    time: "10:30", duration: 45, price: 200_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "GLORY-EXPRESS-I",  origin: P.SANUR, destination: P.LEMBONGAN, time: "08:00", duration: 35, price: 175_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "GLORY-EXPRESS-II", origin: P.SANUR, destination: P.LEMBONGAN, time: "10:00", duration: 35, price: 175_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "GLORY-EXPRESS-II", origin: P.SANUR, destination: P.PENIDA,    time: "07:45", duration: 45, price: 200_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "GLORY-EXPRESS-II", origin: P.SANUR, destination: P.PENIDA,    time: "09:15", duration: 45, price: 200_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "MARLIN-FAST",      origin: P.SANUR, destination: P.PENIDA,    time: "08:00", duration: 45, price: 175_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "MARLIN-FAST",      origin: P.SANUR, destination: P.PENIDA,    time: "09:00", duration: 45, price: 175_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "MARLIN-FAST",      origin: P.SANUR, destination: P.LEMBONGAN, time: "08:30", duration: 35, price: 150_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "MARLIN-FAST",      origin: P.SANUR, destination: P.LEMBONGAN, time: "10:30", duration: 35, price: 150_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  // Penida → Sanur returns
  { boatReg: "GLORY-EXPRESS-I",  origin: P.PENIDA, destination: P.SANUR, time: "12:30", duration: 45, price: 200_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "GLORY-EXPRESS-I",  origin: P.PENIDA, destination: P.SANUR, time: "14:00", duration: 45, price: 200_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "GLORY-EXPRESS-I",  origin: P.PENIDA, destination: P.SANUR, time: "16:00", duration: 45, price: 200_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "MARLIN-FAST",      origin: P.PENIDA, destination: P.SANUR, time: "13:00", duration: 45, price: 175_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "MARLIN-FAST",      origin: P.PENIDA, destination: P.SANUR, time: "15:30", duration: 45, price: 175_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "GLORY-EXPRESS-II", origin: P.LEMBONGAN, destination: P.SANUR, time: "13:00", duration: 35, price: 175_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "MARLIN-FAST",      origin: P.LEMBONGAN, destination: P.SANUR, time: "14:30", duration: 35, price: 150_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },

  // ═══ AMED → GILI ISLANDS ═══
  { boatReg: "FREE-BIRD-I", origin: P.AMED, destination: P.GILI_T,    time: "09:00", duration: 60,  price: 400_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "FREE-BIRD-I", origin: P.AMED, destination: P.GILI_AIR,  time: "09:00", duration: 75,  price: 400_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "FREE-BIRD-I", origin: P.AMED, destination: P.GILI_MENO, time: "09:00", duration: 70,  price: 400_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "FREE-BIRD-I", origin: P.GILI_T,    destination: P.AMED, time: "14:00", duration: 60,  price: 400_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "FREE-BIRD-I", origin: P.GILI_AIR,  destination: P.AMED, time: "14:15", duration: 50,  price: 400_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "FREE-BIRD-I", origin: P.GILI_MENO, destination: P.AMED, time: "14:30", duration: 55,  price: 400_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },

  // ═══ NUSA PENIDA → GILI / LOMBOK ═══
  { boatReg: "FREE-BIRD-II", origin: P.PENIDA,    destination: P.GILI_T,   time: "10:00", duration: 90,  price: 450_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "FREE-BIRD-II", origin: P.PENIDA,    destination: P.GILI_AIR, time: "10:00", duration: 120, price: 450_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "FREE-BIRD-II", origin: P.PENIDA,    destination: P.BANGSAL,  time: "10:00", duration: 150, price: 500_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "FREE-BIRD-II", origin: P.GILI_T,    destination: P.PENIDA,   time: "12:30", duration: 90,  price: 450_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "FREE-BIRD-II", origin: P.BANGSAL,   destination: P.PENIDA,   time: "10:00", duration: 150, price: 500_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  // Eka Jaya Penida corridor
  { boatReg: "EKA-JAYA-II", origin: P.PENIDA,  destination: P.GILI_T,   time: "10:30", duration: 90,  price: 400_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "EKA-JAYA-II", origin: P.GILI_T,  destination: P.PENIDA,   time: "12:00", duration: 90,  price: 400_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },

  // ═══ GILI-TO-GILI HOPS ═══
  { boatReg: "WAHANA-VIRENDRA", origin: P.GILI_T,    destination: P.GILI_AIR,  time: "08:30", duration: 10,  price: 85_000,  scheduleType: "DIRECT", fareRefundability: "NON_REFUNDABLE" },
  { boatReg: "WAHANA-VIRENDRA", origin: P.GILI_T,    destination: P.GILI_MENO, time: "08:30", duration: 15,  price: 85_000,  scheduleType: "DIRECT", fareRefundability: "NON_REFUNDABLE" },
  { boatReg: "WAHANA-VIRENDRA", origin: P.GILI_AIR,  destination: P.GILI_MENO, time: "08:45", duration: 10,  price: 85_000,  scheduleType: "DIRECT", fareRefundability: "NON_REFUNDABLE" },
  { boatReg: "WAHANA-VIRENDRA", origin: P.GILI_AIR,  destination: P.GILI_T,    time: "11:00", duration: 10,  price: 85_000,  scheduleType: "DIRECT", fareRefundability: "NON_REFUNDABLE" },
  { boatReg: "WAHANA-VIRENDRA", origin: P.GILI_MENO, destination: P.GILI_T,    time: "11:15", duration: 15,  price: 85_000,  scheduleType: "DIRECT", fareRefundability: "NON_REFUNDABLE" },
  { boatReg: "WAHANA-VIRENDRA", origin: P.GILI_MENO, destination: P.GILI_AIR,  time: "11:30", duration: 10,  price: 85_000,  scheduleType: "DIRECT", fareRefundability: "NON_REFUNDABLE" },
  { boatReg: "WAHANA-VIRENDRA", origin: P.GILI_T,    destination: P.BANGSAL,   time: "14:00", duration: 25,  price: 100_000, scheduleType: "DIRECT", fareRefundability: "NON_REFUNDABLE" },
  { boatReg: "WAHANA-VIRENDRA", origin: P.BANGSAL,   destination: P.GILI_T,    time: "14:30", duration: 25,  price: 100_000, scheduleType: "DIRECT", fareRefundability: "NON_REFUNDABLE" },

  // ═══ ASDP PUBLIC FERRY (cheap, slow) ═══
  { boatReg: "ASDP-KMP-1", origin: P.PADANG_BAI, destination: P.LEMBAR,  time: "07:00", duration: 270, price: 60_000, scheduleType: "DIRECT", fareRefundability: "REFUNDABLE" },
  { boatReg: "ASDP-KMP-1", origin: P.PADANG_BAI, destination: P.LEMBAR,  time: "13:00", duration: 270, price: 60_000, scheduleType: "DIRECT", fareRefundability: "REFUNDABLE" },
  { boatReg: "ASDP-KMP-1", origin: P.LEMBAR,      destination: P.PADANG_BAI, time: "07:00", duration: 270, price: 60_000, scheduleType: "DIRECT", fareRefundability: "REFUNDABLE" },
  { boatReg: "ASDP-KMP-1", origin: P.LEMBAR,      destination: P.PADANG_BAI, time: "13:00", duration: 270, price: 60_000, scheduleType: "DIRECT", fareRefundability: "REFUNDABLE" },

  // ═══ LOMBOK → FLORES / NTT ═══
  { boatReg: "WANUA-ADVENTURE", origin: P.BANGSAL,     destination: P.LABUAN_BAJO, time: "08:00", duration: 720,  price: 1_250_000, scheduleType: "TRANSIT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "WANUA-ADVENTURE", origin: P.LABUAN_BAJO, destination: P.BANGSAL,     time: "08:00", duration: 720,  price: 1_250_000, scheduleType: "TRANSIT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "WANUA-ADVENTURE", origin: P.GILI_T,      destination: P.LABUAN_BAJO, time: "09:00", duration: 960,  price: 1_500_000, scheduleType: "TRANSIT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "WANUA-ADVENTURE", origin: P.LABUAN_BAJO, destination: P.GILI_T,      time: "09:00", duration: 960,  price: 1_500_000, scheduleType: "TRANSIT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  // Le Pirate — Komodo island hopping
  { boatReg: "LE-PIRATE-I", origin: P.LABUAN_BAJO, destination: P.KOMODO, time: "08:00", duration: 180, price: 950_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "LE-PIRATE-I", origin: P.KOMODO,      destination: P.LABUAN_BAJO, time: "14:00", duration: 180, price: 950_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "LE-PIRATE-I", origin: P.LABUAN_BAJO, destination: P.KOMODO, time: "10:00", duration: 180, price: 850_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },

  // ═══ LOMBOK → PADANG BAI (late returns) ═══
  { boatReg: "EKA-JAYA-I", origin: P.BANGSAL, destination: P.PADANG_BAI, time: "11:00", duration: 120, price: 385_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "GOLDEN-QUEEN-I", origin: P.GILI_T,  destination: P.PADANG_BAI, time: "11:30", duration: 150, price: 350_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "GOLDEN-QUEEN-I", origin: P.GILI_AIR,destination: P.PADANG_BAI, time: "12:15", duration: 130, price: 350_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "GOLDEN-QUEEN-I", origin: P.BANGSAL, destination: P.PADANG_BAI, time: "12:30", duration: 120, price: 350_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "WIJAYA-I",    origin: P.GILI_AIR,  destination: P.PADANG_BAI, time: "12:15", duration: 135, price: 275_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "WIJAYA-I",    origin: P.BANGSAL,   destination: P.PADANG_BAI, time: "12:30", duration: 120, price: 275_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "INAMI-LUXURY",origin: P.GILI_AIR,  destination: P.PADANG_BAI, time: "12:15", duration: 105, price: 425_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "INAMI-LUXURY",origin: P.BANGSAL,   destination: P.PADANG_BAI, time: "12:30", duration: 90,  price: 425_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "GILI-GILI-FASTBOAT", origin: P.GILI_T,    destination: P.PADANG_BAI, time: "11:30", duration: 130, price: 300_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "GILI-GILI-FASTBOAT", origin: P.GILI_AIR,  destination: P.PADANG_BAI, time: "11:45", duration: 115, price: 300_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
  { boatReg: "GILI-GILI-FASTBOAT", origin: P.BANGSAL,   destination: P.PADANG_BAI, time: "12:00", duration: 105, price: 300_000, scheduleType: "DIRECT", fareRefundability: "PARTIALLY_REFUNDABLE" },
];

// ============ SEED FUNCTION ============

export type SeedRealResult = {
  operators: number;
  boats: number;
  schedules: number;
  facilities: number;
  services: number;
  legsGenerated: number;
  urgencyLegs: number;
  todayLegCount: number;
  operatorEmails: string[];
};

export async function seedRealData(opts: {
  defaultPassword?: string;
} = {}): Promise<SeedRealResult> {
  const opPasswordHash = await bcrypt.hash(
    opts.defaultPassword ?? "changeme123",
    12,
  );

  // ── 1. Operators ──
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
  }

  // ── 2. Operator services ──
  let totalServices = 0;
  for (const op of OPERATORS) {
    const opId = operatorIds[op.key];
    if (!opId) continue;
    for (const svc of op.services) {
      await prisma.operatorServicesOnOperator.upsert({
        where: { operatorId_service: { operatorId: opId, service: svc } },
        create: { operatorId: opId, service: svc },
        update: {},
      });
      totalServices++;
    }
  }

  // ── 3. Boats ──
  const boatIds: Record<string, string> = {};
  for (const b of BOATS) {
    const opId = operatorIds[b.operatorKey];
    if (!opId) continue;
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
  }

  // ── 4. Boat facilities ──
  let totalFacilities = 0;
  for (const b of BOATS) {
    const boatId = boatIds[b.reg];
    if (!boatId) continue;
    for (const f of b.facilities) {
      await prisma.boatFacilitiesOnBoat.upsert({
        where: { boatId_facility: { boatId, facility: f } },
        create: { boatId, facility: f },
        update: {},
      });
      totalFacilities++;
    }
  }

  // ── 5. Schedules ──
  const scheduleIds: string[] = [];
  for (const s of SCHEDULES) {
    const boatId = boatIds[s.boatReg];
    if (!boatId) continue;
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
            scheduleType: s.scheduleType,
            fareRefundability: s.fareRefundability,
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
            scheduleType: s.scheduleType,
            fareRefundability: s.fareRefundability,
          },
        });
    scheduleIds.push(row.id);
  }

  // ── 6. Generate upcoming legs (next 14 days from 06:00 WITA today) ──
  // Use 06:00 WITA today as the reference point so morning departures
  // always generate even when seeding in the afternoon or evening.
  const nowWita = (() => {
    const n = new Date();
    const witaOffset = n.getTimezoneOffset() + 480; // minutes from UTC to WITA
    const witaMs = n.getTime() + witaOffset * 60_000;
    const witaDate = new Date(witaMs);
    witaDate.setHours(6, 0, 0, 0); // 06:00 WITA
    return new Date(witaDate.getTime() - 8 * 3_600_000); // back to UTC
  })();

  let totalLegs = 0;
  for (const sid of scheduleIds) {
    const n = await generateLegsForSchedule(sid, 14, nowWita);
    totalLegs += n;
  }

  // ── 7. Create urgency: near-future legs with scarcity ──
  const realNow = new Date();
  const urgencyWindow = new Date(realNow.getTime() + 12 * 60 * 60 * 1000); // next 12h

  const nearLegs = await prisma.leg.findMany({
    where: {
      status: "OPEN",
      availableSeats: { gte: 3 },
      departureDate: { gte: realNow, lte: urgencyWindow },
    },
    orderBy: { departureDate: "asc" },
    take: 30,
  });

  let urgencyLegs = 0;
  for (let i = 0; i < nearLegs.length; i++) {
    const leg = nearLegs[i];
    // First 3 legs: force them to depart within 1-2 hours, only 1-3 seats left
    if (leg && i < 3) {
      const minutesFromNow = 30 + i * 25; // +30m, +55m, +80m
      const newDeparture = new Date(realNow.getTime() + minutesFromNow * 60_000);
      await prisma.leg.update({
        where: { id: leg.id },
        data: {
          departureDate: newDeparture,
          availableSeats: i + 1, // 1, 2, or 3 seats
        },
      });
      urgencyLegs++;
      continue;
    }
    // Remaining legs: moderate scarcity (2-4 seats available)
    const remaining = Math.min(leg.availableSeats, Math.max(1, Math.floor(Math.random() * 4) + 1));
    if (remaining >= leg.availableSeats) continue;
    const seatsToRemove = leg.availableSeats - remaining;
    await prisma.leg.update({
      where: { id: leg.id },
      data: { availableSeats: remaining },
    });
    urgencyLegs++;
  }

  // ── 8. Count today's departures ──
  const todayEnd = new Date(realNow);
  todayEnd.setHours(23, 59, 59, 999);
  const todayLegCount = await prisma.leg.count({
    where: {
      status: "OPEN",
      departureDate: { gte: realNow, lte: todayEnd },
    },
  });

  return {
    operators: OPERATORS.length,
    boats: BOATS.length,
    schedules: scheduleIds.length,
    facilities: totalFacilities,
    services: totalServices,
    legsGenerated: totalLegs,
    urgencyLegs,
    todayLegCount,
    operatorEmails: OPERATORS.map((o) => o.email),
  };
}
