"use client";

import { useEffect } from "react";

/** Registers /sw.js (push reminders + offline page). Needs https or localhost. */
export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  }, []);
  return null;
}
