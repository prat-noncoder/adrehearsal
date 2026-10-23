// The whole rehearsal in one place: check the request, read the ad, run the engine,
// word the reasons, and build the response the report page shows.

import { MODEL } from "./ai/openrouter.ts";
import type { Usage } from "./ai/openrouter.ts";
import { readAd as defaultReadAd, MAX_FRAMES } from "./ai/readAd.ts";
import type { AdFrame } from "./ai/readAd.ts";
import { templateReason, writeReasons as defaultWriteReasons, MAX_GROUPS } from "./ai/writeReasons.ts";
import type { GroupInput } from "./ai/writeReasons.ts";
import * as C from "./engine/constants.ts";
import { runRehearsal } from "./engine/engine.ts";
import type { AudienceFilter } from "./engine/panel.ts";
import { causeOfExit } from "./engine/reasons.ts";
import type { Agreement } from "./engine/reasons.ts";
import { STREAM, uniform } from "./engine/rng.ts";
import type { Cause, Person, Timeline, Viewer } from "./engine/types.ts";

export const AGE_BANDS = ["18-24", "25-34", "35-44", "45-59", "60+"];
export const TIERS = ["metro", "urban_other", "rural"];
export const PLACEMENTS = ["reels", "feed"];
export const PANEL_SIZES = [200, 400, 1000];
export type IncomeGroup = keyof typeof C.INCOME_GROUPS;
export type Placement = "reels" | "feed";

export interface RehearseRequest {
  kind: "image" | "video";
  frames: AdFrame[];
  audience: { ageBands?: string[]; sex?: "Male" | "Female"; tier?: string[]; incomeGroup?: IncomeGroup; states?: string[] };
  panelSize: number;
  seed: number;
  placement?: "reels" | "feed"; // "reels" (30% hook target) or "feed" (23% hook target), default "feed"
  /** Length of the original video if the browser knows it, to say when only the start was analysed. */
  videoDurationS?: number;
}

/** A problem with what the browser sent. Safe to show; maps to HTTP 400. */
export class RequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RequestError";
  }
}

const isObject = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);

export function parseRequest(body: unknown): RehearseRequest {
  if (!isObject(body)) throw new RequestError("The request was not understood.");
  const kind = body.kind;
  if (kind !== "image" && kind !== "video") throw new RequestError("The ad must be an image or a video.");
  if (!Array.isArray(body.frames) || body.frames.length === 0) throw new RequestError("No picture was received.");
  const maxFrames = kind === "image" ? 1 : MAX_FRAMES;
  if (body.frames.length > maxFrames) {
    throw new RequestError(kind === "image" ? "An image ad must be one picture." : `A video can send at most ${MAX_FRAMES} frames.`);
  }
  const frames: AdFrame[] = body.frames.map((f: unknown, k: number) => {
    if (!isObject(f) || typeof f.dataUrl !== "string" || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(f.dataUrl)) {
      throw new RequestError("Only JPEG, PNG and WebP pictures are accepted.");
    }
    return { timeS: kind === "image" ? 0 : k * C.CHUNK_SECONDS, dataUrl: f.dataUrl };
  });

  const a = isObject(body.audience) ? body.audience : {};
  const audience: RehearseRequest["audience"] = {};
  if (a.ageBands !== undefined) {
    if (!Array.isArray(a.ageBands) || !a.ageBands.every((x) => typeof x === "string" && AGE_BANDS.includes(x))) {
      throw new RequestError("Unknown age band.");
    }
    if (a.ageBands.length) audience.ageBands = a.ageBands as string[];
  }
  if (a.sex !== undefined && a.sex !== "" && a.sex !== null) {
    if (a.sex !== "Male" && a.sex !== "Female") throw new RequestError("Unknown value for sex.");
    audience.sex = a.sex;
  }
  if (a.tier !== undefined) {
    if (!Array.isArray(a.tier) || !a.tier.every((x) => typeof x === "string" && TIERS.includes(x))) {
      throw new RequestError("Unknown city type.");
    }
    if (a.tier.length) audience.tier = a.tier as string[];
  }
  if (a.incomeGroup !== undefined && a.incomeGroup !== "" && a.incomeGroup !== null) {
    if (typeof a.incomeGroup !== "string" || !(a.incomeGroup in C.INCOME_GROUPS)) throw new RequestError("Unknown income group.");
    audience.incomeGroup = a.incomeGroup as IncomeGroup;
  }
  if (a.states !== undefined) {
    if (!Array.isArray(a.states) || !a.states.every((x) => typeof x === "string")) {
      throw new RequestError("States must be an array of strings.");
    }
    if (a.states.length) audience.states = a.states as string[];
  }

  const panelSize = body.panelSize === undefined ? C.PANEL_DEFAULT : body.panelSize;
  if (typeof panelSize !== "number" || !PANEL_SIZES.includes(panelSize)) {
    throw new RequestError("Panel size must be 200, 400 or 1000.");
  }
  const seed = body.seed === undefined ? 1 : body.seed;
  if (typeof seed !== "number" || !Number.isInteger(seed)) throw new RequestError("Seed must be a whole number.");
  const videoDurationS = typeof body.videoDurationS === "number" && body.videoDurationS > 0 ? body.videoDurationS : undefined;

  let placement: Placement = "feed";
  if (body.placement !== undefined) {
    if (typeof body.placement !== "string" || !PLACEMENTS.includes(body.placement)) {
      throw new RequestError("Placement must be 'reels' or 'feed'.");
    }
    placement = body.placement as Placement;
  }

  return { kind, frames, audience, panelSize, seed, videoDurationS, placement };
}

