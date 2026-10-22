import { describe, expect, it } from "vitest";
import { AiError, extractJson, MODEL } from "./openrouter.ts";
import { readAd, validateTimeline } from "./readAd.ts";
import type { ReadAdInput } from "./readAd.ts";

const FAKE_KEY = "test-key-not-real";

const goodAnswer = {
  durationS: 6,
  category: "fashion_apparel",
  chunks: [
    { startS: 0, endS: 3, kind: "hook", visual: "A red kurta on a model", text: "SALE", salience: 0.8, friction: [] },
    {
      startS: 3,
      endS: 6,
      kind: "cta",
      visual: "Price tag",
      text: "Rs 999",
      salience: 0.6,
      friction: [{ tag: "price_shock", strength: 0.4 }],
    },
  ],
};

function reply(content: string, status = 200, usage = { prompt_tokens: 100, completion_tokens: 50, cost: 0.001 }) {
  return new Response(JSON.stringify({ choices: [{ message: { content } }], usage }), { status });
}

const image: ReadAdInput = { kind: "image", frames: [{ timeS: 0, dataUrl: "data:image/jpeg;base64,AAAA" }] };
const noSleep = async () => {};

describe("readAd", () => {
  it("sends a Google-only request and returns a checked timeline", async () => {
    const seen: { url: string; headers: Record<string, string>; body: any }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(init.body as string) });
      return reply("```json\n" + JSON.stringify(goodAnswer) + "\n```");
    }) as unknown as typeof fetch;
    const out = await readAd(image, { fetchImpl, sleep: noSleep, apiKey: FAKE_KEY });

    expect(seen).toHaveLength(1);
    const { body, headers, url } = seen[0];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(body.model).toBe(MODEL);
    expect(body.model.startsWith("google/")).toBe(true);
    expect(body.provider).toEqual({ only: ["google-vertex", "google-ai-studio"], allow_fallbacks: false });
    expect(body.reasoning).toEqual({ effort: "low", exclude: true });
    expect(body.temperature).toBe(0);
    expect(body.usage).toEqual({ include: true });
    expect(headers.Authorization).toBe(`Bearer ${FAKE_KEY}`);
    expect(JSON.stringify(body)).not.toContain(FAKE_KEY); // the key is never in the body
    expect(out.timeline.chunks).toHaveLength(2);
    expect(out.timeline.durationS).toBe(6);
    expect(out.timeline.chunks[1].friction[0].tag).toBe("price_shock");
    expect(out.usage.cost).toBeCloseTo(0.001);
  });

  it("retries once with a stricter reminder when the JSON is invalid", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return calls === 1 ? reply("sorry, here is some prose") : reply(JSON.stringify(goodAnswer));
    }) as unknown as typeof fetch;
    const out = await readAd(image, { fetchImpl, sleep: noSleep, apiKey: FAKE_KEY });
    expect(calls).toBe(2);
    expect(out.timeline.category).toBe("fashion_apparel");
    expect(out.usage.promptTokens).toBe(200); // both calls are counted
  });

  it("fails clearly after two invalid answers", async () => {
    const fetchImpl = (async () => reply("not json")) as unknown as typeof fetch;
    await expect(readAd(image, { fetchImpl, sleep: noSleep, apiKey: FAKE_KEY })).rejects.toMatchObject({
      kind: "bad_output",
    });
  });

  it("stops at once on 402 (out of credits) with a plain message", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return new Response("{}", { status: 402 });
    }) as unknown as typeof fetch;
    const err = await readAd(image, { fetchImpl, sleep: noSleep, apiKey: FAKE_KEY }).catch((e) => e);
    expect(err).toBeInstanceOf(AiError);
    expect(err.kind).toBe("out_of_credits");
    expect(err.message).toContain("out of credits");
    expect(calls).toBe(1);
  });

  it("retries 429 and 5xx up to 3 times", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return calls < 3 ? new Response("{}", { status: calls === 1 ? 429 : 503 }) : reply(JSON.stringify(goodAnswer));
    }) as unknown as typeof fetch;
    const out = await readAd(image, { fetchImpl, sleep: noSleep, apiKey: FAKE_KEY });
    expect(calls).toBe(3);
    expect(out.timeline.chunks).toHaveLength(2);

    let always = 0;
    const failing = (async () => {
      always++;
      return new Response("{}", { status: 503 });
    }) as unknown as typeof fetch;
    await expect(readAd(image, { fetchImpl: failing, sleep: noSleep, apiKey: FAKE_KEY })).rejects.toMatchObject({
      kind: "server_error",
    });
    expect(always).toBe(3);
  });

  it("sends one labelled frame per 3 seconds for a video and rejects more than 12", async () => {
    const bodies: any[] = [];
    const fetchImpl = (async (_u: string, init: RequestInit) => {
      bodies.push(JSON.parse(init.body as string));
      return reply(
        JSON.stringify({
          durationS: 9,
          category: "pets",
          chunks: [0, 1, 2].map((k) => ({
            startS: k * 3, endS: k * 3 + 3, kind: k === 0 ? "hook" : "body", visual: "dog", text: "", salience: 0.5, friction: [],
          })),
        }),
      );
    }) as unknown as typeof fetch;
    const video: ReadAdInput = {
      kind: "video",
      frames: [0, 3, 6].map((t) => ({ timeS: t, dataUrl: "data:image/jpeg;base64,AAAA" })),
    };
    const out = await readAd(video, { fetchImpl, sleep: noSleep, apiKey: FAKE_KEY });
    expect(out.timeline.chunks).toHaveLength(3);
    const content = bodies[0].messages[1].content as { type: string; text?: string }[];
    expect(content.filter((p) => p.type === "image_url")).toHaveLength(3);
    expect(content.some((p) => p.text === "Frame at 6 seconds:")).toBe(true);

    const tooMany: ReadAdInput = {
      kind: "video",
      frames: Array.from({ length: 13 }, (_, k) => ({ timeS: k * 3, dataUrl: "data:image/jpeg;base64,AAAA" })),
    };
    await expect(readAd(tooMany, { fetchImpl, sleep: noSleep, apiKey: FAKE_KEY })).rejects.toBeInstanceOf(AiError);
  });
});

describe("validateTimeline", () => {
  it("rejects a bad category, wrong chunk count, bad salience and unknown tags", () => {
    expect(() => validateTimeline({ ...goodAnswer, category: "cars" }, "image", 2)).toThrow();
    expect(() => validateTimeline(goodAnswer, "image", 3)).toThrow();
    const bad = structuredClone(goodAnswer);
    bad.chunks[0].salience = 1.5;
    expect(() => validateTimeline(bad, "image", 2)).toThrow();
    const badTag = structuredClone(goodAnswer);
    (badTag.chunks[1].friction as any[]) = [{ tag: "boring", strength: 0.2 }];
    expect(() => validateTimeline(badTag, "image", 2)).toThrow();
  });
  it("sets chunk times itself instead of trusting the model", () => {
    const odd = structuredClone(goodAnswer);
    odd.chunks[0].startS = 7;
    const t = validateTimeline(odd, "image", 2);
    expect(t.chunks.map((c) => c.startS)).toEqual([0, 3]);
  });
});

describe("extractJson", () => {
  it("finds JSON inside a code fence or chatter", () => {
    expect(extractJson('Sure!\n```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('here: [{"id":"g0"}] done')).toEqual([{ id: "g0" }]);
  });
});
