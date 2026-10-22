import { describe, expect, it } from "vitest";
import { templateReason, writeReasons } from "./writeReasons.ts";
import type { GroupInput } from "./writeReasons.ts";

const FAKE_KEY = "test-key-not-real";
const noSleep = async () => {};

const group = (id: string, cause: GroupInput["cause"]): GroupInput => ({
  id,
  window: "0-3s",
  cause,
  count: 50,
  sharePercent: 80,
  who: { ageBands: "25-34", cityTypes: "metro", incomeBands: "middle" },
  onScreen: { visual: "A model in a red kurta", text: "SALE" },
});

const reply = (content: string) =>
  new Response(JSON.stringify({ choices: [{ message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }), {
    status: 200,
  });

describe("writeReasons", () => {
  const groups = [group("g0", "slow_open"), group("g1", "price_shock")];

  it("makes ONE call for all groups and marks the sentences as AI", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return reply('[{"id":"g0","reason":"The red kurta shot dragged on so I swiped."},{"id":"g1","reason":"Rs 999 felt too much for this."}]');
    }) as unknown as typeof fetch;
    const out = await writeReasons(groups, { fetchImpl, sleep: noSleep, apiKey: FAKE_KEY });
    expect(calls).toBe(1);
    expect(out.failure).toBeNull();
    expect(out.reasons.map((r) => r.source)).toEqual(["ai", "ai"]);
  });

  it("falls back to templates, marked as not AI, when the call fails", async () => {
    const fetchImpl = (async () => new Response("{}", { status: 503 })) as unknown as typeof fetch;
    const out = await writeReasons(groups, { fetchImpl, sleep: noSleep, apiKey: FAKE_KEY });
    expect(out.failure).toContain("busy or unavailable");
    expect(out.reasons.every((r) => r.source === "template")).toBe(true);
    expect(out.reasons[0].reason).toBe(templateReason("slow_open"));
  });

  it("falls back to a template on its own for a sentence that is too long or missing", async () => {
    const long = Array.from({ length: 30 }, () => "word").join(" ");
    const fetchImpl = (async () => reply(JSON.stringify([{ id: "g0", reason: long }]))) as unknown as typeof fetch;
    const out = await writeReasons(groups, { fetchImpl, sleep: noSleep, apiKey: FAKE_KEY });
    expect(out.reasons.map((r) => r.source)).toEqual(["template", "template"]);
  });

  it("falls back when the answer is not JSON", async () => {
    const fetchImpl = (async () => reply("no json here")) as unknown as typeof fetch;
    const out = await writeReasons(groups, { fetchImpl, sleep: noSleep, apiKey: FAKE_KEY });
    expect(out.reasons.every((r) => r.source === "template")).toBe(true);
    expect(out.failure).not.toBeNull();
  });

  it("only asks about the top 8 groups", async () => {
    const many = Array.from({ length: 12 }, (_, k) => group(`g${k}`, "lost_interest"));
    let sent = 0;
    const fetchImpl = (async (_u: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      sent = JSON.parse(body.messages[1].content).length;
      return reply("[]");
    }) as unknown as typeof fetch;
    const out = await writeReasons(many, { fetchImpl, sleep: noSleep, apiKey: FAKE_KEY });
    expect(sent).toBe(8);
    expect(out.reasons).toHaveLength(8);
  });
});
