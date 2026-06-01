"use client";

import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";

interface ScrollingTextProps {
  text: string;
  className?: string;
  /** Gap in px between the repeated copies while scrolling. */
  gap?: number;
}

/**
 * Renders text on a single line. When the text is wider than its container it
 * cycles horizontally as a seamless marquee; otherwise it stays static.
 */
export const ScrollingText = ({ text, className, gap = 40 }: ScrollingTextProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [shouldScroll, setShouldScroll] = useState(false);

  useEffect(() => {
    const measure = () => {
      const container = containerRef.current;
      const measureEl = measureRef.current;
      if (!container || !measureEl) return;
      setShouldScroll(measureEl.scrollWidth > container.clientWidth + 1);
    };

    measure();

    const observer = new ResizeObserver(measure);
    if (containerRef.current) observer.observe(containerRef.current);
    if (measureRef.current) observer.observe(measureRef.current);

    return () => observer.disconnect();
  }, [text]);

  return (
    <div ref={containerRef} className={cn("relative w-full overflow-hidden", className)}>
      {/* Hidden measuring copy — never affects layout */}
      <span ref={measureRef} aria-hidden className="invisible absolute left-0 top-0 whitespace-nowrap">
        {text}
      </span>

      {shouldScroll ? (
        <div className="flex w-max animate-marquee-scroll">
          <span className="whitespace-nowrap" style={{ paddingRight: gap }}>
            {text}
          </span>
          <span aria-hidden className="whitespace-nowrap" style={{ paddingRight: gap }}>
            {text}
          </span>
        </div>
      ) : (
        <span className="block truncate whitespace-nowrap">{text}</span>
      )}
    </div>
  );
};
