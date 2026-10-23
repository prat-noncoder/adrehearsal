// Demo: runs the engine on the FAKE ad and prints the results.
// Run from the app/ folder:  npm run demo

import * as C from "./constants.ts";
import { calibrateOnReference, runRehearsal } from "./engine.ts";
import { fakeVideoAd } from "./fixtures/fakeAd.ts";
import { loadBank } from "./loaders.ts";

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

const bank = loadBank();
const seed = 1;
const base0 = calibrateOnReference(bank, C.HOOK_TARGET.reels);
const r = runRehearsal({
  bank,
  timeline: fakeVideoAd,
  filter: {},
  panelSize: C.PANEL_DEFAULT,
  seed,
  base0,
});

console.log("AdRehearsal engine demo (FAKE ad, simulated viewers; explains likely problems, does not predict sales)");
console.log(`Bank: ${bank.length} people. Panel: ${r.panel.used} used of ${r.panel.requested} requested. Seed ${seed}.`);
if (r.panel.note) console.log(`Panel note: ${r.panel.note}`);
console.log(`Hook constant base_0 (calibrated so a neutral reference ad's hook is ${pct(C.HOOK_TARGET.reels)}): ${base0.toFixed(3)}`);
console.log("");
console.log("FUNNEL");
console.log(`  Hook (still watching at second 3):  ${pct(r.funnel.hook)}`);
console.log(`  Hold at midpoint:                   ${pct(r.funnel.holdMid)}`);
console.log(`  Hold to the end:                    ${pct(r.funnel.holdEnd)}`);
console.log(
  `  Tap (stated intent):                ${pct(r.funnel.tap)} of the panel (${r.funnel.tapEligible} watched enough to tap; ${pct(r.funnel.tapAmongEligible)} of them)`,
);
console.log("");
console.log("EXITS BY 3-SECOND WINDOW");
fakeVideoAd.chunks.forEach((c, k) => {
  console.log(
    `  ${String(c.startS).padStart(2)}-${String(c.endS).padStart(2)}s: ${String(r.exitsByWindow[k]).padStart(4)} left   still watching after: ${pct(r.survival[k])}`,
  );
});
console.log("");
console.log("TOP REASONS (counted by maths; the AI writes the sentences later)");
for (const g of r.groups.slice(0, 8)) {
  console.log(
    `  ${g.startS}-${g.endS}s  ${g.cause.padEnd(22)} ${String(g.count).padStart(4)} people  ${pct(g.shareOfWindow)} of that window's leavers  [${g.agreement}]`,
  );
}
