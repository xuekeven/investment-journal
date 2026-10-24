import type { FundComparisonRow, FundTag, FundTagState } from "./types";

const amountFormatter = new Intl.NumberFormat("zh-CN", {
  maximumFractionDigits: 6,
});

export function holdingCurrentPrice(fund: FundComparisonRow): number | null {
  return fund.tradingVenue === "场内" ? fund.closePrice : fund.nav;
}

export function calculateHoldingProfitLoss(
  fund: FundComparisonRow,
  amount = fund.holdingAmount,
  cost = fund.holdingCost,
): number | null {
  const price = holdingCurrentPrice(fund);
  if (price === null || amount === null || cost === null
    || !Number.isFinite(amount) || !Number.isFinite(cost)) return null;
  const rounded = Math.round((price - cost) * amount * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function formatHoldingAmountLabel(fund: FundComparisonRow) {
  return fund.holdingAmount === null
    ? "持有"
    : `持有${amountFormatter.format(fund.holdingAmount)}份额`;
}

export function formatFundTagLabel(fund: FundComparisonRow, tag: FundTag) {
  if (tag === "holding") {
    const amount = formatHoldingAmountLabel(fund);
    return fund.holdingCost === null
      ? amount
      : `${amount}，成本${amountFormatter.format(fund.holdingCost)}`;
  }
  if (tag === "recurring") {
    return fund.recurringAmount === null
      ? "定投"
      : `定投${amountFormatter.format(fund.recurringAmount)}${fund.currency === "美元" ? "美元" : "人民币"}`;
  }
  return "收藏";
}

export function prepareTaggedFundUpdate(
  fund: FundComparisonRow,
  tag: FundTag,
  change: { amount: number | null; cost?: number | null; remove?: boolean },
): FundTagState {
  const tags = change.remove ? fund.tags.filter((item) => item !== tag) : fund.tags;
  return {
    tags,
    holdingAmount: tag === "holding" ? (change.remove ? null : change.amount) : fund.holdingAmount,
    holdingCost: tag === "holding" ? (change.remove ? null : (change.cost ?? null)) : fund.holdingCost,
    recurringAmount: tag === "recurring" ? (change.remove ? null : change.amount) : fund.recurringAmount,
  };
}

export function calculateRecurringInvestmentTotals(funds: FundComparisonRow[]) {
  return funds.reduce(
    (totals, fund) => {
      if (fund.recurringAmount === null) return totals;
      if (fund.currency === "美元") {
        totals.usd += fund.recurringAmount;
        totals.hasUsd = true;
      } else {
        totals.cny += fund.recurringAmount;
        totals.hasCny = true;
      }
      return totals;
    },
    { cny: 0, usd: 0, hasCny: false, hasUsd: false },
  );
}
