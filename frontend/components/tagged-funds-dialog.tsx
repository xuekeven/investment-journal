import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { groupFundRowsByIndex } from "@/lib/fund-list";
import { getFundDetailUrl } from "@/lib/fund-links";
import { getUsdCnyRate } from "@/lib/api";
import {
  calculateHoldingProfitLoss,
  calculateHoldingProfitTotal,
  calculateHoldingReturnRate,
  calculateRecurringInvestmentTotals,
  formatFundTagLabel,
  holdingCurrentPrice,
} from "@/lib/fund-tag-values";
import type { FundComparisonRow, FundTag, UsdCnyRate } from "@/lib/types";
import { FUND_TAG_META } from "./fund-tag-meta";
import { CloseIcon, TrashIcon } from "./icons";
import { SubscriptionTags } from "./subscription-tags";

type TaggedFundChange = {
  fundCode: string;
  amount: number | null;
  cost?: number | null;
  remove?: boolean;
};

interface TaggedFundsDialogProps {
  tag: FundTag;
  funds: FundComparisonRow[];
  indexNames: Record<string, string>;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onRetry: () => void;
  onChangesSave: (
    tag: FundTag,
    updates: TaggedFundChange[],
  ) => Promise<boolean>;
}

function SubscriptionLimit({ fund }: { fund: FundComparisonRow }) {
  return <SubscriptionTags fund={fund} showEmpty />;
}

const amountFormatter = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 6 });
const profitFormatter = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 });

function RecurringTotal({
  funds,
  prefix = "总定投",
}: {
  funds: FundComparisonRow[];
  prefix?: string;
}) {
  const { cny, usd, hasCny, hasUsd } = calculateRecurringInvestmentTotals(funds);
  if (!hasCny && !hasUsd) {
    return <span className="tagged-recurring-total muted">{prefix}金额暂无</span>;
  }
  return (
    <span className="tagged-recurring-total">
      {prefix}
      {hasCny ? <> <strong>{amountFormatter.format(cny)}</strong> 人民币</> : null}
      {hasUsd ? <> <strong>{amountFormatter.format(usd)}</strong> 美元</> : null}
    </span>
  );
}

function HoldingTotal({
  funds,
  rate,
  rateLoading,
  position,
}: {
  funds: FundComparisonRow[];
  rate: UsdCnyRate | null;
  rateLoading: boolean;
  position: (fund: FundComparisonRow) => { amount: number | null; cost: number | null };
}) {
  const { total, included, omitted, needsRate } = calculateHoldingProfitTotal(
    funds, rate?.rate ?? null, position,
  );
  const title = [
    `已计算 ${included} 个基金份额${omitted ? `，另有 ${omitted} 个缺少持有份额、成本或现价` : ""}。`,
    needsRate && rate
      ? `美元盈亏按中国外汇交易中心 ${rate.rateDate} 中间价换算：1 美元 = ${rate.rate.toFixed(4)} 人民币。`
      : "",
  ].filter(Boolean).join(" ");
  const value = total === null
    ? (needsRate && included > 0 ? (rateLoading ? "汇率加载中…" : "汇率暂不可用") : "—")
    : `¥${total > 0 ? "+" : total < 0 ? "-" : ""}${profitFormatter.format(Math.abs(total))}`;
  return (
    <span className={`tagged-holding-total ${total === null ? "" : total > 0 ? "positive" : total < 0 ? "negative" : ""}`} title={title}>
      {"，合计盈亏 "}<strong>{value}</strong>
    </span>
  );
}

