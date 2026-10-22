// One AI call (not one per person) that words the reasons for the biggest groups of leavers.
// The maths already decided who left and why; the AI only writes the sentence.
// If the call fails, a plain template sentence is used and marked "template, not AI".

import type { Cause } from "../engine/types.ts";
import { chat, extractJson } from "./openrouter.ts";
import type { ChatDeps, Usage } from "./openrouter.ts";

export const MAX_GROUPS = 8;
export const MAX_WORDS = 22;

export interface GroupInput {
  id: string;
  window: string; // e.g. "3-6s"
  cause: Cause;
  count: number;
  sharePercent: number;
  /** Who the leavers are, in plain words: age band, city type, income band. */
  who: { ageBands: string; cityTypes: string; incomeBands: string };
  /** What is on screen in that window, from the ad timeline. */
  onScreen: { visual: string; text: string };
}

export interface ReasonOut {
  id: string;
  reason: string;
  source: "ai" | "template";
}

export interface WriteReasonsResult {
  reasons: ReasonOut[];
  usage: Usage | null;
  /** Set when the AI call failed and templates were used. Safe to show. */
  failure: string | null;
}

const TEMPLATES: Record<Cause, string> = {
  slow_open: "The start felt slow, so I scrolled on.",
  unclear_offer: "I could not tell what was being offered.",
  price_shock: "The price put me off.",
  trust_doubt: "I did not quite trust what I was being told.",
  text_heavy: "There was too much text to read while scrolling.",
  brand_first: "It opened with a brand name instead of something for me.",
  off_putting_presenter: "The person on screen did not appeal to me.",
  nothing_new: "It felt like something I had seen many times before.",
  too_long: "It went on for too long for me.",
  not_relevant: "This was not something I was interested in.",
  lost_interest: "I lost interest and moved on.",
};

export function templateReason(cause: Cause): string {
  return TEMPLATES[cause];
}

const CAUSE_MEANING: Record<Cause, string> = {
  slow_open: "the ad opened slowly",
  unclear_offer: "it was unclear what was offered",
  price_shock: "the price felt too high",
  trust_doubt: "the viewer doubted the claim or brand",
  text_heavy: "too much text on screen",
  brand_first: "the ad led with a brand or logo rather than something of interest",
  off_putting_presenter: "the presenter did not appeal",
  nothing_new: "it felt familiar, nothing new",
  too_long: "it felt too long",
  not_relevant: "the topic did not interest the viewer",
  lost_interest: "attention simply faded",
};

const SYSTEM =
  "You write what a typical viewer might think at the moment they scroll away from an ad. " +
  `For each group, write ONE first-person sentence of at most ${MAX_WORDS} words, in a typical viewer's plain voice. ` +
  "Use only what is on screen in that time window and the stated cause. " +
  "Never mention being an AI. Do not infer anything from sex, religion, caste or names. " +
  'Return ONLY a JSON list like [{"id":"g0","reason":"..."}], one entry per group id given.';

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function allTemplates(groups: GroupInput[], failure: string | null, usage: Usage | null): WriteReasonsResult {
  return {
    reasons: groups.map((g) => ({ id: g.id, reason: templateReason(g.cause), source: "template" as const })),
    usage,
    failure,
  };
}

export async function writeReasons(groups: GroupInput[], deps: ChatDeps = {}): Promise<WriteReasonsResult> {
  const top = groups.slice(0, MAX_GROUPS);
  if (top.length === 0) return { reasons: [], usage: null, failure: null };

  const payload = top.map((g) => ({
    id: g.id,
    window: g.window,
    cause: g.cause,
    causeMeaning: CAUSE_MEANING[g.cause],
    peopleWhoLeft: g.count,
    shareOfThatWindowsLeavers: `${g.sharePercent}%`,
    whoTheyAre: g.who,
    onScreenThen: g.onScreen,
  }));

  try {
    const { text, usage } = await chat(
      [
        { role: "system", content: SYSTEM },
        { role: "user", content: JSON.stringify(payload) },
      ],
      { maxTokens: 1500 },
      deps,
    );
    const raw = extractJson(text);
    const list = Array.isArray(raw) ? raw : (raw as { reasons?: unknown })?.reasons;
    if (!Array.isArray(list)) throw new Error("answer is not a list");
    const byId = new Map<string, string>();
    for (const item of list) {
      if (
        typeof item === "object" && item !== null &&
        typeof (item as { id?: unknown }).id === "string" &&
        typeof (item as { reason?: unknown }).reason === "string"
      ) {
        const reason = (item as { reason: string }).reason.trim();
        if (reason !== "" && wordCount(reason) <= MAX_WORDS) byId.set((item as { id: string }).id, reason);
      }
    }
    return {
      // A group whose sentence is missing, empty or too long falls back to its template on its own.
      reasons: top.map((g) =>
        byId.has(g.id)
          ? { id: g.id, reason: byId.get(g.id)!, source: "ai" as const }
          : { id: g.id, reason: templateReason(g.cause), source: "template" as const },
      ),
      usage,
      failure: null,
    };
  } catch (e) {
    const message = e instanceof Error && e.name === "AiError" ? e.message : "The AI answer could not be used.";
    return allTemplates(top, message, null);
  }
}
