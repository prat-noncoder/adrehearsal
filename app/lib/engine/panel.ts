// Panel: filter the bank by audience, pick the requested number of people, and turn them into viewers.

import * as C from "./constants";
import { drawMood } from "./moods";
import { STREAM, uniform } from "./rng";
import { deriveTraits } from "./traits";
import type { Person, Viewer } from "./types";

export interface AudienceFilter {
  ageBands?: string[];
  sex?: string;
  states?: string[];
  zones?: string[];
  /** City type: "metro", "urban_other" or "rural". */
  tiers?: string[];
  incomeLevels?: number[];
}

export interface PanelOptions {
  size: number;
  seed: number;
  /** People marked "low" for Instagram/Facebook use are left out by default. Unlabelled people stay in. */
  excludeLowMeta?: boolean;
}

export interface PanelResult {
  people: Person[];
  requested: number;
  /** How many people matched the filter before picking. */
  matched: number;
  used: number;
  /** Plain-language note to show on the page when the panel is not what was asked for. */
  note: string | null;
}

export function matchesFilter(p: Person, f: AudienceFilter): boolean {
  if (f.ageBands?.length && !f.ageBands.includes(p.ageband)) return false;
  if (f.sex && p.sex !== f.sex) return false;
  if (f.states?.length && !f.states.includes(p.state)) return false;
  if (f.zones?.length && !f.zones.includes(p.zone)) return false;
  if (f.tiers?.length && !f.tiers.includes(p.tier)) return false;
  if (f.incomeLevels?.length && !f.incomeLevels.includes(p.incomeLevel)) return false;
  return true;
}

export function selectPanel(
  bank: Person[],
  filter: AudienceFilter,
  options: PanelOptions,
): PanelResult {
  const excludeLow = options.excludeLowMeta ?? true;
  const requested = Math.round(options.size);
  const size = Math.min(C.PANEL_MAX, Math.max(C.PANEL_MIN, requested));
  const notes: string[] = [];
  if (size !== requested) {
    notes.push(
      `Panel size ${requested} is outside the allowed range of ${C.PANEL_MIN} to ${C.PANEL_MAX}, so ${size} was used.`,
    );
  }

  const matched = bank.filter(
    (p) => matchesFilter(p, filter) && !(excludeLow && p.meta === "low"),
  );

  let chosen: Person[];
  if (matched.length <= size) {
    chosen = matched;
    if (matched.length < size) {
      notes.push(
        `Only ${matched.length} people match this audience, fewer than the ${size} asked for, so all of them are used.`,
      );
    }
  } else {
    // ASSUMED: people are picked in proportion to population_weight (weighted draw without replacement).
    // key = -ln(u) / weight; the smallest keys are picked. Same seed gives the same panel.
    const keyed = matched.map((p) => ({
      p,
      key: -Math.log(Math.max(uniform(options.seed, STREAM.panel, p.index), 1e-12)) / p.weight,
    }));
    keyed.sort((a, b) => a.key - b.key);
    chosen = keyed.slice(0, size).map((k) => k.p);
    chosen.sort((a, b) => a.index - b.index);
  }

  return {
    people: chosen,
    requested,
    matched: matched.length,
    used: chosen.length,
    note: notes.length ? notes.join(" ") : null,
  };
}

/** How relevant the ad is to the person (0 to 1). 0.5 until interest tags exist. */
export function relevance(person: Person, category: string): number {
  if (!person.interests || person.interests.length === 0) return C.RELEVANCE_UNKNOWN;
  const rank = person.interests.indexOf(category);
  if (rank === -1 || rank >= C.RELEVANCE_BY_INTEREST_RANK.length) return C.RELEVANCE_NO_MATCH;
  return C.RELEVANCE_BY_INTEREST_RANK[rank];
}

/** Traits, mood (for this run's seed) and relevance for each person. */
export function makeViewers(people: Person[], category: string, seed: number): Viewer[] {
  return people.map((person) => ({
    person,
    traits: deriveTraits(person),
    mood: drawMood(seed, person.index),
    relevance: relevance(person, category),
  }));
}
