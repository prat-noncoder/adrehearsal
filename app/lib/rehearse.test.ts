import { describe, expect, it } from "vitest";
import { POST } from "../app/api/rehearse/route.ts";
import { writeReasons } from "./ai/writeReasons.ts";
import type { ReadAdResult } from "./ai/readAd.ts";
import { calibrateOnReference } from "./engine/engine.ts";
import { fakeVideoAd } from "./engine/fixtures/fakeAd.ts";
import { loadBankJson } from "./engine/loaders.ts";
import { parseRequest, rehearse, RequestError } from "./rehearse.ts";

const bank = loadBankJson();
const base0 = calibrateOnReference(bank);
const FAKE_KEY = "test-key-not-real";
const jpeg = "data:image/jpeg;base64,AAAA";

// Stands in for the AI reading the ad: returns the hand-written fake timeline.
const fakeReadAd = async (): Promise<ReadAdResult> => ({
  timeline: structuredClone(fakeVideoAd),
  usage: { promptTokens: 10, completionTokens: 5, cost: 0.001 },
});
// An AI that is down: every reasons call gets a 503.
const downFetch = (async () => new Response("{}", { status: 503 })) as unknown as typeof fetch;
const reasonsDown = (groups: Parameters<typeof writeReasons>[0]) =>
  writeReasons(groups, { fetchImpl: downFetch, sleep: async () => {}, apiKey: FAKE_KEY });

const request = parseRequest({
  kind: "video",
  frames: [0, 1, 2, 3, 4, 5].map(() => ({ dataUrl: jpeg })),
  audience: { ageBands: ["25-34", "35-44"] },
  panelSize: 400,
  seed: 42,
});

describe("rehearse", () => {
  const deps = { bank, base0, readAd: fakeReadAd, writeReasons: reasonsDown };

  it("gives the same result for the same input and seed", async () => {
    const a = await rehearse(request, deps);
    const b = await rehearse(request, deps);
    expect(b).toEqual(a);
  });

  it("shows the template fallback, marked as not AI, when the AI call fails", async () => {
    const out = await rehearse(request, deps);
    expect(out.groups.length).toBeGreaterThan(0);
    expect(out.groups.every((g) => g.reasonSource === "template, not AI")).toBe(true);
    expect(out.reasonsNote).toContain("template sentences");
    expect(out.groups[0].reason.length).toBeGreaterThan(5);
  });

  it("returns every field the report needs", async () => {
    const out = await rehearse(request, deps);
    expect(out.panel.used).toBe(400);
    expect(out.dots).toHaveLength(400);
    expect(out.retention).toHaveLength(fakeVideoAd.durationS + 1);
    expect(out.retention[0]).toBe(1);
    expect(out.retention[3]).toBeCloseTo(out.funnel.hook, 6);
    expect(out.retention[out.retention.length - 1]).toBeCloseTo(out.funnel.end, 6);
    expect(out.headline).toContain("simulated viewers");
    expect(out.assumptions.some((a) => a.title.includes("Sound is not analysed"))).toBe(true);
    expect(out.assumptions.some((a) => a.title.includes("Moods"))).toBe(true);
    expect(out.costInfo.model.startsWith("google/")).toBe(true);
    expect(out.costInfo.totalCostUsd).toBeCloseTo(0.001);
  });

  it("changes with the seed", async () => {
    const other = await rehearse({ ...request, seed: 43 }, deps);
    const base = await rehearse(request, deps);
    expect(other.dots).not.toEqual(base.dots);
  });

  it("tells the user when too few people match the audience", async () => {
    const narrow = parseRequest({
      kind: "video",
      frames: [{ dataUrl: jpeg }],
      audience: { ageBands: ["60+"], incomeGroup: "upper", tier: ["metro"], sex: "Female" },
      panelSize: 1000,
      seed: 1,
    });
    const out = await rehearse(narrow, deps);
    expect(out.panel.used).toBeLessThan(1000);
    expect(out.panel.note).toContain("all of them");
  });
});

describe("parseRequest", () => {
  const ok = { kind: "image", frames: [{ dataUrl: jpeg }], panelSize: 400, seed: 1 };
  it("accepts a good request and defaults the panel size", () => {
    expect(parseRequest({ ...ok, panelSize: undefined }).panelSize).toBe(400);
  });
  it("rejects bad input with plain messages", () => {
    expect(() => parseRequest({ ...ok, kind: "gif" })).toThrow(RequestError);
    expect(() => parseRequest({ ...ok, frames: [] })).toThrow(RequestError);
    expect(() => parseRequest({ ...ok, frames: [{ dataUrl: jpeg }, { dataUrl: jpeg }] })).toThrow(/one picture/);
    expect(() => parseRequest({ ...ok, frames: [{ dataUrl: "data:image/gif;base64,AAAA" }] })).toThrow(/JPEG, PNG and WebP/);
    expect(() => parseRequest({ ...ok, frames: [{ dataUrl: "https://evil.example/x.jpg" }] })).toThrow(RequestError);
    expect(() => parseRequest({ ...ok, panelSize: 123 })).toThrow(/200, 400 or 1000/);
    expect(() => parseRequest({ ...ok, audience: { sex: "Other" } })).toThrow(RequestError);
    expect(() => parseRequest({ ...ok, audience: { ageBands: ["0-5"] } })).toThrow(RequestError);
    expect(() => parseRequest({ ...ok, seed: 1.5 })).toThrow(RequestError);
    const tooMany = { kind: "video", frames: Array.from({ length: 21 }, () => ({ dataUrl: jpeg })) };
    expect(() => parseRequest({ ...ok, ...tooMany })).toThrow(/at most 20/);
    const maxOk = { kind: "video", frames: Array.from({ length: 20 }, () => ({ dataUrl: jpeg })) };
    expect(parseRequest({ ...ok, ...maxOk }).frames).toHaveLength(20);
  });
});

describe("POST /api/rehearse", () => {
  const post = (body: string, headers: Record<string, string> = {}) =>
    POST(new Request("http://localhost/api/rehearse", { method: "POST", body, headers }));

  it("rejects an oversized upload politely, without calling the AI", async () => {
    const res = await post("x".repeat(4.6 * 1024 * 1024));
    expect(res.status).toBe(413);
    const json = await res.json();
    expect(json.error.kind).toBe("too_large");
    expect(json.error.message).toContain("too large");
  });
  it("rejects when the declared size is too large", async () => {
    const res = await post("{}", { "content-length": String(10 * 1024 * 1024) });
    expect(res.status).toBe(413);
  });
  it("rejects bad JSON and bad requests with 400", async () => {
    expect((await post("not json")).status).toBe(400);
    const res = await post(JSON.stringify({ kind: "gif" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.kind).toBe("bad_request");
  });
});
