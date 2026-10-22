// Funnel (hook, hold, tap) and the calibration that sets the hook-chunk constant.

import * as C from "./constants";
import { exitChunk } from "./exits";
import { STREAM, uniform, clip } from "./rng";
import type { Chunk, Timeline, Viewer } from "./types";

export interface Funnel {
  /** Share still watching at second 3 (after the first chunk). */
  hook: number;
  /** Share still watching at the midpoint of the ad. */
  holdMid: number;
  /** Share who watched to the end. */
  holdEnd: number;
  /** Share of the whole panel who would tap to learn more. Stated intent, not behaviour. */
  tap: number;
  /** How many people watched enough of the ad to be able to tap. */
  tapEligible: number;
  /** Taps as a share of those eligible. */
  tapAmongEligible: number;
}

/** Still watching at the end of chunk k: did not leave in chunks 0 to k. */
export function stillWatchingAfter(exit: number | null, k: number): boolean {
  return exit === null || exit > k;
}

/** Index of the chunk whose end is at or just past the midpoint. */
export function midpointChunk(chunkCount: number): number {
  return Math.max(0, Math.ceil(chunkCount / 2) - 1);
}

/** Share still watching after each chunk. */
export function survivalByChunk(exits: (number | null)[], chunkCount: number): number[] {
  const out: number[] = [];
  for (let k = 0; k < chunkCount; k++) {
    out.push(exits.filter((e) => stillWatchingAfter(e, k)).length / exits.length);
  }
  return out;
}

export function computeFunnel(
  viewers: Viewer[],
  exits: (number | null)[],
  timeline: Timeline,
  seed: number,
): Funnel {
  const n = viewers.length;
  const chunks = timeline.chunks;
  const mid = midpointChunk(chunks.length);
  const share = (count: number) => (n === 0 ? 0 : count / n);

  const hook = share(exits.filter((e) => stillWatchingAfter(e, 0)).length);
  const holdMid = share(exits.filter((e) => stillWatchingAfter(e, mid)).length);
  const holdEnd = share(exits.filter((e) => e === null).length);

  let eligible = 0;
  let taps = 0;
  viewers.forEach((v, i) => {
    const e = exits[i];
    // Seconds watched: the start of the chunk they left in (a conservative count), or the whole ad.
    const watchedS = e === null ? timeline.durationS : chunks[e].startS;
    if (watchedS < C.TAP_MIN_WATCHED_SHARE * timeline.durationS) return;
    eligible++;
    const p = clip(
      C.TAP_BASE_RATE * v.traits.clickGain * (C.TAP_RELEVANCE_FLOOR + v.relevance),
      0,
      C.TAP_MAX,
    );
    if (uniform(seed, STREAM.tap, v.person.index) < p) taps++;
  });

  return {
    hook,
    holdMid,
    holdEnd,
    tap: share(taps),
    tapEligible: eligible,
    tapAmongEligible: eligible === 0 ? 0 : taps / eligible,
  };
}

/** The reference ad used for calibration: one hook chunk, middling salience, no friction. */
function referenceTimeline(): Timeline {
  const chunk: Chunk = {
    startS: 0,
    endS: C.CHUNK_SECONDS,
    kind: "hook",
    salience: C.REFERENCE_HOOK_SALIENCE,
    friction: [],
  };
  return { durationS: C.CHUNK_SECONDS, kind: "video", category: "reference", chunks: [chunk] };
}

/**
 * Finds base_0 (the hook-chunk constant) by bisection, so that on this panel and seed the
 * reference ad's hook equals the target. Run it once on a reference panel, then reuse the
 * result for real ads, so the ad's own hook strength still shows up in its result.
 */
export function calibrateBase0(viewers: Viewer[], target: number, seed: number): number {
  const ref = referenceTimeline();
  const hookAt = (base0: number) =>
    viewers.filter((v) => exitChunk(v, ref, base0, seed) === null).length / viewers.length;
  let lo = C.BASE_0_SEARCH_MIN; // hook near 100%
  let hi = C.BASE_0_SEARCH_MAX; // hook near 0%
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (hookAt(mid) > target) lo = mid;
    else hi = mid;
  }
  return Math.abs(hookAt(lo) - target) <= Math.abs(hookAt(hi) - target) ? lo : hi;
}
