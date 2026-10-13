import type { FundComparisonRow } from "@/lib/types";

function statusLabel(
  status: FundComparisonRow["subscriptionStatus"],
  amount: number | null,
  currency: string | null,
) {
  if (status === "suspended") return "暂停申购";
  if (status === "open") return "开放申购";
  if (status !== "limited") return null;
  if (amount === null) return "限额申购";
  const unit = currency === "美元" ? "美元" : "人民币";
  return `限额${new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(amount)}${unit}`;
}

function effectiveDateLabel(value: string) {
  const date = new Date(value);
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  return `${month}/${day}`;
}

function sameSubscriptionState(fund: FundComparisonRow) {
  return (
    fund.subscriptionStatus === fund.nextSubscriptionStatus
    && fund.subscriptionLimitAmount === fund.nextSubscriptionLimitAmount
    && fund.subscriptionLimitCurrency === fund.nextSubscriptionLimitCurrency
  );
}

export function SubscriptionTags({
  fund,
  showEmpty = false,
}: {
  fund: FundComparisonRow;
  showEmpty?: boolean;
}) {
  if (fund.tradingVenue !== "场外") return showEmpty ? <span>—</span> : null;

  const currentLabel = statusLabel(
    fund.subscriptionStatus,
    fund.subscriptionLimitAmount,
    fund.subscriptionLimitCurrency,
  );
  const nextLabel = (
    fund.nextSubscriptionStatus !== null
    && fund.nextSubscriptionEffectiveFrom !== null
    && !sameSubscriptionState(fund)
  ) ? statusLabel(
      fund.nextSubscriptionStatus,
      fund.nextSubscriptionLimitAmount,
      fund.nextSubscriptionLimitCurrency,
    ) : null;

  if (!currentLabel && !nextLabel) return showEmpty ? <span>—</span> : null;

  return (
    <span className="subscription-tags">
      {currentLabel && (
        <span className={`subscription-tag ${fund.subscriptionStatus}`}>
          {currentLabel}
        </span>
      )}
      {nextLabel && fund.nextSubscriptionEffectiveFrom && (
        <span className={`subscription-tag ${fund.nextSubscriptionStatus}`}>
          {effectiveDateLabel(fund.nextSubscriptionEffectiveFrom)}{nextLabel}
        </span>
      )}
    </span>
  );
}
