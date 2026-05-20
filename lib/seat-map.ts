/**
 * Boat seat layout utilities.
 * Layout is stored as JSON on Boat.seatLayout; seats are instantiated as
 * LegSeat rows per departure so we can track per-leg occupancy.
 */

export type SeatDefinition = {
  label: string; // "A1", "B3"
  row: number;
  col: number;
};

export type BoatSeatLayout = {
  rows: number;
  cols: number;
  seats: SeatDefinition[];
};

export function parseSeatLayout(raw: unknown): BoatSeatLayout | null {
  if (!raw || typeof raw !== "object") return null;
  const layout = raw as Record<string, unknown>;
  if (
    typeof layout.rows !== "number" ||
    typeof layout.cols !== "number" ||
    !Array.isArray(layout.seats)
  ) {
    return null;
  }
  return layout as BoatSeatLayout;
}

/** Auto-generates a 2+2 ferry layout (A B _ C D columns) for a given capacity. */
export function generateSeatLayout(capacity: number): BoatSeatLayout {
  const COL_LABELS = ["A", "B", "C", "D"];
  const cols = 4;
  const rows = Math.ceil(capacity / cols);
  const seats: SeatDefinition[] = [];

  let count = 0;
  for (let r = 0; r < rows && count < capacity; r++) {
    for (let c = 0; c < COL_LABELS.length && count < capacity; c++) {
      seats.push({ label: `${COL_LABELS[c]}${r + 1}`, row: r, col: c });
      count++;
    }
  }
  return { rows, cols, seats };
}
