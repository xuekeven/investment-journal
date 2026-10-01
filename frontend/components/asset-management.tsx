"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  getAssetConfig,
  getAssetDashboard,
  getContentOptions,
  saveAssetSnapshot,
  updateAssetConfig,
  updateContentOptions,
} from "@/lib/api";
import type {
  AssetAccountConfig,
  AssetConfig,
  AssetDashboard,
  AssetPositionConfig,
  AssetPurpose,
  AssetRiskLevel,
  AssetSnapshotPayload,
  ContentOptionItem,
  ContentOptionType,
} from "@/lib/types";
import { CloseIcon, SearchIcon, SettingsIcon, TrashIcon } from "./icons";
import { NoteDateField } from "./investment-notes";
import { Tooltip } from "./tooltip";

const PURPOSES: AssetPurpose[] = ["短期日用", "中期稳健", "长期投资"];
const RISKS: AssetRiskLevel[] = ["低", "中", "高"];

function AssetSelect({
  id,
  label,
  value,
  options,
  onChange,
  className = "",
  required = false,
}: {
  id: string;
  label?: string;
  value: string;
  options: readonly (string | { value: string; label: string })[];
  onChange: (value: string) => void;
  className?: string;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function closeOnOutsideClick(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [open]);

  const normalizedOptions = options.map((option) => typeof option === "string" ? { value: option, label: option } : option);
  const selectedLabel = normalizedOptions.find((option) => option.value === value)?.label ?? value;

  return (
    <div ref={containerRef} className={`multi-filter asset-select ${className} ${open ? "open" : ""}`}>
      <button className="multi-filter-trigger" type="button" aria-expanded={open} aria-controls={`${id}-menu`} aria-required={required} onClick={() => setOpen((current) => !current)}>
        {label && <span>{label}</span>}
        <strong className={!value ? "placeholder" : undefined}>{selectedLabel || "请选择"}</strong>
      </button>
      {open && (
        <div className="multi-filter-menu" id={`${id}-menu`}>
          {normalizedOptions.map((option) => <button key={option.value} type="button" className={value === option.value ? "active" : ""} onClick={() => { onChange(option.value); setOpen(false); }}>{option.label}</button>)}
        </div>
      )}
    </div>
  );
}

function formatAmount(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function SummaryIcon({ type }: { type: string }) {
  const paths: Record<string, React.ReactNode> = {
    total: <><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v5c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 11v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" /></>,
    investable: <><path d="M4 7h15v12H4z" /><path d="M6 4h11v3M14 11h7v5h-7z" /></>,
    domestic: <><path d="M3 9h18L12 3 3 9Z" /><path d="M5 19h14M7 10v7m5-7v7m5-7v7" /></>,
    overseas: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>,
  };
  return <span className="asset-summary-icon" aria-hidden="true"><svg viewBox="0 0 24 24">{paths[type] ?? paths.total}</svg></span>;
}

type AssetBreakdownItem = {
  label: string;
  amount: number;
  percent: number;
};

function formatSigned(value: number, suffix = "") {
  const rounded = Math.abs(value) < 0.005 ? 0 : value;
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(2)}${suffix}`;
}

function comparisonByLabel(items: AssetBreakdownItem[] = []) {
  return new Map(items.map((item) => [item.label, item]));
}

function buildAssetBreakdown(
  dashboard: AssetDashboard,
  field: "assetClass" | "purpose" | "riskLevel",
): AssetBreakdownItem[] {
  const amounts = new Map<string, number>();
  dashboard.accounts.forEach((account) => {
    account.positions.forEach((position) => {
      const label = position[field] || "未知";
      amounts.set(label, (amounts.get(label) ?? 0) + position.amountCny);
    });
  });
  const total = dashboard.summary.netAssets;
  return Array.from(amounts, ([label, amount]) => ({
    label,
    amount,
    percent: total ? amount / total * 100 : 0,
  }))
    .filter((item) => Math.abs(item.amount) > 0.000001)
    .sort((left, right) => {
      if (left.amount >= 0 && right.amount < 0) return -1;
      if (left.amount < 0 && right.amount >= 0) return 1;
      return left.amount >= 0
        ? right.amount - left.amount
        : Math.abs(right.amount) - Math.abs(left.amount);
    });
}

function AssetClassBreakdownCard({
  items,
  comparisonItems = [],
  compareMode = false,
  comparisonLabel,
  currentLabel,
}: {
  items: AssetBreakdownItem[];
  comparisonItems?: AssetBreakdownItem[];
  compareMode?: boolean;
  comparisonLabel?: string | null;
  currentLabel?: string | null;
}) {
  const previous = comparisonByLabel(comparisonItems);
  const visibleItems = compareMode ? items.slice(0, 5) : items;
  const columnSize = Math.ceil(visibleItems.length / 3);
  const itemColumns = compareMode
    ? [visibleItems]
    : Array.from({ length: 3 }, (_, index) => visibleItems.slice(index * columnSize, (index + 1) * columnSize))
      .filter((column) => column.length);
  return (
    <article className="asset-card asset-breakdown-card asset-class-breakdown-card">
      <header><h2>投资品种</h2></header>
      <div className="asset-breakdown-list">
        {visibleItems.length ? itemColumns.map((column, columnIndex) => <div className="asset-breakdown-column" key={columnIndex}>{column.map((item) => {
          const previousItem = previous.get(item.label);
          const percentDelta = item.percent - (previousItem?.percent ?? 0);
          return (
            <div className={`asset-breakdown-row ${compareMode ? "comparing" : ""} ${item.amount < 0 ? "negative" : ""}`} key={item.label}>
              <div className="asset-breakdown-label"><strong>{item.label}</strong><span>{formatAmount(item.amount)} 万元{compareMode && previousItem ? ` · 基准 ${formatAmount(previousItem.amount)}` : ""}</span></div>
              {compareMode ? <div className="asset-breakdown-paired">
                <div><b>{comparisonLabel}</b><span><i style={{ width: `${Math.min(Math.abs(previousItem?.percent ?? 0), 100)}%` }} /></span><em>{(previousItem?.percent ?? 0).toFixed(1)}%</em></div>
                <div><b>{currentLabel}</b><span><i className="current" style={{ width: `${Math.min(Math.abs(item.percent), 100)}%` }} /></span><em>{item.percent.toFixed(1)}%</em></div>
              </div> : <div className="asset-breakdown-track"><span style={{ width: `${Math.min(Math.abs(item.percent), 100)}%` }} /></div>}
              <b>{!compareMode && `${item.percent.toFixed(1)}%`}{previousItem && <small className={percentDelta >= 0 ? "up" : "down"}>{formatSigned(percentDelta, "%")}</small>}</b>
            </div>
          );
        })}</div>) : <div className="asset-breakdown-empty">暂无统计数据</div>}
      </div>
    </article>
  );
}

const PURPOSE_COLORS = ["#128052", "#70ad8c", "#d2a24b"];
const PURPOSE_COLOR_BY_LABEL = new Map([
  ["长期投资", PURPOSE_COLORS[0]],
  ["短期日用", PURPOSE_COLORS[1]],
  ["中期稳健", PURPOSE_COLORS[2]],
]);

function PurposePie({ items, comparisonItems = [], label, compact = false }: { items: AssetBreakdownItem[]; comparisonItems?: AssetBreakdownItem[]; label?: string | null; compact?: boolean }) {
  const chartItems = items.filter((item) => item.amount > 0);
  const previous = comparisonByLabel(comparisonItems);
  const positiveTotal = chartItems.reduce((total, item) => total + item.amount, 0);
  const centerX = 260;
  const centerY = 150;
  const radius = compact ? 78 : 90;
  const pointAt = (angle: number, distance: number) => {
    const radians = angle * Math.PI / 180;
    return {
      x: centerX + Math.cos(radians) * distance,
      y: centerY + Math.sin(radians) * distance,
    };
  };
  const slices = chartItems.map((item, index) => {
    const precedingAmount = chartItems.slice(0, index).reduce((total, entry) => total + entry.amount, 0);
    const startAngle = -90 + precedingAmount / positiveTotal * 360;
    const endAngle = startAngle + item.amount / positiveTotal * 360;
    const start = pointAt(startAngle, radius);
    const end = pointAt(endAngle, radius);
    const middleAngle = (startAngle + endAngle) / 2;
    const bend = pointAt(middleAngle, radius + (compact ? 18 : 20));
    const isRight = Math.cos(middleAngle * Math.PI / 180) >= 0;
    const lineEnd = {
      x: isRight ? 388 : 132,
      y: bend.y,
    };
    return {
      item,
      color: PURPOSE_COLOR_BY_LABEL.get(item.label) ?? PURPOSE_COLORS[index % PURPOSE_COLORS.length],
      path: `M ${centerX} ${centerY} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${endAngle - startAngle > 180 ? 1 : 0} 1 ${end.x} ${end.y} Z`,
      edge: pointAt(middleAngle, radius),
      bend,
      lineEnd,
      isRight,
    };
  });
  const labelYByName = new Map<string, number>();
  const labelMinimumY = 46;
  const labelMaximumY = 238;
  const preferredGap = 64;
  [false, true].forEach((isRight) => {
    const sameSide = slices
      .filter((slice) => slice.isRight === isRight)
      .sort((left, right) => left.bend.y - right.bend.y);
    const effectiveGap = sameSide.length > 1
      ? Math.min(preferredGap, (labelMaximumY - labelMinimumY) / (sameSide.length - 1))
      : 0;
    sameSide.forEach((slice, rank) => {
      const minimumY = labelMinimumY + rank * effectiveGap;
      const maximumY = labelMaximumY - (sameSide.length - rank - 1) * effectiveGap;
      labelYByName.set(slice.item.label, Math.max(minimumY, Math.min(maximumY, slice.bend.y)));
    });
  });
  const positionedSlices = slices.map((slice) => {
    return { ...slice, lineEnd: { ...slice.lineEnd, y: labelYByName.get(slice.item.label) ?? slice.bend.y } };
  });

  return positionedSlices.length ? <div className="asset-purpose-pie-panel">
      {label && <strong className="asset-purpose-period">{label}</strong>}
      <div className="asset-purpose-breakdown">
        <svg className="asset-purpose-pie-chart" viewBox="0 0 520 285" role="img" aria-label="资金用途占比饼状图">
          {positionedSlices.map(({ item, color, path }) => <path key={item.label} d={path} fill={color} className="asset-purpose-slice"><title>{item.label}：{formatAmount(item.amount)} 万元，占总资产 {item.percent.toFixed(1)}%</title></path>)}
          {positionedSlices.map(({ item, color, edge, lineEnd, isRight }) => {
            const textX = lineEnd.x + (isRight ? 8 : -8);
            const labelY = lineEnd.y - 3;
            const elbowX = centerX + (isRight ? radius + 20 : -(radius + 20));
            const leaderPoints = `${edge.x},${edge.y} ${elbowX},${lineEnd.y} ${lineEnd.x},${lineEnd.y}`;
            return <g key={`${item.label}-label`}>
              <polyline points={leaderPoints} stroke={color} className="asset-purpose-leader" />
              <text x={textX} y={labelY} textAnchor={isRight ? "start" : "end"} className="asset-purpose-label">
                <tspan>{item.label}</tspan>
                <tspan x={textX} dy="21" textAnchor={isRight ? "start" : "end"} className="asset-purpose-label-amount">
                  {formatAmount(item.amount)} 万元<tspan dx="8" className="asset-purpose-label-percent">{item.percent.toFixed(1)}%</tspan>
                </tspan>
                {previous.has(item.label) && <tspan x={textX} dy="19" className={item.percent >= (previous.get(item.label)?.percent ?? 0) ? "asset-purpose-label-delta up" : "asset-purpose-label-delta down"}>{formatSigned(item.percent - (previous.get(item.label)?.percent ?? 0), "%")}</tspan>}
              </text>
            </g>;
          })}
        </svg>
      </div>
    </div> : <div className="asset-breakdown-empty">暂无统计数据</div>;
}

function PurposeBreakdownCard({
  items,
  comparisonItems = [],
  compareMode = false,
  comparisonLabel,
  currentLabel,
}: {
  items: AssetBreakdownItem[];
  comparisonItems?: AssetBreakdownItem[];
  compareMode?: boolean;
  comparisonLabel?: string | null;
  currentLabel?: string | null;
}) {
  return (
    <article className="asset-card asset-breakdown-card asset-purpose-breakdown-card">
      <header><h2>资金用途</h2></header>
      {compareMode && comparisonItems.length
        ? <div className="asset-purpose-compare"><PurposePie items={comparisonItems} label={`${comparisonLabel}（基准记录）`} compact /><PurposePie items={items} comparisonItems={comparisonItems} label={`${currentLabel}（当前记录）`} compact /></div>
        : <PurposePie items={items} comparisonItems={comparisonItems} />}
    </article>
  );
}

function PurposeTrendCard({
  currentItems,
  comparisonItems,
  currentLabel,
  comparisonLabel,
}: {
  currentItems: AssetBreakdownItem[];
  comparisonItems: AssetBreakdownItem[];
  currentLabel?: string | null;
  comparisonLabel?: string | null;
}) {
  const current = comparisonByLabel(currentItems);
  const previous = comparisonByLabel(comparisonItems);
  const labels = Array.from(new Set([...comparisonItems.map((item) => item.label), ...currentItems.map((item) => item.label)]))
    .slice(0, 4);
  const x1 = 74;
  const x2 = 566;
  const y = (value: number) => 166 - Math.min(Math.max(value, 0), 100) * 1.25;

  return (
    <article className="asset-card asset-purpose-trend-card">
      <header><h2>配置变化趋势</h2><span>两期资金用途占比变化</span></header>
      <div className="asset-purpose-trend">
        <svg viewBox="0 0 640 205" role="img" aria-label="两期资金用途占比变化">
          {[0, 20, 40, 60, 80, 100].map((tick) => <g key={tick}><line x1="60" x2="580" y1={y(tick)} y2={y(tick)} className="asset-chart-grid" /><text x="26" y={y(tick) + 3}>{tick}%</text></g>)}
          {labels.map((label, index) => {
            const previousPercent = previous.get(label)?.percent ?? 0;
            const currentPercent = current.get(label)?.percent ?? 0;
            const color = PURPOSE_COLOR_BY_LABEL.get(label) ?? PURPOSE_COLORS[index % PURPOSE_COLORS.length];
            return <g key={label}>
              <line x1={x1} x2={x2} y1={y(previousPercent)} y2={y(currentPercent)} stroke={color} className="asset-purpose-trend-line" />
              <circle cx={x1} cy={y(previousPercent)} r="4" fill={color} />
              <circle cx={x2} cy={y(currentPercent)} r="4" fill={color} />
              <text x={x2 + 9} y={y(currentPercent) + 3} fill={color} className="asset-purpose-trend-value">{label} {currentPercent.toFixed(1)}%</text>
            </g>;
          })}
          <text x={x1} y="192" textAnchor="middle">{comparisonLabel}</text>
          <text x={x2} y="192" textAnchor="middle">{currentLabel}</text>
        </svg>
      </div>
    </article>
  );
}

function AssetComparisonDashboard({ current, baseline }: { current: AssetDashboard; baseline: AssetDashboard }) {
  const cards = [
    ["总资产", current.summary.netAssets, baseline.summary.netAssets, "total"],
    ["可支配资产", current.summary.investableAssets, baseline.summary.investableAssets, "investable"],
    ["境内资产", current.summary.domesticAssets, baseline.summary.domesticAssets, "domestic"],
    ["境外资产", current.summary.overseasAssets, baseline.summary.overseasAssets, "overseas"],
  ] as const;
  const currentAssetClasses = buildAssetBreakdown(current, "assetClass");
  const baselineAssetClasses = buildAssetBreakdown(baseline, "assetClass");
  const currentPurposes = buildAssetBreakdown(current, "purpose");
  const baselinePurposes = buildAssetBreakdown(baseline, "purpose");

  return <div className="asset-comparison-dashboard">
    <section className="asset-comparison-summary" aria-label="本期变化摘要" data-layout="summary-v2">
      <header><h2>本期变化摘要</h2><span>与 {baseline.snapshotDate} 相比<br />（{current.snapshotDate}）</span></header>
      <div className="asset-comparison-summary-grid">{cards.map(([label, value, baselineValue, icon]) => {
        const delta = value - baselineValue;
        const deltaPercent = baselineValue ? delta / Math.abs(baselineValue) * 100 : 0;
        const unchanged = Math.abs(delta) < .005;
        return <article key={label}><SummaryIcon type={icon} /><div><span>{label}</span><p><strong className={unchanged || delta > 0 ? "up" : "down"}>{unchanged ? "未变化" : `${delta > 0 ? "↑" : "↓"} ${formatAmount(Math.abs(delta))} 万元`}</strong><em className={unchanged || delta > 0 ? "up" : "down"}>{formatSigned(deltaPercent, "%")}</em></p><small>{formatAmount(baselineValue)}　→　{formatAmount(value)} 万元</small></div></article>;
      })}</div>
    </section>

    <div className="asset-comparison-main-grid">
      <article className="asset-card asset-allocation-card">
        <header><h2>风险配置变化</h2><div><i className="comparison" />{baseline.snapshotDate}（基准）<i className="actual" />{current.snapshotDate}（当前）</div></header>
        <div className="asset-allocation-body"><div className="asset-risk-list"><div className="asset-risk-column-head"><span /><span /><b>基准占比</b><b>当前占比</b><b>变化</b></div>{current.allocations.map((item) => {
          const baselineItem = baseline.allocations.find((entry) => entry.riskLevel === item.riskLevel);
          const baselinePercent = baselineItem?.actualPercent ?? 0;
          const periodDelta = item.actualPercent - baselinePercent;
          const unchanged = Math.abs(periodDelta) < .005;
          return <div className="asset-risk-row" key={item.riskLevel}>
            <strong>{item.riskLevel}风险</strong>
            <div className="asset-risk-meter comparing"><div className="asset-risk-compare-line"><span><i className="comparison" style={{ width: `${Math.min(Math.max(baselinePercent, 0), 100)}%` }} /></span></div><div className="asset-risk-compare-line"><span><i className="current" style={{ width: `${Math.min(Math.max(item.actualPercent, 0), 100)}%` }} /></span></div></div>
            <b className="asset-risk-base-value">{baselinePercent.toFixed(0)}%</b><b className="asset-risk-current-value">{item.actualPercent.toFixed(0)}%</b>
            <div className={`asset-risk-reminder period ${unchanged || periodDelta > 0 ? "under" : "over"}`}><b>{unchanged ? "–" : periodDelta > 0 ? "↑" : "↓"}</b><span><strong>{unchanged ? "未变化" : formatSigned(periodDelta, "%")}</strong></span></div>
          </div>;
        })}</div></div>
      </article>

      <ComparisonPurposeCard currentItems={currentPurposes} baselineItems={baselinePurposes} />
      <ComparisonAssetClassCard currentItems={currentAssetClasses} baselineItems={baselineAssetClasses} />
    </div>
  </div>;
}
function AssetComparisonDialog({ dashboard, onClose }: { dashboard: AssetDashboard; onClose: () => void }) {
  const history = useMemo(() => [...dashboard.history].sort((left, right) => (
    left.snapshotDate.localeCompare(right.snapshotDate) || left.snapshotId - right.snapshotId
  )), [dashboard.history]);
  const initialCurrent = dashboard.snapshotId ?? history.at(-1)?.snapshotId ?? null;
  const initialCurrentIndex = history.findIndex((item) => item.snapshotId === initialCurrent);
  const initialBaseline = (initialCurrentIndex > 0 ? history[initialCurrentIndex - 1] : history.find((item) => item.snapshotId !== initialCurrent))?.snapshotId ?? null;
  const [currentId, setCurrentId] = useState<number | null>(initialCurrent);
  const [baselineId, setBaselineId] = useState<number | null>(initialBaseline);
  const [current, setCurrent] = useState<AssetDashboard | null>(dashboard.snapshotId === initialCurrent ? dashboard : null);
  const [baseline, setBaseline] = useState<AssetDashboard | null>(null);

  useEffect(() => {
    if (!currentId || !baselineId) return;
    let active = true;
    Promise.all([
      dashboard.snapshotId === currentId ? Promise.resolve(dashboard) : getAssetDashboard(currentId),
      dashboard.snapshotId === baselineId ? Promise.resolve(dashboard) : getAssetDashboard(baselineId),
    ]).then(([currentValue, baselineValue]) => {
      if (!active) return;
      setCurrent(currentValue);
      setBaseline(baselineValue);
    });
    return () => { active = false; };
  }, [baselineId, currentId, dashboard]);

  const selectedDate = (id: number | null) => history.find((item) => item.snapshotId === id)?.snapshotDate ?? "";
  const choose = (date: string, setter: (value: number) => void) => {
    const item = history.find((entry) => entry.snapshotDate === date);
    if (item) setter(item.snapshotId);
  };
  const ready = current?.snapshotId === currentId && baseline?.snapshotId === baselineId;

  return <div className="asset-dialog-overlay asset-comparison-overlay" role="presentation" onMouseDown={onClose}>
    <section className="asset-dialog asset-comparison-dialog" role="dialog" aria-modal="true" aria-labelledby="asset-comparison-title" onMouseDown={(event) => event.stopPropagation()}>
      <header><div><span>资产对比</span><h2 id="asset-comparison-title">记录对比</h2></div><div className="asset-comparison-toolbar">
        <AssetSelect id="asset-comparison-baseline" label="基准记录" value={selectedDate(baselineId)} options={history.filter((item) => item.snapshotId !== currentId).map((item) => item.snapshotDate)} onChange={(value) => choose(value, setBaselineId)} />
        <button type="button" aria-label="交换基准记录和当前记录" title="交换两期" onClick={() => { const nextBaseline = currentId; setCurrentId(baselineId); setBaselineId(nextBaseline); }}>⇄</button>
        <AssetSelect id="asset-comparison-current" label="当前记录" value={selectedDate(currentId)} options={history.filter((item) => item.snapshotId !== baselineId).map((item) => item.snapshotDate)} onChange={(value) => choose(value, setCurrentId)} />
      </div><button className="icon-button asset-comparison-close" type="button" onClick={onClose} aria-label="关闭"><CloseIcon /></button></header>
      <div className="asset-comparison-content">{ready && current && baseline ? <AssetComparisonDashboard current={current} baseline={baseline} /> : currentId && baselineId ? <div className="asset-dialog-loading">正在生成对比数据…</div> : <div className="asset-dialog-loading">至少需要两期资产记录才能进行对比。</div>}</div>
    </section>
  </div>;
}

type AssetMetricInfo = "total" | "investable";

function AssetMetricInfoDialog({ metric, onClose }: { metric: AssetMetricInfo; onClose: () => void }) {
  const content = metric === "total"
    ? {
        eyebrow: "资产口径",
        title: "总资产",
        description: "当前资产记录中所有项目按人民币折算后的合计。现金、基金、公积金等资产按正数计入，信用卡等负债按负数扣减。",
        formula: "总资产 = 境内资产 + 境外资产",
      }
    : {
        eyebrow: "配置口径",
        title: "可支配资产",
        description: "当前可以由你随时调动和支配的资产合计。住房公积金、医保个人账户等暂时无法自由调动的资产不计入。",
        formula: "可支配资产 = 标记为“可支配”的项目金额合计",
      };

  return (
    <div className="asset-dialog-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="asset-dialog asset-info-dialog" role="dialog" aria-modal="true" aria-labelledby="asset-metric-info-title">
        <header><div><span>{content.eyebrow}</span><h2 id="asset-metric-info-title">{content.title}</h2></div><button type="button" onClick={onClose} aria-label="关闭"><CloseIcon /></button></header>
        <div className="asset-info-content"><p>{content.description}</p><strong>{content.formula}</strong></div>
        <footer className="asset-info-footer"><button className="primary" type="button" onClick={onClose}>知道了</button></footer>
      </section>
    </div>
  );
}

function TrendChart({ dashboard }: { dashboard: AssetDashboard }) {
  const points = dashboard.history.slice(-6);
  if (!points.length) {
    return <div className="asset-empty-chart">保存两期以上记录后显示资产趋势</div>;
  }

  const values = points.flatMap((item) => [item.netAssets, item.investableAssets]);
  const rawMinimum = Math.min(...values);
  const rawMaximum = Math.max(...values);
  const padding = Math.max((rawMaximum - rawMinimum) * 0.18, 0.5);
  const minimum = rawMinimum - padding;
  const maximum = rawMaximum + padding;
  const range = maximum - minimum;
  const chartLeft = 84;
  const chartRight = 612;
  const x = (index: number) => points.length === 1 ? (chartLeft + chartRight) / 2 : chartLeft + index * ((chartRight - chartLeft) / (points.length - 1));
  const chartTop = 40;
  const chartBottom = 246;
  const y = (value: number) => chartBottom - ((value - minimum) / range) * (chartBottom - chartTop);
  const ticks = Array.from({ length: 5 }, (_, index) => maximum - index * range / 4);
  const path = (key: "netAssets" | "investableAssets") => points
    .map((item, index) => `${index ? "L" : "M"}${x(index)},${y(item[key])}`)
    .join(" ");

  return (
    <div className="asset-trend-chart">
      <svg viewBox="0 0 640 300" role="img" aria-label="总资产与可支配资产金额趋势">
        <text x="8" y="19" className="asset-chart-axis-title">金额（万元）</text>
        {ticks.map((tick) => {
          const lineY = y(tick);
          return <g key={tick}>
            <line x1={chartLeft} x2={chartRight} y1={lineY} y2={lineY} className="asset-chart-grid" />
            <text x="50" y={lineY + 3} textAnchor="end" className="asset-chart-axis-label">{formatAmount(tick)}</text>
          </g>;
        })}
        <path d={path("netAssets")} className="asset-chart-line net" />
        <path d={path("investableAssets")} className="asset-chart-line investable" />
        {points.map((item, index) => (
          <g key={item.snapshotDate}>
            <circle cx={x(index)} cy={y(item.netAssets)} r="4" className="asset-chart-dot net"><title>{item.snapshotDate} 总资产 {formatAmount(item.netAssets)} 万元</title></circle>
            <circle cx={x(index)} cy={y(item.investableAssets)} r="4" className="asset-chart-dot investable"><title>{item.snapshotDate} 可支配资产 {formatAmount(item.investableAssets)} 万元</title></circle>
            <text x={x(index)} y={y(item.netAssets) - 9} textAnchor="middle" className="asset-chart-value net">{formatAmount(item.netAssets)}</text>
            <text x={x(index)} y={y(item.investableAssets) + 15} textAnchor="middle" className="asset-chart-value investable">{formatAmount(item.investableAssets)}</text>
            <text x={x(index)} y="286" textAnchor="middle" className="asset-chart-date">{item.snapshotDate.slice(5)}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

export function SnapshotDialog({
  dashboard,
  onClose,
  onSaved,
}: {
  dashboard: AssetDashboard;
  onClose: () => void;
  onSaved: (value: AssetDashboard) => void;
}) {
  const [snapshotDate, setSnapshotDate] = useState(today());
  const [dateOpen, setDateOpen] = useState(false);
  const [note, setNote] = useState("");
  const [amounts, setAmounts] = useState<Record<number, string>>(() => Object.fromEntries(
    dashboard.accounts.flatMap((account) => account.positions.map((position) => [
      position.id,
      String(position.amount),
    ])),
  ));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const payload: AssetSnapshotPayload = {
      snapshotDate,
      note: note.trim() || null,
      targets: dashboard.allocations.map((item) => ({ riskLevel: item.riskLevel, targetPercent: item.targetPercent, warningThreshold: item.warningThreshold })),
      items: dashboard.accounts.flatMap((account) => account.positions.map((position) => ({
        positionId: position.id,
        amount: Number(amounts[position.id] || 0),
        fxRate: position.fxRate || 1,
        expectedAnnualRate: position.expectedAnnualRate,
      }))),
    };
    try {
      onSaved(await saveAssetSnapshot(payload));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存快照失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="asset-dialog-overlay" role="presentation" onMouseDown={onClose}>
      <section className="asset-dialog" role="dialog" aria-modal="true" aria-labelledby="snapshot-title" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div><span>资产记录</span><h2 id="snapshot-title">新增资产记录</h2></div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="关闭"><CloseIcon /></button>
        </header>
        <form onSubmit={submit}>
          <div className="asset-dialog-meta">
            <label>快照日期<NoteDateField value={snapshotDate} open={dateOpen} onOpenChange={setDateOpen} onChange={setSnapshotDate} /></label>
            <label>备注<input value={note} onChange={(event) => setNote(event.target.value)} placeholder="本期调整说明（可选）" /></label>
          </div>
          <p className="asset-dialog-help">单位为万元；已复制上一期金额，只需修改发生变化的项目。</p>
          <div className="asset-snapshot-groups">
            {dashboard.accounts.map((account) => (
              <fieldset key={account.id}>
                <legend>{account.name}<small>{account.region}</small></legend>
                {account.positions.map((position) => (
                  <label className="asset-snapshot-row" key={position.id}>
                    <span><strong>{position.name}</strong><small>{position.purpose} · {position.riskLevel}风险</small></span>
                    <input type="number" step="0.1" value={amounts[position.id] ?? ""} onChange={(event) => setAmounts((current) => ({ ...current, [position.id]: event.target.value }))} />
                    <em>万元</em>
                  </label>
                ))}
              </fieldset>
            ))}
          </div>
          {error && <p className="asset-form-error">{error}</p>}
          <footer><button type="button" onClick={onClose}>取消</button><button className="primary" type="submit" disabled={saving}>{saving ? "保存中…" : "保存记录"}</button></footer>
        </form>
      </section>
    </div>
  );
}

function newPosition(index: number) {
  return {
    id: null,
    name: "",
    assetClass: "其他",
    assetClassOptionId: 0,
    purpose: "" as AssetPurpose,
    purposeOptionId: 0,
    riskLevel: "" as AssetRiskLevel,
    riskOptionId: 0,
    isInvestable: true,
    sortOrder: index,
  };
}

type AssetOptionState = {
  assetCategories: ContentOptionItem[];
  assetClasses: ContentOptionItem[];
  purposes: ContentOptionItem[];
  risks: ContentOptionItem[];
};

type RecordPosition = AssetPositionConfig & {
  amount: string;
  fxRate: number;
  expectedAnnualRate: number | null;
};

type RecordAccount = Omit<AssetAccountConfig, "positions"> & {
  positions: RecordPosition[];
};

async function loadAssetOptions(): Promise<AssetOptionState> {
  const [assetCategories, assetClasses, purposes, risks] = await Promise.all([
    getContentOptions("asset_category"),
    getContentOptions("asset_class"),
    getContentOptions("asset_purpose"),
    getContentOptions("asset_risk"),
  ]);
  return { assetCategories: assetCategories.items, assetClasses: assetClasses.items, purposes: purposes.items, risks: risks.items };
}

function selectOptions(items: ContentOptionItem[]) {
  return items.filter((item): item is ContentOptionItem & { id: number } => item.id !== null)
    .map((item) => ({ value: String(item.id), label: item.value }));
}

function RecordDialog({ dashboard, mode, onClose, onSaved }: { dashboard: AssetDashboard; mode: "create" | "edit"; onClose: () => void; onSaved: (value: AssetDashboard) => void }) {
  const [snapshotDate, setSnapshotDate] = useState(() => mode === "edit" ? dashboard.snapshotDate ?? today() : today());
  const [dateOpen, setDateOpen] = useState(false);
  const [note, setNote] = useState(() => mode === "edit" ? dashboard.note ?? "" : "");
  const [targets, setTargets] = useState(() => dashboard.allocations.map((item) => ({ riskLevel: item.riskLevel, targetPercent: item.targetPercent, warningThreshold: item.warningThreshold })));
  const [config, setConfig] = useState<AssetConfig | null>(null);
  const [accounts, setAccounts] = useState<RecordAccount[] | null>(null);
  const [options, setOptions] = useState<AssetOptionState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draggedPosition, setDraggedPosition] = useState<{ accountIndex: number; positionIndex: number } | null>(null);
  const [dragOverPosition, setDragOverPosition] = useState<{ accountIndex: number; positionIndex: number } | null>(null);

  useEffect(() => {
    Promise.all([
      getAssetConfig(),
      loadAssetOptions(),
      mode === "edit" ? Promise.resolve(dashboard) : getAssetDashboard(),
    ])
      .then(([value, optionValues, sourceDashboard]) => {
        const currentByPosition = new Map(sourceDashboard.accounts.flatMap((account) => account.positions.map((position) => [position.id, position])));
        setConfig(value);
        setOptions(optionValues);
        setTargets(sourceDashboard.allocations.map((item) => ({ riskLevel: item.riskLevel, targetPercent: item.targetPercent, warningThreshold: item.warningThreshold })));
        setAccounts(sourceDashboard.accounts.map((account) => ({
          ...account,
          positions: account.positions.map((position) => {
            const current = position.id ? currentByPosition.get(position.id) : undefined;
            return { ...position, amount: String(current?.amount ?? 0), fxRate: current?.fxRate ?? 1, expectedAnnualRate: current?.expectedAnnualRate ?? null };
          }),
        })));
      })
      .catch(() => setError("无法读取资产记录配置"));
  }, [dashboard, mode]);

  function updateAccount(index: number, patch: Partial<RecordAccount>) {
    setAccounts((current) => current?.map((account, accountIndex) => accountIndex === index ? { ...account, ...patch } : account) ?? null);
  }

  function addAccount(region: "境内" | "境外") {
    setAccounts((current) => [...(current ?? []), {
      id: null,
      name: "",
      region,
      currency: "人民币",
      assetCategory: options?.assetCategories[0]?.value ?? "基金",
      assetCategoryOptionId: options?.assetCategories[0]?.id ?? 0,
      targetAmount: null,
      sortOrder: current?.length ?? 0,
      positions: [],
    }]);
  }

  function dropPosition(event: React.DragEvent<HTMLTableRowElement>, accountIndex: number, targetIndex: number) {
    event.preventDefault();
    if (!draggedPosition || draggedPosition.accountIndex !== accountIndex || draggedPosition.positionIndex === targetIndex) {
      setDragOverPosition(null);
      return;
    }
    const account = accounts?.[accountIndex];
    if (!account) return;
    const positions = [...account.positions];
    const [moved] = positions.splice(draggedPosition.positionIndex, 1);
    positions.splice(targetIndex, 0, moved);
    updateAccount(accountIndex, { positions });
    setDraggedPosition(null);
    setDragOverPosition(null);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!config || !accounts) return;
    setError(null);
    if (accounts.some((account) => account.positions.some((position) => !position.riskOptionId || !position.purposeOptionId))) {
      setError("请为所有持仓选择风险等级和资金用途后再保存。");
      return;
    }
    const accountNames = accounts.map((account) => account.name.trim());
    if (new Set(accountNames).size !== accountNames.length) {
      setError("账户名称不能重复。");
      return;
    }
    const duplicatePositionAccount = accounts.find((account) => {
      const names = account.positions.map((position) => position.name.trim());
      return new Set(names).size !== names.length;
    });
    if (duplicatePositionAccount) {
      setError(`账户“${duplicatePositionAccount.name}”中存在同名持仓。`);
      return;
    }
    setSaving(true);
    try {
      const savedConfig = await updateAssetConfig({
        targets: config.targets,
        accounts: accounts.map((account, accountIndex) => ({
          ...account,
          sortOrder: accountIndex,
          positions: account.positions.map((position, positionIndex) => ({
            id: position.id,
            name: position.name,
            assetClass: position.assetClass,
            assetClassOptionId: position.assetClassOptionId,
            purpose: position.purpose,
            purposeOptionId: position.purposeOptionId,
            riskLevel: position.riskLevel,
            riskOptionId: position.riskOptionId,
            isInvestable: position.isInvestable,
            sortOrder: positionIndex,
          })),
        })),
      }, mode === "edit");
      const savedAccountsById = new Map(savedConfig.accounts.filter((account) => account.id !== null).map((account) => [account.id, account]));
      const payload: AssetSnapshotPayload = {
        snapshotDate,
        note: note.trim() || null,
        targets,
        items: accounts.flatMap((account) => {
          const savedAccount = account.id !== null
            ? savedAccountsById.get(account.id)
            : savedConfig.accounts.find((item) => item.name === account.name);
          if (!savedAccount) throw new Error(`无法保存账户“${account.name}”`);
          const savedPositionsById = new Map(savedAccount.positions.filter((position) => position.id !== null).map((position) => [position.id, position]));
          return account.positions.map((position) => {
            const savedPosition = position.id !== null
              ? savedPositionsById.get(position.id)
              : savedAccount.positions.find((item) => item.name === position.name);
            if (!savedPosition?.id) throw new Error(`无法保存持仓“${position.name}”`);
            return { positionId: savedPosition.id, amount: Number(position.amount || 0), fxRate: position.fxRate || 1, expectedAnnualRate: position.expectedAnnualRate ?? null };
          });
        }),
      };
      onSaved(await saveAssetSnapshot(payload));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存资产记录失败");
    } finally {
      setSaving(false);
    }
  }

  return (
      <section className="asset-dialog asset-settings-dialog asset-record-dialog asset-inline-record-shell">
        {!accounts || !config || !options ? <div className="asset-dialog-loading">{error ?? "正在读取…"}</div> : (
          <form onSubmit={submit}>
            <div className="asset-dialog-meta"><label>记录日期{mode === "edit" ? <input value={snapshotDate} disabled aria-label="当前记录日期" /> : <NoteDateField value={snapshotDate} open={dateOpen} onOpenChange={setDateOpen} onChange={setSnapshotDate} />}</label><label>备注<input value={note} onChange={(event) => setNote(event.target.value)} placeholder="本期调整说明（可选）" /></label></div>
            <section className="asset-target-editor asset-record-targets"><h3>本期风险目标</h3>{targets.map((target, index) => <label key={target.riskLevel}><span>{target.riskLevel}风险</span><input type="number" min="0" max="100" step="0.1" value={target.targetPercent} onChange={(event) => setTargets((current) => current.map((item, targetIndex) => targetIndex === index ? { ...item, targetPercent: Number(event.target.value) } : item))} /><em>%</em></label>)}</section>
            <div className="asset-record-regions">
              {(["境内", "境外"] as const).map((region) => (
                <section className="asset-record-region" key={region}>
                  <div className="asset-table-wrap asset-record-table-wrap">
                    <table className="asset-record-table">
                      <thead><tr><th>{region}账户</th><th>投资品种</th><th>风险等级</th><th>资金用途</th><th>可支配</th><th>当前金额</th><th>操作</th></tr></thead>
                      <tbody>
                        {accounts.map((account, accountIndex) => account.region === region ? (
                          <Fragment key={account.id ?? `new-account-${accountIndex}`}>
                            {(account.positions.length ? account.positions : [null]).map((position, positionIndex) => (
                              <tr
                                className={[positionIndex === 0 ? "asset-record-account-start" : "", draggedPosition?.accountIndex === accountIndex && draggedPosition.positionIndex === positionIndex ? "asset-record-position-dragging" : "", dragOverPosition?.accountIndex === accountIndex && dragOverPosition.positionIndex === positionIndex ? "asset-record-position-drag-over" : ""].filter(Boolean).join(" ") || undefined}
                                key={position?.id ?? `new-position-${accountIndex}-${positionIndex}`}
                                onDragOver={(event) => { if (position && draggedPosition?.accountIndex === accountIndex) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDragOverPosition({ accountIndex, positionIndex }); } }}
                                onDrop={(event) => position && dropPosition(event, accountIndex, positionIndex)}
                              >
                                {positionIndex === 0 && (
                                  <th className="asset-record-account-cell" rowSpan={Math.max(account.positions.length, 1) + 1}>
                                    <label><span>账户名称</span><input value={account.name} onChange={(event) => updateAccount(accountIndex, { name: event.target.value })} required /></label>
                                    <div className="asset-record-account-totals">
                                      <label><span>资产类别</span><AssetSelect id={`record-account-category-${accountIndex}`} value={String(account.assetCategoryOptionId)} options={selectOptions(options.assetCategories)} onChange={(value) => { const selected = options.assetCategories.find((item) => item.id === Number(value)); if (selected) updateAccount(accountIndex, { assetCategory: selected.value, assetCategoryOptionId: Number(value) }); }} /></label>
                                      <label><span>当前总额</span><output>{formatAmount(account.positions.reduce((total, item) => total + Number(item.amount || 0), 0))}</output></label>
                                    </div>
                                    <div className="asset-record-account-actions">
                                      <label><span>计划金额</span><input type="number" step="0.1" value={account.targetAmount ?? ""} onChange={(event) => updateAccount(accountIndex, { targetAmount: event.target.value ? Number(event.target.value) : null })} placeholder="可选" /></label>
                                      <button type="button" onClick={() => setAccounts((current) => current?.filter((_, index) => index !== accountIndex) ?? null)}><TrashIcon /><span>删除账户</span></button>
                                    </div>
                                  </th>
                                )}
                                {position ? <>
                                  <td><AssetSelect id={`record-class-${accountIndex}-${positionIndex}`} value={String(position.assetClassOptionId)} options={selectOptions(options.assetClasses)} onChange={(value) => { const selected = options.assetClasses.find((item) => item.id === Number(value)); if (selected) updateAccount(accountIndex, { positions: account.positions.map((item, index) => index === positionIndex ? { ...item, name: item.id ? item.name : selected.value, assetClass: selected.value, assetClassOptionId: Number(value) } : item) }); }} /></td>
                                  <td><AssetSelect id={`record-risk-${accountIndex}-${positionIndex}`} value={position.riskOptionId ? String(position.riskOptionId) : ""} options={selectOptions(options.risks)} required className={!position.riskOptionId ? "is-empty" : ""} onChange={(value) => { const selected = options.risks.find((item) => item.id === Number(value)); if (selected) updateAccount(accountIndex, { positions: account.positions.map((item, index) => index === positionIndex ? { ...item, riskLevel: selected.value, riskOptionId: Number(value) } : item) }); }} /></td>
                                  <td><AssetSelect id={`record-purpose-${accountIndex}-${positionIndex}`} value={position.purposeOptionId ? String(position.purposeOptionId) : ""} options={selectOptions(options.purposes)} required className={!position.purposeOptionId ? "is-empty" : ""} onChange={(value) => { const selected = options.purposes.find((item) => item.id === Number(value)); if (selected) updateAccount(accountIndex, { positions: account.positions.map((item, index) => index === positionIndex ? { ...item, purpose: selected.value, purposeOptionId: Number(value) } : item) }); }} /></td>
                                  <td className="asset-record-check-cell"><label className={`tag-filter-checkbox asset-config-checkbox ${position.isInvestable ? "active" : ""}`} aria-label="计入资产配置"><input type="checkbox" checked={position.isInvestable} onChange={(event) => updateAccount(accountIndex, { positions: account.positions.map((item, index) => index === positionIndex ? { ...item, isInvestable: event.target.checked } : item) })} /><i aria-hidden="true">{position.isInvestable ? "✓" : ""}</i></label></td>
                                  <td><input className="asset-record-amount" type="number" step="0.1" value={position.amount} onChange={(event) => updateAccount(accountIndex, { positions: account.positions.map((item, index) => index === positionIndex ? { ...item, amount: event.target.value } : item) })} required /></td>
                                  <td className="asset-record-action-cell"><div className="asset-record-action-buttons"><button className="asset-position-drag-handle" type="button" draggable aria-label="拖动调整持仓顺序" title="拖动调整顺序" onDragStart={(event) => { setDraggedPosition({ accountIndex, positionIndex }); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", `${accountIndex}:${positionIndex}`); }} onDragEnd={() => { setDraggedPosition(null); setDragOverPosition(null); }}><span aria-hidden="true">⠿</span></button><button className="asset-position-delete" type="button" aria-label="删除持仓" title="删除持仓" onClick={() => updateAccount(accountIndex, { positions: account.positions.filter((_, index) => index !== positionIndex) })}><TrashIcon /></button></div></td>
                                </> : <td className="asset-record-empty" colSpan={6}>暂无持仓</td>}
                              </tr>
                            ))}
                            <tr className="asset-record-add-row"><td colSpan={6}><button className="asset-add-position" type="button" onClick={() => { const firstClass = options.assetClasses[0]; updateAccount(accountIndex, { positions: [...account.positions, { ...newPosition(account.positions.length), name: firstClass?.value ?? "", assetClass: firstClass?.value ?? "", assetClassOptionId: firstClass?.id ?? 0, amount: "0", fxRate: 1, expectedAnnualRate: null }] }); }}>＋ 添加持仓</button></td></tr>
                          </Fragment>
                        ) : null)}
                        {!accounts.some((account) => account.region === region) && <tr><td className="asset-record-empty" colSpan={7}>暂无{region}账户，请点击下方添加</td></tr>}
                      </tbody>
                      <tfoot><tr><td colSpan={7}><button className="asset-record-add-account" type="button" onClick={() => addAccount(region)}>＋ 添加{region}账户</button></td></tr></tfoot>
                    </table>
                  </div>
                </section>
              ))}
            </div>
            {error && <p className="asset-form-error">{error}</p>}
            <footer><button type="button" onClick={onClose}>取消</button><button className="primary" type="submit" disabled={saving}>{saving ? "保存中…" : mode === "edit" ? "保存修改" : "保存记录"}</button></footer>
          </form>
        )}
      </section>
  );
}

function AssetOptionEditor({ title, values, required, onChange, className = "" }: { title: string; values: ContentOptionItem[]; required: readonly string[]; onChange: (values: ContentOptionItem[]) => void; className?: string }) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  function dropAt(event: React.DragEvent<HTMLDivElement>, targetIndex: number) {
    event.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex) {
      setDragOverIndex(null);
      return;
    }
    const next = [...values];
    const [moved] = next.splice(draggedIndex, 1);
    next.splice(targetIndex, 0, moved);
    onChange(next);
    setDraggedIndex(null);
    setDragOverIndex(null);
  }

  return <section className={`asset-option-editor ${className}`.trim()}><header><h3>{title}</h3></header><div>{values.map((item, index) => <div className={`asset-option-row${draggedIndex === index ? " dragging" : ""}${dragOverIndex === index ? " drag-over" : ""}`} key={item.id ?? `new-${index}`} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDragOverIndex(index); }} onDrop={(event) => dropAt(event, index)}><button className="drag-handle" type="button" draggable aria-label={`拖动调整${item.value}顺序`} title="拖动调整顺序" onDragStart={(event) => { setDraggedIndex(index); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", String(index)); }} onDragEnd={() => { setDraggedIndex(null); setDragOverIndex(null); }}><span aria-hidden="true">⠿</span></button><input aria-label={`${title}选项 ${index + 1}`} value={item.value} disabled={required.includes(item.value)} onChange={(event) => onChange(values.map((value, itemIndex) => itemIndex === index ? { ...value, value: event.target.value } : value))} /><div className="asset-option-actions"><Tooltip content={item.inUse ? "仍被账户或持仓使用的选项不能删除" : null}><button className="delete" type="button" aria-label={`删除${item.value}`} disabled={item.inUse || required.includes(item.value)} onClick={() => onChange(values.filter((_, itemIndex) => itemIndex !== index))}><TrashIcon /></button></Tooltip></div></div>)}<button className="asset-option-add" type="button" onClick={() => onChange([...values, { id: null, value: "" }])}>＋ 添加</button></div></section>;
}

function OptionsDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [options, setOptions] = useState<AssetOptionState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { loadAssetOptions().then(setOptions).catch(() => setError("无法读取配置")); }, []);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!options) return;
    const updates: Array<[string, ContentOptionType, ContentOptionItem[]]> = [
      ["资产类别", "asset_category", options.assetCategories],
      ["投资品种", "asset_class", options.assetClasses],
      ["资金用途", "asset_purpose", options.purposes],
      ["风险等级", "asset_risk", options.risks],
    ];
    const invalid = updates.find(([, , items]) => {
      const normalized = items.map((item) => item.value.trim());
      return normalized.some((value) => !value) || new Set(normalized).size !== normalized.length;
    });
    if (invalid) {
      setError(`${invalid[0]}：选项不能为空或重复`);
      return;
    }
    setSaving(true); setError(null);
    try {
      await Promise.all(updates.map(async ([label, optionType, items]) => {
        try {
          await updateContentOptions(optionType, items);
        } catch (reason) {
          throw new Error(`${label}：${reason instanceof Error ? reason.message : "保存失败"}`);
        }
      }));
      onSaved();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "保存配置失败"); }
    finally { setSaving(false); }
  }
  return <div className="asset-dialog-overlay" role="presentation" onMouseDown={onClose}><section className="asset-dialog asset-options-dialog" role="dialog" aria-modal="true" aria-labelledby="options-title" onMouseDown={(event) => event.stopPropagation()}><header><div><span>资产配置</span><h2 id="options-title">选项配置</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="关闭"><CloseIcon /></button></header>{!options ? <div className="asset-dialog-loading">{error ?? "正在读取…"}</div> : <form onSubmit={submit}><div className="asset-option-grid"><AssetOptionEditor title="资产类别" values={options.assetCategories} required={[]} onChange={(values) => setOptions({ ...options, assetCategories: values })} /><AssetOptionEditor className="asset-option-editor-wide" title="投资品种" values={options.assetClasses} required={[]} onChange={(values) => setOptions({ ...options, assetClasses: values })} /><div className="asset-option-stack"><AssetOptionEditor title="资金用途" values={options.purposes} required={[]} onChange={(values) => setOptions({ ...options, purposes: values })} /><AssetOptionEditor title="风险等级" values={options.risks} required={[]} onChange={(values) => setOptions({ ...options, risks: values })} /></div></div>{error && <p className="asset-form-error">{error}</p>}<footer><button type="button" onClick={onClose}>取消</button><button className="primary" type="submit" disabled={saving}>{saving ? "保存中…" : "保存配置"}</button></footer></form>}</section></div>;
}

export function AssetManagement() {
  const [dashboard, setDashboard] = useState<AssetDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recordMode, setRecordMode] = useState<"create" | "edit" | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [metricInfo, setMetricInfo] = useState<AssetMetricInfo | null>(null);
  const [holdingSearch, setHoldingSearch] = useState("");
  const [assetClassFilter, setAssetClassFilter] = useState("全部品种");
  const [purposeFilter, setPurposeFilter] = useState("全部用途");
  const [riskFilter, setRiskFilter] = useState("全部风险");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const [referenceDashboard, setReferenceDashboard] = useState<AssetDashboard | null>(null);

  const load = useCallback(async (snapshotId?: number) => {
    setLoading(true);
    setError(null);
    try {
      setDashboard(await getAssetDashboard(snapshotId));
    } catch {
      setError("暂时无法读取资产数据，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    getAssetDashboard()
      .then((value) => {
        if (active) setDashboard(value);
      })
      .catch(() => {
        if (active) setError("暂时无法读取资产数据，请稍后重试。");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const referenceSnapshot = useMemo(() => {
    if (!dashboard?.snapshotId) return null;
    const orderedHistory = [...dashboard.history].sort((left, right) => (
      left.snapshotDate.localeCompare(right.snapshotDate) || left.snapshotId - right.snapshotId
    ));
    const currentIndex = orderedHistory.findIndex((item) => item.snapshotId === dashboard.snapshotId);
    return currentIndex > 0 ? orderedHistory[currentIndex - 1] : null;
  }, [dashboard]);

  useEffect(() => {
    if (!referenceSnapshot) return;
    let active = true;
    getAssetDashboard(referenceSnapshot.snapshotId)
      .then((value) => { if (active) setReferenceDashboard(value); })
      .catch(() => { if (active) setReferenceDashboard(null); })
    return () => { active = false; };
  }, [referenceSnapshot]);

  const activeReferenceDashboard = referenceDashboard?.snapshotId === referenceSnapshot?.snapshotId
    ? referenceDashboard
    : null;

  const switchSnapshot = useCallback(async (snapshotDate: string) => {
    if (!dashboard || historyLoading) return;
    const snapshot = dashboard.history.find((item) => item.snapshotDate === snapshotDate);
    if (!snapshot || snapshot.snapshotId === dashboard.snapshotId) return;
    setHistoryLoading(true);
    setRecordMode(null);
    try {
      setDashboard(await getAssetDashboard(snapshot.snapshotId));
    } catch {
      return;
    } finally {
      setHistoryLoading(false);
    }
  }, [dashboard, historyLoading]);

  const deviations = useMemo(() => dashboard?.allocations.filter(
    (item) => Math.abs(item.deviationPercent) >= item.warningThreshold,
  ) ?? [], [dashboard]);

  const assetClassOptions = useMemo(() => Array.from(new Set(
    dashboard?.accounts.flatMap((account) => account.positions.map((position) => position.assetClass)) ?? [],
  )).sort((left, right) => left.localeCompare(right, "zh-CN")), [dashboard]);

  const filteredAccounts = useMemo(() => {
    const keyword = holdingSearch.trim().toLocaleLowerCase("zh-CN");
    return dashboard?.accounts
      .map((account) => ({
        ...account,
        positions: account.positions.filter((position) => {
          const matchesKeyword = !keyword || [account.name, position.assetClass]
            .some((value) => value.toLocaleLowerCase("zh-CN").includes(keyword));
          const matchesAssetClass = assetClassFilter === "全部品种" || position.assetClass === assetClassFilter;
          const matchesPurpose = purposeFilter === "全部用途" || position.purpose === purposeFilter;
          const matchesRisk = riskFilter === "全部风险" || position.riskLevel === riskFilter;
          return matchesKeyword && matchesAssetClass && matchesPurpose && matchesRisk;
        }),
      }))
      .filter((account) => account.positions.length > 0) ?? [];
  }, [assetClassFilter, dashboard, holdingSearch, purposeFilter, riskFilter]);

  const filtersActive = Boolean(holdingSearch)
    || assetClassFilter !== "全部品种"
    || purposeFilter !== "全部用途"
    || riskFilter !== "全部风险";
  const filteredPositionCount = filteredAccounts.reduce(
    (total, account) => total + account.positions.length,
    0,
  );
  const accountTables = (["境内", "境外"] as const)
    .map((region) => ({
      region,
      accounts: filteredAccounts.filter((account) => account.region === region),
    }));

  if (loading) return <main className="asset-page page-width"><div className="asset-page-state">正在汇总资产数据…</div></main>;
  if (error || !dashboard) return <main className="asset-page page-width"><div className="asset-page-state error">{error}</div></main>;

  const cards = [
    ["总资产", dashboard.summary.netAssets, "◎", "total"],
    ["可支配资产", dashboard.summary.investableAssets, "▣", "investable"],
    ["境内资产", dashboard.summary.domesticAssets, "▥", null],
    ["境外资产", dashboard.summary.overseasAssets, "◉", null],
  ] as const;
  const assetClassBreakdown = buildAssetBreakdown(dashboard, "assetClass");
  const purposeBreakdown = buildAssetBreakdown(dashboard, "purpose");
  const referenceAssetClassBreakdown = activeReferenceDashboard ? buildAssetBreakdown(activeReferenceDashboard, "assetClass") : [];
  const referencePurposeBreakdown = activeReferenceDashboard ? buildAssetBreakdown(activeReferenceDashboard, "purpose") : [];
  const referenceValues = activeReferenceDashboard ? [
    activeReferenceDashboard.summary.netAssets,
    activeReferenceDashboard.summary.investableAssets,
    activeReferenceDashboard.summary.domesticAssets,
    activeReferenceDashboard.summary.overseasAssets,
  ] : [];
  return (
    <main className="asset-page page-width">
      <header className="asset-page-head">
        <div><h1>资产管理</h1><p>一次录入，自动汇总，历史可追溯</p></div>
        <div className="asset-page-actions">
          {!recordMode && <>
            {dashboard.history.length > 0 && (
              <AssetSelect
                id="asset-history-select"
                label="记录"
                value={historyLoading ? "切换中…" : dashboard.snapshotDate ?? ""}
                options={[...dashboard.history].reverse().map((item) => item.snapshotDate)}
                onChange={(value) => { void switchSnapshot(value); }}
                className="asset-history-select"
              />
            )}
            <button type="button" disabled={dashboard.history.length < 2} onClick={() => setComparisonOpen(true)}>对比查看</button>
            <button className="primary" type="button" onClick={() => setRecordMode("create")}>＋ 新增记录</button>
          </>}
          <button className="icon-button asset-settings-button" type="button" onClick={() => setSettingsOpen(true)} aria-label="资产设置" title="资产设置"><SettingsIcon /></button>
        </div>
      </header>
      <section className="asset-detail-grid asset-detail-first">
        <article className={`asset-card asset-holdings-card ${recordMode ? "editing" : ""}`}>
          <header><h2>{recordMode === "create" ? "新增资产记录" : recordMode === "edit" ? "编辑资产记录" : "账户与持仓"}</h2>{!recordMode && dashboard.snapshotId && <div className="asset-holdings-head-actions"><button type="button" onClick={() => setRecordMode("edit")}>编辑</button></div>}</header>
          {recordMode ? <RecordDialog dashboard={dashboard} mode={recordMode} onClose={() => setRecordMode(null)} onSaved={(value) => { setDashboard(value); setRecordMode(null); }} /> : <>
            <div className="asset-holdings-filters">
              <label className="search-box asset-holdings-search"><SearchIcon /><input value={holdingSearch} onChange={(event) => setHoldingSearch(event.target.value)} placeholder="搜索账户或投资品种" aria-label="搜索账户或投资品种" />{holdingSearch && <button type="button" onClick={() => setHoldingSearch("")} aria-label="清空搜索"><CloseIcon /></button>}</label>
              <AssetSelect id="asset-class-filter" label="品种" value={assetClassFilter} options={["全部品种", ...assetClassOptions]} onChange={setAssetClassFilter} className="asset-class-filter" />
              <AssetSelect id="asset-purpose-filter" label="用途" value={purposeFilter} options={["全部用途", ...PURPOSES]} onChange={setPurposeFilter} />
              <AssetSelect id="asset-risk-filter" label="风险" value={riskFilter} options={["全部风险", ...RISKS]} onChange={setRiskFilter} />
              <span className="asset-filter-count">{filteredPositionCount} 项</span>
              {filtersActive && <button type="button" onClick={() => { setHoldingSearch(""); setAssetClassFilter("全部品种"); setPurposeFilter("全部用途"); setRiskFilter("全部风险"); }}>重置</button>}
            </div>
            <div className="asset-region-tables">
              {accountTables.map((group) => (
                <div className="asset-table-wrap" key={group.region}>
                  <table>
                    <thead><tr><th>{group.region}账户</th><th>投资品种</th><th>风险等级</th><th>资金用途</th><th>当前金额</th><th>占比</th></tr></thead>
                    <tbody>{group.accounts.length ? group.accounts.flatMap((account) => account.positions.map((position, positionIndex) => <tr className={positionIndex === 0 ? "asset-account-start" : undefined} key={position.id}>{positionIndex === 0 && <th className="asset-account-cell" rowSpan={account.positions.length}><div className="asset-account-heading"><strong>{account.name}</strong><span className="asset-category-pill">{account.assetCategory}</span></div><small>{formatAmount(account.positions.reduce((total, item) => total + item.amountCny, 0))} 万元</small></th>}<td>{position.assetClass}</td><td><span className={`risk-pill risk-${position.riskLevel}`}>{position.riskLevel}</span></td><td><span className={`purpose-pill purpose-${position.purpose}`}>{position.purpose}</span></td><td className="asset-current-amount"><strong>{formatAmount(position.amountCny)}</strong> 万元</td><td className="asset-current-share">{dashboard.summary.netAssets ? `${(position.amountCny / dashboard.summary.netAssets * 100).toFixed(1)}%` : "—"}</td></tr>)) : <tr><td className="asset-filter-empty" colSpan={6}>没有符合当前筛选条件的{group.region}持仓</td></tr>}</tbody>
                  </table>
                </div>
              ))}
            </div>
          </>}
        </article>
      </section>
      <section className="asset-summary-grid">
        {cards.map(([label, value, icon, infoKey], index) => {
          const referenceValue = referenceValues[index];
          const delta = referenceValue === undefined ? null : value - referenceValue;
          const deltaPercent = referenceValue ? (delta ?? 0) / referenceValue * 100 : 0;
          const unchanged = delta !== null && Math.abs(delta) < 0.005;
          return (
            <article key={label}><SummaryIcon type={icon} /><div className="asset-summary-card-content"><div className="asset-summary-main">
              <span>{label}{infoKey && <button className="asset-metric-info" type="button" aria-label={`查看${label}含义`} onClick={() => setMetricInfo(infoKey)}>!</button>}</span>
              <strong>{formatAmount(value)} <small>万</small></strong>
            </div>
              {delta !== null && <em className={unchanged ? "asset-period-change unchanged" : delta >= 0 ? "asset-period-change up" : "asset-period-change down"}>
                {unchanged ? <span className="asset-period-value">未变化</span> : <>
                  <span className="asset-period-label">较上期</span>
                  <span className="asset-period-value">{formatSigned(delta, " 万")}</span>
                  <span className="asset-period-percent">{formatSigned(deltaPercent, "%")}</span>
                </>}
              </em>}
            </div></article>
          );
        })}
      </section>
      <div className="asset-stat-layout">
      <section className="asset-overview-grid">
        <PurposeBreakdownCard items={purposeBreakdown} comparisonItems={referencePurposeBreakdown} />
        <article className="asset-card asset-allocation-card">
          <header><h2>风险配置</h2><div><i className="target" />目标比例<i className="actual" />实际比例</div></header>
          <div className="asset-allocation-body">
            <div className="asset-risk-list">
              {dashboard.allocations.map((item) => {
                const deviation = deviations.find((entry) => entry.riskLevel === item.riskLevel);
                const referenceAllocation = activeReferenceDashboard?.allocations.find((entry) => entry.riskLevel === item.riskLevel);
                const periodDelta = referenceAllocation ? item.actualPercent - referenceAllocation.actualPercent : null;
                const warning = Boolean(deviation && deviation.deviationPercent > 0 && deviation.riskLevel !== "低");
                return (
                  <div className="asset-risk-row" key={item.riskLevel}>
                    <div className="asset-risk-label"><strong>{item.riskLevel}风险</strong><span>{formatAmount(item.amount)} 万元</span></div>
                    <div className="asset-risk-meter">
                      <div className="asset-risk-values"><span>目标 {item.targetPercent.toFixed(0)}%</span><strong style={{ left: `${Math.min(Math.max(item.actualPercent, 0), 100)}%` }}>实际 {item.actualPercent.toFixed(0)}%</strong></div>
                      <div className="asset-risk-bars"><span className="target" style={{ width: `${Math.min(item.targetPercent, 100)}%` }} /><span className="actual" style={{ width: `${Math.min(item.actualPercent, 100)}%` }} /></div>
                    </div>
                    {deviation
                      ? <div className={`asset-risk-reminder ${warning ? "over" : "under"}`}><b>{warning ? "!" : "✓"}</b><span><strong>{deviation.deviationPercent > 0 ? "偏高" : "偏低"} {Math.abs(deviation.deviationPercent).toFixed(0)}%</strong>{periodDelta !== null && <small className={periodDelta >= 0 ? "asset-risk-period up" : "asset-risk-period down"}>较上期 {Math.abs(periodDelta) < 0.005 ? "未变化" : formatSigned(periodDelta, "%")}</small>}</span></div>
                      : <div className="asset-risk-reminder balanced"><b>✓</b><span><strong>目标范围内</strong>{periodDelta !== null && <small className={periodDelta >= 0 ? "asset-risk-period up" : "asset-risk-period down"}>较上期 {Math.abs(periodDelta) < 0.005 ? "未变化" : formatSigned(periodDelta, "%")}</small>}</span></div>}
                  </div>
                );
              })}
            </div>
          </div>
        </article>
        <article className="asset-card asset-trend-card"><header><h2>资产趋势</h2><div><i className="net" />总资产<i className="investable" />可支配资产</div></header><TrendChart dashboard={dashboard} /></article>
      </section>
      <section className="asset-breakdown-grid">
        <AssetClassBreakdownCard items={assetClassBreakdown} comparisonItems={referenceAssetClassBreakdown} />
      </section>
      </div>
      {comparisonOpen && <AssetComparisonDialog dashboard={dashboard} onClose={() => setComparisonOpen(false)} />}
      {settingsOpen && <OptionsDialog onClose={() => setSettingsOpen(false)} onSaved={() => { setSettingsOpen(false); void load(dashboard.snapshotId ?? undefined); }} />}
      {metricInfo && <AssetMetricInfoDialog metric={metricInfo} onClose={() => setMetricInfo(null)} />}
    </main>
  );
}
function ComparisonTrendChart({ current, baseline }: { current: AssetDashboard; baseline: AssetDashboard }) {
  const points = [
    { label: baseline.snapshotDate, netAssets: baseline.summary.netAssets, investableAssets: baseline.summary.investableAssets },
    { label: current.snapshotDate, netAssets: current.summary.netAssets, investableAssets: current.summary.investableAssets },
  ];
  const values = points.flatMap((item) => [item.netAssets, item.investableAssets]);
  const rawMinimum = Math.min(...values);
  const rawMaximum = Math.max(...values);
  const padding = Math.max((rawMaximum - rawMinimum) * .2, .5);
  const minimum = rawMinimum - padding;
  const maximum = rawMaximum + padding;
  const range = maximum - minimum || 1;
  const chartLeft = 88;
  const chartRight = 610;
  const y = (value: number) => 164 - (value - minimum) / range * 126;
  const ticks = Array.from({ length: 5 }, (_, index) => maximum - index * range / 4);

  return <div className="asset-trend-chart comparison-trend-chart">
    <svg viewBox="0 0 640 214" role="img" aria-label="所选两期总资产与可支配资产金额变化">
      <text x="8" y="15" className="asset-chart-axis-title">金额（万元）</text>
      {ticks.map((tick) => <g key={tick}>
        <line x1={chartLeft} x2={chartRight} y1={y(tick)} y2={y(tick)} className="asset-chart-grid" />
        <text x="55" y={y(tick) + 3} textAnchor="end" className="asset-chart-axis-label">{formatAmount(tick)}</text>
      </g>)}
      <path d={`M${chartLeft},${y(points[0].netAssets)} L${chartRight},${y(points[1].netAssets)}`} className="asset-chart-line net" />
      <path d={`M${chartLeft},${y(points[0].investableAssets)} L${chartRight},${y(points[1].investableAssets)}`} className="asset-chart-line investable" />
      {points.map((item, index) => {
        const pointX = index ? chartRight : chartLeft;
        return <g key={item.label}>
          <circle cx={pointX} cy={y(item.netAssets)} r="4" className="asset-chart-dot net" />
          <circle cx={pointX} cy={y(item.investableAssets)} r="4" className="asset-chart-dot investable" />
          <text x={pointX} y={y(item.netAssets) - 9} textAnchor="middle" className="asset-chart-value net">{formatAmount(item.netAssets)}</text>
          <text x={pointX} y={y(item.investableAssets) + 15} textAnchor="middle" className="asset-chart-value investable">{formatAmount(item.investableAssets)}</text>
          <text x={pointX} y="202" textAnchor="middle" className="asset-chart-date">{item.label}</text>
        </g>;
      })}
    </svg>
  </div>;
}

function ComparisonAssetClassCard({ currentItems, baselineItems }: { currentItems: AssetBreakdownItem[]; baselineItems: AssetBreakdownItem[] }) {
  const current = comparisonByLabel(currentItems);
  const baseline = comparisonByLabel(baselineItems);
  const labels = Array.from(new Set([...currentItems.map((item) => item.label), ...baselineItems.map((item) => item.label)]))
    .sort((left, right) => Math.abs(current.get(right)?.amount ?? 0) - Math.abs(current.get(left)?.amount ?? 0));

  return <article className="asset-card asset-compare-table-card">
    <header><h2>投资品种变化</h2><span>按当前总资产占比排序</span></header>
    <div className="asset-compare-table-wrap">
      <table className="asset-compare-table">
        <thead><tr><th>投资品种</th><th>基准（万元）</th><th>当前（万元）</th><th>变化</th><th /></tr></thead>
        <tbody>{labels.map((label) => {
          const before = baseline.get(label);
          const after = current.get(label);
          const delta = (after?.percent ?? 0) - (before?.percent ?? 0);
          const amountDelta = (after?.amount ?? 0) - (before?.amount ?? 0);
          const percentUnchanged = Math.abs(delta) < .005;
          const amountUnchanged = Math.abs(amountDelta) < .005;
          return <tr key={label}>
            <th><strong>{label}</strong></th>
            <td>{formatAmount(before?.amount ?? 0)}</td>
            <td>{formatAmount(after?.amount ?? 0)}</td>
            <td className={percentUnchanged || delta > 0 ? "up" : "down"}>{percentUnchanged ? "未变化" : `${delta > 0 ? "↑" : "↓"} ${Math.abs(delta).toFixed(2)}%`}</td>
            <td className={amountUnchanged || amountDelta > 0 ? "up" : "down"}>{formatSigned(amountUnchanged ? 0 : amountDelta)}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>
  </article>;
}

function ComparisonPurposeCard({ currentItems, baselineItems }: { currentItems: AssetBreakdownItem[]; baselineItems: AssetBreakdownItem[] }) {
  const current = comparisonByLabel(currentItems);
  const baseline = comparisonByLabel(baselineItems);
  const labels = Array.from(new Set([...currentItems.map((item) => item.label), ...baselineItems.map((item) => item.label)]))
    .sort((left, right) => (current.get(right)?.percent ?? 0) - (current.get(left)?.percent ?? 0));

  return <article className="asset-card asset-purpose-delta-card">
    <header><h2>资金用途变化</h2><span>基准 → 当前</span></header>
    <div className="asset-purpose-delta-list">{labels.map((label) => {
      const before = baseline.get(label);
      const after = current.get(label);
      const delta = (after?.percent ?? 0) - (before?.percent ?? 0);
      const unchanged = Math.abs(delta) < .005;
      return <div className="asset-purpose-delta-row" key={label}>
        <div><strong>{label}</strong><span>{formatAmount(after?.amount ?? 0)} 万元</span></div>
        <div className="asset-purpose-paired-bars">
          <span><i style={{ width: `${Math.min(Math.abs(before?.percent ?? 0), 100)}%` }} /></span>
          <span><i style={{ width: `${Math.min(Math.abs(after?.percent ?? 0), 100)}%` }} /></span>
        </div>
        <div className="asset-purpose-delta-values"><span>{(before?.percent ?? 0).toFixed(1)}% → {(after?.percent ?? 0).toFixed(1)}%</span><b className={unchanged || delta > 0 ? "up" : "down"}>{unchanged ? "未变化" : formatSigned(delta, "%")}</b></div>
      </div>;
    })}</div>
  </article>;
}
