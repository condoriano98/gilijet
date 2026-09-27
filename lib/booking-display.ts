import { add } from 'date-fns';

export type PassengerDetail = {
  name: string;
  idNumber: string | null;
  type: 'ADULT' | 'CHILD' | 'INFANT';
};

export type PassengersData = {
  passengers?: PassengerDetail[];
  customerNotes?: string;
};

/**
 * Parse passenger details from booking notes JSON.
 * Defaults to ADULT if type is not specified.
 */
export function parsePassengersFromNotes(
  notes: string | null,
): PassengerDetail[] {
  if (!notes) return [];
  try {
    const parsed = JSON.parse(notes) as PassengersData;
    if (Array.isArray(parsed.passengers)) {
      return parsed.passengers.map((p) => ({
        name: p.name,
        idNumber: p.idNumber || null,
        type: (p.type || 'ADULT') as 'ADULT' | 'CHILD' | 'INFANT',
      }));
    }
  } catch {
    // Free-text note — no passenger list embedded.
  }
  return [];
}

/**
 * Calculate arrival time from departure date and duration.
 * Returns UTC datetime.
 */
export function calculateArrivalTime(
  departureDate: Date,
  durationMinutes: number,
): Date {
  return add(new Date(departureDate), { minutes: durationMinutes });
}