export function TaggedFundsDialog({
  tag,
  funds,
  indexNames,
  loading,
  error,
  onClose,
  onRetry,
  onChangesSave,
}: TaggedFundsDialogProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const meta = FUND_TAG_META[tag];
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draftAmounts, setDraftAmounts] = useState<Record<string, string>>({});
  const [draftCosts, setDraftCosts] = useState<Record<string, string>>({});
  const [removedCodes, setRemovedCodes] = useState<Set<string>>(() => new Set());
  const [editError, setEditError] = useState<string | null>(null);
  const [usdCnyRate, setUsdCnyRate] = useState<UsdCnyRate | null>(null);
  const [rateLoading, setRateLoading] = useState(true);
  const visibleFunds = editing ? funds.filter((fund) => !removedCodes.has(fund.code)) : funds;
  const groups = groupFundRowsByIndex(visibleFunds);

  function holdingPosition(fund: FundComparisonRow) {
    if (!editing) return { amount: fund.holdingAmount, cost: fund.holdingCost };
    const amountDraft = draftAmounts[fund.code]?.trim();
    const costDraft = draftCosts[fund.code]?.trim();
    return {
      amount: amountDraft ? Number(amountDraft) : null,
      cost: costDraft ? Number(costDraft) : null,
    };
  }

  useEffect(() => {
    if (tag !== "holding" || !funds.some((fund) => fund.currency === "美元")) return;
    const controller = new AbortController();
    void getUsdCnyRate(controller.signal)
      .then((rate) => setUsdCnyRate(rate))
      .catch(() => {
        if (!controller.signal.aborted) setUsdCnyRate(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setRateLoading(false);
      });
    return () => controller.abort();
  }, [tag, funds]);

  function beginEditing() {
    setDraftAmounts(Object.fromEntries(funds.map((fund) => {
      const amount = tag === "holding" ? fund.holdingAmount : fund.recurringAmount;
      return [fund.code, amount === null ? "" : String(amount)];
    })));
    setDraftCosts(Object.fromEntries(funds.map((fund) => [
      fund.code, fund.holdingCost === null ? "" : String(fund.holdingCost),
    ])));
    setRemovedCodes(new Set());
    setEditError(null);
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
    setRemovedCodes(new Set());
    setEditError(null);
  }

  async function saveChanges() {
    if (saving) return;
    const updates = funds.flatMap((fund): TaggedFundChange[] => {
      if (removedCodes.has(fund.code)) return [{ fundCode: fund.code, amount: null, remove: true }];
      if (tag === "favorite") return [];
      const draft = draftAmounts[fund.code] ?? "";
      const amount = draft.trim() === "" ? null : Number(draft);
      const previous = tag === "holding" ? fund.holdingAmount : fund.recurringAmount;
      const costDraft = draftCosts[fund.code] ?? "";
      const cost = costDraft.trim() === "" ? null : Number(costDraft);
      if (amount === previous && (tag !== "holding" || cost === fund.holdingCost)) return [];
      return [{ fundCode: fund.code, amount, ...(tag === "holding" ? { cost } : {}) }];
    });
    if (updates.some(({ amount, cost }) => (
      (amount !== null && (!Number.isFinite(amount) || amount < 0))
      || (cost !== undefined && cost !== null && (!Number.isFinite(cost) || cost < 0))
    ))) {
      setEditError("请输入 0 或大于 0 的数字，也可以留空。");
      return;
    }
    if (updates.length === 0) {
      cancelEditing();
      return;
    }
    setSaving(true);
    setEditError(null);
    const saved = await onChangesSave(tag, updates);
    setSaving(false);
    if (saved) {
      cancelEditing();
    } else {
      setEditError("部分数据保存失败，请检查后重试。");
    }
  }

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    closeButtonRef.current?.focus();

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      previousFocus?.focus();
    };
  }, [onClose]);

  return createPortal(
    <div
      className="comparison-overlay tagged-funds-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tagged-funds-title"
    >
      <div className="tagged-funds-sheet">
        <header className="comparison-header">
          <div>
            <span className="section-kicker">指数基金</span>
            <h2 id="tagged-funds-title">{meta.title}</h2>
          </div>
          <div className="tagged-header-actions">
            {!editing && !loading && !error ? (
              <button className="tagged-edit-button" type="button" onClick={beginEditing}>
                编辑
              </button>
            ) : null}
            {editing ? (
              <>
                <button
                  className="tagged-edit-button secondary"
                  type="button"
                  disabled={saving}
                  onClick={cancelEditing}
                >
                  取消
                </button>
                <button
                  className="tagged-edit-button primary"
                  type="button"
                  disabled={saving}
                  onClick={() => void saveChanges()}
                >
                  {saving ? "保存中…" : "保存"}
                </button>
              </>
            ) : null}
            <button
              ref={closeButtonRef}
              className="icon-button"
              type="button"
              disabled={saving}
              onClick={onClose}
              aria-label={`关闭${meta.title}`}
            >
              <CloseIcon />
            </button>
          </div>
        </header>

        <div className="tagged-funds-content">
          {loading ? (
            <div className="tagged-funds-state">
              <span className="spinner" />
              <p>正在加载…</p>
            </div>
          ) : error ? (
            <div className="tagged-funds-state">
              <strong>加载失败</strong>
              <p>{error}</p>
              <button type="button" onClick={onRetry}>重新加载</button>
            </div>
          ) : funds.length === 0 ? (
            <div className="tagged-funds-state">
              <strong>暂无{meta.label}基金</strong>
              <p>在基金列表的“编辑”中添加“{meta.label}”标签后，会显示在这里。</p>
            </div>
          ) : (
            <>
              <p className="tagged-funds-summary">
                共有 <strong>{groups.length}</strong> 种基金、
                <strong>{visibleFunds.length}</strong> 个基金份额
                {tag === "recurring" ? (
                  <>，<RecurringTotal funds={visibleFunds} prefix="合计定投" /></>
                ) : null}
                {tag === "holding" ? (
                  <HoldingTotal funds={visibleFunds} rate={usdCnyRate} rateLoading={rateLoading} position={holdingPosition} />
                ) : null}
              </p>
              {editError ? <p className="tagged-amount-error" role="alert">{editError}</p> : null}
              {editing && visibleFunds.length === 0 ? <p className="tagged-edit-empty">保存后将移除这些基金。</p> : null}
              <div className="tagged-funds-groups">
                {groups.map((group) => (
                  <section className="tagged-funds-group" key={group.indexId}>
                    <header className="tagged-funds-group-header">
                      <div>
                        <h3>{indexNames[group.indexId] ?? group.indexId}</h3>
                        <span>
                          {group.funds.length} 个基金份额
                          {tag === "holding" ? (
                            <HoldingTotal funds={group.funds} rate={usdCnyRate} rateLoading={rateLoading} position={holdingPosition} />
                          ) : null}
                        </span>
                        {tag === "recurring" ? <RecurringTotal funds={group.funds} /> : null}
                      </div>
                    </header>
                    <div className="tagged-funds-table-wrap">
                      <table className={`tagged-funds-table ${tag === "favorite" ? "" : "has-tag-value-column"} ${tag === "holding" ? "has-cost-column" : ""} ${editing ? "has-action-column" : ""}`}>
                        <thead>
                          <tr>
                            <th className="tagged-code-column">基金代码</th>
                            <th className="tagged-name-column">基金份额</th>
                            <th className="tagged-type-column">类型</th>
                            <th className="tagged-currency-column">币种</th>
                            <th className="tagged-limit-column">申购</th>
                            {tag !== "favorite" ? (
                              <th className="tagged-value-column">{meta.label}</th>
                            ) : null}
                            {tag === "holding" ? (
                              <>
                                <th className="tagged-cost-column">现价/成本</th>
                                <th className="tagged-profit-column">盈亏/收益率</th>
                              </>
                            ) : null}
                            {editing ? <th className="tagged-action-column">操作</th> : null}
                          </tr>
                        </thead>
                        <tbody>
                          {group.funds.map((fund) => {
                            const detailUrl = getFundDetailUrl(fund);
                            const currentPrice = tag === "holding" ? holdingCurrentPrice(fund) : null;
                            const draftAmount = draftAmounts[fund.code]?.trim();
                            const draftCost = draftCosts[fund.code]?.trim();
                            const holdingAmount = editing ? (draftAmount ? Number(draftAmount) : null) : fund.holdingAmount;
                            const holdingCost = editing ? (draftCost ? Number(draftCost) : null) : fund.holdingCost;
                            const profit = tag === "holding" ? calculateHoldingProfitLoss(
                              fund, holdingAmount, holdingCost,
                            ) : null;
                            const returnRate = tag === "holding" ? calculateHoldingReturnRate(
                              fund, holdingAmount, holdingCost,
                            ) : null;
                            const profitDirection = profit !== null && profit !== 0 ? profit : returnRate;
                            return (
                              <tr key={fund.id}>
                                <td>
                                  {detailUrl ? (
                                    <a
                                      className="fund-code-link"
                                      href={detailUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      title={`查看${fund.displayName}官方详情`}
                                    >
                                      {fund.code}
                                    </a>
                                  ) : <span className="tagged-fund-code">{fund.code}</span>}
                                </td>
                                <td>
                                  <strong>{fund.displayName}</strong>
                                  <small>{fund.fundCompany}</small>
                                </td>
                                <td>
                                  {fund.tradingVenue}
                                  {fund.exchange ? <small>{fund.exchange}</small> : null}
                                </td>
                                <td>{fund.currency}</td>
                                <td><SubscriptionLimit fund={fund} /></td>
                                {tag !== "favorite" ? (
                                  <td className="tagged-value-cell">
                                    {editing ? (
                                      <label className="tagged-amount-editor">
                                        <input
                                          type="number"
                                          min="0"
                                          step="any"
                                          inputMode="decimal"
                                          value={draftAmounts[fund.code] ?? ""}
                                          disabled={saving}
                                          aria-label={`${fund.displayName}${meta.label}${tag === "holding" ? "份额" : "金额"}`}
                                          onChange={(event) => setDraftAmounts((current) => ({
                                            ...current,
                                            [fund.code]: event.target.value,
                                          }))}
                                        />
                                        {tag === "holding" ? null : <span>{fund.currency}</span>}
                                      </label>
                                    ) : (
                                      tag === "holding" ? (
                                        <span className="tagged-holding-value">
                                          {fund.holdingAmount === null ? "—" : amountFormatter.format(fund.holdingAmount)}
                                        </span>
                                      ) : (
                                        <span className={`user-tag tagged-user-tag ${tag}`}>
                                          {formatFundTagLabel(fund, tag)}
                                        </span>
                                      )
                                    )}
                                  </td>
                                ) : null}
                                {tag === "holding" ? (
                                  <td className="tagged-cost-cell">
                                    <div className="tagged-cost-values">
                                      <span className="tagged-current-price" title="现价">
                                        {currentPrice === null ? "—" : amountFormatter.format(currentPrice)}
                                      </span>
                                      {editing ? (
                                        <input
                                          type="number"
                                          min="0"
                                          step="any"
                                          inputMode="decimal"
                                          value={draftCosts[fund.code] ?? ""}
                                          disabled={saving}
                                          aria-label={`${fund.displayName}持有成本`}
                                          onChange={(event) => setDraftCosts((current) => ({
                                            ...current,
                                            [fund.code]: event.target.value,
                                          }))}
                                        />
                                      ) : (
                                        <span className="tagged-cost-value" title="成本">
                                          {fund.holdingCost === null ? "—" : amountFormatter.format(fund.holdingCost)}
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                ) : null}
                                {tag === "holding" ? (
                                  <td className={`tagged-profit-cell ${profitDirection === null ? "" : profitDirection > 0 ? "positive" : profitDirection < 0 ? "negative" : ""}`}>
                                    <div className="tagged-profit-values">
                                      <span>{profit === null ? "—" : `${fund.currency === "美元" ? "$" : "¥"}${profit > 0 ? "+" : profit < 0 ? "-" : ""}${profitFormatter.format(Math.abs(profit))}`}</span>
                                      <span className="tagged-return-rate">{returnRate === null ? "—" : `${returnRate > 0 ? "+" : ""}${returnRate.toFixed(2)}%`}</span>
                                    </div>
                                  </td>
                                ) : null}
                                {editing ? (
                                  <td className="tagged-action-cell">
                                    <button
                                      className="blacklist-delete"
                                      type="button"
                                      disabled={saving}
                                      aria-label={`删除${fund.displayName}的${meta.label}标签`}
                                      title={`删除${meta.label}标签`}
                                      onClick={() => setRemovedCodes((current) => new Set(current).add(fund.code))}
                                    >
                                      <TrashIcon />
                                    </button>
                                  </td>
                                ) : null}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </section>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