// ---------- Response ----------

export interface Assumption {
  title: string;
  detail: string;
}

export interface ResponseGroup {
  window: string;
  startS: number;
  endS: number;
  cause: Cause;
  count: number;
  /** Share of everyone who left in that same window. */
  share: number;
  shareOfPanel: number;
  /** Agreement label: strong, medium or weak. */
  label: Agreement;
  reason: string;
  reasonSource: "ai" | "template, not AI";
}

export interface CostPart {
  promptTokens: number;
  completionTokens: number;
  costUsd: number | null;
}

export interface PanelComposition {
  ageGroups: Array<{ label: string; count: number }>;
  genders: Array<{ label: string; count: number }>;
  tiers: Array<{ label: string; count: number }>;
  incomeGroups: Array<{ label: string; count: number }>;
  leftIn3s: number;
  watched: number;
}

export interface RehearseResponse {
  headline: string;
  timeline: Timeline;
  panel: { requested: number; used: number; note: string | null };
  panelComposition: PanelComposition;
  funnel: { hook: number; hold: number; end: number; tap: number; tapEligible: number; tapAmongEligible: number };
  /** Share still watching at each whole second, from 0 to the end (curve between chunks is interpolated). */
  retention: number[];
  /** One entry per viewer: the second they left (null if they watched to the end). */
  dots: { exitS: number | null; cause: Cause | null }[];
  exitsByWindow: number[];
  groups: ResponseGroup[];
  reasonsNote: string | null;
  assumptions: Assumption[];
  costInfo: { model: string; readAd: CostPart; reasons: CostPart | null; totalCostUsd: number | null };
  seed: number;
}

export interface RehearseDeps {
  bank: Person[];
  base0: number;
  readAd?: typeof defaultReadAd;
  writeReasons?: typeof defaultWriteReasons;
}

const CAUSE_WORDS: Record<Cause, string> = {
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
const CITY_WORDS: Record<string, string> = { metro: "big-city", urban_other: "other-town", rural: "rural" };
const INCOME_WORDS: Record<number, string> = { 1: "lower", 2: "lower-middle", 3: "middle", 4: "upper-middle", 5: "upper" };

const pct = (x: number) => `${Math.round(x * 100)}%`;
const windowLabel = (s: number, e: number) => `${s}-${e}s`;

/** "25-34 (45%), 18-24 (30%)": the two most common values among the leavers. */
function topTwo(values: string[]): string {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([v, c]) => `${v} (${pct(c / values.length)})`)
    .join(", ");
}

