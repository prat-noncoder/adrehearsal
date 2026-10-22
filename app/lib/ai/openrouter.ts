// A small OpenRouter client. Google models only, Google providers only, never a fallback.
// The key is read here and nowhere else. It is never printed, logged or put in an error message.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
export const MODEL = "google/gemini-3.8-flash";
const GOOGLE_PROVIDERS = ["google-vertex", "google-ai-studio"];
const MAX_TRIES = 3;

export type AiErrorKind =
  | "no_key"
  | "out_of_credits"
  | "rate_limited"
  | "server_error"
  | "request_rejected"
  | "bad_output"
  | "network";

/** Errors carry a plain-language message that is safe to show on the page. */
export class AiError extends Error {
  kind: AiErrorKind;
  constructor(kind: AiErrorKind, message: string) {
    super(message);
    this.name = "AiError";
    this.kind = kind;
  }
}

export interface ChatMessage {
  role: "system" | "user";
  content: string | ContentPart[];
}
export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface Usage {
  promptTokens: number;
  completionTokens: number;
  /** Cost in US dollars as reported by OpenRouter, if it reported one. */
  cost: number | null;
}

export interface ChatDeps {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** For tests: supply the key directly. */
  apiKey?: string;
}

/**
 * The key comes from the OPENROUTER_API_KEY environment variable (Vercel in production).
 * Only in local development, if it is not set, it is read from api_key.txt at the repo root.
 */
export function getApiKey(): string {
  const fromEnv = process.env.OPENROUTER_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV !== "production") {
    try {
      const fromFile = readFileSync(resolve(process.cwd(), "../api_key.txt"), "utf8").trim();
      if (fromFile) return fromFile;
    } catch {
      // fall through to the error below
    }
  }
  throw new AiError(
    "no_key",
    "The AI service key is not set up on this server, so the ad could not be read.",
  );
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** One chat call. Retries 429 and 5xx up to 3 times. On 402 (out of credits) it stops at once. */
export async function chat(
  messages: ChatMessage[],
  options: { maxTokens: number },
  deps: ChatDeps = {},
): Promise<{ text: string; usage: Usage }> {
  const key = deps.apiKey ?? getApiKey();
  const doFetch = deps.fetchImpl ?? fetch;
  const sleep = deps.sleep ?? defaultSleep;
  const body = JSON.stringify({
    model: MODEL,
    temperature: 0,
    max_tokens: options.maxTokens,
    reasoning: { effort: "low", exclude: true },
    usage: { include: true },
    provider: { only: GOOGLE_PROVIDERS, allow_fallbacks: false },
    messages,
  });

  let lastStatus = 0;
  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    let res: Response;
    try {
      res = await doFetch(OPENROUTER_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body,
      });
    } catch {
      if (attempt === MAX_TRIES) {
        throw new AiError("network", "The AI service could not be reached. Please try again.");
      }
      await sleep(500 * 2 ** (attempt - 1));
      continue;
    }

    if (res.status === 402) {
      throw new AiError(
        "out_of_credits",
        "The AI service is out of credits, so the ad could not be read. The owner needs to top up the account.",
      );
    }
    if (res.status === 429 || res.status >= 500) {
      lastStatus = res.status;
      if (attempt < MAX_TRIES) {
        await sleep(500 * 2 ** (attempt - 1));
        continue;
      }
      throw new AiError(
        res.status === 429 ? "rate_limited" : "server_error",
        `The AI service was busy or unavailable (status ${lastStatus}) after ${MAX_TRIES} tries. Please try again in a minute.`,
      );
    }
    if (!res.ok) {
      throw new AiError(
        "request_rejected",
        `The AI service rejected the request (status ${res.status}).`,
      );
    }

    const json = (await res.json()) as {
      choices?: { message?: { content?: string | null } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
    };
    const text = json.choices?.[0]?.message?.content;
    if (typeof text !== "string" || text.trim() === "") {
      throw new AiError("bad_output", "The AI service returned an empty answer.");
    }
    return {
      text,
      usage: {
        promptTokens: json.usage?.prompt_tokens ?? 0,
        completionTokens: json.usage?.completion_tokens ?? 0,
        cost: typeof json.usage?.cost === "number" ? json.usage.cost : null,
      },
    };
  }
  throw new AiError("server_error", "The AI service did not answer.");
}

/** Pulls one JSON value out of a model answer, ignoring any code fence or chatter around it. */
export function extractJson(text: string): unknown {
  const start = text.search(/[{[]/);
  if (start === -1) throw new Error("no JSON found");
  const open = text[start];
  const end = text.lastIndexOf(open === "{" ? "}" : "]");
  if (end <= start) throw new Error("no JSON found");
  return JSON.parse(text.slice(start, end + 1));
}
