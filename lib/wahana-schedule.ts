// GENERATED from the operator's price sheet
// (price_schedule_pt_wahana_virendra_group.xlsx, 432 rows -> 24 departures).
// Do not hand-edit: re-import from the sheet instead.

import type { FareMatrix } from "@/lib/fares";

export type WahanaDeparture = {
  /** PRICE_CODE values this departure was collapsed from, for traceability. */
  priceCodes: string[];
  boat: string;
  origin: string;
  destination: string;
  departureTime: string;
  arrivalTime: string;
  durationMinutes: number;
  daysOfWeek: number[];
  /** Intermediate calls, timed from sibling rows on the same sailing. */
  transitStops: { portName: string; time: string }[];
  /** Adult, low season, one way — the only fare Schedule.basePrice can hold. */
  basePrice: number;
  fares: FareMatrix;
};

export const WAHANA_OPERATOR = "PT WAHANA VIRENDRA GROUP";

export const WAHANA_DEPARTURES: WahanaDeparture[] = [
  {
    "priceCodes": [
      "P1GAPB1OARH",
      "P1GAPB1OARL",
      "P1GAPB1OARP",
      "P1GAPB1OCRH",
      "P1GAPB1OCRL",
      "P1GAPB1OCRP",
      "P1GAPB1OIRH",
      "P1GAPB1OIRL",
      "P1GAPB1OIRP",
      "P1GAPB1RARH",
      "P1GAPB1RARL",
      "P1GAPB1RARP",
      "P1GAPB1RCRH",
      "P1GAPB1RCRL",
      "P1GAPB1RCRP",
      "P1GAPB1RIRH",
      "P1GAPB1RIRL",
      "P1GAPB1RIRP"
    ],
    "boat": "Cantika 09",
    "origin": "Gili Air",
    "destination": "Padang Bai",
    "departureTime": "10:30",
    "arrivalTime": "12:45",
    "durationMinutes": 135,
    "daysOfWeek": [
      1,
      2,
      3,
      4,
      5,
      6,
      7
    ],
    "transitStops": [
      {
        "portName": "Senggigi",
        "time": "11:15"
      }
    ],
    "basePrice": 450000,
    "fares": {
      "oneWay": {
        "low": {
          "adult": 450000,
          "child": 450000,
          "infant": 0
        },
        "high": {
          "adult": 500000,
          "child": 500000,
          "infant": 0
        },
        "peak": {
          "adult": 700000,
          "child": 700000,
          "infant": 0
        }
      },
      "return": {
        "low": {
          "adult": 880000,
          "child": 880000,
          "infant": 0
        },
        "high": {
          "adult": 970000,
          "child": 970000,
          "infant": 0
        },
        "peak": {
          "adult": 1360000,
          "child": 1360000,
          "infant": 0
        }
      }
    }
  },
  {
    "priceCodes": [
      "P1GAPB2OARH",
      "P1GAPB2OARL",
      "P1GAPB2OARP",
      "P1GAPB2OCRH",
      "P1GAPB2OCRL",
      "P1GAPB2OCRP",
      "P1GAPB2OIRH",
      "P1GAPB2OIRL",
      "P1GAPB2OIRP",
      "P1GAPB2RARH",
      "P1GAPB2RARL",
      "P1GAPB2RARP",
      "P1GAPB2RCRH",
      "P1GAPB2RCRL",
      "P1GAPB2RCRP",
      "P1GAPB2RIRH",
      "P1GAPB2RIRL",
      "P1GAPB2RIRP"
    ],
    "boat": "Cantika 09",
    "origin": "Gili Air",
    "destination": "Padang Bai",
    "departureTime": "15:00",
    "arrivalTime": "17:15",
    "durationMinutes": 135,
    "daysOfWeek": [
      1,
      2,
      3,
      4,
      5,
      6,
      7
    ],
    "transitStops": [
      {
        "portName": "Senggigi",
        "time": "15:45"
      }
    ],
    "basePrice": 450000,
    "fares": {
      "oneWay": {
        "low": {
          "adult": 450000,
          "child": 450000,
          "infant": 0
        },
        "high": {
          "adult": 500000,
          "child": 500000,
          "infant": 0
        },
        "peak": {
          "adult": 700000,
          "child": 700000,
          "infant": 0
        }
      },
      "return": {
        "low": {
          "adult": 880000,
          "child": 880000,
          "infant": 0
        },
        "high": {
          "adult": 970000,
          "child": 970000,
          "infant": 0
        },
        "peak": {
          "adult": 1360000,
          "child": 1360000,
          "infant": 0
        }
      }
    }
  },
  {
    "priceCodes": [
      "P1GTPB1OARH",
      "P1GTPB1OARL",
      "P1GTPB1OARP",
      "P1GTPB1OCRH",
      "P1GTPB1OCRL",
      "P1GTPB1OCRP",
      "P1GTPB1OIRH",
      "P1GTPB1OIRL",
      "P1GTPB1OIRP",
      "P1GTPB1RARH",
      "P1GTPB1RARL",
      "P1GTPB1RARP",
      "P1GTPB1RCRH",
      "P1GTPB1RCRL",
      "P1GTPB1RCRP",
      "P1GTPB1RIRH",
      "P1GTPB1RIRL",
      "P1GTPB1RIRP"
    ],
    "boat": "Cantika 09",
    "origin": "Gili Trawangan",
    "destination": "Padang Bai",
    "departureTime": "10:00",
    "arrivalTime": "12:45",
    "durationMinutes": 165,
    "daysOfWeek": [
      1,
      2,
      3,
      4,
      5,
      6,
      7
    ],
    "transitStops": [
      {
        "portName": "Gili Air",
        "time": "10:30"
      },
      {
        "portName": "Senggigi",
        "time": "11:15"
      }
    ],
    "basePrice": 450000,
    "fares": {
      "oneWay": {
        "low": {
          "adult": 450000,
          "child": 450000,
          "infant": 0
        },
        "high": {
          "adult": 500000,
          "child": 500000,
          "infant": 0
        },
        "peak": {
          "adult": 700000,
          "child": 700000,
          "infant": 0
        }
      },
      "return": {
        "low": {
          "adult": 880000,
          "child": 880000,
          "infant": 0
        },
        "high": {
          "adult": 970000,
          "child": 970000,
          "infant": 0
        },
        "peak": {
          "adult": 1360000,
          "child": 1360000,
          "infant": 0
        }
      }
    }
  },
  {
    "priceCodes": [
      "P1GTPB2OARH",
      "P1GTPB2OARL",
      "P1GTPB2OARP",
      "P1GTPB2OCRH",
      "P1GTPB2OCRL",
      "P1GTPB2OCRP",
      "P1GTPB2OIRH",
      "P1GTPB2OIRL",
      "P1GTPB2OIRP",
      "P1GTPB2RARH",
      "P1GTPB2RARL",
      "P1GTPB2RARP",
      "P1GTPB2RCRH",
      "P1GTPB2RCRL",
      "P1GTPB2RCRP",
      "P1GTPB2RIRH",
      "P1GTPB2RIRL",
      "P1GTPB2RIRP"
    ],
    "boat": "Cantika 09",
    "origin": "Gili Trawangan",
    "destination": "Padang Bai",
    "departureTime": "14:30",
    "arrivalTime": "17:15",
    "durationMinutes": 165,
    "daysOfWeek": [
      1,
      2,
      3,
      4,
      5,
      6,
      7
    ],
    "transitStops": [
      {
        "portName": "Gili Air",
        "time": "15:00"
      },
      {
        "portName": "Senggigi",
        "time": "15:45"
      }
    ],
    "basePrice": 450000,
    "fares": {
      "oneWay": {
        "low": {
          "adult": 450000,
          "child": 450000,
          "infant": 0
        },
        "high": {
          "adult": 500000,
          "child": 500000,
          "infant": 0
        },
        "peak": {
          "adult": 700000,
          "child": 700000,
          "infant": 0
        }
      },
      "return": {
        "low": {
          "adult": 880000,
          "child": 880000,
          "infant": 0
        },
        "high": {
          "adult": 970000,
          "child": 970000,
          "infant": 0
        },
        "peak": {
          "adult": 1360000,
          "child": 1360000,
          "infant": 0
        }
      }
    }
  },
  {
    "priceCodes": [
      "P1NPSA1OARH",
      "P1NPSA1OARL",
      "P1NPSA1OARP",
      "P1NPSA1OCRH",
      "P1NPSA1OCRL",
      "P1NPSA1OCRP",
      "P1NPSA1OIRH",
      "P1NPSA1OIRL",
      "P1NPSA1OIRP",
      "P1NPSA1RARH",
      "P1NPSA1RARL",
      "P1NPSA1RARP",
      "P1NPSA1RCRH",
      "P1NPSA1RCRL",
      "P1NPSA1RCRP",
      "P1NPSA1RIRH",
      "P1NPSA1RIRL",
      "P1NPSA1RIRP"
    ],
    "boat": "WGO 5",
    "origin": "Nusa Penida",
    "destination": "Sanur",
    "departureTime": "08:00",
    "arrivalTime": "09:00",
    "durationMinutes": 60,
    "daysOfWeek": [
      1,
      2,
      3,
      4,
      5,
      6,
      7
    ],
    "transitStops": [],
    "basePrice": 150000,
    "fares": {
      "oneWay": {
        "low": {
          "adult": 150000,
          "child": 110000,
          "infant": 0
        },
        "high": {
          "adult": 170000,
          "child": 125000,
          "infant": 0
        },
        "peak": {
          "adult": 200000,
          "child": 150000,
          "infant": 0
        }
      },
      "return": {
        "low": {
          "adult": 290000,
          "child": 210000,
          "infant": 0
        },
        "high": {
          "adult": 325000,
          "child": 235000,
          "infant": 0
        },
        "peak": {
          "adult": 380000,
          "child": 280000,
          "infant": 0
        }
      }
    }
  },
  {
    "priceCodes": [
      "P1NPSA2OARH",
      "P1NPSA2OARL",
      "P1NPSA2OARP",
      "P1NPSA2OCRH",
      "P1NPSA2OCRL",
      "P1NPSA2OCRP",
      "P1NPSA2OIRH",
      "P1NPSA2OIRL",
      "P1NPSA2OIRP",
      "P1NPSA2RARH",
      "P1NPSA2RARL",
      "P1NPSA2RARP",
      "P1NPSA2RCRH",
      "P1NPSA2RCRL",
      "P1NPSA2RCRP",
      "P1NPSA2RIRH",
      "P1NPSA2RIRL",
      "P1NPSA2RIRP"
    ],
    "boat": "ROSE",
    "origin": "Nusa Penida",
    "destination": "Sanur",
    "departureTime": "08:30",
    "arrivalTime": "09:30",
    "durationMinutes": 60,
    "daysOfWeek": [
      1,
      2,
      3,
      4,
      5,
      6,
      7
    ],
    "transitStops": [],
    "basePrice": 150000,
    "fares": {
      "oneWay": {
        "low": {
          "adult": 150000,
          "child": 110000,
          "infant": 0
        },
        "high": {
          "adult": 170000,
          "child": 125000,
          "infant": 0
        },
        "peak": {
          "adult": 200000,
          "child": 150000,
          "infant": 0
        }
      },
      "return": {
        "low": {
          "adult": 290000,
          "child": 210000,
          "infant": 0
        },
        "high": {
          "adult": 325000,
          "child": 235000,
          "infant": 0
        },
        "peak": {
          "adult": 380000,
          "child": 280000,
          "infant": 0
        }
      }
    }
  },
  {
    "priceCodes": [
      "P1NPSA3OARH",
      "P1NPSA3OARL",
      "P1NPSA3OARP",
      "P1NPSA3OCRH",
      "P1NPSA3OCRL",
      "P1NPSA3OCRP",
      "P1NPSA3OIRH",
      "P1NPSA3OIRL",
      "P1NPSA3OIRP",
      "P1NPSA3RARH",
      "P1NPSA3RARL",
      "P1NPSA3RARP",
      "P1NPSA3RCRH",
      "P1NPSA3RCRL",
      "P1NPSA3RCRP",
      "P1NPSA3RIRH",
      "P1NPSA3RIRL",
      "P1NPSA3RIRP"
    ],
    "boat": "WGO 5",
    "origin": "Nusa Penida",
    "destination": "Sanur",
    "departureTime": "10:00",
    "arrivalTime": "11:00",
    "durationMinutes": 60,
    "daysOfWeek": [
      1,
      2,
      3,
      4,
      5,
      6,
      7
    ],
    "transitStops": [],
    "basePrice": 150000,
    "fares": {
      "oneWay": {
        "low": {
          "adult": 150000,
          "child": 110000,
          "infant": 0
        },
        "high": {
          "adult": 170000,
          "child": 125000,
          "infant": 0
        },
        "peak": {
          "adult": 200000,
          "child": 150000,
          "infant": 0
        }
      },
      "return": {
        "low": {
          "adult": 290000,
          "child": 210000,
          "infant": 0
        },
        "high": {
          "adult": 325000,
          "child": 235000,
          "infant": 0
        },
        "peak": {
          "adult": 380000,
          "child": 280000,
          "infant": 0
        }
      }
    }
  },
  {
    "priceCodes": [
      "P1NPSA4OARH",
      "P1NPSA4OARL",
      "P1NPSA4OARP",
      "P1NPSA4OCRH",
      "P1NPSA4OCRL",
      "P1NPSA4OCRP",
      "P1NPSA4OIRH",
      "P1NPSA4OIRL",
      "P1NPSA4OIRP",
      "P1NPSA4RARH",
      "P1NPSA4RARL",
      "P1NPSA4RARP",
      "P1NPSA4RCRH",
      "P1NPSA4RCRL",
      "P1NPSA4RCRP",
      "P1NPSA4RIRH",
      "P1NPSA4RIRL",
      "P1NPSA4RIRP"
    ],
    "boat": "ROSE",
    "origin": "Nusa Penida",
    "destination": "Sanur",
    "departureTime": "14:00",
    "arrivalTime": "15:00",
    "durationMinutes": 60,
    "daysOfWeek": [
      1,
      2,
      3,
      4,
      5,
      6,
      7
    ],
    "transitStops": [],
    "basePrice": 150000,
    "fares": {
      "oneWay": {
        "low": {
          "adult": 150000,
          "child": 110000,
          "infant": 0
        },
        "high": {
          "adult": 170000,
          "child": 125000,
          "infant": 0
        },
        "peak": {
          "adult": 200000,
          "child": 150000,
          "infant": 0
        }
      },
      "return": {
        "low": {
          "adult": 290000,
          "child": 210000,
          "infant": 0
        },
        "high": {
          "adult": 325000,
          "child": 235000,
          "infant": 0
        },
        "peak": {
          "adult": 380000,
          "child": 280000,
          "infant": 0
        }
      }
    }
  },
  {
    "priceCodes": [
      "P1NPSA5OARH",
      "P1NPSA5OARL",
      "P1NPSA5OARP",
      "P1NPSA5OCRH",
      "P1NPSA5OCRL",
      "P1NPSA5OCRP",
      "P1NPSA5OIRH",
      "P1NPSA5OIRL",
      "P1NPSA5OIRP",
      "P1NPSA5RARH",
      "P1NPSA5RARL",
      "P1NPSA5RARP",
      "P1NPSA5RCRH",
      "P1NPSA5RCRL",
      "P1NPSA5RCRP",
      "P1NPSA5RIRH",
      "P1NPSA5RIRL",
      "P1NPSA5RIRP"
    ],
    "boat": "WGO 5",
    "origin": "Nusa Penida",
    "destination": "Sanur",
    "departureTime": "15:00",
    "arrivalTime": "16:00",
    "durationMinutes": 60,
    "daysOfWeek": [
      1,
      2,
      3,
      4,
      5,
      6,
      7
    ],
    "transitStops": [],
    "basePrice": 150000,
    "fares": {
      "oneWay": {
        "low": {
          "adult": 150000,
          "child": 110000,
          "infant": 0
        },
        "high": {
          "adult": 170000,
          "child": 125000,
          "infant": 0
        },
        "peak": {
          "adult": 200000,
          "child": 150000,
          "infant": 0
        }
      },
      "return": {
        "low": {
          "adult": 290000,
          "child": 210000,
          "infant": 0
        },
        "high": {
          "adult": 325000,
          "child": 235000,
          "infant": 0
        },
        "peak": {
          "adult": 380000,
          "child": 280000,
          "infant": 0
        }
      }
    }
  },
  {
    "priceCodes": [
      "P1NPSA6OARH",
      "P1NPSA6OARL",
      "P1NPSA6OARP",
      "P1NPSA6OCRH",
      "P1NPSA6OCRL",
      "P1NPSA6OCRP",
      "P1NPSA6OIRH",
      "P1NPSA6OIRL",
      "P1NPSA6OIRP",
      "P1NPSA6RARH",
      "P1NPSA6RARL",
      "P1NPSA6RARP",
      "P1NPSA6RCRH",
      "P1NPSA6RCRL",
      "P1NPSA6RCRP",
      "P1NPSA6RIRH",
      "P1NPSA6RIRL",
      "P1NPSA6RIRP"
    ],
    "boat": "ROSE",
    "origin": "Nusa Penida",
    "destination": "Sanur",
    "departureTime": "16:30",
    "arrivalTime": "17:30",
    "durationMinutes": 60,
    "daysOfWeek": [
      1,
      2,
      3,
      4,
      5,
      6,
      7
    ],
    "transitStops": [],
    "basePrice": 150000,
    "fares": {
      "oneWay": {
        "low": {
          "adult": 150000,
          "child": 110000,
          "infant": 0
        },
        "high": {
          "adult": 170000,
          "child": 125000,
          "infant": 0
        },
        "peak": {
          "adult": 200000,
          "child": 150000,
          "infant": 0
        }
      },
      "return": {
        "low": {
          "adult": 290000,
          "child": 210000,
          "infant": 0
        },
        "high": {
          "adult": 325000,
          "child": 235000,
          "infant": 0
        },
        "peak": {
          "adult": 380000,
          "child": 280000,
          "infant": 0
        }
      }
    }
  },
  {
    "priceCodes": [
      "P1PBGA1OARH",
      "P1PBGA1OARL",
      "P1PBGA1OARP",
      "P1PBGA1OCRH",
      "P1PBGA1OCRL",
      "P1PBGA1OCRP",
      "P1PBGA1OIRH",
      "P1PBGA1OIRL",
      "P1PBGA1OIRP",
      "P1PBGA1RARH",
      "P1PBGA1RARL",
      "P1PBGA1RARP",
      "P1PBGA1RCRH",
      "P1PBGA1RCRL",
      "P1PBGA1RCRP",
      "P1PBGA1RIRH",
      "P1PBGA1RIRL",
      "P1PBGA1RIRP"
    ],
    "boat": "Cantika 09",
    "origin": "Padang Bai",
    "destination": "Gili Air",
    "departureTime": "08:30",
    "arrivalTime": "10:30",
    "durationMinutes": 120,
    "daysOfWeek": [
      1,
      2,
      3,
      4,
      5,
      6,
      7
    ],
    "transitStops": [
      {
        "portName": "Gili Trawangan",
        "time": "10:00"
      }
    ],
    "basePrice": 450000,
    "fares": {
      "oneWay": {
        "low": {
          "adult": 450000,
          "child": 450000,
          "infant": 0
        },
        "high": {
          "adult": 500000,
          "child": 500000,
          "infant": 0
        },
        "peak": {
          "adult": 700000,
          "child": 700000,
          "infant": 0
        }
      },
      "return": {
        "low": {
          "adult": 880000,
          "child": 880000,
          "infant": 0
        },
        "high": {
          "adult": 970000,
          "child": 970000,
          "infant": 0
        },
        "peak": {
          "adult": 1360000,
          "child": 1360000,
          "infant": 0
        }
      }
    }
  },
  {
    "priceCodes": [
      "P1PBGT1OARH",
      "P1PBGT1OARL",
      "P1PBGT1OARP",
      "P1PBGT1OCRH",
      "P1PBGT1OCRL",
      "P1PBGT1OCRP",
      "P1PBGT1OIRH",
      "P1PBGT1OIRL",
      "P1PBGT1OIRP",
      "P1PBGT1RARH",
      "P1PBGT1RARL",
      "P1PBGT1RARP",
      "P1PBGT1RCRH",
      "P1PBGT1RCRL",
      "P1PBGT1RCRP",
      "P1PBGT1RIRH",
      "P1PBGT1RIRL",
      "P1PBGT1RIRP"
    ],
    "boat": "Cantika 09",
    "origin": "Padang Bai",
    "destination": "Gili Trawangan",
    "departureTime": "08:30",
    "arrivalTime": "10:00",
    "durationMinutes": 90,
    "daysOfWeek": [
      1,
      2,
      3,
      4,
      5,
      6,
      7
    ],
    "transitStops": [],
    "basePrice": 450000,
    "fares": {
      "oneWay": {
        "low": {
          "adult": 450000,
          "child": 450000,
          "infant": 0
        },
        "high": {
          "adult": 500000,
          "child": 500000,
          "infant": 0
        },
        "peak": {
          "adult": 700000,
          "child": 700000,
          "infant": 0
        }
      },
      "return": {
        "low": {
          "adult": 880000,
          "child": 880000,
          "infant": 0
        },
        "high": {
          "adult": 970000,
          "child": 970000,
          "infant": 0
        },
        "peak": {
          "adult": 1360000,
          "child": 1360000,
          "infant": 0
        }
      }
    }
  },
  {
    "priceCodes": [
      "P1PBSL1OARH",
      "P1PBSL1OARL",
      "P1PBSL1OARP",
      "P1PBSL1OCRH",
      "P1PBSL1OCRL",
      "P1PBSL1OCRP",
      "P1PBSL1OIRH",
      "P1PBSL1OIRL",
      "P1PBSL1OIRP",
      "P1PBSL1RARH",
      "P1PBSL1RARL",
      "P1PBSL1RARP",
      "P1PBSL1RCRH",
      "P1PBSL1RCRL",
      "P1PBSL1RCRP",
      "P1PBSL1RIRH",
      "P1PBSL1RIRL",
      "P1PBSL1RIRP"
    ],
    "boat": "Cantika 09",
    "origin": "Padang Bai",
    "destination": "Senggigi",
    "departureTime": "08:30",
    "arrivalTime": "11:15",
    "durationMinutes": 165,
    "daysOfWeek": [
      1,
      2,
      3,
      4,
      5,
      6,
      7
    ],
    "transitStops": [
      {
        "portName": "Gili Trawangan",
        "time": "10:00"
      },
      {
        "portName": "Gili Air",
        "time": "10:30"
      }
    ],
    "basePrice": 450000,
    "fares": {
      "oneWay": {
        "low": {
          "adult": 450000,
          "child": 450000,
          "infant": 0
        },
        "high": {
          "adult": 500000,
          "child": 500000,
          "infant": 0
        },
        "peak": {
          "adult": 700000,
          "child": 700000,
          "infant": 0
        }
      },
      "return": {
        "low": {
          "adult": 880000,
          "child": 880000,
          "infant": 0
        },
        "high": {
          "adult": 970000,
          "child": 970000,
          "infant": 0
        },
        "peak": {
          "adult": 1360000,
          "child": 1360000,
          "infant": 0
        }
      }
    }
  },
  {
    "priceCodes": [
      "P1PBGA2OARH",
      "P1PBGA2OARL",
      "P1PBGA2OARP",
      "P1PBGA2OCRH",
      "P1PBGA2OCRL",
      "P1PBGA2OCRP",
      "P1PBGA2OIRH",
      "P1PBGA2OIRL",
      "P1PBGA2OIRP",
      "P1PBGA2RARH",
      "P1PBGA2RARL",
      "P1PBGA2RARP",
      "P1PBGA2RCRH",
      "P1PBGA2RCRL",
      "P1PBGA2RCRP",
      "P1PBGA2RIRH",
      "P1PBGA2RIRL",
      "P1PBGA2RIRP"
    ],
    "boat": "Cantika 09",
    "origin": "Padang Bai",
    "destination": "Gili Air",
    "departureTime": "13:00",
    "arrivalTime": "15:00",
    "durationMinutes": 120,
    "daysOfWeek": [
      1,
      2,
      3,
      4,
      5,
      6,
      7
    ],
    "transitStops": [
      {
        "portName": "Gili Trawangan",
        "time": "14:30"
      }
    ],
    "basePrice": 450000,
    "fares": {
      "oneWay": {
        "low": {
          "adult": 450000,
          "child": 450000,
          "infant": 0
        },
        "high": {
          "adult": 500000,
          "child": 500000,
          "infant": 0
        },
        "peak": {
          "adult": 700000,
          "child": 700000,
          "infant": 0
        }
      },
      "return": {
        "low": {
          "adult": 880000,
          "child": 880000,
          "infant": 0
        },
        "high": {
          "adult": 970000,
          "child": 970000,
          "infant": 0
        },
        "peak": {
          "adult": 1360000,
          "child": 1360000,
          "infant": 0
        }
      }
    }
  },
  {
    "priceCodes": [
      "P1PBGT2OARH",
      "P1PBGT2OARL",
      "P1PBGT2OARP",
      "P1PBGT2OCRH",
      "P1PBGT2OCRL",
      "P1PBGT2OCRP",
      "P1PBGT2OIRH",
      "P1PBGT2OIRL",
      "P1PBGT2OIRP",
      "P1PBGT2RARH",
      "P1PBGT2RARL",
      "P1PBGT2RARP",
      "P1PBGT2RCRH",
      "P1PBGT2RCRL",
      "P1PBGT2RCRP",
      "P1PBGT2RIRH",
      "P1PBGT2RIRL",
      "P1PBGT2RIRP"
    ],
    "boat": "Cantika 09",
    "origin": "Padang Bai",
    "destination": "Gili Trawangan",
    "departureTime": "13:00",
    "arrivalTime": "14:30",
    "durationMinutes": 90,
    "daysOfWeek": [
      1,
      2,
      3,
      4,
      5,
      6,
      7
    ],
    "transitStops": [],
    "basePrice": 450000,
    "fares": {
      "oneWay": {
        "low": {
          "adult": 450000,
          "child": 450000,
          "infant": 0
        },
        "high": {
          "adult": 500000,
          "child": 500000,
          "infant": 0
        },
        "peak": {
          "adult": 700000,
          "child": 700000,
          "infant": 0
        }
      },
      "return": {
        "low": {
          "adult": 880000,
          "child": 880000,
          "infant": 0
        },
        "high": {
          "adult": 970000,
          "child": 970000,
          "infant": 0
        },
        "peak": {
          "adult": 1360000,
          "child": 1360000,
          "infant": 0
        }
      }
    }
  },
  {
    "priceCodes": [
      "P1PBSL2OARH",
      "P1PBSL2OARL",
      "P1PBSL2OARP",
      "P1PBSL2OCRH",
      "P1PBSL2OCRL",
      "P1PBSL2OCRP",
      "P1PBSL2OIRH",
      "P1PBSL2OIRL",
      "P1PBSL2OIRP",
      "P1PBSL2RARH",
      "P1PBSL2RARL",
      "P1PBSL2RARP",
      "P1PBSL2RCRH",
      "P1PBSL2RCRL",
      "P1PBSL2RCRP",
      "P1PBSL2RIRH",
      "P1PBSL2RIRL",
      "P1PBSL2RIRP"
    ],
    "boat": "Cantika 09",
    "origin": "Padang Bai",
    "destination": "Senggigi",
    "departureTime": "13:00",
    "arrivalTime": "15:45",
    "durationMinutes": 165,
    "daysOfWeek": [
      1,
      2,
      3,
      4,
      5,
      6,
      7
    ],
    "transitStops": [
      {
        "portName": "Gili Trawangan",
        "time": "14:30"
      },
      {
        "portName": "Gili Air",
        "time": "15:00"
      }
    ],
    "basePrice": 450000,
    "fares": {
      "oneWay": {
        "low": {
          "adult": 450000,
          "child": 450000,
          "infant": 0
        },
        "high": {
          "adult": 500000,
          "child": 500000,
          "infant": 0
        },
        "peak": {
          "adult": 700000,
          "child": 700000,
          "infant": 0
        }
      },
      "return": {
        "low": {
          "adult": 880000,
          "child": 880000,
          "infant": 0
        },
        "high": {
          "adult": 970000,
          "child": 970000,
          "infant": 0
        },
        "peak": {
          "adult": 1360000,
          "child": 1360000,
          "infant": 0
        }
      }
    }
  },
  {
    "priceCodes": [
      "P1SANP1OARH",
      "P1SANP1OARL",
      "P1SANP1OARP",
      "P1SANP1OCRH",
      "P1SANP1OCRL",
      "P1SANP1OCRP",
      "P1SANP1OIRH",
      "P1SANP1OIRL",
      "P1SANP1OIRP",
      "P1SANP1RARH",
      "P1SANP1RARL",
      "P1SANP1RARP",
      "P1SANP1RCRH",
      "P1SANP1RCRL",
      "P1SANP1RCRP",
      "P1SANP1RIRH",
      "P1SANP1RIRL",
      "P1SANP1RIRP"
    ],
    "boat": "WGO 5",
    "origin": "Sanur",
    "destination": "Nusa Penida",
    "departureTime": "07:00",
    "arrivalTime": "08:00",
    "durationMinutes": 60,
    "daysOfWeek": [
      1,
      2,
      3,
      4,
      5,
      6,
      7
    ],
    "transitStops": [],
    "basePrice": 150000,
    "fares": {
      "oneWay": {
        "low": {
          "adult": 150000,
          "child": 110000,
          "infant": 0
        },
        "high": {
          "adult": 170000,
          "child": 125000,
          "infant": 0
        },
        "peak": {
          "adult": 200000,
          "child": 150000,
          "infant": 0
        }
      },
      "return": {
        "low": {
          "adult": 290000,
          "child": 210000,
          "infant": 0
        },
        "high": {
          "adult": 325000,
          "child": 235000,
          "infant": 0
        },
        "peak": {
          "adult": 380000,
          "child": 280000,
          "infant": 0
        }
      }
    }
  },
  {
    "priceCodes": [
      "P1SANP2OARH",
      "P1SANP2OARL",
      "P1SANP2OARP",
      "P1SANP2OCRH",
      "P1SANP2OCRL",
      "P1SANP2OCRP",
      "P1SANP2OIRH",
      "P1SANP2OIRL",
      "P1SANP2OIRP",
      "P1SANP2RARH",
      "P1SANP2RARL",
      "P1SANP2RARP",
      "P1SANP2RCRH",
      "P1SANP2RCRL",
      "P1SANP2RCRP",
      "P1SANP2RIRH",
      "P1SANP2RIRL",
      "P1SANP2RIRP"
    ],
    "boat": "ROSE",
    "origin": "Sanur",
    "destination": "Nusa Penida",
    "departureTime": "07:30",
    "arrivalTime": "08:30",
    "durationMinutes": 60,
    "daysOfWeek": [
      1,
      2,
      3,
      4,
      5,
      6,
      7
    ],
    "transitStops": [],
    "basePrice": 150000,
    "fares": {
      "oneWay": {
        "low": {
          "adult": 150000,
          "child": 110000,
          "infant": 0
        },
        "high": {
          "adult": 170000,
          "child": 125000,
          "infant": 0
        },
        "peak": {
          "adult": 200000,
          "child": 150000,
          "infant": 0
        }
      },
      "return": {
        "low": {
          "adult": 290000,
          "child": 210000,
          "infant": 0
        },
        "high": {
          "adult": 325000,
          "child": 235000,
          "infant": 0
        },
        "peak": {
          "adult": 380000,
          "child": 280000,
          "infant": 0
        }
      }
    }
  },
  {
    "priceCodes": [
      "P1SANP3OARH",
      "P1SANP3OARL",
      "P1SANP3OARP",
      "P1SANP3OCRH",
      "P1SANP3OCRL",
      "P1SANP3OCRP",
      "P1SANP3OIRH",
      "P1SANP3OIRL",
      "P1SANP3OIRP",
      "P1SANP3RARH",
      "P1SANP3RARL",
      "P1SANP3RARP",
      "P1SANP3RCRH",
      "P1SANP3RCRL",
      "P1SANP3RCRP",
      "P1SANP3RIRH",
      "P1SANP3RIRL",
      "P1SANP3RIRP"
    ],
    "boat": "WGO 5",
    "origin": "Sanur",
    "destination": "Nusa Penida",
    "departureTime": "09:00",
    "arrivalTime": "10:00",
    "durationMinutes": 60,
    "daysOfWeek": [
      1,
      2,
      3,
      4,
      5,
      6,
      7
    ],
    "transitStops": [],
    "basePrice": 150000,
    "fares": {
      "oneWay": {
        "low": {
          "adult": 150000,
          "child": 110000,
          "infant": 0
        },
        "high": {
          "adult": 170000,
          "child": 125000,
          "infant": 0
        },
        "peak": {
          "adult": 200000,
          "child": 150000,
          "infant": 0
        }
      },
      "return": {
        "low": {
          "adult": 290000,
          "child": 210000,
          "infant": 0
        },
        "high": {
          "adult": 325000,
          "child": 235000,
          "infant": 0
        },
        "peak": {
          "adult": 380000,
          "child": 280000,
          "infant": 0
        }
      }
    }
  },
  {
    "priceCodes": [
      "P1SANP4OARH",
      "P1SANP4OARL",
      "P1SANP4OARP",
      "P1SANP4OCRH",
      "P1SANP4OCRL",
      "P1SANP4OCRP",
      "P1SANP4OIRH",
      "P1SANP4OIRL",
      "P1SANP4OIRP",
      "P1SANP4RARH",
      "P1SANP4RARL",
      "P1SANP4RARP",
      "P1SANP4RCRH",
      "P1SANP4RCRL",
      "P1SANP4RCRP",
      "P1SANP4RIRH",
      "P1SANP4RIRL",
      "P1SANP4RIRP"
    ],
    "boat": "ROSE",
    "origin": "Sanur",
    "destination": "Nusa Penida",
    "departureTime": "09:30",
    "arrivalTime": "10:30",
    "durationMinutes": 60,
    "daysOfWeek": [
      1,
      2,
      3,
      4,
      5,
      6,
      7
    ],
    "transitStops": [],
    "basePrice": 150000,
    "fares": {
      "oneWay": {
        "low": {
          "adult": 150000,
          "child": 110000,
          "infant": 0
        },
        "high": {
          "adult": 170000,
          "child": 125000,
          "infant": 0
        },
        "peak": {
          "adult": 200000,
          "child": 150000,
          "infant": 0
        }
      },
      "return": {
        "low": {
          "adult": 290000,
          "child": 210000,
          "infant": 0
        },
        "high": {
          "adult": 325000,
          "child": 235000,
          "infant": 0
        },
        "peak": {
          "adult": 380000,
          "child": 280000,
          "infant": 0
        }
      }
    }
  },
  {
    "priceCodes": [
      "P1SANP5OARH",
      "P1SANP5OARL",
      "P1SANP5OARP",
      "P1SANP5OCRH",
      "P1SANP5OCRL",
      "P1SANP5OCRP",
      "P1SANP5OIRH",
      "P1SANP5OIRL",
      "P1SANP5OIRP",
      "P1SANP5RARH",
      "P1SANP5RARL",
      "P1SANP5RARP",
      "P1SANP5RCRH",
      "P1SANP5RCRL",
      "P1SANP5RCRP",
      "P1SANP5RIRH",
      "P1SANP5RIRL",
      "P1SANP5RIRP"
    ],
    "boat": "WGO 5",
    "origin": "Sanur",
    "destination": "Nusa Penida",
    "departureTime": "11:00",
    "arrivalTime": "12:00",
    "durationMinutes": 60,
    "daysOfWeek": [
      1,
      2,
      3,
      4,
      5,
      6,
      7
    ],
    "transitStops": [],
    "basePrice": 150000,
    "fares": {
      "oneWay": {
        "low": {
          "adult": 150000,
          "child": 110000,
          "infant": 0
        },
        "high": {
          "adult": 170000,
          "child": 125000,
          "infant": 0
        },
        "peak": {
          "adult": 200000,
          "child": 150000,
          "infant": 0
        }
      },
      "return": {
        "low": {
          "adult": 290000,
          "child": 210000,
          "infant": 0
        },
        "high": {
          "adult": 325000,
          "child": 235000,
          "infant": 0
        },
        "peak": {
          "adult": 380000,
          "child": 280000,
          "infant": 0
        }
      }
    }
  },
  {
    "priceCodes": [
      "P1SANP6OARH",
      "P1SANP6OARL",
      "P1SANP6OARP",
      "P1SANP6OCRH",
      "P1SANP6OCRL",
      "P1SANP6OCRP",
      "P1SANP6OIRH",
      "P1SANP6OIRL",
      "P1SANP6OIRP",
      "P1SANP6RARH",
      "P1SANP6RARL",
      "P1SANP6RARP",
      "P1SANP6RCRH",
      "P1SANP6RCRL",
      "P1SANP6RCRP",
      "P1SANP6RIRH",
      "P1SANP6RIRL",
      "P1SANP6RIRP"
    ],
    "boat": "ROSE",
    "origin": "Sanur",
    "destination": "Nusa Penida",
    "departureTime": "15:00",
    "arrivalTime": "16:00",
    "durationMinutes": 60,
    "daysOfWeek": [
      1,
      2,
      3,
      4,
      5,
      6,
      7
    ],
    "transitStops": [],
    "basePrice": 150000,
    "fares": {
      "oneWay": {
        "low": {
          "adult": 150000,
          "child": 110000,
          "infant": 0
        },
        "high": {
          "adult": 170000,
          "child": 125000,
          "infant": 0
        },
        "peak": {
          "adult": 200000,
          "child": 150000,
          "infant": 0
        }
      },
      "return": {
        "low": {
          "adult": 290000,
          "child": 210000,
          "infant": 0
        },
        "high": {
          "adult": 325000,
          "child": 235000,
          "infant": 0
        },
        "peak": {
          "adult": 380000,
          "child": 280000,
          "infant": 0
        }
      }
    }
  },
  {
    "priceCodes": [
      "P1SLPB1OARH",
      "P1SLPB1OARL",
      "P1SLPB1OARP",
      "P1SLPB1OCRH",
      "P1SLPB1OCRL",
      "P1SLPB1OCRP",
      "P1SLPB1OIRH",
      "P1SLPB1OIRL",
      "P1SLPB1OIRP",
      "P1SLPB1RARH",
      "P1SLPB1RARL",
      "P1SLPB1RARP",
      "P1SLPB1RCRH",
      "P1SLPB1RCRL",
      "P1SLPB1RCRP",
      "P1SLPB1RIRH",
      "P1SLPB1RIRL",
      "P1SLPB1RIRP"
    ],
    "boat": "Cantika 09",
    "origin": "Senggigi",
    "destination": "Padang Bai",
    "departureTime": "11:15",
    "arrivalTime": "12:45",
    "durationMinutes": 90,
    "daysOfWeek": [
      1,
      2,
      3,
      4,
      5,
      6,
      7
    ],
    "transitStops": [],
    "basePrice": 450000,
    "fares": {
      "oneWay": {
        "low": {
          "adult": 450000,
          "child": 450000,
          "infant": 0
        },
        "high": {
          "adult": 500000,
          "child": 500000,
          "infant": 0
        },
        "peak": {
          "adult": 700000,
          "child": 700000,
          "infant": 0
        }
      },
      "return": {
        "low": {
          "adult": 880000,
          "child": 880000,
          "infant": 0
        },
        "high": {
          "adult": 970000,
          "child": 970000,
          "infant": 0
        },
        "peak": {
          "adult": 1360000,
          "child": 1360000,
          "infant": 0
        }
      }
    }
  },
  {
    "priceCodes": [
      "P1SLPB2OARH",
      "P1SLPB2OARL",
      "P1SLPB2OARP",
      "P1SLPB2OCRH",
      "P1SLPB2OCRL",
      "P1SLPB2OCRP",
      "P1SLPB2OIRH",
      "P1SLPB2OIRL",
      "P1SLPB2OIRP",
      "P1SLPB2RARH",
      "P1SLPB2RARL",
      "P1SLPB2RARP",
      "P1SLPB2RCRH",
      "P1SLPB2RCRL",
      "P1SLPB2RCRP",
      "P1SLPB2RIRH",
      "P1SLPB2RIRL",
      "P1SLPB2RIRP"
    ],
    "boat": "Cantika 09",
    "origin": "Senggigi",
    "destination": "Padang Bai",
    "departureTime": "15:45",
    "arrivalTime": "17:15",
    "durationMinutes": 90,
    "daysOfWeek": [
      1,
      2,
      3,
      4,
      5,
      6,
      7
    ],
    "transitStops": [],
    "basePrice": 450000,
    "fares": {
      "oneWay": {
        "low": {
          "adult": 450000,
          "child": 450000,
          "infant": 0
        },
        "high": {
          "adult": 500000,
          "child": 500000,
          "infant": 0
        },
        "peak": {
          "adult": 700000,
          "child": 700000,
          "infant": 0
        }
      },
      "return": {
        "low": {
          "adult": 880000,
          "child": 880000,
          "infant": 0
        },
        "high": {
          "adult": 970000,
          "child": 970000,
          "infant": 0
        },
        "peak": {
          "adult": 1360000,
          "child": 1360000,
          "infant": 0
        }
      }
    }
  }
];
