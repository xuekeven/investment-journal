import { useEffect, useRef, useState } from "react";
import type { DragEvent, FormEvent } from "react";
import { createPortal } from "react-dom";

import { getFundBlacklist, saveFundBlacklist } from "@/lib/api";
import type { FundBlacklist, FundBlacklistItem } from "@/lib/types";
import { CloseIcon, TrashIcon } from "./icons";

type DraftItem = FundBlacklistItem & { key: string };
type EntryType = "companies" | "codes";
type Draft = Record<EntryType, DraftItem[]>;

function makeDraft(data: FundBlacklist): Draft {
  return {
    companies: data.companies.map((item) => ({ ...item, key: crypto.randomUUID() })),
    codes: data.codes.map((item) => ({ ...item, key: crypto.randomUUID() })),
  };
}

const EMPTY: FundBlacklist = { companies: [], codes: [] };

export function FundBlacklistDialog({ onClose }: { onClose: () => void }) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [data, setData] = useState<FundBlacklist>(EMPTY);
  const [draft, setDraft] = useState<Draft>(() => makeDraft(EMPTY));
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragged, setDragged] = useState<{ type: EntryType; index: number } | null>(null);
  const [dragOver, setDragOver] = useState<{ type: EntryType; index: number } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getFundBlacklist(controller.signal)
      .then((result) => { setData(result); setDraft(makeDraft(result)); setError(null); })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "加载失败");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !saving) onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => { window.removeEventListener("keydown", closeOnEscape); previousFocus?.focus(); };
  }, [onClose, saving]);

  function beginEdit() {
    setDraft(makeDraft(data));
    setError(null);
    setEditing(true);
  }

  function cancelEdit() {
    setDraft(makeDraft(data));
    setError(null);
    setEditing(false);
  }

  function update(type: EntryType, key: string, field: "value" | "managerName" | "fundName" | "reason", value: string) {
    setDraft((current) => ({
      ...current,
      [type]: current[type].map((item) => item.key === key ? { ...item, [field]: value } : item),
    }));
  }

  function add(type: EntryType) {
    setDraft((current) => ({
      ...current,
      [type]: [...current[type], { key: crypto.randomUUID(), id: null, value: "", managerName: "", fundName: "", reason: "" }],
    }));
  }

  function remove(type: EntryType, key: string) {
    setDraft((current) => ({
      ...current,
      [type]: current[type].filter((item) => item.key !== key),
    }));
  }

  function beginDrag(event: DragEvent<HTMLButtonElement>, type: EntryType, index: number) {
    setDragged({ type, index });
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(index));
  }

  function dropAt(event: DragEvent<HTMLTableRowElement>, type: EntryType, index: number) {
    event.preventDefault();
    if (dragged?.type === type && dragged.index !== index) {
      setDraft((current) => {
        const rows = [...current[type]];
        const [moved] = rows.splice(dragged.index, 1);
        rows.splice(index, 0, moved);
        return { ...current, [type]: rows };
      });
    }
    setDragged(null);
    setDragOver(null);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload: FundBlacklist = {
      companies: draft.companies.map(({ id, value, managerName, reason }) => ({ id, value: value.trim(), managerName: managerName.trim(), fundName: "", reason: reason.trim() })),
      codes: draft.codes.map(({ id, value, fundName, reason }) => ({ id, value: value.trim(), managerName: "", fundName: fundName.trim(), reason: reason.trim() })),
    };
    for (const [type, label] of [["companies", "基金公司"], ["codes", "基金代码"]] as const) {
      const values = payload[type].map((item) => item.value);
      if (values.some((value) => !value)) { setError(`${label}不能为空`); return; }
      if (type === "companies" && payload.companies.some((item) => !item.managerName)) {
        setError("基金经理不能为空"); return;
      }
      const keys = type === "companies"
        ? payload.companies.map((item) => `${item.managerName}\u0000${item.value}`)
        : values;
      if (new Set(keys).size !== keys.length) {
        setError(type === "companies" ? "基金经理与基金公司组合不能重复" : `${label}不能重复`);
        return;
      }
    }
    setSaving(true);
    setError(null);
    try {
      const result = await saveFundBlacklist(payload);
      setData(result);
      setDraft(makeDraft(result));
      setEditing(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存失败，请稍后重试。");
    } finally {
      setSaving(false);
    }
  }

  function table(type: EntryType, title: string, column: string) {
    const rows = editing ? draft[type] : data[type];
    return (
      <section className="blacklist-section">
        <h3>{title}</h3>
        <div className="blacklist-table-wrap">
          <table className={`blacklist-table ${type === "codes" ? "blacklist-code-table" : "blacklist-manager-table"}`}>
            <thead><tr>{editing && <th className="blacklist-drag-cell" aria-label="排序" />}
              {type === "companies" && <th className="blacklist-manager-column">基金经理</th>}
              <th className="blacklist-value-column">{column}</th>
              {type === "codes" && <th className="blacklist-name-column">基金名称</th>}
              <th>原因</th>{editing && <th className="blacklist-delete-cell" aria-label="操作" />}
            </tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td className="blacklist-empty" colSpan={editing ? 5 : 3}>暂无记录</td></tr>}
              {rows.map((item, index) => (
                <tr
                  key={editing ? (item as DraftItem).key : item.id}
                  className={dragged?.type === type && dragged.index === index ? "dragging" : dragOver?.type === type && dragOver.index === index ? "drag-over" : ""}
                  onDragOver={editing ? (event) => {
                    if (dragged?.type !== type) return;
                    event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDragOver({ type, index });
                  } : undefined}
                  onDrop={editing ? (event) => dropAt(event, type, index) : undefined}
                >
                  {editing && <td className="blacklist-drag-cell"><button className="drag-handle" type="button" draggable={!saving} disabled={saving} aria-label={`拖动调整${item.value || column}顺序`} title="拖动调整顺序" onDragStart={(event) => beginDrag(event, type, index)} onDragEnd={() => { setDragged(null); setDragOver(null); }}>⠿</button></td>}
                  {type === "companies" && <td className="blacklist-manager-cell">{editing ? <input value={item.managerName} maxLength={200} disabled={saving} aria-label={`基金经理 ${index + 1}`} placeholder="基金经理" onChange={(event) => update(type, (item as DraftItem).key, "managerName", event.target.value)} /> : <strong>{item.managerName}</strong>}</td>}
                  <td className="blacklist-value-cell">{editing ? <input value={item.value} maxLength={200} disabled={saving} aria-label={`${column} ${index + 1}`} onChange={(event) => update(type, (item as DraftItem).key, "value", event.target.value)} /> : <strong>{item.value}</strong>}</td>
                  {type === "codes" && <td className="blacklist-name-cell">{editing ? <input value={item.fundName} maxLength={200} disabled={saving} aria-label={`基金名称 ${index + 1}`} placeholder="基金名称" onChange={(event) => update(type, (item as DraftItem).key, "fundName", event.target.value)} /> : item.fundName ? <strong>{item.fundName}</strong> : <span className="blacklist-muted">—</span>}</td>}
                  <td>{editing ? <input value={item.reason} maxLength={1000} disabled={saving} aria-label={`${title}原因 ${index + 1}`} placeholder="填写原因（可选）" onChange={(event) => update(type, (item as DraftItem).key, "reason", event.target.value)} /> : item.reason || <span className="blacklist-muted">—</span>}</td>
                  {editing && <td className="blacklist-delete-cell"><button className="blacklist-delete" type="button" disabled={saving} aria-label={`删除${item.value || column}`} title="删除" onClick={() => remove(type, (item as DraftItem).key)}><TrashIcon /></button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {editing && <button className="content-option-add" type="button" disabled={saving} onClick={() => add(type)}>＋ 添加{type === "companies" ? "基金经理" : column}</button>}
      </section>
    );
  }

  return createPortal(
    <div className="comparison-overlay blacklist-overlay" role="dialog" aria-modal="true" aria-labelledby="blacklist-title">
      <div className="tagged-funds-sheet blacklist-sheet">
        <header className="comparison-header">
          <div><span className="section-kicker">投资记录</span><h2 id="blacklist-title">黑名单</h2></div>
          <div className="tagged-header-actions">
            {!editing && !loading && !error && <button className="tagged-edit-button" type="button" onClick={beginEdit}>编辑</button>}
            <button ref={closeButtonRef} className="icon-button" type="button" disabled={saving} onClick={onClose} aria-label="关闭黑名单"><CloseIcon /></button>
          </div>
        </header>
        {loading ? <div className="blacklist-state">正在加载…</div> : error && !editing ? <div className="blacklist-state" role="alert">{error}<button type="button" onClick={() => { setLoading(true); getFundBlacklist().then((result) => { setData(result); setDraft(makeDraft(result)); setError(null); }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "加载失败")).finally(() => setLoading(false)); }}>重试</button></div> : (
          <form className="blacklist-form" onSubmit={(event) => void save(event)}>
            <div className="blacklist-content">
              {table("codes", "基金代码", "基金代码")}
              {table("companies", "基金经理", "基金公司")}
              {error && <p className="content-option-error" role="alert">{error}</p>}
            </div>
            {editing && <footer className="content-option-actions blacklist-actions"><button type="button" disabled={saving} onClick={cancelEdit}>取消</button><button className="primary" type="submit" disabled={saving}>{saving ? "保存中…" : "保存"}</button></footer>}
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
}
