import React from "react";
import { vscForeground } from "..";

// Inject keyframes once
if (typeof document !== "undefined") {
  const styleId = "ring-loader-keyframes";
  if (!document.getElementById(styleId)) {
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      @keyframes ringRotate {
        0% { stroke-dashoffset: 100; }
        100% { stroke-dashoffset: 12; }
      }
    `;
    document.head.appendChild(style);
  }
}

const RingLoader = (props: {
  size: number;
  wFull?: boolean;
  className?: string;
  width?: string;
  height?: string;
  period?: number;
}) => {
  const viewBox = `0 0 ${props.size} ${props.size}`;
  const center = (props.size / 2).toString();
  const r = "14";
  const svgWidth = props.width || "40px";
  const svgHeight = props.height || "40px";
  const period = props.period || 6;

  return (
    <div
      className={
        "m-auto mt-2 text-center" +
        (props.wFull === false ? "" : " w-full") +
        " " +
        (props.className ?? "")
      }
    >
      <svg
        viewBox={viewBox}
        style={{
          transform: "rotate(-90deg)",
          width: svgWidth,
          height: svgHeight,
          opacity: 0.5,
        }}
      >
        <circle
          cx={center}
          cy={center}
          r={r}
          style={{
            fill: "none",
            stroke: vscForeground,
            strokeWidth: 2,
            strokeDasharray: 100,
            strokeDashoffset: 0,
            animation: `ringRotate ${period}s ease-out infinite`,
            strokeLinecap: "round",
          }}
        />
      </svg>
    </div>
  );
};

export default RingLoader;
