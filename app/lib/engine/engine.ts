// The engine's front door: panel -> viewers -> exits -> funnel -> reasons.
// Plain maths only. No AI and no keys are used here.

import * as C from "./constants.ts";
import { exitChunk } from "./exits.ts";
import { calibrateBase0, computeFunnel, survivalByChunk } from "./funnel.ts";
import type { Funnel } from "./funnel.ts";
import { makeViewers, selectPanel } from "./panel.ts";
import type { AudienceFilter, PanelResult } from "./panel.ts";
import { exitsByWindow, groupReasons } from "./reasons.ts";
import type { ReasonGroup } from "./reasons.ts";
import type { MoodName, Person, Timeline, Viewer } from "./types.ts";

export interface RehearsalInput {
  bank: Person[];
  timeline: Timeline;
  filter: AudienceFilter;
  panelSize: number;
  seed: number;
  /** The calibrated hook constant. Get it once from calibrateOnReference(). */
  base0: number;
  excludeLowMeta?: boolean;
  /** For tests only: give everyone the same mood. */
  moodOverride?: MoodName;
}

export interface RehearsalResult {
  panel: PanelResult;
  viewers: Viewer[];
  /** For each viewer, the chunk they left in, or null if they watched to the end. */
  exits: (number | null)[];
  funnel: Funnel;
  /** Share still watching after each chunk. */
  survival: number[];
  exitsByWindow: number[];
  groups: ReasonGroup[];
}

/** Exit chunk for every viewer. */
export function simulateExits(
  viewers: Viewer[],
  timeline: Timeline,
  base0: number,
  seed: number,
): (number | null)[] {
  return viewers.map((v) => exitChunk(v, timeline, base0, seed));
}

/**
 * Finds the hook constant on a reference panel drawn from the whole bank.
 * Do this once, then pass the result to every run, so each ad's own hook still shows.
 */
export function calibrateOnReference(
  bank: Person[],
  target: number = C.HOOK_TARGET.reels,
): number {
  const panel = selectPanel(bank, {}, { size: C.REFERENCE_PANEL_SIZE, seed: C.CALIBRATION_SEED });
  const viewers = makeViewers(panel.people, "reference", C.CALIBRATION_SEED);
  return calibrateBase0(viewers, target, C.CALIBRATION_SEED);
}

export function runRehearsal(input: RehearsalInput): RehearsalResult {
  const panel = selectPanel(input.bank, input.filter, {
    size: input.panelSize,
    seed: input.seed,
    excludeLowMeta: input.excludeLowMeta,
  });
  let viewers = makeViewers(panel.people, input.timeline.category, input.seed);
  if (input.moodOverride) {
    const mood = input.moodOverride;
    viewers = viewers.map((v) => ({ ...v, mood }));
  }
  const exits = simulateExits(viewers, input.timeline, input.base0, input.seed);
  return {
    panel,
    viewers,
    exits,
    funnel: computeFunnel(viewers, exits, input.timeline, input.seed),
    survival: survivalByChunk(exits, input.timeline.chunks.length),
    exitsByWindow: exitsByWindow(exits, input.timeline.chunks.length),
    groups: groupReasons(viewers, exits, input.timeline),
  };
}
