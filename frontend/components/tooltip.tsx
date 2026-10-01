"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

export function Tooltip({
  content,
  children,
  className = "",
}: {
  content: ReactNode | null;
  children: ReactNode;
  className?: string;
}) {
  const tooltipId = useId();
  const enabled = content !== null;
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  const updatePosition = useCallback(() => {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (rect) setPosition({ top: rect.top - 8, left: rect.right });
  }, []);
  const show = () => {
    if (!enabled) return;
    updatePosition();
    setVisible(true);
  };

  useEffect(() => {
    if (!visible) return;
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [updatePosition, visible]);

  return (
    <span
      ref={anchorRef}
      className={`ui-tooltip ${enabled ? "is-enabled" : ""} ${className}`.trim()}
      tabIndex={enabled ? 0 : undefined}
      aria-describedby={enabled ? tooltipId : undefined}
      onMouseEnter={show}
      onMouseLeave={() => setVisible(false)}
      onFocus={show}
      onBlur={() => setVisible(false)}
    >
      {children}
      {enabled && visible && createPortal(
        <span id={tooltipId} className="ui-tooltip-content" role="tooltip" style={position}>{content}</span>,
        document.body,
      )}
    </span>
  );
}
