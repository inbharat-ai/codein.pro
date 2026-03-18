import React from "react";

// Inject keyframes once
if (typeof document !== "undefined") {
  const styleId = "blinking-dot-keyframes";
  if (!document.getElementById(styleId)) {
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      @keyframes blinkDot {
        0%, 100% { transform: scale(1); opacity: 1; }
        50% { opacity: 0.25; }
      }
    `;
    document.head.appendChild(style);
  }
}

interface BlinkingDotProps extends React.HTMLAttributes<HTMLDivElement> {
  color: string;
  diameter?: number;
  shouldBlink?: boolean;
}

const DEFAULT_DIAMETER = 6;

const BlinkingDot = React.forwardRef<HTMLDivElement, BlinkingDotProps>(
  ({ color, diameter, shouldBlink, style, ...rest }, ref) => {
    const size = diameter ?? DEFAULT_DIAMETER;
    return (
      <div
        ref={ref}
        style={{
          backgroundColor: color,
          boxShadow: `0px 0px 2px 1px ${color}`,
          width: size,
          height: size,
          borderRadius: "50%",
          border: "1px solid rgba(255, 255, 255, 0.75)",
          margin: "0 2px",
          animation:
            (shouldBlink ?? false) ? "blinkDot 3s infinite" : undefined,
          ...style,
        }}
        {...rest}
      />
    );
  },
);

BlinkingDot.displayName = "BlinkingDot";

export default BlinkingDot;
