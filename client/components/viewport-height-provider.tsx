"use client";

import { useEffect } from "react";

/**
 * Sets CSS custom properties --viewport-height and --viewport-width from the
 * Visual Viewport API. Used on iOS to reduce layout jumps when the keyboard
 * or browser chrome (address bar) appears or disappears.
 * Elements can use height: var(--viewport-height) or similar when needed.
 */
export function ViewportHeightProvider() {
  useEffect(() => {
    function setViewportSize() {
      const vv = typeof window !== "undefined" ? window.visualViewport : null;
      const height = vv?.height ?? window.innerHeight;
      const width = vv?.width ?? window.innerWidth;
      document.documentElement.style.setProperty("--viewport-height", `${height}px`);
      document.documentElement.style.setProperty("--viewport-width", `${width}px`);
    }

    setViewportSize();

    window.addEventListener("resize", setViewportSize);
    window.addEventListener("orientationchange", setViewportSize);
    window.addEventListener("pageshow", setViewportSize);

    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener("resize", setViewportSize);
      vv.addEventListener("scroll", setViewportSize);
    }

    return () => {
      window.removeEventListener("resize", setViewportSize);
      window.removeEventListener("orientationchange", setViewportSize);
      window.removeEventListener("pageshow", setViewportSize);
      if (vv) {
        vv.removeEventListener("resize", setViewportSize);
        vv.removeEventListener("scroll", setViewportSize);
      }
    };
  }, []);

  return null;
}
