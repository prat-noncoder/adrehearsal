import { describe, expect, it } from "vitest";
import * as C from "./constants.ts";
import { calibrateOnReference, runRehearsal, simulateExits } from "./engine.ts";
import { fakeVideoAd } from "./fixtures/fakeAd.ts";
import { calibrateBase0 } from "./funnel.ts";
import { nearestArchetype } from "./labels.ts";
import { loadArchetypes, loadBank } from "./loaders.ts";
import { drawMood } from "./moods.ts";
import { makeViewers, matchesFilter, selectPanel } from "./panel.ts";
import { createRng, STREAM } from "./rng.ts";
import { deriveTraits } from "./traits.ts";
import type { Chunk, Timeline, Viewer } from "./types.ts";

const bank = loadBank();
const base0 = calibrateOnReference(bank, C.HOOK_TARGET.reels);

/** Plain timeline with the same salience and tags in every 3-second chunk. */
function flatAd(
  chunkCount: number,
  salience: number,
  frictionAt: Record<number, Chunk["friction"]> = {},
): Timeline {
  return {
    durationS: chunkCount * 3,
    kind: "video",
    category: "fashion_apparel",
    chunks: Array.from({ length: chunkCount }, (_, k) => ({
      startS: k * 3,
      endS: k * 3 + 3,
      kind: k === 0 ? "hook" : "body",
      salience,
      friction: frictionAt[k] ?? [],
    })),
  };
}

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  return sxy / Math.sqrt(sxx * syy);
}

const baseInput = {
  bank,
  timeline: fakeVideoAd,
  filter: {},
  panelSize: 1000,
  seed: 11,
  base0,
};

describe("1. same seed gives identical results", () => {
  it("repeats exactly, and a different seed gives a different result", () => {
    const a = runRehearsal(baseInput);
    const b = runRehearsal(baseInput);
    expect(b.exits).toEqual(a.exits);
    expect(b.funnel).toEqual(a.funnel);
    expect(b.groups).toEqual(a.groups);
    const c = runRehearsal({ ...baseInput, seed: 12 });
    expect(c.exits).not.toEqual(a.exits);
  });
});

describe("2. A/A: the same ad as A and B cannot produce a winner", () => {
  it("gives identical hook, hold and tap", () => {
    const a = runRehearsal(baseInput);
    const b = runRehearsal({ ...baseInput, timeline: structuredClone(fakeVideoAd) });
    expect(b.funnel.hook).toBe(a.funnel.hook);
    expect(b.funnel.holdMid).toBe(a.funnel.holdMid);
    expect(b.funnel.holdEnd).toBe(a.funnel.holdEnd);
    expect(b.funnel.tap).toBe(a.funnel.tap);
  });
});

describe("3. shuffling traits removes the price_sensitivity link", () => {
  // Chunk 0 is plain; chunk 1 is a strong price shock.
  const ad = flatAd(2, 0.7, { 1: [{ tag: "price_shock", strength: 1 }] });
  const seed = 3;
  const viewers = makeViewers(bank, ad.category, seed);

  /** Correlation between a person's own price sensitivity and leaving at the price-shock chunk. */
  function link(used: Viewer[]): { r: number; noise: number } {
    const exits = simulateExits(used, ad, base0, seed);
    const xs: number[] = [];
    const ys: number[] = [];
    used.forEach((_, i) => {
      if (exits[i] === 0) return; // only people who reached the price shock
      xs.push(viewers[i].traits.priceSensitivity); // their own, original trait
      ys.push(exits[i] === 1 ? 1 : 0);
    });
    // noise = typical size of a correlation that is really zero, for this many people
    return { r: pearson(xs, ys), noise: 1 / Math.sqrt(xs.length) };
  }

  it("has a clear link before shuffling and about none after", () => {
    const before = link(viewers);
    // Shuffle which traits each person carries (Fisher-Yates with the seeded generator).
    const order = viewers.map((_, i) => i);
    const rng = createRng(STREAM.shuffle);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const shuffled = viewers.map((v, i) => ({ ...v, traits: viewers[order[i]].traits }));
    const after = link(shuffled);
    // Only a small share leave per chunk after the hook, so the link is real but modest.
    expect(before.r).toBeGreaterThan(4 * before.noise);
    expect(Math.abs(after.r)).toBeLessThan(3 * after.noise);
  });
});

