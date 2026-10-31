import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { getFundDeviationHistory } from "@/lib/api";
import type { DeviationPoint, DeviationSeriesResponse, FundComparisonRow } from "@/lib/types";
import { CloseIcon } from "./icons";


function formatPercent(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatDate(value: string) {
  return value.replaceAll("-", "/");
}

function DeviationChart({ items }: { items: DeviationPoint[] }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const width = 760;
  const height = 320;
  const left = 84;
  const right = 20;
  const top = 24;
  const bottom = 43;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const dates = items.map((item) => Date.parse(`${item.date}T00:00:00Z`));
  const firstDate = dates[0];
  const dateSpan = dates[dates.length - 1] - firstDate;
  const rawMinimum = Math.min(0, ...items.map((item) => item.value));
  const rawMaximum = Math.max(0, ...items.map((item) => item.value));
  const padding = Math.max((rawMaximum - rawMinimum) * 0.1, 0.5);
  const minimum = rawMinimum - padding;
  const maximum = rawMaximum + padding;
  const range = maximum - minimum;
  const x = (index: number) => dateSpan === 0
    ? left + plotWidth / 2
    : left + ((dates[index] - firstDate) / dateSpan) * plotWidth;
  const y = (value: number) => top + ((maximum - value) / range) * plotHeight;
  const path = items.map((item, index) => (
    `${index === 0 || dates[index] - dates[index - 1] > 10 * 86_400_000 ? "M" : "L"}${x(index).toFixed(1)},${y(item.value).toFixed(1)}`
  )).join(" ");
  const selectedIndex = activeIndex ?? items.length - 1;
  const selected = items[selectedIndex];
  const ticks = Array.from({ length: 5 }, (_, index) => minimum + (range * index) / 4);
  const highest = Math.max(...items.map((item) => item.value));
  const lowest = Math.min(...items.map((item) => item.value));
  const average = items.reduce((total, item) => total + item.value, 0) / items.length;
  const references = [highest, average, lowest].filter((value, index, all) =>
    all.findIndex((other) => Math.abs(other - value) < 0.0001) === index
  );
  const statistics = [
    { label: "最高", value: highest },
    { label: "平均", value: average },
    { label: "最低", value: lowest },
  ];
  const occupiedLabelYs = ticks.map(y);
  const labels = statistics.map((statistic) => {
    const lineY = y(statistic.value);
    let labelY = lineY;
    for (let offset = 0; offset <= plotHeight; offset += 1) {
      const candidates = offset === 0 ? [lineY] : [lineY - offset, lineY + offset];
      const available = candidates.find((candidate) =>
        candidate >= top + 8 && candidate <= top + plotHeight - 8
        && occupiedLabelYs.every((other) => Math.abs(candidate - other) >= 16)
      );
      if (available !== undefined) {
        labelY = available;
        break;
      }
    }
    occupiedLabelYs.push(labelY);
    return { ...statistic, lineY, labelY };
  });

  return (
    <>
      <div className="deviation-chart-wrap">
        <svg viewBox={`0 0 ${width} ${height}`} role="img"
          aria-label={`近一年场内基金偏离率折线图。最高 ${formatPercent(highest)}，平均 ${formatPercent(average)}，最低 ${formatPercent(lowest)}`}>
          {ticks.map((tick) => (
            <g key={tick}>
              <line className="deviation-chart-grid" x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} />
              <text className="deviation-chart-axis" x={left - 10} y={y(tick) + 4} textAnchor="end">{tick.toFixed(1)}%</text>
            </g>
          ))}
          <line className="deviation-chart-zero" x1={left} x2={width - right} y1={y(0)} y2={y(0)} />
          {references.map((value) => (
            <line key={value} className={value === average ? "deviation-chart-reference average" : "deviation-chart-reference"}
              x1={left} x2={width - right} y1={y(value)} y2={y(value)} />
          ))}
          {labels.map(({ label, value, lineY, labelY }) => (
            <g key={label}>
              {Math.abs(labelY - lineY) > 1 && (
                <path className="deviation-chart-label-leader" d={`M ${left - 6} ${labelY} L ${left - 6} ${lineY} L ${left} ${lineY}`} />
              )}
              <text className="deviation-chart-stat-label" x={left - 10} y={labelY + 4} textAnchor="end">
                {label}<tspan className="deviation-chart-stat-value" dx="5">{formatPercent(value)}</tspan>
              </text>
            </g>
          ))}
          <path className="deviation-chart-line" d={path} />
          <rect x={left} y={top} width={plotWidth} height={plotHeight} fill="transparent"
            onPointerMove={(event) => {
              const bounds = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
              if (!bounds) return;
              const pointerX = ((event.clientX - bounds.left) / bounds.width) * width;
              let closest = 0;
              for (let index = 1; index < items.length; index += 1) {
                if (Math.abs(x(index) - pointerX) < Math.abs(x(closest) - pointerX)) closest = index;
              }
              setActiveIndex(closest);
            }}
            onPointerLeave={() => setActiveIndex(null)} />
          <line className="deviation-chart-cursor" x1={x(selectedIndex)} x2={x(selectedIndex)} y1={top} y2={top + plotHeight} />
          <circle className="deviation-chart-dot" cx={x(selectedIndex)} cy={y(selected.value)} r="5" />
          {items.length === 1 ? (
            <text className="deviation-chart-axis" x={x(0)} y={height - 12} textAnchor="middle">{formatDate(items[0].date)}</text>
          ) : (
            <>
              <text className="deviation-chart-axis" x={left} y={height - 12} textAnchor="start">{formatDate(items[0].date)}</text>
              {items.length > 2 && <text className="deviation-chart-axis" x={x(Math.floor(items.length / 2))} y={height - 12} textAnchor="middle">{formatDate(items[Math.floor(items.length / 2)].date)}</text>}
              <text className="deviation-chart-axis" x={width - right} y={height - 12} textAnchor="end">{formatDate(items[items.length - 1].date)}</text>
            </>
          )}
        </svg>
      </div>
      <div className="deviation-chart-detail" aria-live="polite">
        <strong>{formatDate(selected.date)} · 偏离 {formatPercent(selected.value)}</strong>
        <span>收盘价 {selected.closePrice.toFixed(3)} · 单位净值 {selected.unitNav.toFixed(4)}（净值日 {formatDate(selected.navDate)}）</span>
      </div>
    </>
  );
}


