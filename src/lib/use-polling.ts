"use client";

import { useEffect, useRef } from "react";

/**
 * Runs `callback` on a fixed interval, paused while the tab is backgrounded
 * (`document.visibilityState !== "visible"`) so an unattended tab doesn't keep
 * hitting the DB. Resumes immediately on becoming visible again, rather than
 * waiting out the remainder of a stale interval.
 *
 * `callback` is read through a ref so callers can pass an inline closure
 * without it resetting the interval on every render — only `intervalMs` and
 * `enabled` do that.
 */
export function usePolling(
  callback: () => void,
  intervalMs: number,
  enabled = true,
) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!enabled) return;

    let id: ReturnType<typeof setInterval> | null = null;

    function start() {
      if (id !== null) return;
      id = setInterval(() => callbackRef.current(), intervalMs);
    }
    function stop() {
      if (id === null) return;
      clearInterval(id);
      id = null;
    }

    if (document.visibilityState === "visible") start();

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        start();
        callbackRef.current();
      } else {
        stop();
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [intervalMs, enabled]);
}
