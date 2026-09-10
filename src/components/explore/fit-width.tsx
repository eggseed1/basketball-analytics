"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * Scales children down so their natural width fits the parent — no horizontal scroll.
 */
export function FitWidth({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState<number | undefined>();

  const measure = useCallback(() => {
    const host = hostRef.current;
    const content = contentRef.current;
    if (!host || !content) return;
    // Measure unscaled size (transform does not affect layout/scrollWidth).
    content.style.transform = "scale(1)";
    const naturalW = content.scrollWidth;
    const naturalH = content.scrollHeight;
    const available = host.clientWidth;
    if (naturalW <= 0 || available <= 0) return;
    const next = Math.min(1, available / naturalW);
    content.style.transform = `scale(${next})`;
    setScale(next);
    setHeight(naturalH * next);
  }, []);

  useEffect(() => {
    measure();
    const host = hostRef.current;
    const content = contentRef.current;
    if (!host) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(host);
    if (content) ro.observe(content);
    return () => ro.disconnect();
  }, [measure]);

  return (
    <div
      ref={hostRef}
      className={className}
      style={height != null ? { height } : undefined}
    >
      <div
        ref={contentRef}
        className="w-max origin-top-left will-change-transform"
        style={{ transform: `scale(${scale})` }}
      >
        {children}
      </div>
    </div>
  );
}