describe("4. sanity checks", () => {
  const input = { ...baseInput, panelSize: 1000 };

  it("stronger friction lowers the hook", () => {
    const calm = runRehearsal({ ...input, timeline: flatAd(3, 0.8) });
    const rough = runRehearsal({
      ...input,
      timeline: flatAd(3, 0.8, { 0: [{ tag: "slow_open", strength: 0.8 }] }),
    });
    expect(rough.funnel.hook).toBeLessThan(calm.funnel.hook);
  });

  it("higher salience raises the hold", () => {
    const dull = runRehearsal({ ...input, timeline: flatAd(6, 0.3) });
    const gripping = runRehearsal({ ...input, timeline: flatAd(6, 0.9) });
    expect(gripping.funnel.holdEnd).toBeGreaterThan(dull.funnel.holdEnd);
  });

  it("scroll fatigue lowers the hook compared with baseline", () => {
    const ad = flatAd(3, 0.8);
    const normal = runRehearsal({ ...input, timeline: ad, moodOverride: "baseline" });
    const tired = runRehearsal({ ...input, timeline: ad, moodOverride: "scroll_fatigue" });
    expect(tired.funnel.hook).toBeLessThan(normal.funnel.hook);
  });
});

describe("5. calibration", () => {
  const reference: Timeline = {
    durationS: 3,
    kind: "video",
    category: "reference",
    chunks: [
      { startS: 0, endS: 3, kind: "hook", salience: C.REFERENCE_HOOK_SALIENCE, friction: [] },
    ],
  };

  it.each([0.3, 0.23])("with target %s the simulated hook lands within 1 point", (target) => {
    const seed = 5;
    const panel = selectPanel(bank, {}, { size: 1000, seed });
    const viewers = makeViewers(panel.people, reference.category, seed);
    const b0 = calibrateBase0(viewers, target, seed);
    const result = runRehearsal({ ...baseInput, timeline: reference, panelSize: 1000, seed, base0: b0 });
    expect(Math.abs(result.funnel.hook - target)).toBeLessThan(0.01);
  });
});

describe("6. panel size", () => {
  it("uses everyone and says so when fewer people match than were asked for", () => {
    const filter = { incomeLevels: [5], ageBands: ["60+"] };
    const panel = selectPanel(bank, filter, { size: 1000, seed: 1 });
    expect(panel.matched).toBeGreaterThan(0);
    expect(panel.matched).toBeLessThan(1000);
    expect(panel.used).toBe(panel.matched);
    expect(panel.note).toContain("all of them");
    expect(panel.people.every((p) => matchesFilter(p, filter))).toBe(true);
  });

  it("gives exactly the number asked for when enough people match", () => {
    const panel = selectPanel(bank, {}, { size: 400, seed: 1 });
    expect(panel.used).toBe(400);
    expect(panel.note).toBeNull();
  });

  it("keeps the size between the minimum and the maximum, and says so", () => {
    const tooSmall = selectPanel(bank, {}, { size: 50, seed: 1 });
    expect(tooSmall.used).toBe(C.PANEL_MIN);
    expect(tooSmall.note).toContain("outside the allowed range");
  });
});

describe("extra checks", () => {
  it("labelling the same person twice gives the same answer", () => {
    const archetypes = loadArchetypes();
    expect(archetypes).toHaveLength(25);
    for (const person of bank.slice(0, 200)) {
      const first = nearestArchetype(deriveTraits(person), archetypes).id;
      const second = nearestArchetype(deriveTraits(person), archetypes).id;
      expect(second).toBe(first);
    }
  });

  it("mood odds add up to 1 and draws roughly follow them", () => {
    const total = Object.values(C.MOOD_ODDS).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 10);
    const baseline = bank.filter((p) => drawMood(9, p.index) === "baseline").length / bank.length;
    expect(baseline).toBeGreaterThan(0.38);
    expect(baseline).toBeLessThan(0.42);
  });
});
