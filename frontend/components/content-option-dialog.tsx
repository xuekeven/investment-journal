"use client";

import { useEffect, useState } from "react";
import type { DragEvent, FormEvent } from "react";
import type { ContentOptionItem } from "@/lib/types";

import { CloseIcon, TrashIcon } from "./icons";

type ContentOptionDialogProps = {
  pageTitle: string;
  itemLabel: string;
  items: ContentOptionItem[];
  onClose: () => void;
  onSave: (items: ContentOptionItem[]) => Promise<void>;
};

export function ContentOptionDialog({
  pageTitle,
  itemLabel,
  items,
  onClose,
  onSave,
}: ContentOptionDialogProps) {
  const [draft, setDraft] = useState<ContentOptionItem[]>(items.length > 0 ? items : [{ id: null, value: "" }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !saving) onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, saving]);

  function update(index: number, value: string) {
    setDraft((current) => current.map((item, itemIndex) => (
      itemIndex === index ? { ...item, value } : item
    )));
  }

  function beginDrag(event: DragEvent<HTMLButtonElement>, index: number) {
    setDraggedIndex(index);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(index));
  }

  function dropAt(event: DragEvent<HTMLDivElement>, targetIndex: number) {
    event.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex) {
      setDragOverIndex(null);
      return;
    }
    setDraft((current) => {
      const next = [...current];
      const [moved] = next.splice(draggedIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
    setDraggedIndex(null);
    setDragOverIndex(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = draft.map((item) => ({ ...item, value: item.value.trim() })).filter((item) => item.value);
    if (normalized.length === 0) {
      setError(`至少保留一个${itemLabel}。`);
      return;
    }
    if (new Set(normalized.map((item) => item.value)).size !== normalized.length) {
      setError(`${itemLabel}不能重复。`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(normalized);
      onClose();
    } catch {
      setError("保存失败，请检查数据服务后重试。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="content-option-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <section
        className="content-option-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="content-option-title"
      >
        <form onSubmit={submit}>
          <header className="content-option-head">
            <div>
              <span className="section-kicker">页面设置</span>
              <h2 id="content-option-title">{pageTitle}管理</h2>
            </div>
            <button className="icon-button" type="button" onClick={onClose} disabled={saving} aria-label="关闭">
              <CloseIcon />
            </button>
          </header>
          <p className="content-option-help">统一管理本页面使用的可配置字段。</p>
          <section className="content-option-section">
            <header className="content-option-section-head">
              <h3>{itemLabel}选项</h3>
            </header>
            <div className="content-option-list">
            {draft.map((item, index) => (
              <div
                className={`content-option-row${draggedIndex === index ? " dragging" : ""}${dragOverIndex === index ? " drag-over" : ""}`}
                key={item.id ?? `new-${index}`}
                onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDragOverIndex(index); }}
                onDrop={(event) => dropAt(event, index)}
              >
                <button className="drag-handle" type="button" draggable={!saving} disabled={saving} aria-label={`拖动调整${item.value || itemLabel}顺序`} title="拖动调整顺序" onDragStart={(event) => beginDrag(event, index)} onDragEnd={() => { setDraggedIndex(null); setDragOverIndex(null); }}><span aria-hidden="true">⠿</span></button>
                <input
                  autoFocus={index === 0}
                  maxLength={200}
                  value={item.value}
                  onChange={(event) => update(index, event.target.value)}
                  aria-label={`${itemLabel} ${index + 1}`}
                  placeholder={`请输入${itemLabel}`}
                />
                <button className="danger" type="button" onClick={() => setDraft((current) => current.filter((_, itemIndex) => itemIndex !== index))} disabled={draft.length === 1 || saving} aria-label={`删除${item.value || itemLabel}`} title="删除"><TrashIcon /></button>
              </div>
            ))}
            </div>
            <button className="content-option-add" type="button" disabled={saving} onClick={() => setDraft((current) => [...current, { id: null, value: "" }])}>＋ 添加{itemLabel}</button>
          </section>
          {error && <p className="content-option-error" role="alert">{error}</p>}
          <footer className="content-option-actions">
            <button type="button" disabled={saving} onClick={onClose}>取消</button>
            <button className="primary" type="submit" disabled={saving}>{saving ? "保存中…" : "保存设置"}</button>
          </footer>
        </form>
      </section>
    </div>
  );
}
