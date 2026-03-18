import React from "react";

// Inject keyframes once
if (typeof document !== "undefined") {
  const styleId = "gradient-border-keyframes";
  if (!document.getElementById(styleId)) {
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      @keyframes gradientBorderMove {
        0% { background-position: 0px 0; }
        100% { background-position: 100em 0; }
      }
    `;
    document.head.appendChild(style);
  }
}

interface GradientBorderProps extends React.HTMLAttributes<HTMLDivElement> {
  borderRadius?: string;
  borderColor?: string;
  loading: 0 | 1;
  children?: React.ReactNode;
}

export const GradientBorder = React.forwardRef<
  HTMLDivElement,
  GradientBorderProps
>(({ borderRadius, borderColor, loading, style, children, ...rest }, ref) => {
  const background = borderColor
    ? borderColor
    : `repeating-linear-gradient(
        101.79deg,
        #1BBE84 0%,
        #331BBE 16%,
        #BE1B55 33%,
        #A6BE1B 55%,
        #BE1B55 67%,
        #331BBE 85%,
        #1BBE84 99%
      )`;

  return (
    <div
      ref={ref}
      style={{
        borderRadius: borderRadius || "0",
        padding: 1,
        background,
        animation: loading
          ? "gradientBorderMove 6s linear infinite"
          : undefined,
        backgroundSize: "200% 200%",
        width: "100%",
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        marginTop: loading ? "8px" : undefined,
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
});

GradientBorder.displayName = "GradientBorder";
