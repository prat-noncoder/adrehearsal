// Reasons (structure only). The AI writes the sentence later; here we only count causes.

import * as C from "./constants.ts";
import { frictionTerms } from "./exits.ts";
import type { Cause, Chunk, Timeline, Viewer } from "./types.ts";

export type Agreement = "strong" | "medium" | "weak";

export interface ReasonGroup {
  chunkIndex: number;
  startS: number;
  endS: number;
  cause: Cause;
  count: number;
  /** Share of everyone who left in this same window. */
  shareOfWindow: number;
  /** Share of the whole panel. */
  shareOfPanel: number;
  agreement: Agreement;
}

/** Why someone left at this chunk: the tag with the largest strength x trait. */
export function causeOfExit(chunk: Chunk, v: Viewer): Cause {
  let best: { tag: Cause; value: number } | null = null;
  for (const t of frictionTerms(chunk, v)) {
    if (best === null || t.value > best.value) best = { tag: t.tag, value: t.value };
  }
  if (best !== null && best.value > 0) return best.tag;
  return v.relevance < C.NOT_RELEVANT_BELOW ? "not_relevant" : "lost_interest";
}

export function agreementLabel(shareOfWindow: number): Agreement {
  if (shareOfWindow >= C.AGREEMENT_STRONG) return "strong";
  if (shareOfWindow >= C.AGREEMENT_MEDIUM) return "medium";
  return "weak";
}

/** Counts per (3-second window, cause), biggest first. */
export function groupReasons(
  viewers: Viewer[],
  exits: (number | null)[],
  timeline: Timeline,
): ReasonGroup[] {
  const leaversPerChunk = timeline.chunks.map(() => 0);
  const counts = new Map<string, number>();
  viewers.forEach((v, i) => {
    const e = exits[i];
    if (e === null) return;
    leaversPerChunk[e]++;
    const cause = causeOfExit(timeline.chunks[e], v);
    const key = `${e}|${cause}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });

  const groups: ReasonGroup[] = [];
  for (const [key, count] of counts) {
    const [chunkStr, cause] = key.split("|");
    const chunkIndex = Number(chunkStr);
    const shareOfWindow = count / leaversPerChunk[chunkIndex];
    groups.push({
      chunkIndex,
      startS: timeline.chunks[chunkIndex].startS,
      endS: timeline.chunks[chunkIndex].endS,
      cause: cause as Cause,
      count,
      shareOfWindow,
      shareOfPanel: count / viewers.length,
      agreement: agreementLabel(shareOfWindow),
    });
  }
  groups.sort((a, b) => b.count - a.count || a.chunkIndex - b.chunkIndex);
  return groups;
}

/** How many people left in each 3-second window. */
export function exitsByWindow(exits: (number | null)[], chunkCount: number): number[] {
  const out = new Array<number>(chunkCount).fill(0);
  for (const e of exits) if (e !== null) out[e]++;
  return out;
}
