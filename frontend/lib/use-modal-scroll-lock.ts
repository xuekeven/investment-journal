"use client";

import { useEffect } from "react";

const MODAL_SELECTOR = '[aria-modal="true"]';

/**
 * Keeps the document behind an open modal fixed while leaving the modal's own
 * scroll container usable. A single observer at the application root covers
 * every current and future modal, including nested confirmation dialogs.
 */
export function useModalScrollLock() {
  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    let locked = false;
    let previousRootOverflow = "";
    let previousBodyOverflow = "";
    let previousBodyPaddingRight = "";

    function setLocked(nextLocked: boolean) {
      if (nextLocked === locked) return;
      locked = nextLocked;

      if (nextLocked) {
        previousRootOverflow = root.style.overflow;
        previousBodyOverflow = body.style.overflow;
        previousBodyPaddingRight = body.style.paddingRight;

        const scrollbarWidth = window.innerWidth - root.clientWidth;
        const bodyPaddingRight = Number.parseFloat(window.getComputedStyle(body).paddingRight) || 0;
        root.style.overflow = "hidden";
        body.style.overflow = "hidden";
        if (scrollbarWidth > 0) {
          body.style.paddingRight = `${bodyPaddingRight + scrollbarWidth}px`;
        }
        return;
      }

      root.style.overflow = previousRootOverflow;
      body.style.overflow = previousBodyOverflow;
      body.style.paddingRight = previousBodyPaddingRight;
    }

    function syncModalState() {
      setLocked(document.querySelector(MODAL_SELECTOR) !== null);
    }

    const observer = new MutationObserver(syncModalState);
    observer.observe(body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-modal"],
    });
    syncModalState();

    return () => {
      observer.disconnect();
      setLocked(false);
    };
  }, []);
}
