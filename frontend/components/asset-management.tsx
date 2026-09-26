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
} from "@/lib/types";
import { CloseIcon, SearchIcon, SettingsIcon, TrashIcon } from "./icons";
import { NoteDateField } from "./investment-notes";

const PURPOSES: AssetPurpose[] = ["短期日用", "中期稳健", "长期投资", "不参与配置"];
const RISKS: AssetRiskLevel[] = ["低", "中", "高", "未分类"];

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
  options: readonly string[];
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

  return (
    <div ref={containerRef} className={`multi-filter asset-select ${className} ${open ? "open" : ""}`}>
      <button className="multi-filter-trigger" type="button" aria-expanded={open} aria-controls={`${id}-menu`} aria-required={required} onClick={() => setOpen((current) => !current)}>
        {label && <span>{label}</span>}
        <strong className={!value ? "placeholder" : undefined}>{value || "请选择"}</strong>
      </button>
      {open && (
        <div className="multi-filter-menu" id={`${id}-menu`}>
          {options.map((option) => <button key={option} type="button" className={value === option ? "active" : ""} onClick={() => { onChange(option); setOpen(false); }}>{option}</button>)}
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
  return <span className="asset-summary-icon" aria-hidden="true">{type}</span>;
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
  const points = dashboard.history;
  if (!points.length) {
    return <div className="asset-empty-chart">保存两期以上快照后显示资产趋势</div>;
  }
  const values = points.flatMap((item) => [item.netAssets, item.investableAssets]);
  const minimum = Math.min(...values, 0);
  const maximum = Math.max(...values, 1);
  const range = Math.max(maximum - minimum, 1);
  const x = (index: number) => points.length === 1 ? 320 : 34 + index * (572 / (points.length - 1));
  const y = (value: number) => 176 - ((value - minimum) / range) * 128;
  const path = (key: "netAssets" | "investableAssets") => points
    .map((item, index) => `${index ? "L" : "M"}${x(index)},${y(item[key])}`)
    .join(" ");

  return (
    <div className="asset-trend-chart">
      <svg viewBox="0 0 640 220" role="img" aria-label="总资产与可支配资产趋势">
        {[48, 80, 112, 144, 176].map((lineY) => (
          <line key={lineY} x1="34" x2="606" y1={lineY} y2={lineY} className="asset-chart-grid" />
        ))}
        <path d={path("netAssets")} className="asset-chart-line net" />
        <path d={path("investableAssets")} className="asset-chart-line investable" />
        {points.map((item, index) => (
          <g key={item.snapshotDate}>
            <circle cx={x(index)} cy={y(item.netAssets)} r="4" className="asset-chart-dot net" />
            <circle cx={x(index)} cy={y(item.investableAssets)} r="4" className="asset-chart-dot investable" />
            <text x={x(index)} y="207" textAnchor="middle">{item.snapshotDate.slice(5)}</text>
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
    purpose: "" as AssetPurpose,
    riskLevel: "" as AssetRiskLevel,
    isInvestable: true,
    sortOrder: index,
  };
}

type AssetOptionState = {
  assetCategories: string[];
  assetClasses: string[];
  purposes: string[];
  risks: string[];
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
  return { assetCategories: assetCategories.values, assetClasses: assetClasses.values, purposes: purposes.values, risks: risks.values };
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
    Promise.all([getAssetConfig(), loadAssetOptions()])
      .then(([value, optionValues]) => {
        const currentByPosition = new Map(dashboard.accounts.flatMap((account) => account.positions.map((position) => [position.id, position])));
        setConfig(value);
        setOptions(optionValues);
        setAccounts(value.accounts.map((account) => ({
          ...account,
          positions: account.positions.map((position) => {
            const current = position.id ? currentByPosition.get(position.id) : undefined;
            return { ...position, amount: String(current?.amount ?? 0), fxRate: current?.fxRate ?? 1, expectedAnnualRate: current?.expectedAnnualRate ?? null };
          }),
        })));
      })
      .catch(() => setError("无法读取资产记录配置"));
  }, [dashboard]);

  function updateAccount(index: number, patch: Partial<RecordAccount>) {
    setAccounts((current) => current?.map((account, accountIndex) => accountIndex === index ? { ...account, ...patch } : account) ?? null);
  }

  function addAccount(region: "境内" | "境外") {
    setAccounts((current) => [...(current ?? []), {
      id: null,
      name: "",
      region,
      currency: "人民币",
      assetCategory: options?.assetCategories[0] ?? "基金",
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
    if (accounts.some((account) => account.positions.some((position) => !position.riskLevel || !position.purpose))) {
      setError("请为所有持仓选择风险等级和资金用途后再保存。");
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
            purpose: position.purpose,
            riskLevel: position.riskLevel,
            isInvestable: position.isInvestable,
            sortOrder: positionIndex,
          })),
        })),
      });
      const draftByIdentity = new Map(accounts.flatMap((account) => account.positions.map((position) => [`${account.name}\u0000${position.name}`, position])));
      const payload: AssetSnapshotPayload = {
        snapshotDate,
        note: note.trim() || null,
        targets,
        items: savedConfig.accounts.flatMap((account) => account.positions.map((position) => {
          const draft = draftByIdentity.get(`${account.name}\u0000${position.name}`);
          return { positionId: position.id as number, amount: Number(draft?.amount || 0), fxRate: draft?.fxRate || 1, expectedAnnualRate: draft?.expectedAnnualRate ?? null };
        })),
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
                                      <label><span>资产类别</span><AssetSelect id={`record-account-category-${accountIndex}`} value={account.assetCategory} options={options.assetCategories} onChange={(value) => updateAccount(accountIndex, { assetCategory: value })} /></label>
                                      <label><span>当前总额</span><output>{formatAmount(account.positions.reduce((total, item) => total + Number(item.amount || 0), 0))}</output></label>
                                    </div>
                                    <div className="asset-record-account-actions">
                                      <label><span>计划金额</span><input type="number" step="0.1" value={account.targetAmount ?? ""} onChange={(event) => updateAccount(accountIndex, { targetAmount: event.target.value ? Number(event.target.value) : null })} placeholder="可选" /></label>
                                      <button type="button" onClick={() => setAccounts((current) => current?.filter((_, index) => index !== accountIndex) ?? null)}><TrashIcon /><span>删除账户</span></button>
                                    </div>
                                  </th>
                                )}
                                {position ? <>
                                  <td><AssetSelect id={`record-class-${accountIndex}-${positionIndex}`} value={position.assetClass} options={options.assetClasses} onChange={(value) => updateAccount(accountIndex, { positions: account.positions.map((item, index) => index === positionIndex ? { ...item, name: item.id ? item.name : value, assetClass: value } : item) })} /></td>
                                  <td><AssetSelect id={`record-risk-${accountIndex}-${positionIndex}`} value={position.riskLevel} options={options.risks} required className={!position.riskLevel ? "is-empty" : ""} onChange={(value) => updateAccount(accountIndex, { positions: account.positions.map((item, index) => index === positionIndex ? { ...item, riskLevel: value } : item) })} /></td>
                                  <td><AssetSelect id={`record-purpose-${accountIndex}-${positionIndex}`} value={position.purpose} options={options.purposes} required className={!position.purpose ? "is-empty" : ""} onChange={(value) => updateAccount(accountIndex, { positions: account.positions.map((item, index) => index === positionIndex ? { ...item, purpose: value } : item) })} /></td>
                                  <td className="asset-record-check-cell"><label className={`tag-filter-checkbox asset-config-checkbox ${position.isInvestable ? "active" : ""}`} aria-label="计入资产配置"><input type="checkbox" checked={position.isInvestable} onChange={(event) => updateAccount(accountIndex, { positions: account.positions.map((item, index) => index === positionIndex ? { ...item, isInvestable: event.target.checked } : item) })} /><i aria-hidden="true">{position.isInvestable ? "✓" : ""}</i></label></td>
                                  <td><input className="asset-record-amount" type="number" step="0.1" value={position.amount} onChange={(event) => updateAccount(accountIndex, { positions: account.positions.map((item, index) => index === positionIndex ? { ...item, amount: event.target.value } : item) })} required /></td>
                                  <td className="asset-record-action-cell"><div className="asset-record-action-buttons"><button className="asset-position-drag-handle" type="button" draggable aria-label="拖动调整持仓顺序" title="拖动调整顺序" onDragStart={(event) => { setDraggedPosition({ accountIndex, positionIndex }); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", `${accountIndex}:${positionIndex}`); }} onDragEnd={() => { setDraggedPosition(null); setDragOverPosition(null); }}><span aria-hidden="true">⠿</span></button><button className="asset-position-delete" type="button" aria-label="删除持仓" title="删除持仓" onClick={() => updateAccount(accountIndex, { positions: account.positions.filter((_, index) => index !== positionIndex) })}><TrashIcon /></button></div></td>
                                </> : <td className="asset-record-empty" colSpan={6}>暂无持仓</td>}
                              </tr>
                            ))}
                            <tr className="asset-record-add-row"><td colSpan={6}><button className="asset-add-position" type="button" onClick={() => updateAccount(accountIndex, { positions: [...account.positions, { ...newPosition(account.positions.length), name: options.assetClasses[0], assetClass: options.assetClasses[0], amount: "0", fxRate: 1, expectedAnnualRate: null }] })}>＋ 添加持仓</button></td></tr>
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

