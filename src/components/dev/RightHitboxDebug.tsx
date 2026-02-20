"use client";

import { useEffect, useRef, useState } from "react";

type DebugInfo = {
  tag: string;
  id: string;
  className: string;
  position: string;
  zIndex: string;
  pointerEvents: string;
  rect: string;
};

function buildDebugInfo(element: Element): DebugInfo {
  const htmlElement = element as HTMLElement;
  const styles = window.getComputedStyle(htmlElement);
  const rect = htmlElement.getBoundingClientRect();

  return {
    tag: element.tagName.toLowerCase(),
    id: htmlElement.id || "-",
    className: htmlElement.className || "-",
    position: styles.position || "-",
    zIndex: styles.zIndex || "-",
    pointerEvents: styles.pointerEvents || "-",
    rect: `${Math.round(rect.left)},${Math.round(rect.top)} ${Math.round(rect.width)}x${Math.round(rect.height)}`,
  };
}

export default function RightHitboxDebug() {
  const [info, setInfo] = useState<DebugInfo | null>(null);
  const frameRef = useRef<number | null>(null);
  const lastKeyRef = useRef<string>("");

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;

    const onMouseMove = (event: MouseEvent) => {
      if (frameRef.current !== null) return;

      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null;

        if (event.clientX <= window.innerWidth * 0.7) {
          setInfo(null);
          return;
        }

        const element = document.elementFromPoint(event.clientX, event.clientY);
        if (!element) return;

        const next = buildDebugInfo(element);
        const key = `${next.tag}|${next.id}|${next.className}|${next.position}|${next.zIndex}|${next.pointerEvents}|${next.rect}`;

        if (key !== lastKeyRef.current) {
          lastKeyRef.current = key;
          console.debug("[right-hitbox-debug]", next);
        }

        setInfo(next);
      });
    };

    window.addEventListener("mousemove", onMouseMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  if (process.env.NODE_ENV !== "development" || !info) return null;

  return (
    <div className="pointer-events-none fixed bottom-2 left-2 z-[2147483647] max-w-[min(90vw,560px)] rounded-lg border border-[#d7e3f4] bg-white/95 px-3 py-2 text-[11px] leading-tight text-[#0f213c] shadow-lg">
      <div className="font-semibold">Right Hitbox Debug</div>
      <div>element: {info.tag}</div>
      <div>id: {info.id}</div>
      <div>class: {info.className}</div>
      <div>
        css: pos={info.position} z={info.zIndex} pe={info.pointerEvents}
      </div>
      <div>rect: {info.rect}</div>
    </div>
  );
}
