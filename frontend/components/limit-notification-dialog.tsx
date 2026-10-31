import { useEffect, useRef, useState } from "react";

import { getMessageNotificationSettings, testLimitNotification, updateMessageNotificationSettings } from "@/lib/api";
import type { LimitNotificationConfig, LimitNotificationConfigUpdate, LimitNotificationScope } from "@/lib/types";
import { CloseIcon } from "./icons";
import { NoteSelect } from "./investment-notes";
import { Switch } from "./switch";

interface LimitNotificationDialogProps { onClose: () => void }

const SCOPES: ReadonlyArray<{ value: LimitNotificationScope; label: string }> = [
  { value: "sp-500", label: "标普500" },
  { value: "nasdaq-100", label: "纳斯达克100" },
];

const VISIBLE_SCOPES = new Set<LimitNotificationScope>(SCOPES.map((item) => item.value));

export function LimitNotificationDialog({ onClose }: LimitNotificationDialogProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [configs, setConfigs] = useState<LimitNotificationConfig[]>([]);
  const [thresholds, setThresholds] = useState<Record<string, string>>({});
  const [weworkUserId, setWeworkUserId] = useState("XueKai");
  const [weworkApp, setWeworkApp] = useState("main");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingRow, setTestingRow] = useState<string | null>(null);
  const [openDirection, setOpenDirection] = useState<LimitNotificationScope | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void getMessageNotificationSettings(controller.signal)
      .then((loaded) => {
        setConfigs(loaded);
        setThresholds(Object.fromEntries(loaded.map((item) => [item.scope, String(item.deviationThreshold)])));
        const existing = loaded.find((item) => VISIBLE_SCOPES.has(item.scope) && (item.enabled || item.deviationEnabled)) ?? loaded[0];
        if (existing) {
          setWeworkUserId(existing.weworkUserId);
          setWeworkApp(existing.weworkApp);
        }
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "无法读取提醒配置。");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();
    return () => previousFocus?.focus();
  }, []);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (openDirection) setOpenDirection(null);
      else onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, openDirection]);

  useEffect(() => {
    if (!openDirection) return;
    function closeOnOutsideClick(event: PointerEvent) {
      if (!(event.target instanceof Element) || !event.target.closest(".message-direction-select")) {
        setOpenDirection(null);
      }
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [openDirection]);

  function change(scope: LimitNotificationScope, updates: Partial<LimitNotificationConfig>) {
    setConfigs((current) => current.map((item) => item.scope === scope ? { ...item, ...updates } : item));
    setMessage(null);
    setError(null);
  }

  function updateThreshold(scope: LimitNotificationScope, value: string) {
    if (!/^-?\d*(?:\.\d{0,2})?$/.test(value)) return;
    setThresholds((current) => ({ ...current, [scope]: value }));
    setMessage(null);
    setError(null);
  }

  function payload(): LimitNotificationConfigUpdate[] {
    return configs.map((item) => {
      const visible = VISIBLE_SCOPES.has(item.scope);
      const value = visible ? thresholds[item.scope] ?? "" : String(item.deviationThreshold);
      if (visible && (value === "" || value === "-" || value === "." || value === "-.")) {
        throw new Error("请填写" + SCOPES.find((scope) => scope.value === item.scope)?.label + "的偏离阈值。");
      }
      const threshold = Number(value);
      if (!Number.isFinite(threshold) || Math.abs(threshold) >= 1_000_000) {
        throw new Error("偏离阈值超出允许范围。");
      }
      return {
        enabled: visible && item.enabled,
        scope: item.scope,
        fundType: "off_exchange",
        deviationEnabled: visible && item.deviationEnabled,
        deviationThreshold: threshold,
        deviationDirection: item.deviationDirection,
        weworkUserId: weworkUserId.trim(),
        weworkApp: weworkApp.trim() || "main",
      };
    });
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const saved = await updateMessageNotificationSettings(payload());
      setConfigs(saved);
      setMessage("消息提醒设置已保存。");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存失败。");
    } finally {
      setSaving(false);
    }
  }

  async function sendTest(scope: LimitNotificationScope, kind: "deviation" | "limit") {
    const rowKey = scope + ":" + kind;
    setTestingRow(rowKey);
    setMessage(null);
    setError(null);
    try {
      const config = configs.find((item) => item.scope === scope);
      if (!config) throw new Error("无法读取该行的提醒配置。");
      if (!weworkUserId.trim()) throw new Error("请填写企微接收人。");
      const threshold = Number(thresholds[scope]);
      if (kind === "deviation" && (!Number.isFinite(threshold) || thresholds[scope]?.trim() === "" || Math.abs(threshold) >= 1_000_000)) {
        throw new Error("请填写有效的偏离阈值。");
      }
      await testLimitNotification({
        scope,
        kind,
        deviationThreshold: kind === "deviation" ? threshold : 0,
        deviationDirection: config.deviationDirection,
        weworkUserId: weworkUserId.trim(),
        weworkApp: weworkApp.trim() || "main",
      });
      const scopeLabel = SCOPES.find((item) => item.value === scope)?.label ?? scope;
      setMessage(scopeLabel + (kind === "deviation" ? "场内基金" : "场外基金") + "测试消息已发送。");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "测试消息发送失败。");
    } finally {
      setTestingRow(null);
    }
  }

  const visibleConfigs = configs.filter((item) => VISIBLE_SCOPES.has(item.scope));
  const lastError = visibleConfigs.find((item) => item.lastError)?.lastError;
  const relayConfigured = configs[0]?.relayConfigured ?? true;

  return (
    <div className="comparison-overlay limit-notification-overlay" role="dialog" aria-modal="true"
      aria-labelledby="limit-notification-title">
      <div className="limit-notification-sheet">
        <header className="comparison-header">
          <div>
            <span className="section-kicker">消息订阅</span>
            <h2 id="limit-notification-title">消息提醒设置</h2>
          </div>
          <button ref={closeButtonRef} className="icon-button" type="button" onClick={onClose} aria-label="关闭消息提醒设置">
            <CloseIcon />
          </button>
        </header>

        {loading ? <div className="limit-notification-state">正在读取提醒配置…</div> : (
          <div className="limit-notification-content">
            {configs.length > 0 && <div className="message-settings-matrix" role="group" aria-label="各类基金消息提醒">
              {SCOPES.map(({ value, label }) => {
                const config = configs.find((item) => item.scope === value);
                if (!config) return null;
                return <div className="message-settings-group" key={value}>
                  <div className="message-settings-scope">{label}</div>
                  <div className="message-settings-rows">
                    <div className="message-settings-row">
                      <div className="message-settings-venue-control">
                        <span className="message-settings-venue">场内基金</span>
                        <Switch checked={config.deviationEnabled} disabled={saving}
                          label={label + "场内基金偏离提醒"}
                          onCheckedChange={(checked) => change(value, { deviationEnabled: checked })} />
                      </div>
                      <div className="message-settings-action">
                        <span>偏离</span>
                        <div className="message-direction-select" role="group" aria-label={label + "场内基金偏离提醒方向"}>
                          <NoteSelect id={"deviation-direction-" + value} value={config.deviationDirection}
                            options={[["below", "低于"], ["above", "高于"]]}
                            open={openDirection === value}
                            onOpenChange={(open) => setOpenDirection(open ? value : null)}
                            onChange={(direction) => change(value, { deviationDirection: direction as LimitNotificationConfig["deviationDirection"] })} />
                        </div>
                        <input id={"deviation-" + value} type="text" inputMode="decimal"
                          aria-label={label + "场内基金偏离阈值，百分比"} value={thresholds[value] ?? ""}
                          onChange={(event) => updateThreshold(value, event.target.value)} /> % 提醒
                      </div>
                      <button className="limit-test-button message-settings-test" type="button"
                        disabled={saving || testingRow !== null || !weworkUserId.trim()}
                        onClick={() => void sendTest(value, "deviation")}>
                        {testingRow === value + ":deviation" ? "发送中…" : "测试发送"}
                      </button>
                    </div>
                    <div className="message-settings-row">
                      <div className="message-settings-venue-control">
                        <span className="message-settings-venue">场外基金</span>
                        <Switch checked={config.enabled} disabled={saving}
                          label={label + "场外基金限额变动提醒"}
                          onCheckedChange={(checked) => change(value, { enabled: checked })} />
                      </div>
                      <span className="message-settings-action">限额变动提醒</span>
                      <button className="limit-test-button message-settings-test" type="button"
                        disabled={saving || testingRow !== null || !weworkUserId.trim()}
                        onClick={() => void sendTest(value, "limit")}>
                        {testingRow === value + ":limit" ? "发送中…" : "测试发送"}
                      </button>
                    </div>
                  </div>
                </div>;
              })}
            </div>}

            <div className="message-settings-delivery">
              <label htmlFor="limit-wework-user">企微接收
                <input id="limit-wework-user" value={weworkUserId} onChange={(event) => setWeworkUserId(event.target.value)} />
              </label>
              <label htmlFor="limit-wework-app">企微发送应用
                <input id="limit-wework-app" value={weworkApp} onChange={(event) => setWeworkApp(event.target.value)} />
              </label>
            </div>
            {(!relayConfigured || lastError) && <div className="limit-notification-note">
              {!relayConfigured && <p className="warning">服务端尚未配置企微中转密钥。</p>}
              {lastError && <p className="error">最近错误：{lastError}</p>}
            </div>}
            {message && <p className="limit-form-message success">{message}</p>}
            {error && <p className="limit-form-message error">{error}</p>}
          </div>
        )}

        <footer className="limit-notification-footer">
          <button type="button" className="fund-edit-cancel" onClick={onClose}>取消</button>
          <button type="button" className="fund-edit-save" disabled={loading || saving || configs.length === 0} onClick={() => void save()}>
            {saving ? "保存中…" : "保存"}
          </button>
        </footer>
      </div>
    </div>
  );
}
