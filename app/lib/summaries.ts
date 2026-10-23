// Plain templates that turn numbers already in the report into short sentences. No AI, no new maths on the engine.

import type { RehearseResponse } from "./rehearse.ts";

export const CAUSE_WORDS: Record<string, string> = {
  slow_open: "a slow opening",
  unclear_offer: "an unclear offer",
  price_shock: "the price",
  trust_doubt: "doubt about trust",
  text_heavy: "too much text",
  brand_first: "leading with the brand",
  off_putting_presenter: "the presenter",
  nothing_new: "nothing feeling new",
  too_long: "the length",
  not_relevant: "the topic not being relevant to them",
  lost_interest: "attention fading",
};

const TEST_IDEAS: Record<string, string> = {
  slow_open: "Try a version that shows the product or the main benefit in the first second.",
  unclear_offer: "Try a version that says what you are offering in one plain line on screen.",
  price_shock: "Try a version that frames the price against the value, or leaves it out of the opening.",
  trust_doubt: "Try a version that adds a proof point, such as a review, a number or a guarantee.",
  text_heavy: "Try a version with fewer words on screen, one idea per moment.",
  brand_first: "Try a version that leads with the benefit and shows the brand later.",
  off_putting_presenter: "Try a version with a different presenter, or with the product in the lead.",
  nothing_new: "Try a version that opens with something unexpected or a clear new angle.",
  too_long: "Try a shorter cut that gets to the point sooner.",
  not_relevant: "Try a version aimed at a narrower audience, or one that names who it is for.",
  lost_interest: "Try a version with a change of scene or a new piece of information earlier on.",
};

const pct = (x: number) => `${Math.round(x * 100)}%`;
const win = (s: number, e: number) => `${s}-${e} seconds`;

export interface Digest {
  biggest: { startS: number; endS: number; left: number; cause: string | null } | null;
  best: { startS: number; endS: number; left: number } | null;
}

export function digest(d: RehearseResponse): Digest {
  const n = d.dots.length || 1;
  const chunks = d.timeline.chunks;
  let bigK = -1;
  d.exitsByWindow.forEach((c, k) => {
    if (c > 0 && (bigK === -1 || c > d.exitsByWindow[bigK])) bigK = k;
  });
  let biggest: Digest["biggest"] = null;
  if (bigK !== -1 && chunks[bigK]) {
    const inWin = d.groups.filter((g) => g.startS === chunks[bigK].startS).sort((a, b) => b.count - a.count);
    biggest = { startS: chunks[bigK].startS, endS: chunks[bigK].endS, left: d.exitsByWindow[bigK], cause: inWin[0]?.cause ?? null };
  }
  let bestK = -1;
  d.exitsByWindow.forEach((c, k) => {
    if (bestK === -1 || c < d.exitsByWindow[bestK]) bestK = k;
  });
  const best = bestK !== -1 && chunks[bestK] && chunks.length > 1
    ? { startS: chunks[bestK].startS, endS: chunks[bestK].endS, left: d.exitsByWindow[bestK] / n }
    : null;
  return { biggest, best };
}

export function decisionSentence(d: RehearseResponse): string {
  const { biggest } = digest(d);
  const first = `${pct(d.funnel.hook)} stayed past the hook.`;
  if (!biggest) return `${first} Nobody left during this ad in this simulation.`;
  const why = biggest.cause ? `, mostly because of ${CAUSE_WORDS[biggest.cause] ?? biggest.cause}` : "";
  return `${first} The biggest drop was at ${win(biggest.startS, biggest.endS)}${why}.`;
}

export function doThisNow(d: RehearseResponse): { keep: string; fix: string; test: string } {
  const { biggest, best } = digest(d);
  const keep = best
    ? `The part at ${win(best.startS, best.endS)} lost the fewest viewers (${pct(best.left)} of the panel). Leave it as it is.`
    : "There is only one stage in this ad, so there is no stronger part to compare. Keep what works for you.";
  const fix = biggest
    ? `${biggest.left} viewers left at ${win(biggest.startS, biggest.endS)}${biggest.cause ? `, mostly because of ${CAUSE_WORDS[biggest.cause] ?? biggest.cause}` : ""}. Start here.`
    : "No clear leak in this run.";
  const test = biggest?.cause ? TEST_IDEAS[biggest.cause] ?? "Try one change to that moment and run it again." : "Try one change and run it again to compare.";
  return { keep, fix, test };
}
