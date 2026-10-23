import { getBank } from "../../../lib/bankData.ts";
import { selectPanel } from "../../../lib/engine/panel.ts";
import type { AudienceFilter } from "../../../lib/engine/panel.ts";
import * as C from "../../../lib/engine/constants.ts";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const incomeKey = body.incomeGroup as "lower" | "middle" | "upper" | undefined;
    const filter: AudienceFilter = {};
    if (body.ageBands?.length) filter.ageBands = body.ageBands;
    if (body.sex) filter.sex = body.sex;
    if (body.states?.length) filter.states = body.states;
    if (body.tier?.length) filter.tiers = body.tier;
    if (incomeKey) filter.incomeLevels = C.INCOME_GROUPS[incomeKey];
    const result = selectPanel(getBank(), filter, { size: 999999, seed: 1, excludeLowMeta: true });
    return Response.json({ matched: result.matched });
  } catch {
    return Response.json({ matched: 0 }, { status: 500 });
  }
}