function AssetOptionEditor({ title, values, required, onChange }: { title: string; values: string[]; required: readonly string[]; onChange: (values: string[]) => void }) {
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

  return <section className="asset-option-editor"><header><h3>{title}</h3></header><div>{values.map((value, index) => <div className={`asset-option-row${draggedIndex === index ? " dragging" : ""}${dragOverIndex === index ? " drag-over" : ""}`} key={String(index)} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDragOverIndex(index); }} onDrop={(event) => dropAt(event, index)}><button className="drag-handle" type="button" draggable aria-label={`拖动调整${value}顺序`} title="拖动调整顺序" onDragStart={(event) => { setDraggedIndex(index); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", String(index)); }} onDragEnd={() => { setDraggedIndex(null); setDragOverIndex(null); }}><span aria-hidden="true">⠿</span></button><input aria-label={`${title}选项 ${index + 1}`} value={value} disabled={required.includes(value)} onChange={(event) => onChange(values.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} /><div className="asset-option-actions"><button className="delete" type="button" aria-label={`删除${value}`} title="删除" disabled={required.includes(value)} onClick={() => onChange(values.filter((_, itemIndex) => itemIndex !== index))}><TrashIcon /></button></div></div>)}<button className="asset-option-add" type="button" onClick={() => onChange([...values, ""])}>＋ 添加</button></div></section>;
}

function OptionsDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [options, setOptions] = useState<AssetOptionState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { loadAssetOptions().then(setOptions).catch(() => setError("无法读取配置")); }, []);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!options) return;
    setSaving(true); setError(null);
    try {
      await Promise.all([
        updateContentOptions("asset_category", options.assetCategories),
        updateContentOptions("asset_class", options.assetClasses),
        updateContentOptions("asset_purpose", options.purposes),
        updateContentOptions("asset_risk", options.risks),
      ]);
      onSaved();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "保存配置失败"); }
    finally { setSaving(false); }
  }
  return <div className="asset-dialog-overlay" role="presentation" onMouseDown={onClose}><section className="asset-dialog asset-options-dialog" role="dialog" aria-modal="true" aria-labelledby="options-title" onMouseDown={(event) => event.stopPropagation()}><header><div><span>资产配置</span><h2 id="options-title">选项配置</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="关闭"><CloseIcon /></button></header>{!options ? <div className="asset-dialog-loading">{error ?? "正在读取…"}</div> : <form onSubmit={submit}><div className="asset-option-grid"><AssetOptionEditor title="资产类别" values={options.assetCategories} required={[]} onChange={(values) => setOptions({ ...options, assetCategories: values })} /><AssetOptionEditor title="投资品种" values={options.assetClasses} required={[]} onChange={(values) => setOptions({ ...options, assetClasses: values })} /><AssetOptionEditor title="资金用途" values={options.purposes} required={[]} onChange={(values) => setOptions({ ...options, purposes: values })} /><AssetOptionEditor title="风险等级" values={options.risks} required={[]} onChange={(values) => setOptions({ ...options, risks: values })} /></div>{error && <p className="asset-form-error">{error}</p>}<footer><button type="button" onClick={onClose}>取消</button><button className="primary" type="submit" disabled={saving}>{saving ? "保存中…" : "保存配置"}</button></footer></form>}</section></div>;
}

