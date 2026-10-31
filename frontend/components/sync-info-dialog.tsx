import { useCallback, useEffect, useRef, useState } from "react";

import {
  getSyncTaskHistory,
  getSyncTasks,
  startSyncTask,
  type SyncHistoryItem,
  type SyncTaskKey,
  type SyncTaskSnapshot,
} from "@/lib/api";
import { CloseIcon } from "./icons";

interface SyncInfoDialogProps {
  onClose: () => void;
}

type ScriptTaskKey = Exclude<SyncTaskKey, "all">;

const SCRIPT_FILES: Record<ScriptTaskKey, string> = {
  A: "sse_funds.py",
  B: "sse_details.py",
  C: "szse_funds.py",
  D: "szse_details.py",
  E: "csrc_funds.py",
  F: "csrc_details.py",
};

function formatHistoryTime(value: string) {
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

const HISTORY_RESULT_LABELS: Record<SyncHistoryItem["result"], string> = {
  succeeded: "成功",
  failed: "失败",
  stopped: "停止",
};

const HISTORY_METHOD_LABELS: Record<SyncHistoryItem["method"], string> = {
  scheduled: "定时计划",
  dialog: "弹层按钮",
  terminal: "终端命令行",
};

function SyncHistoryDialog({
  task,
  onClose,
}: {
  task: ScriptTaskKey;
  onClose: () => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [items, setItems] = useState<SyncHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void getSyncTaskHistory(task, controller.signal)
      .then((response) => setItems(response.items))
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError("无法读取脚本执行历史。");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [task]);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    closeButtonRef.current?.focus();

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onClose();
    }

    window.addEventListener("keydown", closeOnEscape, true);
    return () => {
      window.removeEventListener("keydown", closeOnEscape, true);
      previousFocus?.focus();
    };
  }, [onClose]);

  return (
    <div
      className="sync-history-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sync-history-title"
    >
      <div className="sync-history-sheet">
        <header className="comparison-header">
          <div>
            <span className="section-kicker">最近 7 天</span>
            <h2 id="sync-history-title">
              脚本 {task} 执行历史
            </h2>
          </div>
          <button
            ref={closeButtonRef}
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label="关闭脚本执行历史"
          >
            <CloseIcon />
          </button>
        </header>
        <div className="sync-history-content">
          {loading ? (
            <p className="sync-history-state">正在读取执行历史…</p>
          ) : error ? (
            <p className="sync-history-state error">{error}</p>
          ) : items.length === 0 ? (
            <p className="sync-history-state">最近 7 天暂无执行记录。</p>
          ) : (
            <table className="sync-history-table">
              <thead>
                <tr>
                  <th>时间</th>
                  <th>结果</th>
                  <th>方式</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={`${item.time}-${item.method}-${index}`}>
                    <td>{formatHistoryTime(item.time)}</td>
                    <td>
                      <span className={`sync-history-result ${item.result}`}>
                        {HISTORY_RESULT_LABELS[item.result]}
                      </span>
                    </td>
                    <td>{HISTORY_METHOD_LABELS[item.method]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

const SYNC_ROWS: Array<{
  scope: string;
  tasks: Array<{
    key: ScriptTaskKey;
    schedule: string;
    sources: Array<{ label: string; url: string; description: string }>;
    ending?: string;
  }>;
}> = [
  {
    scope: "场内基金 · 上交所",
    tasks: [
      {
        key: "A",
        schedule: "每周一 09:00",
        sources: [
          {
            label: "上交所",
            url: "https://etf.sse.com.cn/fundlist/",
            description: "读取 ETF 列表，筛选目标基金，更新基金代码、名称等基本信息",
          },
          {
            label: "证监会基金电子披露网站",
            url: "http://eid.csrc.gov.cn/fund",
            description: "读取产品资料概要，更新管理费率、托管费率和运作综合费率",
          },
        ],
      },
      {
        key: "B",
        schedule: "周一至周五 22:05",
        sources: [
          {
            label: "上交所",
            url: "https://etf.sse.com.cn/fundlist/",
            description: "获取收盘价、基金规模和行情日期",
          },
          {
            label: "证监会基金电子披露网站",
            url: "http://eid.csrc.gov.cn/fund",
            description: "中获取正式单位净值、净值日期及历史净值",
          },
        ],
        ending: "；根据正式净值计算区间收益率。",
      },
    ],
  },
  {
    scope: "场内基金 · 深交所",
    tasks: [
      {
        key: "C",
        schedule: "每周一 09:00",
        sources: [
          {
            label: "深交所",
            url: "https://www.szse.cn/www/market/product/list/etfList/index.html",
            description: "按关键词查询 ETF 列表并筛选目标基金；对搜索结果未覆盖的深市 QDII ETF，依据证监会索引按代码补查或经电子披露平台核验后补入。更新上述基金代码、名称等基本信息",
          },
          {
            label: "证监会基金电子披露网站",
            url: "http://eid.csrc.gov.cn/fund",
            description: "读取产品资料概要，更新管理费率、托管费率和运作综合费率",
          },
        ],
      },
      {
        key: "D",
        schedule: "周一至周五 22:00",
        sources: [
          {
            label: "深交所",
            url: "https://www.szse.cn/www/market/product/list/etfList/index.html",
            description: "获取收盘价、正式单位净值、基金份额规模和交易日期",
          },
          {
            label: "证监会基金电子披露网站",
            url: "http://eid.csrc.gov.cn/fund",
            description: "中补充正式单位净值及历史净值",
          },
        ],
        ending: "；结合正式净值估算人民币基金规模，并计算区间收益率。",
      },
    ],
  },
  {
    scope: "场外基金",
    tasks: [
      {
        key: "E",
        schedule: "每月 1 日 09:00",
        sources: [
          {
            label: "中国证监会",
            url: "https://www.csrc.gov.cn/csrc/c101900/c1029655/content.shtml",
            description: "读取公募基金目录，筛选目标基金，获取代码、名称和成立日期",
          },
          {
            label: "证监会基金电子披露网站",
            url: "http://eid.csrc.gov.cn/fund",
            description: "核验基金全称、管理人和合同生效日期，发现各份额，并从最新产品资料概要和季度报告更新费率、基金规模",
          },
        ],
      },
      {
        key: "F",
        schedule: "周一至周五 09:00\n周一至周五 22:10",
        sources: [{
          label: "证监会基金电子披露网站",
          url: "http://eid.csrc.gov.cn/fund",
          description: "获取各份额的正式净值及历史净值，并解析申购公告中的状态与限额",
        }],
        ending: "；美元净值缺失时按规则从基金公司官网补充，并根据正式净值计算区间收益率。",
      },
    ],
  },
];

function statusLabel(
  task: ScriptTaskKey,
  snapshot: SyncTaskSnapshot | null,
) {
  const state = snapshot?.tasks[task];
  if (!state || state.status === "idle") return null;
  if (state.status === "queued" || state.status === "running") return null;
  return state.status === "succeeded" ? null : "执行失败";
}

export function SyncInfoDialog({
  onClose,
}: SyncInfoDialogProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [snapshot, setSnapshot] = useState<SyncTaskSnapshot | null>(null);
  const [startingTask, setStartingTask] = useState<ScriptTaskKey | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [historyTask, setHistoryTask] = useState<ScriptTaskKey | null>(null);

  const refreshStatus = useCallback(async (signal?: AbortSignal) => {
    try {
      setSnapshot(await getSyncTasks(signal));
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setRunError("无法读取同步任务状态。");
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => void refreshStatus(controller.signal));
    const timer = window.setInterval(() => void refreshStatus(), 2000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [refreshStatus]);

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

  async function runTask(task: ScriptTaskKey) {
    setStartingTask(task);
    setRunError(null);
    try {
      setSnapshot(await startSyncTask(task));
    } catch (error) {
      setRunError(error instanceof Error ? error.message : "同步任务启动失败。");
      await refreshStatus();
    } finally {
      setStartingTask(null);
    }
  }

  function taskControl(task: ScriptTaskKey) {
    const state = snapshot?.tasks[task];
    const label = statusLabel(task, snapshot);
    const busy = Boolean(snapshot?.activeJob) || startingTask !== null;
    const runLabel = startingTask === task || state?.status === "running"
      ? "执行中"
      : state?.status === "queued"
        ? "等待执行"
        : "执行";
    return (
      <span className="sync-task-control">
        <button
          className="sync-run-button"
          type="button"
          disabled={busy}
          onClick={() => void runTask(task)}
          aria-label={`执行脚本 ${task}`}
        >
          {runLabel}
        </button>
        <button
          className="sync-history-button"
          type="button"
          onClick={() => setHistoryTask(task)}
          aria-label={`查看脚本 ${task} 执行历史`}
        >
          历史
        </button>
        {label && (
          <small
            className={`sync-task-status ${state?.status ?? ""}`}
            title={state?.output || undefined}
          >
            {label}
          </small>
        )}
      </span>
    );
  }

  return (
    <div
      className="comparison-overlay sync-info-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sync-info-title"
    >
      <div className="sync-info-sheet">
        <header className="comparison-header">
          <div>
            <span className="section-kicker">数据说明</span>
            <h2 id="sync-info-title">数据同步机制</h2>
          </div>
          <button
            ref={closeButtonRef}
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label="关闭数据同步机制"
          >
            <CloseIcon />
          </button>
        </header>

        <div className="sync-info-content">
          {runError && <p className="sync-run-error">{runError}</p>}
          {SYNC_ROWS.map((row) => (
            <section key={row.scope} className="sync-info-section">
              <h3>{row.scope}</h3>
              <div className="sync-task-table-wrap">
                <table className="sync-task-table">
                  <thead>
                    <tr>
                      <th>脚本</th>
                      <th>执行时间</th>
                      <th>数据来源与更新内容</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {row.tasks.map((task, taskIndex) => (
                      <tr key={task.key}>
                        <td className="sync-task-script" title={`backend/app/sync/${SCRIPT_FILES[task.key]}`}>
                          脚本 {task.key}
                        </td>
                        <td>{task.schedule}</td>
                        <td>
                          {task.sources.map((source, index) => (
                            <span
                              key={`${task.key}-${index}`}
                              className={taskIndex === 0 ? "sync-task-source-line" : undefined}
                            >
                              {index > 0 && taskIndex !== 0 ? "；" : ""}
                              {(taskIndex === 0 || index === 0) && (
                                <strong className="sync-task-step">
                                  {taskIndex === 0
                                    ? index === 0 ? "第一步：" : "第二步："
                                    : "第三步："}
                                </strong>
                              )}
                              从{" "}
                              <a href={source.url} target="_blank" rel="noreferrer">
                                {source.label}
                              </a>
                              {" "}{source.description}
                              {taskIndex === 0 ? "。" : ""}
                            </span>
                          ))}
                          {task.ending ?? (taskIndex === 0 ? "" : "。")}
                        </td>
                        <td>{taskControl(task.key)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}

        </div>
      </div>
      {historyTask && (
        <SyncHistoryDialog
          task={historyTask}
          onClose={() => setHistoryTask(null)}
        />
      )}
    </div>
  );
}
