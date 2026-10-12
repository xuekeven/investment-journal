import { useEffect, useMemo, useRef, useState } from "react";

import {
  getLimitNotificationConfig,
  testLimitNotification,
  updateLimitNotificationConfig,
} from "@/lib/api";
import type {
  LimitNotificationConfig,
  LimitNotificationConfigUpdate,
  LimitNotificationFundType,
  LimitNotificationScope,
} from "@/lib/types";
import { CloseIcon } from "./icons";
import { Switch } from "./switch";

interface LimitNotificationDialogProps {
  onClose: () => void;
}

interface LimitSelectProps<T extends string> {
  id: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string; badge?: string }>;
  onChange: (value: T) => void;
  disabled?: boolean;
}

function LimitSelect<T extends string>({ id, value, options, onChange, disabled = false }: LimitSelectProps<T>) {
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

  const selectedLabel = options.find((option) => option.value === value)?.label ?? value;

  return (
    <div ref={containerRef} className={`multi-filter asset-select limit-custom-select ${open ? "open" : ""}`}>
      <button
        className="multi-filter-trigger"
        type="button"
        aria-expanded={open}
        aria-controls={`${id}-menu`}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <strong>{selectedLabel}</strong>
      </button>
      {open && (
        <div className="multi-filter-menu" id={`${id}-menu`} role="listbox">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={value === option.value}
              className={value === option.value ? "active" : ""}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              <span>{option.label}</span>
              {option.badge && <small className="limit-option-badge">{option.badge}</small>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const SCOPE_OPTIONS: Array<{ value: LimitNotificationScope; label: string }> = [
  { value: "sp-500", label: "标普500" },
  { value: "nasdaq-100", label: "纳斯达克100" },
  { value: "csi-500", label: "中证500" },
  { value: "favorite", label: "收藏标签" },
  { value: "holding", label: "持有标签" },
  { value: "recurring", label: "定投标签" },
];

const FUND_TYPE_OPTIONS: Array<{ value: LimitNotificationFundType; label: string }> = [
  { value: "on_exchange", label: "场内基金" },
  { value: "off_exchange", label: "场外基金" },
  { value: "all", label: "所有基金" },
];

const DEFAULT_CONFIG: LimitNotificationConfig = {
  enabled: false,
  scope: "favorite",
  fundType: "off_exchange",
  weworkUserId: "XueKai",
  weworkApp: "main",
  relayConfigured: false,
  lastSentAt: null,
  lastError: null,
};

function editable(config: LimitNotificationConfig): LimitNotificationConfigUpdate {
  return {
    enabled: config.enabled,
    scope: config.scope,
    fundType: config.fundType,
    weworkUserId: config.weworkUserId,
    weworkApp: config.weworkApp,
  };
}

function formatDate(value: string | null) {
  if (!value) return "尚未发送";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export function LimitNotificationDialog({ onClose }: LimitNotificationDialogProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [config, setConfig] = useState<LimitNotificationConfig>(DEFAULT_CONFIG);
  const [enabledScopes, setEnabledScopes] = useState<Set<LimitNotificationScope>>(new Set());
  const [loading, setLoading] = useState(true);
  const [scopeLoading, setScopeLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const payload = useMemo(() => editable(config), [config]);
  const scopeOptions = useMemo(
    () => SCOPE_OPTIONS.map((option) => ({
      ...option,
      badge: (
        option.value === config.scope
          ? config.enabled
          : enabledScopes.has(option.value)
      ) ? "已开启" : undefined,
    })),
    [config.enabled, config.scope, enabledScopes],
  );

  useEffect(() => {
    const controller = new AbortController();
    void getLimitNotificationConfig(undefined, controller.signal)
      .then(setConfig)
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "无法读取提醒配置。");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    void Promise.all(
      SCOPE_OPTIONS.map((option) => getLimitNotificationConfig(option.value, controller.signal)),
    ).then((configs) => {
      setEnabledScopes(new Set(
        configs.filter((item) => item.enabled).map((item) => item.scope),
      ));
    }).catch((reason: unknown) => {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
    });
    return () => controller.abort();
  }, []);

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

  function set<K extends keyof LimitNotificationConfig>(key: K, value: LimitNotificationConfig[K]) {
    setConfig((current) => ({ ...current, [key]: value }));
    setMessage(null);
    setTestMessage(null);
    setError(null);
  }

  async function changeScope(scope: LimitNotificationScope) {
    setConfig((current) => ({ ...current, scope }));
    setScopeLoading(true);
    setMessage(null);
    setTestMessage(null);
    setError(null);
    try {
      setConfig(await getLimitNotificationConfig(scope));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "无法读取该订阅范围的提醒配置。");
    } finally {
      setScopeLoading(false);
    }
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    setTestMessage(null);
    setError(null);
    try {
      const saved = await updateLimitNotificationConfig(payload);
      setConfig(saved);
      setEnabledScopes((current) => {
        const next = new Set(current);
        if (saved.enabled) next.add(saved.scope);
        else next.delete(saved.scope);
        return next;
      });
      setMessage("提醒配置已保存。");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存失败。");
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    setTesting(true);
    setMessage(null);
    setTestMessage(null);
    setError(null);
    try {
      await testLimitNotification(payload);
      setTestMessage("测试消息已发送。");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "测试消息发送失败。");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div
      className="comparison-overlay limit-notification-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="limit-notification-title"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="limit-notification-sheet">
        <header className="comparison-header">
          <div>
            <span className="section-kicker">消息订阅</span>
            <h2 id="limit-notification-title">限额变动提醒</h2>
          </div>
          <button ref={closeButtonRef} className="icon-button" type="button" onClick={onClose} aria-label="关闭限额变动提醒">
            <CloseIcon />
          </button>
        </header>

        {loading ? (
          <div className="limit-notification-state">正在读取提醒配置…</div>
        ) : (
          <div className="limit-notification-content">
            <div className="limit-notification-form">
              <div className="limit-notification-row">
                <span className="limit-notification-label">订阅范围</span>
                <div className="limit-notification-control">
                  <LimitSelect
                    id="limit-notification-scope"
                    value={config.scope}
                    options={scopeOptions}
                    disabled={scopeLoading || saving}
                    onChange={(value) => void changeScope(value)}
                  />
                </div>
              </div>

              <div className="limit-notification-row">
                <span className="limit-notification-label">限额变动提醒</span>
                <div className="limit-notification-control limit-switch-control">
                  <Switch
                    checked={config.enabled}
                    disabled={scopeLoading || saving}
                    label="限额变动提醒"
                    onCheckedChange={(checked) => set("enabled", checked)}
                  />
                  <small>数据同步后，该范围内符合条件的变化将通过企业微信发送。</small>
                </div>
              </div>

              <fieldset
                className={`limit-notification-dependent ${config.enabled ? "" : "disabled"}`}
                disabled={!config.enabled || scopeLoading}
              >
                <div className="limit-notification-row">
                  <span className="limit-notification-label">基金类型</span>
                  <div className="limit-notification-control">
                    <LimitSelect
                      id="limit-notification-fund-type"
                      value={config.fundType}
                      options={FUND_TYPE_OPTIONS}
                      onChange={(value) => set("fundType", value)}
                    />
                  </div>
                </div>

                <div className="limit-notification-row">
                  <label className="limit-notification-label" htmlFor="limit-wework-user">企微接收人</label>
                  <div className="limit-notification-control">
                    <input id="limit-wework-user" value={config.weworkUserId} onChange={(event) => set("weworkUserId", event.target.value)} />
                  </div>
                </div>

                <div className="limit-notification-row">
                  <label className="limit-notification-label" htmlFor="limit-wework-app">发送应用</label>
                  <div className="limit-notification-control">
                    <input id="limit-wework-app" value={config.weworkApp} onChange={(event) => set("weworkApp", event.target.value)} />
                  </div>
                </div>

                <div className="limit-notification-note limit-notification-aligned">
                  <p>同一次同步发现的变化合并发送；开启时以现有限额为基线，不补发历史变化。</p>
                  <p>场内基金仅在存在可用限额数据时产生提醒。</p>
                  <p>最近发送：{formatDate(config.lastSentAt)}</p>
                  {!config.relayConfigured && <p className="warning">服务端尚未配置企微中转密钥。</p>}
                  {config.lastError && <p className="error">最近错误：{config.lastError}</p>}
                </div>

                <div className="limit-test-action limit-notification-aligned">
                  <button className="limit-test-button" type="button" disabled={testing || !config.weworkUserId.trim()} onClick={() => void sendTest()}>
                    {testing ? "发送中…" : "发送测试消息"}
                  </button>
                  {testMessage && <span className="limit-test-message">{testMessage}</span>}
                </div>
              </fieldset>
            </div>

            {message && <p className="limit-form-message success">{message}</p>}
            {error && <p className="limit-form-message error">{error}</p>}
          </div>
        )}

        <footer className="limit-notification-footer">
          <button type="button" className="fund-edit-cancel" onClick={onClose}>取消</button>
          <button type="button" className="fund-edit-save" disabled={loading || scopeLoading || saving} onClick={() => void save()}>
            {saving ? "保存中…" : "保存"}
          </button>
        </footer>
      </div>
    </div>
  );
}
