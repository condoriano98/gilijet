import type { BoatFacility, OperatorService } from "@prisma/client";

export const BOAT_FACILITY_LABELS: Record<BoatFacility, { label: string; icon: string }> = {
  AIR_CONDITIONING:    { label: "AC", icon: "snowflake" },
  TOILET:              { label: "Toilet", icon: "door-open" },
  WIFI:                { label: "WiFi", icon: "wifi" },
  LIFE_JACKET:         { label: "Life Jacket", icon: "life-buoy" },
  LIFE_RAFT:           { label: "Life Raft", icon: "ship" },
  ENTERTAINMENT_SYSTEM:{ label: "Entertainment", icon: "tv" },
  SNACK_SERVICE:       { label: "Snacks", icon: "cookie" },
  DRINK_SERVICE:       { label: "Drinks", icon: "coffee" },
  CHARGING_PORT:       { label: "Charging Port", icon: "plug" },
  BLANKET:             { label: "Blanket", icon: "blanket" },
  FIRST_AID_KIT:       { label: "First Aid", icon: "cross" },
  BAGGAGE_COMPARTMENT: { label: "Baggage Hold", icon: "package" },
  OUTDOOR_DECK:        { label: "Outdoor Deck", icon: "sun" },
  CABIN_SEATING:       { label: "Cabin Seats", icon: "armchair" },
  SMOKING_AREA:        { label: "Smoking Area", icon: "smoking" },
  PRAYER_ROOM:         { label: "Prayer Room", icon: "religious" },
};

export const OPERATOR_SERVICE_LABELS: Record<OperatorService, string> = {
  BAGGAGE_INSURANCE:    "Baggage Insurance",
  TRAVEL_INSURANCE:     "Travel Insurance",
  HOTEL_TRANSFER:       "Hotel Transfer",
  MEAL_INCLUDED:        "Meal Included",
  PRIORITY_BOARDING:    "Priority Boarding",
  FLEXIBLE_RESCHEDULE:  "Flexible Reschedule",
  CHILD_DISCOUNT:       "Child Discount",
  GROUP_BOOKING:        "Group Booking",
  PET_FRIENDLY:         "Pet Friendly",
  WHEELCHAIR_ACCESSIBLE:"Wheelchair Accessible",
};

export function getFacilityLabel(facility: BoatFacility): string {
  return BOAT_FACILITY_LABELS[facility]?.label ?? facility;
}

export function getServiceLabel(service: OperatorService): string {
  return OPERATOR_SERVICE_LABELS[service] ?? service;
}
