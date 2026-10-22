import { describe, expect, it } from "vitest";
import * as C from "./constants.ts";
import { loadBankJson } from "./loaders.ts";
import { relevance, selectPanel } from "./panel.ts";
import { deriveTraits } from "./traits.ts";
import type { Person } from "./types.ts";

const bank = loadBankJson();

const someone: Person = {
  index: 5,
  id: "x",
  sex: "Female",
  age: 30,
  ageband: "25-34",
  state: "Kerala",
  zone: "Urban",
  tier: "metro",
  incomeLevel: 3,
  weight: 1,
};

describe("bank.json", () => {
  it("has everyone, and AI labels for about 4,900 people", () => {
    expect(bank).toHaveLength(32434);
    const labelled = bank.filter((p) => p.ai);
    expect(labelled.length).toBeGreaterThan(4800);
    expect(labelled.every((p) => (p.interests?.length ?? 0) > 0)).toBe(true);
    expect(bank.every((p, i) => p.index === i)).toBe(true);
  });
});

describe("AI score blend", () => {
  it("pulls traits toward the AI score (0.75 AI + 0.25 rule)", () => {
    const rules = deriveTraits(someone);
    const high = deriveTraits({ ...someone, ai: { ps: 5, sk: 5, nv: 5, im: 5, at: 5, si: 5 } });
    const low = deriveTraits({ ...someone, ai: { ps: 1, sk: 1, nv: 1, im: 1, at: 1, si: 1 } });
    expect(high.priceSensitivity).toBeCloseTo(C.AI_BLEND_AI + C.AI_BLEND_RULE * rules.priceSensitivity, 6);
    expect(low.priceSensitivity).toBeCloseTo(C.AI_BLEND_RULE * rules.priceSensitivity, 6);
    expect(high.skepticism).toBeGreaterThan(low.skepticism);
  });

  it("uses the rules alone for people without AI scores", () => {
    expect(deriveTraits(someone)).toEqual(deriveTraits({ ...someone }));
    const t = deriveTraits(someone);
    expect(t.priceSensitivity).toBeGreaterThan(0);
    expect(t.priceSensitivity).toBeLessThan(1);
  });

  it("gives the same answer when asked twice", () => {
    const p = bank.find((x) => x.ai)!;
    expect(deriveTraits(p)).toEqual(deriveTraits(p));
  });
});

describe("relevance from interest tags", () => {
  const p: Person = { ...someone, interests: ["food_grocery", "pets", "fashion_apparel"] };
  it("is 1.0, 0.75, 0.6 for first, second, third interest and 0.25 otherwise", () => {
    expect(relevance(p, "food_grocery")).toBe(1.0);
    expect(relevance(p, "pets")).toBe(0.75);
    expect(relevance(p, "fashion_apparel")).toBe(0.6);
    expect(relevance(p, "real_estate")).toBe(0.25);
  });
  it("is 0.5 when a person has no interest tags", () => {
    expect(relevance(someone, "pets")).toBe(C.RELEVANCE_UNKNOWN);
  });
});

describe("'low' social-media users", () => {
  it("are left out by default, and included when switched off", () => {
    const lows = bank.filter((p) => p.meta === "low").length;
    expect(lows).toBeGreaterThan(0);
    const normal = selectPanel(bank, {}, { size: 1000, seed: 2 });
    expect(normal.people.some((p) => p.meta === "low")).toBe(false);
    expect(normal.matched).toBe(bank.length - lows);
    const all = selectPanel(bank, {}, { size: 1000, seed: 2, excludeLowMeta: false });
    expect(all.matched).toBe(bank.length);
  });
  it("keeps unlabelled people in", () => {
    const panel = selectPanel(bank, {}, { size: 1000, seed: 2 });
    expect(panel.people.some((p) => p.meta === undefined)).toBe(true);
  });
});
