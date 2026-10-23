// A hand-written FAKE ad timeline for tests and the demo. It is not a real ad and not an AI reading.

import type { Timeline } from "../types.ts";

export const fakeVideoAd: Timeline = {
  durationS: 18,
  kind: "video",
  category: "fashion_apparel",
  chunks: [
    { startS: 0, endS: 3, kind: "hook", salience: 0.9, friction: [{ tag: "slow_open", strength: 0.3 }] },
    { startS: 3, endS: 6, kind: "body", salience: 0.7, friction: [{ tag: "unclear_offer", strength: 0.3 }] },
    { startS: 6, endS: 9, kind: "body", salience: 0.6, friction: [{ tag: "text_heavy", strength: 0.4 }] },
    { startS: 9, endS: 12, kind: "body", salience: 0.8, friction: [{ tag: "price_shock", strength: 0.6 }] },
    {
      startS: 12,
      endS: 15,
      kind: "body",
      salience: 0.5,
      friction: [
        { tag: "nothing_new", strength: 0.3 },
        { tag: "trust_doubt", strength: 0.3 },
      ],
    },
    { startS: 15, endS: 18, kind: "cta", salience: 0.8, friction: [] },
  ],
};
