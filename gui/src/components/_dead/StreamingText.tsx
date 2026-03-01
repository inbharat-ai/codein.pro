/**
 * StreamingText — Smooth streaming display with fade-in, smart line breaks
 * Anti-flicker: buffers tokens and renders in batches for fluid animation.
 * Uses .codin-streaming-cursor + .codin-animate-in from codin-theme.css.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";

interface StreamingTextProps {
  tokens: string[];
  speed?: number; // ms per render batch (default: 30)
  batchSize?: number; // tokens per batch (default: 3)
  onComplete?: () => void;
  className?: string;
  renderMarkdown?: boolean;
}

export function StreamingText({
  tokens,
  speed = 30,
  batchSize = 3,
  onComplete,
  className,
}: StreamingTextProps) {
  const [rendered, setRendered] = useState("");
  const [cursor, setCursor] = useState(true);
  const indexRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const tick = useCallback(() => {
    const end = Math.min(indexRef.current + batchSize, tokens.length);
    if (indexRef.current >= tokens.length) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setCursor(false);
      onComplete?.();
      return;
    }
    const batch = tokens.slice(indexRef.current, end).join("");
    indexRef.current = end;
    setRendered((prev) => prev + batch);
  }, [tokens, batchSize, onComplete]);

  useEffect(() => {
    indexRef.current = 0;
    setRendered("");
    setCursor(true);
    timerRef.current = setInterval(tick, speed);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [tokens, speed, tick]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [rendered]);

  return (
    <div
      ref={containerRef}
      className={`codin-scrollbar ${className || ""}`}
      style={{
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        lineHeight: 1.6,
        fontFamily: "var(--codin-font-mono)",
        fontSize: "var(--codin-font-size-base)",
      }}
    >
      {rendered.split("\n").map((line, i, arr) => (
        <React.Fragment key={i}>
          <span className="codin-animate-in">{line}</span>
          {i < arr.length - 1 && <br />}
        </React.Fragment>
      ))}
      {cursor && <span className="codin-streaming-cursor" />}
    </div>
  );
}

export default StreamingText;