export function DeviationHistoryDialog({
  fund,
  onClose,
}: {
  fund: FundComparisonRow;
  onClose: () => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [series, setSeries] = useState<DeviationSeriesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    getFundDeviationHistory(fund.code, controller.signal)
      .then((result) => { setSeries(result); setError(false); })
      .catch((reason: unknown) => {
        if (reason instanceof Error && reason.name === "AbortError") return;
        setError(true);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [fund.code, retry]);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
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

  const items = series?.items ?? [];
  return createPortal(
    <div className="comparison-overlay deviation-history-overlay" role="dialog" aria-modal="true"
      aria-labelledby="deviation-history-title">
      <div className="comparison-sheet deviation-history-sheet">
        <header className="comparison-header">
          <div>
            <span className="section-kicker">场内基金 · 近一年</span>
            <h2 id="deviation-history-title">{fund.code} {fund.displayName} 偏离率</h2>
          </div>
          <button ref={closeButtonRef} className="icon-button" type="button" onClick={onClose} aria-label="关闭偏离率走势">
            <CloseIcon />
          </button>
        </header>
        <div className="deviation-history-content">
          {loading ? <div className="deviation-history-state"><span className="spinner" /><p>正在加载偏离率历史…</p></div>
            : error ? <div className="deviation-history-state"><p>偏离率历史加载失败。</p><button type="button" onClick={() => { setLoading(true); setRetry((value) => value + 1); }}>重试</button></div>
              : items.length === 0 ? <div className="deviation-history-state"><p>近一年暂无可计算的偏离率记录。</p></div>
                : <>
                  <p className="deviation-history-summary">近一年已记录 <strong>{items.length}</strong> 个交易日，现有数据从 {formatDate(items[0].date)} 至 {formatDate(items[items.length - 1].date)}。</p>
                  <DeviationChart key={fund.code} items={items} />
                  <p className="deviation-history-note">偏离率 =（收盘价 ÷ 正式单位净值 − 1）× 100%。QDII 使用收盘日前最近的净值日期（最多相差 7 天）；历史回算不代表该净值在当日收盘时已披露。</p>
                </>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