function usageToPart(u: Usage | null): CostPart | null {
  return u ? { promptTokens: u.promptTokens, completionTokens: u.completionTokens, costUsd: u.cost } : null;
}

function retentionPerSecond(survival: number[], durationS: number): number[] {
  const out: number[] = [];
  for (let t = 0; t <= durationS; t++) {
    const k = Math.min(Math.floor(t / C.CHUNK_SECONDS), survival.length - 1);
    const before = k === 0 ? 1 : survival[k - 1];
    const frac = t >= durationS ? 1 : (t - k * C.CHUNK_SECONDS) / C.CHUNK_SECONDS;
    out.push(before - (before - survival[k]) * frac);
  }
  return out;
}

function buildAssumptions(req: RehearseRequest, viewers: Viewer[], timeline: Timeline, base0: number): Assumption[] {
  const odds = Object.entries(C.MOOD_ODDS)
    .map(([m, p]) => `${m.replace(/_/g, " ")} ${pct(p)}`)
    .join(", ");
  const labelled = viewers.filter((v) => v.person.ai).length;
  const placement = req.placement || "feed";
  const targetHook = C.HOOK_TARGET[placement];
  const placementLabel = placement === "reels" ? "Instagram Reels" : "Instagram Feed or Facebook Feed";
  const list: Assumption[] = [
    {
      title: "Moods (assumed)",
      detail: `Each viewer gets one mood per run, drawn with a fixed seed. Odds are assumed: ${odds}. Each mood changes patience and price or doubt sensitivity by assumed amounts.`,
    },
    {
      title: "How traits are scored (assumed)",
      detail: `${labelled} of ${viewers.length} viewers have AI trait scores, blended ${pct(C.AI_BLEND_AI)} AI and ${pct(C.AI_BLEND_RULE)} rule (assumed). The rest use rules on income and age plus random variety (assumed). Sex is never used in the maths.`,
    },
    {
      title: "Income bands (assumed)",
      detail: "Income level (1 to 5) is assigned by a formula, not measured. The lower, middle and upper groups used for the audience filter are assumed groupings of those levels.",
    },
    {
      title: "Exit settings (assumed, not India-specific)",
      detail: `The chance of leaving rises with skip habit, low attention, friction that matters to the viewer, low relevance and fatigue. The hook constant (${base0.toFixed(2)}) is calibrated so a neutral reference ad has a ${pct(targetHook)} hook on ${placementLabel} (a rough third-party figure, not India-specific). Later chunks use a base of ${C.BASE_HAZARD_LATER_CHUNKS} (assumed).`,
    },
    {
      title: "Relevance (assumed)",
      detail: `Relevance is ${C.RELEVANCE_BY_INTEREST_RANK.join(", ")} when the ad category is a viewer's 1st, 2nd or 3rd interest and ${C.RELEVANCE_NO_MATCH} otherwise (all assumed). People the AI marks as unlikely to use Instagram or Facebook are left out of the panel.`,
    },
    {
      title: "Panel (assumed)",
      detail: "Viewers are picked at random in proportion to their population weight (assumed). A panel is a sample, so small differences between runs on different seeds are noise.",
    },
    {
      title: "Tap (assumed, stated intent)",
      detail: `Only viewers who watched at least ${pct(C.TAP_MIN_WATCHED_SHARE)} of the ad can tap. The tap chance is assumed (${C.TAP_BASE_RATE} x click gain x relevance). It shows stated intent, not behaviour.`,
    },
    {
      title: "Sound is not analysed",
      detail: "Only picture frames are read in this version. Music, voice-over and sound effects are not considered.",
    },
  ];
  if (req.kind === "image") {
    list.push({
      title: "Image viewing window (assumed)",
      detail: "A still image is treated as a 6-second viewing window in two chunks: a glance, then a read. The 6 seconds are assumed.",
    });
  } else if (req.videoDurationS && req.videoDurationS > timeline.durationS) {
    list.push({
      title: "Only the start of the video was analysed",
      detail: `The browser sends one frame every 3 seconds, up to ${MAX_FRAMES}. So only the first ${timeline.durationS} seconds of this ${Math.round(req.videoDurationS)}-second video were read.`,
    });
  }
  list.push({
    title: "The AI reads the picture and words the reasons only",
    detail: "The AI describes what is on screen and writes one sentence per group of leavers. It never decides who leaves. Plain maths does.",
  });
  return list;
}

