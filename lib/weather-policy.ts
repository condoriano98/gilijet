export type Sailability = {
  sailable: boolean;
  warning?: string;
  level: "SAFE" | "BORDERLINE" | "UNSAFE";
};

const WAVE_HEIGHT_THRESHOLD_M = 2.5;
const WIND_KNOTS_THRESHOLD = 25;
const BORDERLINE_WAVE_M = 1.5;
const BORDERLINE_WIND_KNOTS = 20;

export function isSailable(args: {
  waveHeightM?: number | null;
  windKnots?: number | null;
}): Sailability {
  const wave = args.waveHeightM ?? 0;
  const wind = args.windKnots ?? 0;

  if (wave > WAVE_HEIGHT_THRESHOLD_M || wind > WIND_KNOTS_THRESHOLD) {
    return {
      sailable: false,
      warning: `Unsafe conditions: ${wave.toFixed(1)}m waves, ${wind.toFixed(0)}kt winds`,
      level: "UNSAFE",
    };
  }

  if (wave > BORDERLINE_WAVE_M || wind > BORDERLINE_WIND_KNOTS) {
    return {
      sailable: true,
      warning: `Marginal conditions: ${wave.toFixed(1)}m waves, ${wind.toFixed(0)}kt winds`,
      level: "BORDERLINE",
    };
  }

  return { sailable: true, level: "SAFE" };
}
