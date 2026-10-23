// Turns the page's filter controls (age range, gender chips, states) into the age bands and sex the engine already understands.

export const AGE_MIN = 18;
export const AGE_MAX = 65; // 65 on the slider means "65 and over"

const BANDS: { label: string; lo: number; hi: number }[] = [
  { label: "18-24", lo: 18, hi: 24 },
  { label: "25-34", lo: 25, hi: 34 },
  { label: "35-44", lo: 35, hi: 44 },
  { label: "45-59", lo: 45, hi: 59 },
  { label: "60+", lo: 60, hi: 200 },
];

/** Bands that overlap the chosen range. Full range returns [] (no age filter). */
export function ageBandsForRange(min: number, max: number): string[] {
  if (min <= AGE_MIN && max >= AGE_MAX) return [];
  const hi = max >= AGE_MAX ? 200 : max;
  return BANDS.filter((b) => b.lo <= hi && b.hi >= min).map((b) => b.label);
}

/** One gender chosen means filter on it; both or none means no filter. */
export function sexForGenders(genders: string[]): "Male" | "Female" | undefined {
  const g = genders.filter((x) => x === "Male" || x === "Female");
  return g.length === 1 ? (g[0] as "Male" | "Female") : undefined;
}