export async function rehearse(req: RehearseRequest, deps: RehearseDeps): Promise<RehearseResponse> {
  const readAd = deps.readAd ?? defaultReadAd;
  const writeReasons = deps.writeReasons ?? defaultWriteReasons;

  console.time("readAd");
  const ad = await readAd({ kind: req.kind, frames: req.frames });
  console.timeEnd("readAd");
  const timeline = ad.timeline;

  const filter: AudienceFilter = {
    ageBands: req.audience.ageBands,
    sex: req.audience.sex,
    states: req.audience.states,
    tiers: req.audience.tier,
    incomeLevels: req.audience.incomeGroup ? C.INCOME_GROUPS[req.audience.incomeGroup] : undefined,
  };
  console.time("panel selection and engine");
  const run = runRehearsal({
    bank: deps.bank,
    timeline,
    filter,
    panelSize: req.panelSize,
    seed: req.seed,
    base0: deps.base0,
  });
  console.timeEnd("panel selection and engine");
  if (run.viewers.length === 0) throw new RequestError("No one in the bank matches this audience. Try widening the filters.");

  // Cache cause of exit for each viewer to avoid recomputing it.
  console.time("build exit cause cache");
  const exitCauses = run.viewers.map((v, k) => {
    const e = run.exits[k];
    return e !== null ? causeOfExit(timeline.chunks[e], v) : null;
  });
  console.timeEnd("build exit cause cache");

  // Who left in each group, and what was on screen, for the reasons call.
  const topGroups = run.groups.slice(0, MAX_GROUPS);
  console.time("reasons input building");
  const inputs: GroupInput[] = topGroups.map((g, i) => {
    const chunk = timeline.chunks[g.chunkIndex];
    const leavers = run.viewers.filter(
      (v, k) => run.exits[k] === g.chunkIndex && exitCauses[k] === g.cause,
    );
    return {
      id: `g${i}`,
      window: windowLabel(g.startS, g.endS),
      cause: g.cause,
      count: g.count,
      sharePercent: Math.round(g.shareOfWindow * 100),
      who: {
        ageBands: topTwo(leavers.map((v) => v.person.ageband)),
        cityTypes: topTwo(leavers.map((v) => CITY_WORDS[v.person.tier] ?? v.person.tier)),
        incomeBands: topTwo(leavers.map((v) => INCOME_WORDS[v.person.incomeLevel])),
      },
      onScreen: { visual: chunk.visual ?? "", text: chunk.text ?? "" },
    };
  });
  console.timeEnd("reasons input building");
  console.time("writeReasons");
  const reasons = await writeReasons(inputs);
  console.timeEnd("writeReasons");
  const reasonById = new Map(reasons.reasons.map((r) => [r.id, r]));

  const groups: ResponseGroup[] = run.groups.map((g, i) => {
    const r = i < MAX_GROUPS ? reasonById.get(`g${i}`) : undefined;
    return {
      window: windowLabel(g.startS, g.endS),
      startS: g.startS,
      endS: g.endS,
      cause: g.cause,
      count: g.count,
      share: g.shareOfWindow,
      shareOfPanel: g.shareOfPanel,
      label: g.agreement,
      reason: r ? r.reason : templateReason(g.cause),
      reasonSource: r && r.source === "ai" ? "ai" : "template, not AI",
    };
  });

  const dots = run.viewers.map((v, k) => {
    const e = run.exits[k];
    if (e === null) return { exitS: null, cause: null };
    const chunk = timeline.chunks[e];
    const within = uniform(req.seed, STREAM.display, v.person.index);
    return {
      // Never exactly 0, so nobody is already gone before the ad starts.
      exitS: Math.max(0.1, Math.round((chunk.startS + within * (chunk.endS - chunk.startS)) * 10) / 10),
      cause: causeOfExit(chunk, v),
    };
  });

  // Headline: computed from the numbers, not written by the AI.
  const f = run.funnel;
  let headline = `Of ${run.panel.used} simulated viewers, ${pct(f.hook)} were still watching at second 3 and ${pct(f.holdEnd)} watched to the end.`;
  let biggest = -1;
  run.exitsByWindow.forEach((n, k) => {
    if (k >= 1 && (biggest === -1 || n > run.exitsByWindow[biggest])) biggest = k;
  });
  if (biggest !== -1 && run.exitsByWindow[biggest] > 0) {
    const c = timeline.chunks[biggest];
    const top = run.groups.find((g) => g.chunkIndex === biggest);
    headline += ` After the first 3 seconds, the biggest drop was at ${windowLabel(c.startS, c.endS)}: ${run.exitsByWindow[biggest]} people left${top ? `, most often because of ${CAUSE_WORDS[top.cause]}` : ""}.`;
  }

  // Panel composition: demographics of the panel
  const ageMap = new Map<string, number>();
  const genderMap = new Map<string, number>();
  const tierMap = new Map<string, number>();
  const incomeMap = new Map<number, number>();
  let leftIn3s = 0;
  for (const v of run.viewers) {
    ageMap.set(v.person.ageband, (ageMap.get(v.person.ageband) ?? 0) + 1);
    genderMap.set(v.person.sex, (genderMap.get(v.person.sex) ?? 0) + 1);
    tierMap.set(CITY_WORDS[v.person.tier] ?? v.person.tier, (tierMap.get(CITY_WORDS[v.person.tier] ?? v.person.tier) ?? 0) + 1);
    incomeMap.set(v.person.incomeLevel, (incomeMap.get(v.person.incomeLevel) ?? 0) + 1);
  }
  for (const v of run.viewers) {
    const k = run.viewers.indexOf(v);
    if (run.exits[k] === 0) leftIn3s++; // Exited in first chunk (0-3 seconds)
  }
  const panelComposition: PanelComposition = {
    ageGroups: Array.from(ageMap).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
    genders: Array.from(genderMap).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
    tiers: Array.from(tierMap).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
    incomeGroups: Array.from(incomeMap)
      .map(([level, count]) => ({ label: INCOME_WORDS[level], count }))
      .sort((a, b) => b.count - a.count),
    leftIn3s,
    watched: run.panel.used - leftIn3s,
  };

  const readCost = usageToPart(ad.usage)!;
  const reasonCost = usageToPart(reasons.usage);
  const costs = [readCost.costUsd, reasonCost?.costUsd ?? null];
  const known = costs.filter((c): c is number => c !== null);

  return {
    headline,
    timeline,
    panel: { requested: run.panel.requested, used: run.panel.used, note: run.panel.note },
    panelComposition,
    funnel: {
      hook: f.hook,
      hold: f.holdMid,
      end: f.holdEnd,
      tap: f.tap,
      tapEligible: f.tapEligible,
      tapAmongEligible: f.tapAmongEligible,
    },
    retention: retentionPerSecond(run.survival, timeline.durationS),
    dots,
    exitsByWindow: run.exitsByWindow,
    groups,
    reasonsNote: reasons.failure
      ? `The AI could not word the reasons (${reasons.failure}), so plain template sentences are shown instead.`
      : null,
    assumptions: buildAssumptions(req, run.viewers, timeline, deps.base0),
    costInfo: {
      model: MODEL,
      readAd: readCost,
      reasons: reasonCost,
      totalCostUsd: known.length ? known.reduce((a, b) => a + b, 0) : null,
    },
    seed: req.seed,
  };
}
