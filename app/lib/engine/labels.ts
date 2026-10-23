// Report label: the closest of the 25 shopper types, by the six traits.
// It is only a name for the report. It is repeatable and never used in the maths.

import type { Traits } from "./types.ts";

export interface Archetype {
  id: string;
  name: string;
  reportGroup: string;
  skepticism: number;
  priceSensitivity: number;
  noveltySeeking: number;
  socialInfluence: number;
  impulsivity: number;
  attentionBaseline: number;
}

type SixTraits = Pick<
  Archetype,
  | "skepticism"
  | "priceSensitivity"
  | "noveltySeeking"
  | "socialInfluence"
  | "impulsivity"
  | "attentionBaseline"
>;

function distance(a: SixTraits, b: SixTraits): number {
  return (
    (a.skepticism - b.skepticism) ** 2 +
    (a.priceSensitivity - b.priceSensitivity) ** 2 +
    (a.noveltySeeking - b.noveltySeeking) ** 2 +
    (a.socialInfluence - b.socialInfluence) ** 2 +
    (a.impulsivity - b.impulsivity) ** 2 +
    (a.attentionBaseline - b.attentionBaseline) ** 2
  );
}

/** Nearest type. Ties go to the first one listed, so the answer always repeats. */
export function nearestArchetype(traits: Traits, archetypes: Archetype[]): Archetype {
  let best = archetypes[0];
  let bestD = Infinity;
  for (const a of archetypes) {
    const d = distance(traits, a);
    if (d < bestD) {
      bestD = d;
      best = a;
    }
  }
  return best;
}