export function AssetManagement() {
  const [dashboard, setDashboard] = useState<AssetDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recordMode, setRecordMode] = useState<"create" | "edit" | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [metricInfo, setMetricInfo] = useState<AssetMetricInfo | null>(null);
  const [holdingSearch, setHoldingSearch] = useState("");
  const [regionFilter, setRegionFilter] = useState("全部地域");
  const [purposeFilter, setPurposeFilter] = useState("全部用途");
  const [riskFilter, setRiskFilter] = useState("全部风险");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDashboard(await getAssetDashboard());
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

  const deviations = useMemo(() => dashboard?.allocations.filter(
    (item) => Math.abs(item.deviationPercent) >= item.warningThreshold,
  ) ?? [], [dashboard]);

  const filteredAccounts = useMemo(() => {
    const keyword = holdingSearch.trim().toLocaleLowerCase("zh-CN");
    return dashboard?.accounts
      .filter((account) => regionFilter === "全部地域" || account.region === regionFilter)
      .map((account) => ({
        ...account,
        positions: account.positions.filter((position) => {
          const matchesKeyword = !keyword || [account.name, position.assetClass]
            .some((value) => value.toLocaleLowerCase("zh-CN").includes(keyword));
          const matchesPurpose = purposeFilter === "全部用途" || position.purpose === purposeFilter;
          const matchesRisk = riskFilter === "全部风险" || position.riskLevel === riskFilter;
          return matchesKeyword && matchesPurpose && matchesRisk;
        }),
      }))
      .filter((account) => account.positions.length > 0) ?? [];
  }, [dashboard, holdingSearch, purposeFilter, regionFilter, riskFilter]);

  const filtersActive = Boolean(holdingSearch)
    || regionFilter !== "全部地域"
    || purposeFilter !== "全部用途"
    || riskFilter !== "全部风险";
  const filteredPositionCount = filteredAccounts.reduce(
    (total, account) => total + account.positions.length,
    0,
  );
  const accountTables = (["境内", "境外"] as const)
    .filter((region) => regionFilter === "全部地域" || regionFilter === region)
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

  return (
    <main className="asset-page page-width">
      <header className="asset-page-head">
        <div><h1>资产管理</h1><p>一次录入，自动汇总，历史可追溯</p></div>
        <div className="asset-page-actions">{!recordMode && <button className="primary" type="button" onClick={() => setRecordMode("create")}>＋ 新增记录</button>}<button className="icon-button asset-settings-button" type="button" onClick={() => setSettingsOpen(true)} aria-label="资产设置" title="资产设置"><SettingsIcon /></button></div>
      </header>
      <section className="asset-detail-grid asset-detail-first">
        <article className={`asset-card asset-holdings-card ${recordMode ? "editing" : ""}`}>
          <header><h2>{recordMode === "create" ? "新增资产记录" : recordMode === "edit" ? "编辑资产记录" : "账户与持仓"}</h2>{!recordMode && dashboard.snapshotId && <div className="asset-holdings-head-actions"><button type="button" onClick={() => setRecordMode("edit")}>编辑</button></div>}</header>
          {recordMode ? <RecordDialog dashboard={dashboard} mode={recordMode} onClose={() => setRecordMode(null)} onSaved={(value) => { setDashboard(value); setRecordMode(null); }} /> : <>
            <div className="asset-holdings-filters">
              <label className="search-box asset-holdings-search"><SearchIcon /><input value={holdingSearch} onChange={(event) => setHoldingSearch(event.target.value)} placeholder="搜索账户或投资品种" aria-label="搜索账户或投资品种" />{holdingSearch && <button type="button" onClick={() => setHoldingSearch("")} aria-label="清空搜索"><CloseIcon /></button>}</label>
              <AssetSelect id="asset-region-filter" label="地域" value={regionFilter} options={["全部地域", "境内", "境外"]} onChange={setRegionFilter} />
              <AssetSelect id="asset-purpose-filter" label="用途" value={purposeFilter} options={["全部用途", ...PURPOSES]} onChange={setPurposeFilter} />
              <AssetSelect id="asset-risk-filter" label="风险" value={riskFilter} options={["全部风险", ...RISKS]} onChange={setRiskFilter} />
              <span className="asset-filter-count">{filteredPositionCount} 项</span>
              {filtersActive && <button type="button" onClick={() => { setHoldingSearch(""); setRegionFilter("全部地域"); setPurposeFilter("全部用途"); setRiskFilter("全部风险"); }}>重置</button>}
            </div>
            <div className="asset-region-tables">
              {accountTables.map((group) => (
                <div className="asset-table-wrap" key={group.region}>
                  <table>
                    <thead><tr><th>{group.region}账户</th><th>投资品种</th><th>风险等级</th><th>资金用途</th><th>当前金额</th><th>占比</th></tr></thead>
                    <tbody>{group.accounts.length ? group.accounts.flatMap((account) => account.positions.map((position, positionIndex) => <tr key={position.id}>{positionIndex === 0 && <th className="asset-account-cell" rowSpan={account.positions.length}><div className="asset-account-heading"><strong>{account.name}</strong><span className="asset-category-pill">{account.assetCategory}</span></div><small>{formatAmount(account.positions.reduce((total, item) => total + item.amountCny, 0))} 万元</small></th>}<td>{position.assetClass}</td><td><span className={`risk-pill risk-${position.riskLevel}`}>{position.riskLevel}</span></td><td><span className={`purpose-pill purpose-${position.purpose}`}>{position.purpose}</span></td><td className="asset-current-amount"><strong>{formatAmount(position.amountCny)}</strong> 万元</td><td className="asset-current-share">{dashboard.summary.netAssets ? `${(position.amountCny / dashboard.summary.netAssets * 100).toFixed(1)}%` : "—"}</td></tr>)) : <tr><td className="asset-filter-empty" colSpan={6}>没有符合当前筛选条件的{group.region}持仓</td></tr>}</tbody>
                  </table>
                </div>
              ))}
            </div>
          </>}
        </article>
      </section>
      <section className="asset-summary-grid">
        {cards.map(([label, value, icon, infoKey]) => (
          <article key={label}><SummaryIcon type={icon} /><div><span>{label}{infoKey && <button className="asset-metric-info" type="button" aria-label={`查看${label}含义`} onClick={() => setMetricInfo(infoKey)}>!</button>}</span><strong>{formatAmount(value)} <small>万</small></strong></div></article>
        ))}
      </section>
      <section className="asset-insight-grid">
        <article className="asset-card asset-allocation-card">
          <header><h2>风险配置</h2><div><i className="target" />目标比例<i className="actual" />实际比例</div></header>
          <div className="asset-allocation-body">
            <div className="asset-risk-list">
              {dashboard.allocations.map((item) => {
                const deviation = deviations.find((entry) => entry.riskLevel === item.riskLevel);
                const warning = Boolean(deviation && deviation.deviationPercent > 0 && deviation.riskLevel !== "低");
                return (
                  <div className="asset-risk-row" key={item.riskLevel}>
                    <strong>{item.riskLevel}风险</strong>
                    <div className="asset-risk-meter">
                      <div className="asset-risk-values"><span>目标 {item.targetPercent.toFixed(0)}%</span><strong style={{ left: `${Math.min(Math.max(item.actualPercent, 0), 100)}%` }}>实际 {item.actualPercent.toFixed(0)}%</strong></div>
                      <div className="asset-risk-bars"><span className="target" style={{ width: `${Math.min(item.targetPercent, 100)}%` }} /><span className="actual" style={{ width: `${Math.min(item.actualPercent, 100)}%` }} /></div>
                    </div>
                    {deviation
                      ? <div className={`asset-risk-reminder ${warning ? "over" : "under"}`}><b>{warning ? "!" : "✓"}</b><span><strong>{item.riskLevel}风险{deviation.deviationPercent > 0 ? "偏高" : "偏低"} {Math.abs(deviation.deviationPercent).toFixed(0)}%</strong></span></div>
                      : <div className="asset-risk-reminder balanced"><b>✓</b><span><strong>{item.riskLevel}风险在目标范围内</strong></span></div>}
                  </div>
                );
              })}
            </div>
          </div>
        </article>
        <article className="asset-card asset-trend-card"><header><h2>资产趋势</h2><div><i className="net" />总资产<i className="investable" />可支配资产</div></header><TrendChart dashboard={dashboard} /></article>
      </section>
      {settingsOpen && <OptionsDialog onClose={() => setSettingsOpen(false)} onSaved={() => { setSettingsOpen(false); void load(); }} />}
      {metricInfo && <AssetMetricInfoDialog metric={metricInfo} onClose={() => setMetricInfo(null)} />}
    </main>
  );
}
