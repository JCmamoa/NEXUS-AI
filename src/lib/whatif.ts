// Real-time what-if projection model (Module C).
// Pure client-side math so slider changes recalculate instantly, with no
// round-trip to the backend. The model is deterministic and documented:
//   revenue  = visitors * conversion% * avgPrice        (+3% traffic/mo)
//   COGS     = 42% of revenue
//   shipping = units * shippingCost
//   net      = revenue - COGS - shipping - adSpend
//   cashFlow = cumulative net
import type { WhatIfInputs, WhatIfProjection } from "../types";

export const DEFAULT_INPUTS: WhatIfInputs = {
  avgPrice: 89,
  conversionRate: 2.4,
  traffic: 12000,
  shippingCost: 4.5,
  adSpend: 3500,
};

export function projectWhatIf(inputs: WhatIfInputs): WhatIfProjection[] {
  const rows: WhatIfProjection[] = [];
  let cash = 0;
  for (let month = 1; month <= 6; month++) {
    const visitors = inputs.traffic * (1 + 0.03 * (month - 1));
    const buyers = visitors * (inputs.conversionRate / 100);
    const revenue = buyers * inputs.avgPrice;
    const cogs = revenue * 0.42;
    const shipping = buyers * inputs.shippingCost;
    const grossProfit = revenue - cogs - shipping;
    const netProfit = grossProfit - inputs.adSpend;
    cash += netProfit;
    rows.push({
      month,
      revenue: round(revenue),
      grossProfit: round(grossProfit),
      netProfit: round(netProfit),
      cashFlow: round(cash),
    });
  }
  return rows;
}

const round = (n: number) => Math.round(n * 100) / 100;
