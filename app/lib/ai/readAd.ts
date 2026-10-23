// Reads an ad with Gemini (through OpenRouter, Google only) and returns a timeline for the engine.
// The model only describes what is visible. It never decides who leaves.

import { AD_CATEGORIES, FRICTION_TAGS } from "../engine/types.ts";
import type { Chunk, Friction, Timeline } from "../engine/types.ts";
import { AiError, chat, extractJson } from "./openrouter.ts";
import type { ChatDeps, ContentPart, Usage } from "./openrouter.ts";

export const MAX_FRAMES = 20; // one frame per 3 seconds, so up to 60 seconds of a video
export const CHUNK_SECONDS = 3;
export const IMAGE_WINDOW_SECONDS = 6; // ASSUMED: a still image is "watched" for 6 seconds, in 2 chunks

export interface AdFrame {
  /** Time in the ad in seconds. For an image this is 0. */
  timeS: number;
  /** A data URL: data:image/jpeg;base64,... */
  dataUrl: string;
}

export interface ReadAdInput {
  kind: "image" | "video";
  frames: AdFrame[];
}

export interface ReadAdResult {
  timeline: Timeline;
  usage: Usage;
}

export const SYSTEM_PROMPT =
  "You watch an ad the way a viewer scrolling on Instagram would see it. Describe only what is visible. Never forecast performance. Frames are given in order, each with its time in seconds. " +
  `Return ONE JSON object: {durationS, category (one of: ${AD_CATEGORIES.join(", ")}), ` +
  "chunks: [{startS, endS, kind: hook|body|cta, visual, text, salience 0 to 1, friction: [{tag, strength 0 to 1}]}]}. " +
  `Friction tags: ${FRICTION_TAGS.join(", ")}. ` +
  "salience is how much the moment grabs a scrolling viewer. Keep visual and text short.";

const STRICTER_REMINDER =
  "Your last answer was not valid. Reply with ONLY the JSON object, no other text, no code fence. " +
  "Use exactly the requested number of chunks, a category from the list, kinds hook, body or cta, " +
  "salience and strength as numbers from 0 to 1, and friction tags only from the list.";

const isObject = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);
const isUnit = (x: unknown): x is number => typeof x === "number" && x >= 0 && x <= 1;

/** Checks the model's JSON and builds the timeline. Throws an Error with a reason if it is wrong. */
export function validateTimeline(raw: unknown, kind: "image" | "video", chunkCount: number): Timeline {
  if (!isObject(raw)) throw new Error("answer is not an object");
  const category = raw.category;
  if (typeof category !== "string" || !(AD_CATEGORIES as readonly string[]).includes(category)) {
    throw new Error("category is not one of the allowed categories");
  }
  if (!Array.isArray(raw.chunks) || raw.chunks.length !== chunkCount) {
    throw new Error(`expected exactly ${chunkCount} chunks`);
  }
  const chunks: Chunk[] = raw.chunks.map((c: unknown, k: number) => {
    if (!isObject(c)) throw new Error(`chunk ${k} is not an object`);
    if (c.kind !== "hook" && c.kind !== "body" && c.kind !== "cta") throw new Error(`chunk ${k} has a bad kind`);
    if (!isUnit(c.salience)) throw new Error(`chunk ${k} salience must be 0 to 1`);
    if (typeof c.visual !== "string" || typeof c.text !== "string") throw new Error(`chunk ${k} needs visual and text`);
    if (!Array.isArray(c.friction)) throw new Error(`chunk ${k} friction must be a list`);
    const friction: Friction[] = c.friction.map((f: unknown) => {
      if (!isObject(f) || typeof f.tag !== "string" || !(FRICTION_TAGS as string[]).includes(f.tag) || !isUnit(f.strength)) {
        throw new Error(`chunk ${k} has a bad friction entry`);
      }
      return { tag: f.tag as Friction["tag"], strength: f.strength };
    });
    return {
      // Times are set by us, not trusted from the model: one chunk per 3 seconds.
      startS: k * CHUNK_SECONDS,
      endS: (k + 1) * CHUNK_SECONDS,
      kind: c.kind,
      salience: c.salience,
      friction,
      visual: c.visual.slice(0, 200),
      text: c.text.slice(0, 200),
    };
  });
  return { durationS: chunkCount * CHUNK_SECONDS, kind: kind === "image" ? "image" : "video", category, chunks };
}

function buildUserContent(input: ReadAdInput, chunkCount: number): ContentPart[] {
  const intro =
    input.kind === "image"
      ? `This is a single still image ad. Treat it as a ${IMAGE_WINDOW_SECONDS}-second viewing window in ${chunkCount} chunks of 3 seconds: chunk 1 (0 to 3 s) is the first glance, chunk 2 (3 to 6 s) is the viewer reading the details of the same image. Return exactly ${chunkCount} chunks.`
      : `This is a video ad shown as ${input.frames.length} frames, one every 3 seconds. Each frame stands for the 3-second chunk that starts at its time. Return exactly ${chunkCount} chunks, in order.`;
  const parts: ContentPart[] = [{ type: "text", text: intro }];
  for (const f of input.frames) {
    parts.push({ type: "text", text: `Frame at ${f.timeS} seconds:` });
    parts.push({ type: "image_url", image_url: { url: f.dataUrl } });
  }
  return parts;
}

export async function readAd(input: ReadAdInput, deps: ChatDeps = {}): Promise<ReadAdResult> {
  if (input.frames.length === 0) throw new AiError("request_rejected", "No picture was received.");
  if (input.kind === "video" && input.frames.length > MAX_FRAMES) {
    throw new AiError("request_rejected", `A video can send at most ${MAX_FRAMES} frames.`);
  }
  const chunkCount = input.kind === "image" ? IMAGE_WINDOW_SECONDS / CHUNK_SECONDS : input.frames.length;
  const system = { role: "system" as const, content: SYSTEM_PROMPT };
  const user = { role: "user" as const, content: buildUserContent(input, chunkCount) };

  let usageTotal: Usage = { promptTokens: 0, completionTokens: 0, cost: null };
  const addUsage = (u: Usage) => {
    usageTotal = {
      promptTokens: usageTotal.promptTokens + u.promptTokens,
      completionTokens: usageTotal.completionTokens + u.completionTokens,
      cost: u.cost === null && usageTotal.cost === null ? null : (usageTotal.cost ?? 0) + (u.cost ?? 0),
    };
  };

  let reminder: string | null = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const messages = reminder
      ? [system, user, { role: "user" as const, content: reminder }]
      : [system, user];
    const { text, usage } = await chat(messages, { maxTokens: 4000 }, deps);
    addUsage(usage);
    try {
      return { timeline: validateTimeline(extractJson(text), input.kind, chunkCount), usage: usageTotal };
    } catch {
      reminder = STRICTER_REMINDER;
    }
  }
  throw new AiError(
    "bad_output",
    "The AI could not describe this ad in a usable form after two tries. Please try again or use a different ad.",
  );
}
