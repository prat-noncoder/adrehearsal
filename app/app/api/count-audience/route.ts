import { getBank } from "../../../lib/bankData.ts";
import { selectPanel } from "../../../lib/engine/panel.ts";
import type { AudienceFilter } from "../../../lib/engine/panel.ts";
import * as C from "../../../lib/engine/constants.ts";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const incomeKey = body.incomeGroup as "lower" | "middle" | "upper" | undefined;
    const filter: AudienceFilter = {
      ageBands: body.ageBands,
      sex: body.sex,
      states: body.states,
      tiers: body.tier,
      incomeLevels: incomeKey ? C.INCOME_GROUPS[incomeKey] : undefined,
    };
    const result = selectPanel(getBank(), filter, { size: 999999, seed: 1, excludeLowMeta: true });
    return Response.json({ matched: result.matched });
  } catch {
    return Response.json({ matched: 0 }, { status: 500 });
  }
}
