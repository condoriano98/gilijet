export type UrgencyLevel = {
  label: string;
  tone: "destructive" | "warning" | "success";
} | null;

export function seatUrgency(availableSeats: number): UrgencyLevel {
  if (availableSeats <= 3) return { label: `Only ${availableSeats} left`, tone: "destructive" };
  if (availableSeats <= 10) return { label: `${availableSeats} seats left`, tone: "warning" };
  if (availableSeats <= 30) return { label: `${availableSeats} seats left`, tone: "success" };
  return null;
}
